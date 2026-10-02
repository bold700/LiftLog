import { applyCors } from './_lib/cors.mjs';
/**
 * Admin-endpoint: een beheerder verwijdert een account definitief (Auth + profiel + persoonlijke data
 * + ranglijstdocument). De ranglijst wordt daarbij automatisch opgeschoond.
 *
 * Actie (POST, JSON):
 *  - { action: 'delete', targetUid }   verwijdert login, profiel, logs, check-ins, voeding, metingen,
 *                                       workout-aanvragen en het ranglijstdocument van die persoon.
 *                                       Daarna wordt de ranglijst automatisch nagelopen op documenten
 *                                       van accounts die al eerder zijn verwijderd.
 *  - { action: 'delete-self' }       het eigen account opzeggen (iedereen, behalve de eigenaar van een
 *                                       studio). Ruimt dezelfde gegevens op als 'delete'.
 *  - { action: 'export-self' }       een kopie van al je eigen gegevens als JSON (AVG art. 15/20).
 *  - { action: 'withdraw-health-consent' }
 *                                       toestemming voor gezondheidsgegevens intrekken: metingen weg,
 *                                       rusthartslag en blessures van het profiel, toestemming op nee.
 *  - { action: 'invite', email, role } nodigt iemand met een bestaand account uit bij de studio van
 *                                       de beller. Geen account? Dan { status: 'no-account' } en maakt
 *                                       de app gewoon een nieuw account aan.
 *  - { action: 'importMembers', members: [...] }
 *                                       leden importeren (Beheer → Leden importeren), max. 25 per keer:
 *                                       account + profiel aanmaken op de server. In de browser kan
 *                                       Firebase maar ~100 accounts per uur aanmaken ("te veel
 *                                       pogingen"); de Admin SDK heeft die grens niet. Per lid:
 *                                       { email, displayName, trainerId?, birthDate?, gender?, phone?,
 *                                       address?, memberSince?, inactive? } → { status, uid?, password? }.
 *  - { action: 'processorAgreement' } / { action: 'signProcessorAgreement', version, agree, controller, signer }
 *    / { action: 'processorAgreementPdf' }
 *                                       verwerkersovereenkomst met BOLD700 lezen, tekenen en als PDF
 *                                       downloaden (alleen beheerder). Na tekenen gaat de PDF naar de
 *                                       gedeelde drive (GOOGLE_DRIVE_FOLDER_ID) en per mail rond.
 *                                       Alleen de eigenaar van de studio tekent; andere beheerders lezen mee.
 *  - { action: 'setOwner', targetUid }  wijst de eigenaar van de studio aan (api/_lib/studioOwner.mjs):
 *                                       de huidige eigenaar draagt over, of support van BOLD700, of een
 *                                       beheerder zolang er nog geen eigenaar is. De nieuwe eigenaar is
 *                                       beheerder van de studio en geen support van BOLD700.
 *  - { action: 'myInvites' }            openstaande uitnodigingen voor de beller.
 *  - { action: 'acceptInvite', inviteId } / { action: 'declineInvite', inviteId }
 *                                       de uitgenodigde beslist; pas bij accepteren hoort hij erbij.
 *  - { action: 'setRole', targetUid, role }
 *                                       zet de rol van een lid in de studio van de beheerder
 *                                       (`orgRoles`; bij één studio ook `role`).
 *  - { action: 'updateCredentials', targetUid, email?, password? }
 *                                       wijzigt het e-mailadres en/of wachtwoord van een sporter uit
 *                                       eigen studio, direct en zonder diens huidige wachtwoord (voor
 *                                       "Bekijk als" op Profiel: een trainer die het profiel van een
 *                                       sporter volledig beheert, alsof hij zelf is ingelogd).
 *
 * Beveiliging:
 *  - Vereist een geldig Firebase ID-token in de Authorization-header (Bearer).
 *  - Rollen gelden per studio (_lib/orgRoles.mjs). Het verzoek handelt in de studio die de app als
 *    actief meestuurt (`actingOrgId`), mits de beller daar lid van is.
 *  - 'delete' en 'setRole' vereisen beheerder in die studio, en dat het lid bij die studio hoort.
 *    Hoort iemand ook bij een andere studio, dan haalt 'delete' hem alleen uit deze studio.
 *  - 'updateCredentials' vereist trainer of beheerder in die studio, een sporter uit die studio, en
 *    dat die sporter bij geen andere studio hoort (anders zou de ene studio het account van de
 *    andere kunnen overnemen).
 *
 * Vereist env-var FIREBASE_SERVICE_ACCOUNT: de JSON van een Firebase service-account
 * (als string). Zonder deze var geeft het endpoint een nette foutmelding.
 */
