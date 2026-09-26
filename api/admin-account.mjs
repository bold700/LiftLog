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
 *  - { action: 'updateCredentials', targetUid, email?, password? }
 *                                       wijzigt het e-mailadres en/of wachtwoord van een sporter uit
 *                                       eigen studio, direct en zonder diens huidige wachtwoord (voor
 *                                       "Bekijk als" op Profiel: een trainer die het profiel van een
 *                                       sporter volledig beheert, alsof hij zelf is ingelogd).
 *
 * Beveiliging:
 *  - Vereist een geldig Firebase ID-token in de Authorization-header (Bearer).
 *  - 'delete' vereist de rol 'admin'; 'updateCredentials' vereist 'trainer' of 'admin' én dat de
 *    sporter in dezelfde studio zit.
 *
 * Vereist env-var FIREBASE_SERVICE_ACCOUNT: de JSON van een Firebase service-account
 * (als string). Zonder deze var geeft het endpoint een nette foutmelding.
 */
import { getAdmin } from './_lib/firebaseAdmin.mjs';
import { deleteQueryInBatches, deleteUserData, exportUserData } from './_lib/accountData.mjs';
import { enforceRateLimit } from './_lib/requireUser.mjs';

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

  // Inloggegevens van een sporter wijzigen (Profiel → "Bekijk als"): een trainer of beheerder mag
  // zonder het huidige wachtwoord van de sporter zelf diens e-mailadres en/of wachtwoord zetten,
  // zolang het om een sporter in de eigen studio gaat. Anders dan de gewone flow (auth.changeEmail/
  // changePassword) loopt dit via de Admin SDK: de sporter hoeft er niet apart voor in te loggen.
  if (action === 'updateCredentials') {
    const callerSnap = await db.collection('profiles').doc(callerUid).get();
    const callerData = callerSnap.exists ? callerSnap.data() : null;
    if (!callerData || (callerData.role !== 'trainer' && callerData.role !== 'admin')) {
      return json(res, 403, { error: 'Alleen trainers en beheerders mogen accountgegevens van een sporter wijzigen.' });
    }
    const targetUid = String(body?.targetUid || '').trim();
    if (!targetUid) return json(res, 400, { error: 'Ontbrekende targetUid.' });
    if (targetUid === callerUid) return json(res, 400, { error: 'Gebruik je eigen profiel om je eigen gegevens te wijzigen.' });

    const targetSnap = await db.collection('profiles').doc(targetUid).get();
    if (!targetSnap.exists || targetSnap.data()?.role !== 'sporter') {
      return json(res, 404, { error: 'Sporter niet gevonden.' });
    }
    const callerOrgIds = callerData.orgIds ?? [callerData.orgId].filter(Boolean);
    const targetOrgIds = targetSnap.data()?.orgIds ?? [targetSnap.data()?.orgId].filter(Boolean);
    if (!callerOrgIds.some((id) => targetOrgIds.includes(id))) {
      return json(res, 403, { error: 'Deze sporter zit niet in jouw studio.' });
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

  // 3) Alle overige acties: alleen een beheerder.
  const callerSnap = await db.collection('profiles').doc(callerUid).get();
  if (!callerSnap.exists || callerSnap.data()?.role !== 'admin') {
    return json(res, 403, { error: 'Alleen beheerders mogen accounts verwijderen.' });
  }

  const targetUid = String(body?.targetUid || '').trim();
  if (action !== 'delete' || !targetUid) {
    return json(res, 400, { error: 'Ongeldige actie of ontbrekende targetUid.' });
  }
  if (targetUid === callerUid) {
    return json(res, 400, { error: 'Je kunt je eigen account niet verwijderen.' });
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