import { getAdmin, parseServiceAccount } from './_lib/firebaseAdmin.mjs';
import {
  CURRENT_PROCESSOR_AGREEMENT_VERSION,
  PROCESSOR,
  PROCESSOR_AGREEMENT_TITLE,
  agreementFileName,
  agreementHash,
  agreementSections,
  cleanSignInput,
} from './_lib/processorAgreement.mjs';
import { buildProcessorAgreementPdf, formatSignedAt } from './_lib/processorAgreementPdf.mjs';
import { driveFolderId, uploadPdfToDrive } from './_lib/googleDrive.mjs';
import { mailConfigured, sendViaResend } from './_lib/invoiceEmail.mjs';
import { deleteQueryInBatches, deleteUserData, exportUserData } from './_lib/accountData.mjs';
import { mergeMembers } from './_lib/mergeMembers.mjs';
import { enforceRateLimit } from './_lib/requireUser.mjs';
import { actingOrg, isAdminIn, isStaffIn, orgsOf, roleIn } from './_lib/orgRoles.mjs';
import { canSetOwner, canSignForStudio, isSupportEmail } from './_lib/studioOwner.mjs';
import { FieldValue } from 'firebase-admin/firestore';
import { sendPushToUser } from './_lib/pushSend.mjs';
import { randomBytes } from 'node:crypto';

/** Versie van de toestemmingstekst voor gezondheidsgegevens (zie src/components/HealthConsentDialog.tsx). */
const HEALTH_CONSENT_VERSION = 2;

/** Zo vaak per dag mag iemand zijn gegevens downloaden (het haalt veel documenten op). */
const EXPORTS_PER_DAY = 5;

function json(res, status, body) {
  const payload = JSON.stringify(body);
  const ct = 'application/json; charset=utf-8';
  if (typeof res.status === 'function') {
    res.status(status).setHeader('Content-Type', ct);
    res.end(payload);
    return;
  }
  res.writeHead(status, { 'Content-Type': ct });
  res.end(payload);
}

async function readBody(req) {
  if (req.body) {
    return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }
  const admin = getAdmin();
  if (admin.error) {
    console.error('[admin-account] Firebase Admin niet beschikbaar:', admin.error);
    return json(res, 500, { error: 'Serverconfiguratie onvolledig. Neem contact op met de beheerder.' });
  }
  const { auth, db } = admin;

  // 1) Beller authenticeren
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    return json(res, 401, { error: 'Niet ingelogd.' });
  }

  let callerUid;
  try {
    const decoded = await auth.verifyIdToken(token);
    callerUid = decoded.uid;
  } catch {
    return json(res, 401, { error: 'Ongeldige sessie. Log opnieuw in.' });
  }

  // 2) Verzoek uitlezen. Het eigen account opzeggen mag iedereen; de rest alleen een beheerder.
  let body;
  try {
    body = await readBody(req);
  } catch {
    return json(res, 400, { error: 'Ongeldige aanvraag.' });
  }

  const action = body?.action;

  // Eigen account opzeggen. Dit loopt bewust langs de server: in de app mag niemand een profiel
  // verwijderen. Anders kon iemand zijn profiel weggooien en zich met hetzelfde account opnieuw
  // aanmaken in een andere studio — inclusief de logs en metingen die op zijn uid blijven staan.
  if (action === 'delete-self') {
    // Een eigenaar kan zijn studio niet wees laten: eerst het eigenaarschap overdragen of de studio
    // opzeggen (via support), anders staan de trainers en leden zonder beheerder.
    const owned = await db.collection('orgs').where('ownerId', '==', callerUid).get();
    if (!owned.empty) {
      return json(res, 409, {
        error: 'Je bent eigenaar van een studio. Draag die eerst over of neem contact op met support@bold700.com om je account te verwijderen.',
      });
    }
    try {
      await auth.deleteUser(callerUid);
    } catch (e) {
      if (e?.code !== 'auth/user-not-found') {
        return json(res, 500, { error: 'Verwijderen van het login-account mislukt.' });
      }
    }
    try {
      await db.collection('profiles').doc(callerUid).delete();
      const cleaned = await deleteUserData(db, callerUid);
      return json(res, 200, { ok: true, deletedUid: callerUid, cleaned });
    } catch {
      return json(res, 500, { error: 'Login verwijderd, maar het opruimen van je gegevens mislukte.' });
    }
  }

  // Toestemming voor gezondheidsgegevens intrekken (Profiel → Account). De AVG vraagt dat de
  // verwerking dan stopt: metingen (gewicht, lichaamssamenstelling, omtrek) gaan weg, net als
  // rusthartslag en blessures op het profiel. Voortgangsfoto's ruimt de app eerst zelf op (zie
  // src/services/privacyService.ts); de server kent de opslagbucket niet.
  if (action === 'withdraw-health-consent') {
    try {
      const removed = await deleteQueryInBatches(db, db.collection('measurements').where('userId', '==', callerUid));
      await db.collection('profiles').doc(callerUid).update({
        restingHrBpm: null,
        limitations: [],
        healthConsent: { given: false, at: new Date().toISOString(), version: HEALTH_CONSENT_VERSION },
      });
      return json(res, 200, { ok: true, measurementsRemoved: removed });
    } catch (e) {
      console.error('[admin-account] toestemming intrekken mislukte:', e);
      return json(res, 500, { error: 'Intrekken mislukt. Probeer het opnieuw.' });
    }
  }

  // Een kopie van al je eigen gegevens (Profiel → Account → "Download mijn gegevens"): recht op
  // inzage en overdraagbaarheid (AVG art. 15 en 20). Alleen je eigen gegevens, nooit die van een ander.
  if (action === 'export-self') {
    if (!(await enforceRateLimit(db, res, callerUid, 'export-self', EXPORTS_PER_DAY, 24 * 60 * 60 * 1000))) return;
    try {
      const authUser = await auth.getUser(callerUid).catch(() => null);
      return json(res, 200, { ok: true, data: await exportUserData(db, callerUid, authUser) });
    } catch (e) {
      console.error('[admin-account] export mislukte:', e);
      return json(res, 500, { error: 'Je gegevens ophalen mislukte. Probeer het later opnieuw.' });
    }
  }

  // Leden importeren bij een overstap: accounts op de server aanmaken (geen limiet per uur zoals in
  // de browser). Alleen een beheerder, alleen in de eigen studio, als sporter.
  if (action === 'importMembers') {
    const callerSnap = await db.collection('profiles').doc(callerUid).get();
    const callerData = callerSnap.exists ? callerSnap.data() : null;
    const org = callerData ? actingOrg(callerData, body?.actingOrgId) : null;
    if (!callerData || !isAdminIn(callerData, org)) return json(res, 403, { error: 'Alleen een beheerder kan leden importeren.' });
    const members = Array.isArray(body?.members) ? body.members.slice(0, 25) : [];
    if (members.length === 0) return json(res, 400, { error: 'Geen leden om te importeren.' });
    if (!(await enforceRateLimit(db, res, callerUid, 'importMembers', 200, 24 * 60 * 60 * 1000))) return;
    const str = (v, max = 200) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
    const isoDate = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
    const trainerOk = new Map();
    const results = [];
    for (const m of members) {
      const email = String(m?.email ?? '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        results.push({ email, status: 'failed', error: 'Ongeldig e-mailadres.' });
        continue;
      }
      // Trainer alleen koppelen als die staf is in deze studio.
      let trainerId = str(m?.trainerId, 128);
      if (trainerId && !trainerOk.has(trainerId)) {
        const t = await db.collection('profiles').doc(trainerId).get();
        trainerOk.set(trainerId, t.exists && isStaffIn(t.data(), org));
      }
      if (trainerId && !trainerOk.get(trainerId)) trainerId = null;
      const password = randomBytes(9).toString('base64url');
      const displayName = str(m?.displayName, 120);
      let user;
      try {
        user = await auth.createUser({ email, password, ...(displayName ? { displayName } : {}) });
      } catch (e) {
        const code = String(e?.code ?? e?.errorInfo?.code ?? '');
        results.push({ email, status: code.includes('email-already-exists') ? 'exists' : 'failed', error: code.includes('email-already-exists') ? 'Er bestaat al een account met dit e-mailadres.' : 'Account aanmaken mislukt.' });
        continue;
      }
      const address = m?.address && typeof m.address === 'object' ? { street: str(m.address.street), zip: str(m.address.zip, 20), city: str(m.address.city) } : null;
      const gender = ['man', 'vrouw', 'anders'].includes(m?.gender) ? m.gender : null;
      await db.collection('profiles').doc(user.uid).set({
        userId: user.uid,
        orgId: org,
        orgIds: [org],
        role: 'sporter',
        email,
        displayName,
        trainerId,
        trainerRequested: false,
        leaderboardVisibility: 'named',
        createdByAdmin: true,
        birthDate: isoDate(m?.birthDate),
        gender,
        phone: str(m?.phone, 40),
        address: address && (address.street || address.zip || address.city) ? address : null,
        memberSince: isoDate(m?.memberSince),
        // Uitgeschreven in het oude systeem: meteen inactief (er staan nog geen lessen of abonnementen).
        inactiveOrgs: m?.inactive === true ? [org] : [],
        importedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      results.push({ email, status: 'created', uid: user.uid, password });
    }
    return json(res, 200, { results });
  }

  // Uitnodigingen voor een tweede (of derde) studio. Eén account, meerdere studio's: de studio vraagt,
  // het lid beslist. Uitnodigingen staan in `orgInvites` en alleen de server leest en schrijft ze.
  // Verwerkersovereenkomst met BOLD700 (Beheer → Instellingen): lezen, tekenen, PDF. Alleen een
  // beheerder van de studio. Tekenen legt vast wie, wanneer en welke tekst; de PDF gaat naar de
  // gedeelde drive van BOLD700 (als ingesteld) en per mail naar de ondertekenaar en BOLD700.
  if (action === 'processorAgreement' || action === 'signProcessorAgreement' || action === 'processorAgreementPdf') {
    const callerSnap = await db.collection('profiles').doc(callerUid).get();
    const callerData = callerSnap.exists ? callerSnap.data() : null;
    const org = callerData ? actingOrg(callerData, body?.actingOrgId) : null;
    if (!callerData || !org || !isAdminIn(callerData, org)) return json(res, 403, { error: 'Alleen een beheerder van de studio kan de verwerkersovereenkomst inzien en tekenen.' });
    const orgRef = db.collection('orgs').doc(org);
    const orgSnap = await orgRef.get();
    const orgData = orgSnap.exists ? orgSnap.data() : {};
    const signed = orgData?.processorAgreement ?? null;

    const ownerId = typeof orgData?.ownerId === 'string' && orgData.ownerId ? orgData.ownerId : null;

    if (action === 'processorAgreement') {
      const b = orgData?.business ?? {};
      const ownerSnap = ownerId ? await db.collection('profiles').doc(ownerId).get() : null;
      const ownerName = ownerSnap?.exists ? String(ownerSnap.data()?.displayName || ownerSnap.data()?.email || '') : '';
      return json(res, 200, {
        ok: true,
        version: CURRENT_PROCESSOR_AGREEMENT_VERSION,
        title: PROCESSOR_AGREEMENT_TITLE,
        processor: PROCESSOR,
        sections: agreementSections(),
        signed,
        owner: ownerId ? { uid: ownerId, name: ownerName } : null,
        canSign: canSignForStudio({ ownerId, callerUid }),
        prefill: {
          legalName: String(b.legalName || orgData?.name || ''),
          street: String(b.street || ''),
          postcode: String(b.postcode || ''),
          city: String(b.city || ''),
          kvk: String(b.kvk || ''),
          name: String(callerData.displayName || ''),
        },
      });
    }

    if (action === 'processorAgreementPdf') {
      if (!signed) return json(res, 404, { error: 'Er is nog geen getekende verwerkersovereenkomst.' });
      const pdf = buildProcessorAgreementPdf(signed);
      return json(res, 200, { ok: true, filename: agreementFileName(signed), pdf: Buffer.from(pdf).toString('base64') });
    }

    // signProcessorAgreement: alleen de eigenaar tekent namens de studio.
    if (!canSignForStudio({ ownerId, callerUid })) {
      return json(res, 403, {
        error: ownerId
          ? 'Alleen de eigenaar van de studio kan de verwerkersovereenkomst tekenen.'
          : 'Wijs eerst de eigenaar van de studio aan (Beheer → Instellingen); die tekent de verwerkersovereenkomst.',
      });
    }
    const parsed = cleanSignInput(body);
    if (parsed.error) return json(res, 400, { error: parsed.error });
    if (!(await enforceRateLimit(db, res, callerUid, 'signProcessorAgreement', 10, 24 * 60 * 60 * 1000))) return;
    const authUser = await auth.getUser(callerUid).catch(() => null);
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const record = {
      version: CURRENT_PROCESSOR_AGREEMENT_VERSION,
      textHash: agreementHash(),
      signedAt: new Date().toISOString(),
      orgId: org,
      controller: parsed.value.controller,
      signer: { ...parsed.value.signer, uid: callerUid, email: authUser?.email ?? callerData.email ?? '' },
      ip: forwarded || null,
      userAgent: String(req.headers['user-agent'] || '').slice(0, 300) || null,
    };
    const historyRef = db.collection('processorAgreements').doc(`${org}__v${record.version}__${Date.now()}`);
    await historyRef.set(record);
    await orgRef.set({ processorAgreement: record }, { merge: true });

    // Kopieën: naar de Drive van BOLD700 en per mail. Mislukt dat, dan staat de ondertekening er
    // wel; de PDF is altijd opnieuw te downloaden.
    const pdf = buildProcessorAgreementPdf(record);
    const filename = agreementFileName(record);
    const copies = { drive: 'not-configured', driveLink: null, emailed: false };
    const folderId = driveFolderId();
    if (folderId) {
      try {
        const parsedAccount = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT);
        if (parsedAccount.error) throw new Error(parsedAccount.error);
        const up = await uploadPdfToDrive({ account: parsedAccount.account, folderId, name: filename, pdf });
        copies.drive = 'uploaded';
        copies.driveLink = up.webViewLink;
      } catch (e) {
        console.error('[admin-account] verwerkersovereenkomst naar Drive mislukt:', e);
        copies.drive = 'failed';
      }
    }
    if (mailConfigured()) {
      const c = record.controller;
      const subject = `${PROCESSOR_AGREEMENT_TITLE} getekend: ${c.legalName}`;
      const text = `${record.signer.name} (${record.signer.role}) heeft namens ${c.legalName} de ${PROCESSOR_AGREEMENT_TITLE} (versie ${record.version}) getekend op ${formatSignedAt(record.signedAt)}. De PDF zit in de bijlage en staat ook in de app onder Beheer → Instellingen.`;
      const html = `<p>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`;
      const attachments = [{ filename, content: Buffer.from(pdf).toString('base64') }];
      const to = [...new Set([record.signer.email, PROCESSOR.email].filter(Boolean))];
      try {
        for (const addr of to) await sendViaResend({ fromName: 'VORM', to: addr, replyTo: PROCESSOR.email, subject, html, text, attachments });
        copies.emailed = true;
      } catch (e) {
        console.error('[admin-account] mail verwerkersovereenkomst mislukt:', e);
      }
    }
    await historyRef.set({ copies }, { merge: true });
    return json(res, 200, { ok: true, signed: record, ...copies });
  }

  if (action === 'invite') {
    const callerSnap = await db.collection('profiles').doc(callerUid).get();
    const callerData = callerSnap.exists ? callerSnap.data() : null;
    const org = callerData ? actingOrg(callerData, body?.actingOrgId) : null;
    const role = String(body?.role ?? 'sporter').trim();
    if (!['sporter', 'trainer', 'admin'].includes(role)) return json(res, 400, { error: 'Onbekende rol.' });
    // Een sporter uitnodigen mag de staf; trainer of beheerder maken alleen een beheerder.
    if (!callerData || !isStaffIn(callerData, org) || (role !== 'sporter' && !isAdminIn(callerData, org))) {
      return json(res, 403, { error: 'Alleen een beheerder kan een trainer of beheerder uitnodigen.' });
    }
    const email = String(body?.email ?? '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(res, 400, { error: 'Vul een geldig e-mailadres in.' });
    if (!(await enforceRateLimit(db, res, callerUid, 'invite', 100, 24 * 60 * 60 * 1000))) return;
    const user = await auth.getUserByEmail(email).catch(() => null);
    if (!user) return json(res, 200, { status: 'no-account' });
    const targetSnap = await db.collection('profiles').doc(user.uid).get();
    if (targetSnap.exists && orgsOf(targetSnap.data()).includes(org)) return json(res, 200, { status: 'already-member' });
    const orgSnap = await db.collection('orgs').doc(org).get();
    const orgName = (orgSnap.exists && orgSnap.data()?.name) || 'een studio';
    const inviteId = `${org}__${user.uid}`;
    await db.collection('orgInvites').doc(inviteId).set({
      orgId: org,
      orgName,
      uid: user.uid,
      email,
      role,
      invitedBy: callerUid,
      invitedByName: String(callerData.displayName || callerData.email || ''),
      status: 'pending',
      createdAt: FieldValue.serverTimestamp(),
    });
    await sendPushToUser(db, user.uid, {
      title: `Uitnodiging van ${orgName}`,
      body: 'Open VORM om de uitnodiging te accepteren.',
      data: { kind: 'orgInvite' },
    }).catch(() => 0);
    return json(res, 200, { status: 'invited', orgName });
  }

  if (action === 'myInvites') {
    const snap = await db.collection('orgInvites').where('uid', '==', callerUid).where('status', '==', 'pending').get();
    const invites = snap.docs.map((d) => {
      const x = d.data();
      return { id: d.id, orgId: x.orgId, orgName: x.orgName, role: x.role, invitedByName: x.invitedByName || null };
    });
    return json(res, 200, { invites });
  }

  if (action === 'acceptInvite' || action === 'declineInvite') {
    const inviteId = String(body?.inviteId ?? '').trim();
    if (!inviteId) return json(res, 400, { error: 'Geen uitnodiging opgegeven.' });
    const inviteRef = db.collection('orgInvites').doc(inviteId);
    const profileRef = db.collection('profiles').doc(callerUid);
    try {
      const orgId = await db.runTransaction(async (tx) => {
        const [inviteSnap, profileSnap] = await Promise.all([tx.get(inviteRef), tx.get(profileRef)]);
        const invite = inviteSnap.exists ? inviteSnap.data() : null;
        if (!invite || invite.uid !== callerUid || invite.status !== 'pending') {
          const err = new Error('Deze uitnodiging bestaat niet (meer).');
          err.status = 404;
          throw err;
        }
        const decidedAt = FieldValue.serverTimestamp();
        if (action === 'declineInvite') {
          tx.update(inviteRef, { status: 'declined', decidedAt });
          return invite.orgId;
        }
        if (!profileSnap.exists) {
          const err = new Error('Profiel niet gevonden.');
          err.status = 404;
          throw err;
        }
        const profile = profileSnap.data();
        const orgs = orgsOf(profile);
        // Elke studio krijgt een eigen rol. De bestaande studio's houden de rol die ze nu hebben;
        // zo wordt een beheerder elders nooit via de algemene `role` beheerder bij deze studio.
        const orgRoles = {};
        for (const o of orgs) orgRoles[o] = roleIn(profile, o);
        orgRoles[invite.orgId] = invite.role;
        tx.update(profileRef, {
          orgIds: orgs.includes(invite.orgId) ? orgs : [...orgs, invite.orgId],
          orgRoles,
          updatedAt: decidedAt,
        });
        tx.update(inviteRef, { status: 'accepted', decidedAt });
        return invite.orgId;
      });
      return json(res, 200, { ok: true, orgId });
    } catch (e) {
      if (e?.status) return json(res, e.status, { error: e.message });
      console.error('[admin-account] uitnodiging verwerken mislukte:', e);
      return json(res, 500, { error: 'Uitnodiging verwerken mislukt. Probeer het opnieuw.' });
    }
  }

  // Inloggegevens van een sporter wijzigen (Profiel → "Bekijk als"): een trainer of beheerder mag
  // zonder het huidige wachtwoord van de sporter zelf diens e-mailadres en/of wachtwoord zetten,
  // zolang het om een sporter in de eigen studio gaat. Anders dan de gewone flow (auth.changeEmail/
  // changePassword) loopt dit via de Admin SDK: de sporter hoeft er niet apart voor in te loggen.
  if (action === 'updateCredentials') {
    const callerSnap = await db.collection('profiles').doc(callerUid).get();
    const callerData = callerSnap.exists ? callerSnap.data() : null;
    const org = callerData ? actingOrg(callerData, body?.actingOrgId) : null;
    if (!callerData || !isStaffIn(callerData, org)) {
      return json(res, 403, { error: 'Alleen trainers en beheerders mogen accountgegevens van een sporter wijzigen.' });
    }
    const targetUid = String(body?.targetUid || '').trim();
    if (!targetUid) return json(res, 400, { error: 'Ontbrekende targetUid.' });
    if (targetUid === callerUid) return json(res, 400, { error: 'Gebruik je eigen profiel om je eigen gegevens te wijzigen.' });

    const targetSnap = await db.collection('profiles').doc(targetUid).get();
    const target = targetSnap.exists ? targetSnap.data() : null;
    if (!target || !orgsOf(target).includes(org)) {
      return json(res, 403, { error: 'Deze sporter zit niet in jouw studio.' });
    }
    if (roleIn(target, org) !== 'sporter') return json(res, 404, { error: 'Sporter niet gevonden.' });
    // Eén login voor meerdere studio's: dan beslist alleen de sporter zelf over e-mail en wachtwoord.
    if (orgsOf(target).length > 1) {
      return json(res, 403, { error: 'Deze sporter zit ook bij een andere studio. Alleen de sporter zelf kan e-mail of wachtwoord wijzigen.' });
    }

    const email = typeof body?.email === 'string' ? body.email.trim() : undefined;
    const password = typeof body?.password === 'string' ? body.password : undefined;
    if (!email && !password) return json(res, 400, { error: 'Niets om te wijzigen.' });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json(res, 400, { error: 'Vul een geldig e-mailadres in.' });
    }
    if (password && password.length < 6) {
      return json(res, 400, { error: 'Een nieuw wachtwoord moet minstens 6 tekens zijn.' });
    }

    try {
      const update = {};
      if (email) update.email = email;
      if (password) update.password = password;
      await auth.updateUser(targetUid, update);
    } catch (e) {
      const code = e?.code || '';
      const msg =
        code === 'auth/email-already-exists' ? 'Dit e-mailadres is al bij een ander account in gebruik.'
        : code === 'auth/invalid-email' ? 'Ongeldig e-mailadres.'
        : 'Wijzigen van accountgegevens mislukt.';
      return json(res, 400, { error: msg });
    }
    if (email) {
      try {
        await db.collection('profiles').doc(targetUid).update({ email });
      } catch {
        // Login is al gewijzigd; het profiel loopt bij de volgende refreshProfile() vanzelf gelijk.
      }
    }
    return json(res, 200, { ok: true });
  }

  if (action === 'setOwner') {
    const callerSnap = await db.collection('profiles').doc(callerUid).get();
    const callerData = callerSnap.exists ? callerSnap.data() : null;
    const org = callerData ? actingOrg(callerData, body?.actingOrgId) : null;
    if (!callerData || !isAdminIn(callerData, org)) return json(res, 403, { error: 'Alleen een beheerder kan de eigenaar aanwijzen.' });
    const orgRef = db.collection('orgs').doc(org);
    const orgSnap = await orgRef.get();
    const ownerId = orgSnap.exists && typeof orgSnap.data()?.ownerId === 'string' ? orgSnap.data().ownerId || null : null;
    const callerAuth = await auth.getUser(callerUid).catch(() => null);
    if (!canSetOwner({ ownerId, callerUid, callerIsSupport: isSupportEmail(callerAuth?.email) })) {
      return json(res, 403, { error: 'Alleen de eigenaar kan het eigenaarschap overdragen.' });
    }
    const targetUid = String(body?.targetUid || '').trim();
    const targetSnap = targetUid ? await db.collection('profiles').doc(targetUid).get() : null;
    const target = targetSnap?.exists ? targetSnap.data() : null;
    if (!target || !isAdminIn(target, org)) {
      return json(res, 400, { error: 'De eigenaar moet beheerder van de studio zijn. Maak diegene eerst beheerder.' });
    }
    const targetAuth = await auth.getUser(targetUid).catch(() => null);
    if (isSupportEmail(targetAuth?.email ?? target.email)) {
      return json(res, 400, { error: 'Support van BOLD700 kan geen eigenaar van een studio zijn.' });
    }
    await orgRef.set({ ownerId: targetUid, ownerSetBy: callerUid, ownerSetAt: FieldValue.serverTimestamp() }, { merge: true });
    return json(res, 200, { ok: true, ownerId: targetUid });
  }

  // 3) Alle overige acties: alleen een beheerder van de studio waarin het verzoek handelt.
  const callerSnap = await db.collection('profiles').doc(callerUid).get();
  const callerData = callerSnap.exists ? callerSnap.data() : null;
  const org = callerData ? actingOrg(callerData, body?.actingOrgId) : null;
  if (!callerData || !isAdminIn(callerData, org)) {
    return json(res, 403, { error: 'Alleen beheerders mogen dit.' });
  }

  // Twee accounts van dezelfde persoon samenvoegen: eerst een voorbeeld, dan pas echt.
  if (action === 'mergePreview' || action === 'mergeMembers') {
    const keepId = String(body?.keepUid || '').trim();
    const fromId = String(body?.fromUid || '').trim();
    if (!keepId || !fromId || keepId === fromId) return json(res, 400, { error: 'Kies twee verschillende accounts.' });
    if (fromId === callerUid) return json(res, 400, { error: 'Je eigen account kan niet opgaan in een ander account.' });
    const [keepSnap, fromSnap, ownerSnap] = await Promise.all([
      db.collection('profiles').doc(keepId).get(),
      db.collection('profiles').doc(fromId).get(),
      db.collection('orgs').doc(org).get(),
    ]);
    const keep = keepSnap.exists ? keepSnap.data() : null;
    const from = fromSnap.exists ? fromSnap.data() : null;
    if (!keep || !from || !orgsOf(keep).includes(org) || !orgsOf(from).includes(org)) return json(res, 404, { error: 'Beide accounts moeten bij jouw studio horen.' });
    if (ownerSnap.exists && ownerSnap.data()?.ownerId === fromId) return json(res, 409, { error: 'Het account van de eigenaar kan niet opgaan in een ander account.' });
    if (orgsOf(from).length > 1) return json(res, 409, { error: 'Het account dat weggaat hoort ook bij een andere studio. Haal het daar eerst weg.' });
    if (roleIn(from, org) !== 'sporter') return json(res, 409, { error: 'Het account dat weggaat is een trainer of beheerder. Maak het eerst sporter.' });

    const dryRun = action === 'mergePreview';
    const result = await mergeMembers(db, { orgId: org, keepId, fromId, keepProfile: keep, fromProfile: from, byUserId: callerUid, dryRun });
    if (dryRun) {
      const lastSignIn = async (uid) => (await auth.getUser(uid).catch(() => null))?.metadata?.lastSignInTime ?? null;
      const who = async (uid, p) => ({ uid, name: String(p.displayName ?? ''), email: String(p.email ?? ''), lastSignIn: await lastSignIn(uid) });
      return json(res, 200, { ...result, keep: await who(keepId, keep), from: await who(fromId, from) });
    }
    // Daarna het profiel en het login-account dat weggaat.
    await db.collection('profiles').doc(fromId).delete();
    try {
      await auth.deleteUser(fromId);
    } catch (e) {
      if (e?.code !== 'auth/user-not-found') {
        return json(res, 500, { error: 'Gegevens zijn samengevoegd, maar het oude login-account verwijderen mislukte. Verwijder het via Firebase.' });
      }
    }
    return json(res, 200, { ok: true, ...result });
  }

  const targetUid = String(body?.targetUid || '').trim();
  if ((action !== 'delete' && action !== 'setRole') || !targetUid) {
    return json(res, 400, { error: 'Ongeldige actie of ontbrekende targetUid.' });
  }
  if (targetUid === callerUid) {
    return json(res, 400, { error: action === 'delete' ? 'Je kunt je eigen account niet verwijderen.' : 'Je kunt je eigen rol niet wijzigen.' });
  }
  const targetSnap = await db.collection('profiles').doc(targetUid).get();
  const target = targetSnap.exists ? targetSnap.data() : null;
  // Alleen leden van je eigen studio; een beheerder van de ene studio komt nooit aan een ander.
  if (!target || !orgsOf(target).includes(org)) {
    return json(res, 404, { error: 'Dit lid hoort niet bij jouw studio.' });
  }
  // De eigenaar blijft beheerder zolang hij eigenaar is: eerst overdragen.
  const orgOwnerSnap = await db.collection('orgs').doc(org).get();
  if (orgOwnerSnap.exists && orgOwnerSnap.data()?.ownerId === targetUid && (action === 'delete' || String(body?.role ?? '') !== 'admin')) {
    return json(res, 409, { error: 'Dit is de eigenaar van de studio. Draag het eigenaarschap eerst over (Beheer → Instellingen).' });
  }

  if (action === 'setRole') {
    const role = String(body?.role ?? '').trim();
    if (!['sporter', 'trainer', 'admin'].includes(role)) return json(res, 400, { error: 'Onbekende rol.' });
    const update = { [`orgRoles.${org}`]: role, updatedAt: FieldValue.serverTimestamp() };
    // Eén studio: de rol van het account loopt gelijk (oude app-versies lezen alleen `role`).
    if (orgsOf(target).length === 1) update.role = role;
    if (role !== 'sporter' && orgsOf(target).length === 1) update.trainerId = null;
    await db.collection('profiles').doc(targetUid).update(update);
    return json(res, 200, { ok: true, role });
  }

  // Hoort dit lid ook bij een andere studio, dan alleen uit déze studio halen: het account en de
  // gegevens bij de andere studio blijven staan.
  if (orgsOf(target).length > 1) {
    const rest = orgsOf(target).filter((o) => o !== org);
    const home = String(target.orgId ?? '') === org ? rest[0] : String(target.orgId ?? rest[0]);
    // Hangt dit lid aan een trainer die alleen bij déze studio hoort, dan valt die koppeling weg.
    let clearTrainer = false;
    if (target.trainerId) {
      const tr = await db.collection('profiles').doc(String(target.trainerId)).get();
      clearTrainer = !tr.exists || !orgsOf(tr.data()).some((o) => rest.includes(o));
    }
    await db.collection('profiles').doc(targetUid).update({
      orgIds: rest,
      orgId: home,
      [`orgRoles.${org}`]: FieldValue.delete(),
      ...(clearTrainer ? { trainerId: null } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return json(res, 200, { ok: true, removedFromOrg: org });
  }

  // 4) Auth-account verwijderen (negeer als het al weg is)
  try {
    await auth.deleteUser(targetUid);
  } catch (e) {
    if (e?.code !== 'auth/user-not-found') {
      return json(res, 500, { error: 'Verwijderen van het login-account mislukt.' });
    }
  }

  // 5) Profiel verwijderen
  try {
    await db.collection('profiles').doc(targetUid).delete();
  } catch {
    return json(res, 500, { error: 'Login verwijderd, maar profiel opruimen mislukte.' });
  }

  // 6) Persoonlijke data en ranglijstdocument opruimen. Zonder dit blijft de persoon op de
  //    ranglijst staan (die leest de hele collectie leaderboardPublic) en blijven de logs achter.
  let cleaned = {};
  try {
    cleaned = await deleteUserData(db, targetUid);
  } catch {
    return json(res, 500, {
      error: 'Login en profiel verwijderd, maar het opruimen van logs/ranglijst mislukte. Probeer het account opnieuw te verwijderen.',
    });
  }

  // 7) Ranglijst nalopen op documenten van accounts die eerder al zijn verwijderd. Dit hoort bij het
  //    verwijderen zelf, zodat niemand dat handmatig hoeft te doen. Mislukt dit, dan is de eigenlijke
  //    verwijdering al gelukt en heeft een volgende verwijdering opnieuw een kans.
  try {
    cleaned.orphansRemoved = (await deleteOrphanedLeaderboardDocs(db)).length;
  } catch (e) {
    console.error('[admin-account] Ranglijst nalopen mislukte:', e);
  }

  return json(res, 200, { ok: true, deletedUid: targetUid, cleaned });
}

/** Ranglijstdocumenten waarvan het profiel niet meer bestaat (document-id = uid): resten van
 *  verwijderingen van voor deze automatische opschoning. */
async function deleteOrphanedLeaderboardDocs(db) {
  const [lbSnap, profilesSnap] = await Promise.all([
    db.collection('leaderboardPublic').get(),
    db.collection('profiles').select().get(),
  ]);
  const profileIds = new Set(profilesSnap.docs.map((d) => d.id));
  const orphans = lbSnap.docs.filter((d) => !profileIds.has(d.id));
  for (let i = 0; i < orphans.length; i += 400) {
    const batch = db.batch();
    orphans.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  return orphans.map((d) => ({ uid: d.id, label: String(d.data()?.displayLabel ?? '') }));
}
