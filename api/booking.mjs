import { applyCors } from './_lib/cors.mjs';
/**
 * Lessen reserveren met credits.
 *
 * Waarom dit op de server staat en niet in Firestore-regels: reserveren moet drie dingen
 * tegelijk doen — controleren of er nog plek is, credits afschrijven en de reservering
 * vastleggen. Regels kunnen niet tellen en niet meerdere documenten samen bewaken. Twee mensen
 * die op hetzelfde moment de laatste plek pakken zouden er allebei in komen, en een sporter zou
 * kunnen reserveren zonder saldo. Een Firestore-transactie lost dat wel op.
 *
 * POST, JSON:
 *   { action: 'book',    classId, weekly?, userId? }     sporter reserveert (of komt op de wachtlijst);
 *                                                        weekly: true zet dit weekmoment ook op "elke week";
 *                                                        userId: staf schrijft een andere sporter in (diens
 *                                                        credit gaat eraf, niet die van de staf)
 *   { action: 'cancel',  bookingId }                   afmelden; credit terug binnen de annuleertermijn
 *                                                        (instelbaar per studio, zie bookingPolicy hieronder)
 *   { action: 'setStandingBooking', standingBookingId, active }  "elke week inschrijven" aan/uit zetten
 *   { action: 'generateClassOccurrences', classTypeId }  rooster meteen vullen voor deze lessoort (staf),
 *                                                        in plaats van tot de volgende cron te wachten
 *   { action: 'grant',   userId, amount, note }        credits handmatig aanpassen (alleen trainer/beheerder,
 *                                                        bijvoorbeeld om een verkeerde toekenning recht te zetten)
 *   { action: 'assign' | 'unassign' | 'renewDue' }     abonnementen (zie onder)
 *   { action: 'invoice', chargeId }                    factuur-PDF van een post (staf, of het lid zelf)
 *   { action: 'sendInvoice', chargeId }                factuur per mail naar het lid, PDF als bijlage (staf)
 *   { action: 'invoiceLink', chargeId }                openbare link naar de factuur + WhatsApp-tekst (staf, of het lid zelf)
 *
 * GET /f/{token} (rewrite naar ?invoice={token}): de factuur-PDF zonder inloggen, voor wie de link
 * heeft. De code is 32 hexcijfers uit een veilige toevalsbron en staat alleen op de post.
 *   { action: 'mailStatus' }                           is versturen ingericht? (staf)
 *   { action: 'savePaymentKey', orgId, mode, apiKey }  Mollie-sleutel koppelen, geverifieerd (beheerder)
 *   { action: 'removePaymentKey', orgId, mode }        Mollie-sleutel loskoppelen (beheerder)
 *   { action: 'purchasePlan', planId }                 sporter koopt zelf een betaald abonnement/strippenkaart
 *                                                        (elk lid, voor zichzelf); geeft een Mollie-checkout-URL
 *                                                        terug. Er wordt nog niets toegekend — dat gebeurt pas
 *                                                        als de webhook hieronder een geslaagde betaling meldt.
 *
 * POST /mollie-webhook/{orgId} (rewrite naar ?mollieWebhook={orgId}): Mollie meldt hier elke
 * statuswijziging van een betaling (form-encoded, alleen `id`). De melding zelf is niet
 * vertrouwbaar; de status wordt altijd rechtstreeks bij Mollie opgevraagd met de sleutel van de
 * studio. Bij "betaald": lidmaatschap/credits activeren (zelfde stappen als `assign`) en de
 * factuur automatisch mailen. Geen Firebase-login — dit komt van Mollie's servers.
 *
 * GET /api/cron/evening (rewrite naar ?cron=evening): dagelijkse Vercel-cron rond 18:00, de
 * avondronde van meldingen (lesherinneringen, geplande berichten, check-in, inactief, verjaardag; zie
 * api/_lib/notifications.mjs). Zelfde CRON_SECRET-controle als hieronder.
 *
 * GET /api/cron/generate-classes (rewrite naar ?cron=generateClasses): dagelijkse Vercel-cron die
 * lessen van een terugkerende lessoort op het rooster zet (zie api/_lib/classSchedule.mjs). Zit
 * bewust in dit endpoint in plaats van een eigen bestand: het Hobby-plan van Vercel staat maximaal
 * 12 Serverless Functions per deployment toe, en dat aantal zat al vol. Boekt daarna ook meteen
 * iedereen met een actieve "elke week"-inschrijving voor dat weekmoment in (plek/saldo toegestaan?
 * geboekt; vol? wachtlijst; geen saldo? die week overgeslagen — zie `lastOutcome` op het document).
 *
 * GET /kalender/{token} (rewrite naar ?feed={token}): de kalenderfeed (.ics) van een lid, zonder
 * inloggen — een agenda-app (Google Agenda/Outlook/Apple Agenda) haalt deze URL zelf periodiek op
 * en kan niet inloggen. De sleutel staat, net als bij mcpKeys, alleen als SHA-256-hash in Firestore
 * (`calendarFeedTokens`); de app maakt hem aan via het profiel (src/services/calendarFeedService.ts).
 * Bevat alle lessen (PT, groep, SGT, kickbox — alles is een `classes`-document) waar dit lid voor
 * geboekt staat of op de wachtlijst voor staat, vanaf vandaag.
 *
 * Beveiliging:
 *  - Vereist een geldig Firebase ID-token (Bearer), behalve de cron hierboven: die controleert
 *    in plaats daarvan `Authorization: Bearer $CRON_SECRET` (Vercel stuurt dat automatisch mee
 *    zodra die env-var gezet is).
 *  - Alles blijft binnen de studio van de aanvrager; een sporter reserveert alleen voor zichzelf.
 *  - Credits toekennen kan alleen staf, en alleen aan iemand in de eigen studio.
 */
import { getAdmin } from './_lib/firebaseAdmin.mjs';
import { orgIdOf, newId } from './_lib/liftlogData.mjs';
import { randomBytes } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { activeMembership, newCharge, newMembership, settleMembership } from './_lib/subscriptions.mjs';
import { businessOf, dueDateOf, reserveInvoiceNumber, vatRateOf } from './_lib/invoice.mjs';
import { buildInvoicePdf, invoiceFileName } from './_lib/invoicePdf.mjs';
import { logoToDataUrl } from './_lib/invoiceLogo.mjs';
import { buildInvoiceEmail, mailConfigured, sendViaResend } from './_lib/invoiceEmail.mjs';
import { hashFeedToken, buildIcsFeed } from './_lib/calendarFeed.mjs';
import { last4, mollieKeyFormatError, secretFieldFor, verifyMollieKey, getOrgMollieKey, createMolliePayment, getMolliePayment } from './_lib/molliePayments.mjs';
import { enforceRateLimit } from './_lib/requireUser.mjs';
import { amsterdamDate } from './_lib/classReminders.mjs';
import { sendPushToUser } from './_lib/pushSend.mjs';
import {
  creditsLowAfterBooking,
  deliverBroadcast,
  messages as pushMessages,
  notificationEnabled,
  orgNotificationEnabled,
  runEveningNotifications,
  validateBroadcast,
} from './_lib/notifications.mjs';
import {
  classFieldUpdates,
  classIdForOccurrence,
  expectedIdsForSchedule,
  canReopenPrivateClass,
  inStandingSeries,
  missingOccurrences,
  occurrencesForSchedule,
  personalClassTypeId,
  privateClassEmptyAfter,
  staleGeneratedClasses,
  standingAppliesOn,
  standingBookingId,
} from './_lib/classSchedule.mjs';

const BUILD = (process.env.VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 7);

/** Tot hoeveel uur voor aanvang je kosteloos kunt afmelden. Daarna is de credit op. */
const FREE_CANCEL_HOURS = 12;

/** Bovengrens op één keer credits aanpassen; beschermt tegen een typefout met een nul te veel. */
const MAX_GRANT = 500;

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
  if (req.body) return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

/** Document-id van een creditrekening: één rekening per persoon per studio. */
const accountId = (orgId, userId) => `${orgId}__${userId}`;

/** Wanneer begint deze les? Datum en tijd staan los opgeslagen zodat ze leesbaar blijven. */
function classStartsAt(data) {
  const date = String(data.date ?? '');
  const time = String(data.startTime ?? '00:00');
  const parsed = new Date(`${date}T${time}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  const publicToken = req.method === 'GET' ? String(req.query?.invoice ?? '').trim() : '';
  const cronName = req.method === 'GET' ? String(req.query?.cron ?? '') : '';
  const isCron = cronName === 'generateClasses' || cronName === 'evening' || cronName === 'classReminders';
  const feedToken = req.method === 'GET' ? String(req.query?.feed ?? '').trim() : '';
  const mollieWebhookOrgId = req.method === 'POST' ? String(req.query?.mollieWebhook ?? '').trim() : '';
  if (req.method !== 'POST' && !publicToken && !isCron && !feedToken) return json(res, 405, { error: 'Method not allowed', build: BUILD });

  const admin = getAdmin();
  if (admin.error) {
    console.error('[booking] Firebase Admin niet beschikbaar:', admin.error);
    return json(res, 500, { error: 'Serverconfiguratie onvolledig.', build: BUILD });
  }
  const { auth, db } = admin;

  if (publicToken) return publicInvoice(res, db, publicToken);
  if (feedToken) return calendarFeed(res, db, feedToken);
  if (cronName === 'generateClasses') return generateClasses(req, res, db);
  // 'classReminders' is de oude naam van de avondronde; blijft werken tot de cron is omgezet.
  if (cronName === 'evening' || cronName === 'classReminders') return eveningRun(req, res, db);
  if (mollieWebhookOrgId) return mollieWebhook(req, res, db, mollieWebhookOrgId);

  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return json(res, 401, { error: 'Niet ingelogd.', build: BUILD });

  let uid;
  try {
    uid = (await auth.verifyIdToken(token)).uid;
  } catch {
    return json(res, 401, { error: 'Sessie verlopen. Log opnieuw in.', build: BUILD });
  }

  let body;
  try {
    body = await readBody(req);
  } catch {
    return json(res, 400, { error: 'Ongeldige aanvraag.', build: BUILD });
  }

  const meSnap = await db.collection('profiles').doc(uid).get();
  if (!meSnap.exists) return json(res, 401, { error: 'Profiel niet gevonden.', build: BUILD });
  const meData = meSnap.data() ?? {};
  const myOrgs = Array.isArray(meData.orgIds) && meData.orgIds.length ? meData.orgIds.map(String) : [orgIdOf(meData.orgId)];
  const myRole = String(meData.role ?? 'sporter');
  const isStaff = myRole === 'trainer' || myRole === 'admin';

  try {
    switch (body?.action) {
      case 'book':
        return await book(
          res, db, uid, myOrgs,
          String(body.classId ?? '').trim(),
          body.weekly === true,
          isStaff,
          body.userId ? String(body.userId).trim() : null
        );
      case 'cancel':
        return await cancel(res, db, uid, myOrgs, isStaff, String(body.bookingId ?? '').trim());
      case 'setStandingBooking':
        return await setStandingBooking(res, db, uid, myOrgs, isStaff, String(body.standingBookingId ?? '').trim(), body.active === true);
      case 'addStandingBooking':
        return await addStandingBooking(res, db, uid, myOrgs, isStaff, body);
      case 'pauseStandingBooking':
        return await pauseStandingBooking(res, db, uid, myOrgs, isStaff, body);
      case 'addPersonalSlot':
        return await addPersonalSlot(res, db, uid, myOrgs, isStaff, body);
      case 'generateClassOccurrences':
        return await generateClassOccurrencesNow(res, db, myOrgs, isStaff, String(body.classTypeId ?? '').trim());
      case 'pruneStaleClasses':
        return await pruneStaleClasses(res, db, myOrgs, isStaff);
      case 'grant':
        if (!isStaff) return json(res, 403, { error: 'Alleen een trainer of beheerder kan credits aanpassen.', build: BUILD });
        return await grant(res, db, uid, myOrgs, body);
      case 'assign':
        if (!isStaff) return json(res, 403, { error: 'Alleen een trainer of beheerder kan een abonnement koppelen.', build: BUILD });
        return await assign(res, db, uid, myOrgs, body);
      case 'unassign':
        if (!isStaff) return json(res, 403, { error: 'Alleen een trainer of beheerder kan een abonnement stoppen.', build: BUILD });
        return await unassign(res, db, uid, myOrgs, body);
      case 'renewDue':
        if (!isStaff) return json(res, 403, { error: 'Alleen een trainer of beheerder kan verlengingen verwerken.', build: BUILD });
        return await renewDue(res, db, myOrgs, body);
      case 'invoice':
        return await invoice(res, db, uid, myOrgs, isStaff, String(body.chargeId ?? '').trim());
      case 'invoiceLink':
        return await invoiceLink(req, res, db, uid, myOrgs, isStaff, String(body.chargeId ?? '').trim());
      case 'mailStatus':
        if (!isStaff) return json(res, 403, { error: 'Alleen staf.', build: BUILD });
        return json(res, 200, { configured: mailConfigured(), build: BUILD });
      case 'savePaymentKey':
        if (myRole !== 'admin') return json(res, 403, { error: 'Alleen een beheerder kan betaalgegevens instellen.', build: BUILD });
        return await savePaymentKey(res, db, myOrgs, body);
      case 'removePaymentKey':
        if (myRole !== 'admin') return json(res, 403, { error: 'Alleen een beheerder kan betaalgegevens instellen.', build: BUILD });
        return await removePaymentKey(res, db, myOrgs, body);
      case 'sendInvoice':
        if (!isStaff) return json(res, 403, { error: 'Alleen een trainer of beheerder kan een factuur versturen.', build: BUILD });
        return await sendInvoice(res, db, myOrgs, String(body.chargeId ?? '').trim());
      case 'purchasePlan':
        return await purchasePlan(req, res, db, uid, myOrgs, body);
      case 'sendBroadcast':
        if (!isStaff) return json(res, 403, { error: 'Alleen een trainer of beheerder kan berichten sturen.', build: BUILD });
        return await sendBroadcast(res, db, uid, meData, myOrgs, body);
      case 'listBroadcasts':
        if (!isStaff) return json(res, 403, { error: 'Alleen staf.', build: BUILD });
        return await listBroadcasts(res, db, myOrgs, body);
      case 'cancelBroadcast':
        if (!isStaff) return json(res, 403, { error: 'Alleen staf.', build: BUILD });
        return await cancelBroadcast(res, db, myOrgs, String(body.broadcastId ?? '').trim());
      default:
        return json(res, 400, { error: 'Onbekende actie.', build: BUILD });
    }
  } catch (e) {
    // Een verwachte weigering (geen plek, geen saldo) komt hier als Error langs met een nette tekst.
    const message = e instanceof Error ? e.message : 'Er ging iets mis.';
    if (e?.expected) return json(res, e.status ?? 409, { error: message, build: BUILD });
    console.error('[booking] mislukt:', e);
    return json(res, 500, { error: 'Reservering verwerken mislukt.', build: BUILD });
  }
}

/** Weigering die de gebruiker moet zien (geen plek, geen saldo) — geen serverfout. */
function refuse(message, status) {
  const err = new Error(message);
  err.expected = true;
  if (status) err.status = status;
  return err;
}

/**
 * Reserveren. In één transactie: plek controleren, credit afschrijven, reservering vastleggen.
 * Zit de les vol, dan kom je op de wachtlijst — zonder dat er een credit af gaat.
 */
async function book(res, db, uid, myOrgs, classId, weekly, isStaff, targetUserId) {
  if (!classId) return json(res, 400, { error: 'Geen les opgegeven.', build: BUILD });

  // Staf kan iemand anders inschrijven (bijv. een sporter die via WhatsApp afmeldde er weer bij
  // zetten); de credit gaat dan gewoon van diegene af, niet van de staf zelf.
  let beneficiaryUid = uid;
  let beneficiaryIsStaff = isStaff;
  if (targetUserId && targetUserId !== uid) {
    if (!isStaff) return json(res, 403, { error: 'Alleen een trainer of beheerder kan iemand anders inschrijven.', build: BUILD });
    const targetSnap = await db.collection('profiles').doc(targetUserId).get();
    if (!targetSnap.exists) return json(res, 404, { error: 'Sporter niet gevonden.', build: BUILD });
    const target = targetSnap.data() ?? {};
    const targetOrgs = Array.isArray(target.orgIds) && target.orgIds.length ? target.orgIds.map(String) : [orgIdOf(target.orgId)];
    if (!myOrgs.some((o) => targetOrgs.includes(o))) return json(res, 403, { error: 'Deze sporter zit niet in jouw studio.', build: BUILD });
    beneficiaryUid = targetUserId;
    beneficiaryIsStaff = target.role === 'trainer' || target.role === 'admin';
  }

  // Eerst het eigen abonnement bijwerken (verlenging die nog openstond), dan pas reserveren.
  // Onbeperkt plan: de les kost niets.
  const preSnap = await db.collection('classes').doc(classId).get();
  const preOrg = preSnap.exists ? orgIdOf(preSnap.data().orgId) : null;
  let unlimited = false;
  if (preOrg && myOrgs.includes(preOrg)) {
    const m = await activeMembership(db, preOrg, beneficiaryUid);
    if (m) {
      await settleMembership(db, newId, db.collection('memberships').doc(m.id), new Date().toISOString());
      const still = await activeMembership(db, preOrg, beneficiaryUid);
      if (still) {
        const pSnap = await db.collection('plans').doc(String(still.planId)).get();
        unlimited = pSnap.exists && pSnap.data().credits == null;
      }
    }
  }

  const result = await db.runTransaction(async (tx) => {
    const classRef = db.collection('classes').doc(classId);
    const classSnap = await tx.get(classRef);
    if (!classSnap.exists) throw refuse('Deze les bestaat niet (meer).');

    const cls = classSnap.data();
    const orgId = orgIdOf(cls.orgId);
    if (!myOrgs.includes(orgId)) throw refuse('Deze les hoort niet bij jouw studio.');
    // Een privé-les (vaste PT van één lid) is alleen voor dat lid; zelf afgemeld? Dan mag het lid
    // hem weer terugzetten ("toch wel").
    if (cls.privateFor && cls.privateFor !== beneficiaryUid) throw refuse('Deze les is een persoonlijke afspraak van iemand anders.');
    const reopen = canReopenPrivateClass(cls, beneficiaryUid);
    if (cls.cancelledAt && !reopen) throw refuse('Deze les is afgelast.');

    const startsAt = classStartsAt(cls);
    if (startsAt && startsAt.getTime() < Date.now()) throw refuse('Deze les is al geweest.');

    // Al gereserveerd? Dan niets doen in plaats van een tweede plek innemen.
    const mine = await tx.get(
      db.collection('bookings').where('classId', '==', classId).where('userId', '==', beneficiaryUid)
    );
    const active = mine.docs.filter((d) => ['booked', 'waitlist'].includes(String(d.data().status)));
    if (active.length > 0) throw refuse(beneficiaryUid === uid ? 'Je staat al ingeschreven voor deze les.' : 'Deze sporter staat al ingeschreven voor deze les.');

    const capacity = Number(cls.capacity) || 0;
    const booked = Number(cls.bookedCount) || 0;
    const cost = unlimited || beneficiaryIsStaff ? 0 : Number(cls.creditCost ?? 1) || 0;
    const onWaitlist = booked >= capacity;

    const accountRef = db.collection('creditAccounts').doc(accountId(orgId, beneficiaryUid));
    const accountSnap = await tx.get(accountRef);
    const balance = Number(accountSnap.exists ? accountSnap.data().balance : 0) || 0;

    // Op de wachtlijst kost het niets; de credit gaat er pas af als je doorschuift.
    if (!onWaitlist && balance < cost) {
      const wie = beneficiaryUid === uid ? 'Je hebt' : 'Deze sporter heeft';
      throw refuse(
        cost === 1
          ? `${wie} geen credits meer.`
          : `Deze les kost ${cost} credits; ${beneficiaryUid === uid ? 'je hebt' : 'deze sporter heeft'} er ${balance}.`
      );
    }

    const bookingId = newId('bk');
    const now = new Date().toISOString();
    tx.set(db.collection('bookings').doc(bookingId), {
      id: bookingId,
      orgId,
      classId,
      userId: beneficiaryUid,
      status: onWaitlist ? 'waitlist' : 'booked',
      creditsSpent: onWaitlist ? 0 : cost,
      createdAt: now,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const reopened = reopen ? { cancelledAt: null, autoCancelled: false } : {};
    if (onWaitlist) {
      tx.set(classRef, { waitlistCount: FieldValue.increment(1), ...reopened }, { merge: true });
    } else {
      tx.set(classRef, { bookedCount: FieldValue.increment(1), ...reopened }, { merge: true });
      if (cost > 0) {
        tx.set(accountRef, { orgId, userId: beneficiaryUid, balance: balance - cost, updatedAt: now }, { merge: true });
        tx.set(db.collection('creditLedger').doc(newId('cl')), {
          orgId,
          userId: beneficiaryUid,
          delta: -cost,
          reason: 'booking',
          classId,
          byUserId: uid,
          createdAt: now,
        });
      }
    }

    // "Elke week inschrijven" aangevinkt: dit weekmoment van de lessoort voortaan ook automatisch
    // boeken (cron in generateClasses). Opnieuw aanvinken zet een bestaande, uitgezette inschrijving
    // gewoon weer aan — het id is deterministisch, dus dit levert nooit een dubbele op.
    if (weekly && cls.classTypeId) {
      const weekday = new Date(`${cls.date}T00:00:00`).getDay();
      const sbRef = db
        .collection('standingBookings')
        .doc(standingBookingId(cls.classTypeId, beneficiaryUid, weekday, cls.startTime));
      tx.set(
        sbRef,
        {
          id: sbRef.id,
          orgId,
          userId: beneficiaryUid,
          classTypeId: cls.classTypeId,
          weekday,
          startTime: cls.startTime,
          active: true,
          lastOutcome: onWaitlist ? 'skippedFull' : 'booked',
          lastOutcomeDate: cls.date,
          createdAt: now,
          updatedAt: now,
        },
        { merge: true }
      );
    }

    return {
      bookingId,
      status: onWaitlist ? 'waitlist' : 'booked',
      balance: onWaitlist ? balance : balance - cost,
      notice: { orgId, cost: onWaitlist ? 0 : cost },
    };
  });

  const { notice, ...answer } = result;
  // Bijna door de credits heen: een seintje, zodat iemand op tijd bijkoopt.
  if (notice && creditsLowAfterBooking(notice.cost, answer.balance)) {
    try {
      if (await orgNotificationEnabled(db, notice.orgId, 'creditsLow')) {
        await sendPushToUser(db, beneficiaryUid, { ...pushMessages.creditsLow(answer.balance), data: { kind: 'creditsLow' } });
      }
    } catch (e) {
      console.error('[booking] melding credits bijna op mislukt', e);
    }
  }
  return json(res, 200, { ...answer, build: BUILD });
}

/**
 * Afmelden. Binnen de annuleertermijn krijg je je credit terug; daarna niet — anders meldt
 * iedereen zich op het laatste moment af en staat de zaal leeg.
 * Komt er een plek vrij, dan schuift de eerste van de wachtlijst door.
 */
async function cancel(res, db, uid, myOrgs, isStaff, bookingId) {
  if (!bookingId) return json(res, 400, { error: 'Geen reservering opgegeven.', build: BUILD });
  const { notice, ...result } = await cancelBookingCore(db, uid, myOrgs, isStaff, bookingId);
  await notifyAfterCancel(db, uid, notice, result);
  return json(res, 200, { ...result, build: BUILD });
}

/**
 * Meldingen na afmelden: de studio meldde iemand anders af ("Les geannuleerd"), en/of iemand van
 * de wachtlijst kreeg de plek. Nooit laten mislukken: de afmelding zelf is al gelukt.
 */
async function notifyAfterCancel(db, uid, notice, result) {
  if (!notice) return;
  try {
    const orgSnap = await db.collection('orgs').doc(notice.orgId).get();
    const org = orgSnap.exists ? orgSnap.data() : null;
    if (notice.bookingUserId !== uid && notificationEnabled(org, 'classCancelled')) {
      await sendPushToUser(db, notice.bookingUserId, {
        ...pushMessages.bookingCancelledByStudio(notice.cls, result.refunded),
        data: { kind: 'classCancelled' },
      });
    }
    if (result.promotedUserId && notificationEnabled(org, 'waitlistPromoted')) {
      await sendPushToUser(db, result.promotedUserId, {
        ...pushMessages.waitlistPromoted(notice.cls, notice.promotedCost),
        data: { kind: 'waitlistPromoted' },
      });
    }
  } catch (e) {
    console.error('[booking] melding na afmelden mislukt', e);
  }
}

/** Het eigenlijke afmelden, ook gebruikt bij het stoppen of pauzeren van een vaste les. */
async function cancelBookingCore(db, uid, myOrgs, isStaff, bookingId) {
  return db.runTransaction(async (tx) => {
    const bookingRef = db.collection('bookings').doc(bookingId);
    const bookingSnap = await tx.get(bookingRef);
    if (!bookingSnap.exists) throw refuse('Deze reservering bestaat niet (meer).');

    const booking = bookingSnap.data();
    const orgId = orgIdOf(booking.orgId);
    if (!myOrgs.includes(orgId)) throw refuse('Deze reservering hoort niet bij jouw studio.');
    // Een sporter meldt alleen zichzelf af; staf mag ook voor een ander afmelden.
    if (booking.userId !== uid && !isStaff) throw refuse('Je kunt alleen je eigen reservering afzeggen.');
    if (!['booked', 'waitlist'].includes(String(booking.status))) throw refuse('Deze reservering staat al open.');

    const classRef = db.collection('classes').doc(String(booking.classId));
    const classSnap = await tx.get(classRef);
    const cls = classSnap.exists ? classSnap.data() : null;

    // Studio's stellen zelf in tot hoeveel uur van tevoren afmelden gratis is (Beheer → Huisstijl);
    // zonder instelling geldt het standaard aantal uur van de server.
    const orgSnap = await tx.get(db.collection('orgs').doc(orgId));
    const freeCancelHours = Number(orgSnap.data()?.bookingPolicy?.freeCancelHours) || FREE_CANCEL_HOURS;

    const startsAt = cls ? classStartsAt(cls) : null;
    const hoursLeft = startsAt ? (startsAt.getTime() - Date.now()) / 3_600_000 : Infinity;
    const spent = Number(booking.creditsSpent) || 0;
    // De les is afgelast: dan altijd terug, ongeacht het tijdstip.
    const refund = spent > 0 && (cls?.cancelledAt ? true : hoursLeft >= freeCancelHours);

    // Eerste van de wachtlijst laten doorschuiven als er een plek vrijkomt.
    let promoted = null;
    if (booking.status === 'booked' && cls && !cls.cancelledAt) {
      const waiting = await tx.get(
        db.collection('bookings').where('classId', '==', String(booking.classId)).where('status', '==', 'waitlist')
      );
      const sorted = waiting.docs
        .map((d) => ({ ref: d.ref, data: d.data() }))
        .sort((a, b) => String(a.data.createdAt).localeCompare(String(b.data.createdAt)));
      promoted = sorted[0] ?? null;
    }

    const now = new Date().toISOString();
    tx.set(bookingRef, { status: 'cancelled', cancelledAt: now, refunded: refund }, { merge: true });

    if (refund) {
      const accountRef = db.collection('creditAccounts').doc(accountId(orgId, booking.userId));
      tx.set(accountRef, { orgId, userId: booking.userId, balance: FieldValue.increment(spent), updatedAt: now }, { merge: true });
      tx.set(db.collection('creditLedger').doc(newId('cl')), {
        orgId,
        userId: booking.userId,
        delta: spent,
        reason: 'refund',
        classId: booking.classId,
        byUserId: uid,
        createdAt: now,
      });
    }

    if (booking.status === 'waitlist') {
      tx.set(classRef, { waitlistCount: FieldValue.increment(-1) }, { merge: true });
    } else if (promoted) {
      // Plek gaat direct naar de wachtlijst; die persoon betaalt nu zijn credit.
      const cost = Number(cls?.creditCost ?? 1) || 0;
      const promotedAccountRef = db.collection('creditAccounts').doc(accountId(orgId, String(promoted.data.userId)));
      const promotedAccount = await tx.get(promotedAccountRef);
      const promotedBalance = Number(promotedAccount.exists ? promotedAccount.data().balance : 0) || 0;

      if (promotedBalance >= cost) {
        tx.set(promoted.ref, { status: 'booked', creditsSpent: cost, promotedAt: now }, { merge: true });
        tx.set(classRef, { waitlistCount: FieldValue.increment(-1) }, { merge: true });
        if (cost > 0) {
          tx.set(promotedAccountRef, { balance: promotedBalance - cost, updatedAt: now }, { merge: true });
          tx.set(db.collection('creditLedger').doc(newId('cl')), {
            orgId,
            userId: promoted.data.userId,
            delta: -cost,
            reason: 'booking',
            classId: booking.classId,
            byUserId: uid,
            createdAt: now,
          });
        }
      } else {
        // Geen saldo: plek komt gewoon vrij en de wachtlijst blijft staan. De teller wordt
        // hieronder één keer verlaagd — hier ook aftrekken zou hem op -1 zetten en zo plekken
        // uit het niets laten ontstaan.
        promoted = null;
      }
    }

    if (booking.status === 'booked' && !promoted) {
      tx.set(classRef, { bookedCount: FieldValue.increment(-1) }, { merge: true });
    }

    // Privé-les (vaste PT) waar nu niemand meer op staat: van het rooster van de trainer af. De
    // credit-regel hierboven keek nog naar de les zoals hij was, dus dit geeft geen gratis afmelding.
    const emptied = privateClassEmptyAfter(cls, {
      bookedDelta: booking.status === 'booked' && !promoted ? -1 : 0,
      waitlistDelta: booking.status === 'waitlist' || promoted ? -1 : 0,
    });
    if (emptied) tx.set(classRef, { cancelledAt: now, autoCancelled: true }, { merge: true });

    return {
      cancelled: true,
      refunded: refund,
      promotedUserId: promoted ? String(promoted.data.userId) : null,
      // Alleen voor de meldingen hierna; gaat niet mee in het antwoord.
      notice: {
        orgId,
        bookingUserId: String(booking.userId),
        cls: cls ? { title: cls.title, date: cls.date, startTime: cls.startTime } : null,
        promotedCost: promoted ? Number(cls?.creditCost ?? 1) || 0 : 0,
      },
    };
  });
}

/**
 * Een vaste les ophalen en controleren of deze persoon hem mag aanpassen: de sporter zelf, of
 * staf van dezelfde studio (een trainer die de vaste lessen van zijn klant beheert).
 */
async function loadStandingForActor(db, uid, myOrgs, isStaff, standingId) {
  if (!standingId) throw refuse('Geen vaste les opgegeven.', 400);
  const snap = await db.collection('standingBookings').doc(standingId).get();
  if (!snap.exists) throw refuse('Deze vaste les bestaat niet (meer).', 404);
  const data = { ...snap.data(), id: snap.id };
  if (!myOrgs.includes(orgIdOf(data.orgId))) throw refuse('Deze vaste les hoort niet bij jouw studio.', 403);
  if (data.userId !== uid && !isStaff) throw refuse('Dit is niet jouw vaste les.', 403);
  return data;
}

/** Toekomstige lessen van het weekmoment van een vaste les, oudste eerst. */
async function futureSeriesClasses(db, standing) {
  const from = todayIso();
  const now = Date.now();
  const snap = await db.collection('classes').where('classTypeId', '==', standing.classTypeId).get();
  return snap.docs
    .map((d) => ({ ...d.data(), id: d.id }))
    .filter((c) => orgIdOf(c.orgId) === orgIdOf(standing.orgId) && typeof c.date === 'string' && c.date >= from)
    .filter((c) => inStandingSeries(c, standing) && (classStartsAt(c)?.getTime() ?? 0) > now)
    .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));
}

/**
 * De lessen die al op het rooster staan meteen boeken. De cron boekt alleen lessen die hij nieuw
 * aanmaakt; zonder dit zou een vaste les pas over 8 weken voor het eerst gelden.
 */
async function bookExistingForStanding(db, standing) {
  const counts = { booked: 0, skippedFull: 0, skippedNoCredits: 0 };
  for (const cls of await futureSeriesClasses(db, standing)) {
    if ((cls.cancelledAt && !canReopenPrivateClass(cls, standing.userId)) || !standingAppliesOn(standing, cls.date)) continue;
    const r = await attemptStandingBooking(db, orgIdOf(standing.orgId), cls.id, standing);
    if (r) counts[r.outcome]++;
  }
  return counts;
}

/**
 * Geboekte lessen van een vaste les afmelden (stoppen, of een pauze). Gewoon afmelden: binnen de
 * termijn credit terug, daarbuiten niet — zelfde regel als losse lessen.
 */
async function cancelSeriesBookings(db, uid, myOrgs, isStaff, standing, inRange) {
  const classIds = new Set((await futureSeriesClasses(db, standing)).filter((c) => inRange(c.date)).map((c) => c.id));
  if (classIds.size === 0) return { cancelled: 0, refunded: 0 };
  const snap = await db.collection('bookings').where('userId', '==', standing.userId).get();
  let cancelled = 0;
  let refunded = 0;
  for (const d of snap.docs) {
    const b = d.data();
    if (!classIds.has(String(b.classId)) || !['booked', 'waitlist'].includes(String(b.status))) continue;
    const r = await cancelBookingCore(db, uid, myOrgs, isStaff, d.id).catch(() => null);
    if (r) {
      cancelled++;
      if (r.refunded) refunded++;
    }
  }
  return { cancelled, refunded };
}

/**
 * Een vaste les aan- of uitzetten. Uit: de al geboekte lessen worden ook afgemeld. Aan: de lessen
 * die al op het rooster staan worden meteen geboekt.
 */
async function setStandingBooking(res, db, uid, myOrgs, isStaff, standingId, active) {
  const standing = await loadStandingForActor(db, uid, myOrgs, isStaff, standingId);
  const ctSnap = await db.collection('classTypes').doc(String(standing.classTypeId)).get();
  if (ctSnap.exists && ctSnap.data().privateFor) {
    if (active) return json(res, 400, { error: 'Een gestopt PT-moment zet je opnieuw vast via "PT-moment".', build: BUILD });
    return json(res, 200, { active: false, ...(await removePersonalSlot(db, uid, myOrgs, isStaff, standing)), build: BUILD });
  }
  await db.collection('standingBookings').doc(standing.id).set({ active, updatedAt: new Date().toISOString() }, { merge: true });
  const next = { ...standing, active };
  if (!active) {
    const r = await cancelSeriesBookings(db, uid, myOrgs, isStaff, standing, () => true);
    return json(res, 200, { active, ...r, build: BUILD });
  }
  const counts = await bookExistingForStanding(db, next);
  return json(res, 200, { active, ...counts, build: BUILD });
}

/**
 * Een vaste les toevoegen vanuit het profiel: een weekmoment van een lessoort, vanaf een datum.
 * Voor jezelf, of (staf) voor een lid van de studio.
 */
async function addStandingBooking(res, db, uid, myOrgs, isStaff, body) {
  const classTypeId = String(body?.classTypeId ?? '').trim();
  const weekday = Number(body?.weekday);
  const startTime = String(body?.startTime ?? '').trim();
  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.startDate ?? '')) ? String(body.startDate) : todayIso();
  const targetUserId = String(body?.userId ?? '').trim() || uid;
  if (!classTypeId || !Number.isInteger(weekday) || !/^\d{2}:\d{2}$/.test(startTime)) {
    return json(res, 400, { error: 'Kies een lessoort en een weekmoment.', build: BUILD });
  }

  if (targetUserId !== uid) {
    if (!isStaff) return json(res, 403, { error: 'Alleen een trainer of beheerder kan dit voor een ander instellen.', build: BUILD });
    const targetSnap = await db.collection('profiles').doc(targetUserId).get();
    if (!targetSnap.exists) return json(res, 404, { error: 'Sporter niet gevonden.', build: BUILD });
    const t = targetSnap.data() ?? {};
    const targetOrgs = Array.isArray(t.orgIds) && t.orgIds.length ? t.orgIds.map(String) : [orgIdOf(t.orgId)];
    if (!myOrgs.some((o) => targetOrgs.includes(o))) return json(res, 403, { error: 'Deze sporter zit niet in jouw studio.', build: BUILD });
  }

  const ctSnap = await db.collection('classTypes').doc(classTypeId).get();
  if (!ctSnap.exists) return json(res, 404, { error: 'Deze lessoort bestaat niet (meer).', build: BUILD });
  const ct = ctSnap.data();
  const orgId = orgIdOf(ct.orgId);
  if (!myOrgs.includes(orgId)) return json(res, 403, { error: 'Deze lessoort hoort niet bij jouw studio.', build: BUILD });
  if (ct.privateFor && ct.privateFor !== targetUserId) return json(res, 403, { error: 'Dit is een persoonlijke afspraak van iemand anders.', build: BUILD });
  const slot = (Array.isArray(ct.schedule) ? ct.schedule : []).find((sl) => Number(sl.weekday) === weekday && sl.startTime === startTime);
  if (!slot) return json(res, 400, { error: 'Dit weekmoment staat niet (meer) bij deze lessoort.', build: BUILD });

  const standing = await writeStanding(db, { orgId, userId: targetUserId, classTypeId, weekday, startTime, startDate, createdByUserId: uid });
  const counts = await bookExistingForStanding(db, standing);
  return json(res, 200, { standingBookingId: standing.id, ...counts, build: BUILD });
}

/** De vaste les (weer) vastleggen, actief en zonder pauze. Deterministische id: nooit dubbel. */
async function writeStanding(db, { orgId, userId, classTypeId, weekday, startTime, startDate, createdByUserId }) {
  const id = standingBookingId(classTypeId, userId, weekday, startTime);
  const now = new Date().toISOString();
  const standing = {
    id,
    orgId,
    userId,
    classTypeId,
    weekday,
    startTime,
    active: true,
    startDate,
    pausedFrom: null,
    pausedUntil: null,
    lastOutcome: null,
    lastOutcomeDate: null,
    createdByUserId,
    updatedAt: now,
  };
  const ref = db.collection('standingBookings').doc(id);
  const existing = await ref.get();
  await ref.set(existing.exists ? standing : { ...standing, createdAt: now }, { merge: true });
  return standing;
}

/** Zit dit lid in een studio van de staf? Gooit een nette weigering als dat niet zo is. */
async function requireMemberOfMyOrgs(db, myOrgs, userId) {
  const snap = await db.collection('profiles').doc(userId).get();
  if (!snap.exists) throw refuse('Sporter niet gevonden.', 404);
  const t = snap.data() ?? {};
  const orgs = Array.isArray(t.orgIds) && t.orgIds.length ? t.orgIds.map(String) : [orgIdOf(t.orgId)];
  if (!myOrgs.some((o) => orgs.includes(o))) throw refuse('Deze sporter zit niet in jouw studio.', 403);
  return t;
}

/**
 * Vast PT-moment voor één lid ("Bas traint elke vrijdag 18:00 bij Kenny"), zonder dat daarvoor een
 * groepsles op het rooster hoeft te staan. Hergebruikt het mechanisme van lessoorten: er komt een
 * privé-lessoort (alleen voor dit lid, niet zichtbaar in Beheer → Lessoorten of voor andere
 * leden) met één weekmoment, gebaseerd op een bestaande lessoort (prijs, soort, ruimte). Het
 * rooster vult zich dan vanzelf en de vaste les boekt het lid elke week.
 * Alleen staf: het gaat om de agenda van de trainer.
 */
async function addPersonalSlot(res, db, uid, myOrgs, isStaff, body) {
  if (!isStaff) return json(res, 403, { error: 'Alleen een trainer of beheerder kan een PT-moment vastzetten.', build: BUILD });
  const userId = String(body?.userId ?? '').trim();
  const baseClassTypeId = String(body?.baseClassTypeId ?? '').trim();
  const weekday = Number(body?.weekday);
  const startTime = String(body?.startTime ?? '').trim();
  const endTime = String(body?.endTime ?? '').trim();
  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.startDate ?? '')) ? String(body.startDate) : todayIso();
  const isTime = (v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
  if (!userId || !baseClassTypeId) return json(res, 400, { error: 'Kies een lid en een lessoort.', build: BUILD });
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6 || !isTime(startTime) || !isTime(endTime)) {
    return json(res, 400, { error: 'Kies een dag en een begin- en eindtijd.', build: BUILD });
  }
  if (endTime <= startTime) return json(res, 400, { error: 'De eindtijd ligt voor de begintijd.', build: BUILD });

  await requireMemberOfMyOrgs(db, myOrgs, userId);
  const baseSnap = await db.collection('classTypes').doc(baseClassTypeId).get();
  if (!baseSnap.exists) return json(res, 404, { error: 'Deze lessoort bestaat niet (meer).', build: BUILD });
  const base = baseSnap.data();
  const orgId = orgIdOf(base.orgId);
  if (!myOrgs.includes(orgId)) return json(res, 403, { error: 'Deze lessoort hoort niet bij jouw studio.', build: BUILD });
  if (base.privateFor) return json(res, 400, { error: 'Kies een gewone lessoort als basis.', build: BUILD });

  // Trainer: gekozen, anders de vaste trainer van de lessoort, anders wie het instelt.
  const trainerId = String(body?.trainerId ?? '').trim() || base.defaultTrainerId || uid;
  if (trainerId !== uid) {
    const tSnap = await db.collection('profiles').doc(trainerId).get();
    const tr = tSnap.exists ? tSnap.data() : null;
    const trOrgs = tr ? (Array.isArray(tr.orgIds) && tr.orgIds.length ? tr.orgIds.map(String) : [orgIdOf(tr.orgId)]) : [];
    if (!tr || !['trainer', 'admin'].includes(String(tr.role)) || !trOrgs.includes(orgId)) {
      return json(res, 400, { error: 'Deze trainer hoort niet bij jouw studio.', build: BUILD });
    }
  }

  const id = personalClassTypeId(userId, weekday, startTime);
  const now = new Date().toISOString();
  const ref = db.collection('classTypes').doc(id);
  const existing = await ref.get();
  const ct = {
    id,
    orgId,
    name: base.name,
    // Eén lid per PT-moment; duo-PT met twee vaste leden komt later.
    capacity: 1,
    creditCost: base.creditCost ?? 1,
    defaultTrainerId: trainerId,
    schemaId: base.schemaId ?? null,
    schedule: [{ weekday, startTime, endTime }],
    room: base.room ?? null,
    sessionKind: base.sessionKind ?? '1on1',
    description: base.description ?? null,
    privateFor: userId,
    baseClassTypeId,
    createdAt: existing.exists ? existing.data().createdAt ?? now : now,
    updatedAt: now,
  };
  await ref.set(ct);

  // Eerst de vaste les, dan het rooster: nieuw gemaakte lessen worden zo meteen voor het lid geboekt.
  const standing = await writeStanding(db, { orgId, userId, classTypeId: id, weekday, startTime, startDate, createdByUserId: uid });
  if (existing.exists) await syncClassType(db, id, ct);
  const generated = await generateForClassType(db, id, ct);
  const counts = await bookExistingForStanding(db, standing);
  return json(res, 200, {
    classTypeId: id,
    standingBookingId: standing.id,
    booked: generated.autoBooked + counts.booked,
    skippedFull: generated.autoWaitlisted + counts.skippedFull,
    skippedNoCredits: generated.autoSkippedNoCredits + counts.skippedNoCredits,
    build: BUILD,
  });
}

/**
 * Een PT-moment stoppen: geboekte lessen afmelden (gewone afmeldregel), de privé-lessoort en de
 * vaste les weghalen en de lege toekomstige lessen van het rooster halen. Wat al geweest is blijft.
 */
async function removePersonalSlot(db, uid, myOrgs, isStaff, standing) {
  const r = await cancelSeriesBookings(db, uid, myOrgs, isStaff, standing, () => true);
  const classTypeId = String(standing.classTypeId);
  const future = await futureClassesOfType(db, classTypeId, todayIso(), [orgIdOf(standing.orgId)]);
  await deleteClasses(db, future.filter((c) => !(Number(c.bookedCount) > 0) && !(Number(c.waitlistCount) > 0)));
  await db.collection('classTypes').doc(classTypeId).delete();
  await db.collection('standingBookings').doc(String(standing.id)).delete();
  return r;
}

/**
 * Pauze (vakantie) instellen of opheffen: van `from` t/m `until` (leeg = tot je hem opheft).
 * Geboekte lessen in die periode worden afgemeld; lessen erbuiten die nu weer meetellen, geboekt.
 */
async function pauseStandingBooking(res, db, uid, myOrgs, isStaff, body) {
  const standing = await loadStandingForActor(db, uid, myOrgs, isStaff, String(body?.standingBookingId ?? '').trim());
  const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? ''));
  const from = isDate(body?.from) ? String(body.from) : null;
  const until = from && isDate(body?.until) ? String(body.until) : null;
  if (from && until && until < from) return json(res, 400, { error: 'De einddatum ligt voor de begindatum.', build: BUILD });

  await db
    .collection('standingBookings')
    .doc(standing.id)
    .set({ pausedFrom: from, pausedUntil: until, updatedAt: new Date().toISOString() }, { merge: true });
  const next = { ...standing, pausedFrom: from, pausedUntil: until };
  const cancelledResult = from
    ? await cancelSeriesBookings(db, uid, myOrgs, isStaff, standing, (date) => !standingAppliesOn(next, date))
    : { cancelled: 0, refunded: 0 };
  const counts = await bookExistingForStanding(db, next);
  return json(res, 200, { ...cancelledResult, ...counts, build: BUILD });
}

/** Credits handmatig aanpassen (toekennen of afboeken). Elke mutatie komt ook in het grootboek te staan. */
async function grant(res, db, uid, myOrgs, body) {
  const targetUserId = String(body?.userId ?? '').trim();
  const amount = Number(body?.amount);
  const note = typeof body?.note === 'string' ? body.note.slice(0, 200) : '';

  if (!targetUserId) return json(res, 400, { error: 'Geen sporter opgegeven.', build: BUILD });
  if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > MAX_GRANT) {
    return json(res, 400, { error: `Vul een heel aantal credits in tussen -${MAX_GRANT} en ${MAX_GRANT}.`, build: BUILD });
  }

  const targetSnap = await db.collection('profiles').doc(targetUserId).get();
  if (!targetSnap.exists) return json(res, 404, { error: 'Sporter niet gevonden.', build: BUILD });
  const target = targetSnap.data() ?? {};
  const targetOrgs = Array.isArray(target.orgIds) && target.orgIds.length ? target.orgIds.map(String) : [orgIdOf(target.orgId)];

  // De studio waar jullie elkaar treffen; credits horen bij één studio.
  const orgId = myOrgs.find((o) => targetOrgs.includes(o));
  if (!orgId) return json(res, 403, { error: 'Deze sporter zit niet in jouw studio.', build: BUILD });

  const result = await db.runTransaction(async (tx) => {
    const accountRef = db.collection('creditAccounts').doc(accountId(orgId, targetUserId));
    const snap = await tx.get(accountRef);
    const balance = Number(snap.exists ? snap.data().balance : 0) || 0;
    const next = balance + amount;
    if (next < 0) throw refuse(`Dat zou het saldo op ${next} zetten; er staan er ${balance}.`);

    const now = new Date().toISOString();
    tx.set(accountRef, { orgId, userId: targetUserId, balance: next, updatedAt: now }, { merge: true });
    tx.set(db.collection('creditLedger').doc(newId('cl')), {
      orgId,
      userId: targetUserId,
      delta: amount,
      reason: 'manual',
      note,
      byUserId: uid,
      createdAt: now,
    });
    return { balance: next };
  });

  return json(res, 200, { ...result, build: BUILD });
}

// --- Abonnementen -----------------------------------------------------------------

/** Studio waar staf en lid elkaar treffen, of null. */
function sharedOrg(myOrgs, target) {
  const targetOrgs = Array.isArray(target.orgIds) && target.orgIds.length ? target.orgIds.map(String) : [orgIdOf(target.orgId)];
  return myOrgs.find((o) => targetOrgs.includes(o)) ?? null;
}

/**
 * Een lid aan een plan koppelen. Een lopend lidmaatschap stopt; het eerste tegoed komt er via het
 * grootboek bij (bij "vervalt" telt een restant van vroeger gewoon nog mee, dat verdwijnt pas bij
 * de eerste verlenging).
 */
async function assign(res, db, uid, myOrgs, body) {
  const targetUserId = String(body?.userId ?? '').trim();
  const planId = String(body?.planId ?? '').trim();
  if (!targetUserId || !planId) return json(res, 400, { error: 'Lid of abonnement ontbreekt.', build: BUILD });

  const targetSnap = await db.collection('profiles').doc(targetUserId).get();
  if (!targetSnap.exists) return json(res, 404, { error: 'Lid niet gevonden.', build: BUILD });
  const orgId = sharedOrg(myOrgs, targetSnap.data() ?? {});
  if (!orgId) return json(res, 403, { error: 'Dit lid zit niet in jouw studio.', build: BUILD });

  const planSnap = await db.collection('plans').doc(planId).get();
  if (!planSnap.exists || orgIdOf(planSnap.data().orgId) !== orgId) return json(res, 404, { error: 'Abonnement niet gevonden.', build: BUILD });
  const plan = { id: planSnap.id, ...planSnap.data() };

  const nowIso = new Date().toISOString();
  const current = await activeMembership(db, orgId, targetUserId);
  const membership = newMembership({ id: newId('mb'), orgId, userId: targetUserId, plan, nowIso, byUserId: uid });
  const credits = plan.credits == null ? 0 : Number(plan.credits) || 0;

  const balance = await db.runTransaction(async (tx) => {
    const accountRef = db.collection('creditAccounts').doc(accountId(orgId, targetUserId));
    const aSnap = await tx.get(accountRef);
    const saldo = Number(aSnap.exists ? aSnap.data().balance : 0) || 0;
    const orgRef = db.collection('orgs').doc(orgId);
    const orgSnap = await tx.get(orgRef);
    if (current) tx.set(db.collection('memberships').doc(current.id), { status: 'cancelled', cancelledAt: nowIso, updatedAt: nowIso }, { merge: true });
    tx.set(db.collection('memberships').doc(membership.id), membership);
    // Eerste post: de eerste periode (maand of de kaart zelf), tenzij het plan gratis is. Met factuurnummer.
    if ((Number(plan.price) || 0) > 0) {
      const invoiceNumber = reserveInvoiceNumber(tx, orgRef, orgSnap, nowIso);
      const charge = newCharge({ id: newId('ch'), orgId, userId: targetUserId, plan, membershipId: membership.id, periodStartIso: nowIso, nowIso, invoiceNumber });
      tx.set(db.collection('charges').doc(charge.id), charge);
    }
    if (credits > 0) {
      tx.set(accountRef, { orgId, userId: targetUserId, balance: saldo + credits, updatedAt: nowIso }, { merge: true });
      tx.set(db.collection('creditLedger').doc(newId('cl')), {
        orgId,
        userId: targetUserId,
        delta: credits,
        reason: 'plan',
        planId: plan.id,
        note: `${plan.name} gestart`,
        byUserId: uid,
        createdAt: nowIso,
      });
    }
    return saldo + credits;
  });

  return json(res, 200, { membershipId: membership.id, balance, build: BUILD });
}

/** Lidmaatschap stoppen; credits die er staan blijven staan. */
async function unassign(res, db, uid, myOrgs, body) {
  const targetUserId = String(body?.userId ?? '').trim();
  if (!targetUserId) return json(res, 400, { error: 'Geen lid opgegeven.', build: BUILD });
  const targetSnap = await db.collection('profiles').doc(targetUserId).get();
  if (!targetSnap.exists) return json(res, 404, { error: 'Lid niet gevonden.', build: BUILD });
  const orgId = sharedOrg(myOrgs, targetSnap.data() ?? {});
  if (!orgId) return json(res, 403, { error: 'Dit lid zit niet in jouw studio.', build: BUILD });

  const current = await activeMembership(db, orgId, targetUserId);
  if (!current) return json(res, 200, { stopped: false, build: BUILD });
  const nowIso = new Date().toISOString();
  await db.collection('memberships').doc(current.id).set({ status: 'cancelled', cancelledAt: nowIso, byUserId: uid, updatedAt: nowIso }, { merge: true });
  return json(res, 200, { stopped: true, build: BUILD });
}

/**
 * Sporter koopt zelf een betaald abonnement of strippenkaart. Er wordt hier nog niets toegekend —
 * dat gebeurt pas als de webhook (mollieWebhook, verderop) een geslaagde betaling meldt. Een
 * `mollieCheckouts`-post (server-only) koppelt de Mollie-betaling aan wie wat koopt.
 */
async function purchasePlan(req, res, db, uid, myOrgs, body) {
  // Elke aanroep maakt een echte Mollie-betaling aan en een Firestore-post; een limiet voorkomt
  // misbruik (spam-aanroepen) zonder een sporter die een mislukte betaling gewoon overdoet te hinderen.
  if (!(await enforceRateLimit(db, res, uid, 'purchasePlan', 20, 24 * 60 * 60 * 1000))) return;

  const planId = String(body?.planId ?? '').trim();
  if (!planId) return json(res, 400, { error: 'Geen abonnement opgegeven.', build: BUILD });

  const planSnap = await db.collection('plans').doc(planId).get();
  if (!planSnap.exists) return json(res, 404, { error: 'Abonnement niet gevonden.', build: BUILD });
  const plan = { id: planSnap.id, ...planSnap.data() };
  const orgId = orgIdOf(plan.orgId);
  if (!myOrgs.includes(orgId)) return json(res, 403, { error: 'Dit abonnement hoort niet bij jouw studio.', build: BUILD });
  if (plan.status !== 'active') return json(res, 409, { error: 'Dit abonnement is niet meer beschikbaar.', build: BUILD });
  if (plan.availableTo === 'invite') return json(res, 403, { error: 'Dit abonnement is alleen op uitnodiging.', build: BUILD });
  const price = Number(plan.price) || 0;
  if (price <= 0) return json(res, 409, { error: 'Dit abonnement is gratis; vraag de studio om het voor je te activeren.', build: BUILD });

  const mollie = await getOrgMollieKey(db, orgId);
  if (!mollie) return json(res, 409, { error: 'Deze studio heeft nog geen betalingen ingesteld.', build: BUILD });

  const orgSnap = await db.collection('orgs').doc(orgId).get();
  const orgName = orgSnap.exists ? String(orgSnap.data()?.name || orgId) : orgId;
  const origin = appOrigin(req);

  let payment;
  try {
    payment = await createMolliePayment({
      apiKey: mollie.apiKey,
      amount: price,
      description: `${plan.name} — ${orgName}`,
      redirectUrl: `${origin}/?aankoop=${encodeURIComponent(planId)}#profiel`,
      webhookUrl: `${origin}/mollie-webhook/${orgId}`,
    });
  } catch (e) {
    console.error('[booking] Mollie-betaling aanmaken mislukt:', e);
    return json(res, 502, { error: 'Betalen bij Mollie lukte nu niet. Probeer het zo nog eens.', build: BUILD });
  }

  const nowIso = new Date().toISOString();
  await db.collection('mollieCheckouts').doc(payment.id).set({
    orgId,
    userId: uid,
    planId,
    mode: mollie.mode,
    status: 'pending',
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  return json(res, 200, { checkoutUrl: payment.checkoutUrl, build: BUILD });
}

/**
 * Een geslaagde zelf-aankoop verwerken: nieuw lidmaatschap (een lopend lidmaatschap stopt — zelfde
 * regel als wanneer een trainer een abonnement toekent, zie `assign`), credits bijschrijven, en de
 * post meteen als betaald boeken met een factuurnummer. Wordt aangeroepen vanuit mollieWebhook.
 */
async function settlePurchase(db, checkout, paymentId) {
  const { orgId, userId, planId } = checkout;
  const planSnap = await db.collection('plans').doc(planId).get();
  if (!planSnap.exists) throw new Error('Abonnement bestaat niet meer.');
  const plan = { id: planSnap.id, ...planSnap.data() };
  const nowIso = new Date().toISOString();
  const current = await activeMembership(db, orgId, userId);
  const membership = newMembership({ id: newId('mb'), orgId, userId, plan, nowIso, byUserId: userId });
  const credits = plan.credits == null ? 0 : Number(plan.credits) || 0;

  const chargeId = await db.runTransaction(async (tx) => {
    // Eerste lezing, en meteen de bewaking tegen dubbel verwerken: Mollie (of een trage tweede
    // aanroep) kan dezelfde melding twee keer sturen. Alleen de transactie die "pending" nog ziet
    // mag doorgaan; Firestore herhaalt een transactie zelf al bij een conflicterende schrijving,
    // dus dit is ook onder gelijktijdige meldingen veilig.
    const checkoutRef = db.collection('mollieCheckouts').doc(paymentId);
    const checkoutSnap = await tx.get(checkoutRef);
    if (!checkoutSnap.exists || checkoutSnap.data().status !== 'pending') return null;

    const accountRef = db.collection('creditAccounts').doc(accountId(orgId, userId));
    const aSnap = await tx.get(accountRef);
    const saldo = Number(aSnap.exists ? aSnap.data().balance : 0) || 0;
    const orgRef = db.collection('orgs').doc(orgId);
    const orgSnap = await tx.get(orgRef);

    if (current) tx.set(db.collection('memberships').doc(current.id), { status: 'cancelled', cancelledAt: nowIso, updatedAt: nowIso }, { merge: true });
    tx.set(db.collection('memberships').doc(membership.id), membership);

    const invoiceNumber = reserveInvoiceNumber(tx, orgRef, orgSnap, nowIso);
    const charge = newCharge({ id: newId('ch'), orgId, userId, plan, membershipId: membership.id, periodStartIso: nowIso, nowIso, invoiceNumber });
    tx.set(db.collection('charges').doc(charge.id), { ...charge, status: 'paid', paidAt: nowIso, paidBy: 'mollie', molliePaymentId: paymentId });

    if (credits > 0) {
      tx.set(accountRef, { orgId, userId, balance: saldo + credits, updatedAt: nowIso }, { merge: true });
      tx.set(db.collection('creditLedger').doc(newId('cl')), {
        orgId,
        userId,
        delta: credits,
        reason: 'plan',
        planId: plan.id,
        note: `${plan.name} gekocht`,
        byUserId: userId,
        createdAt: nowIso,
      });
    }
    tx.set(checkoutRef, { status: 'completed', chargeId: charge.id, completedAt: nowIso, updatedAt: nowIso }, { merge: true });
    return charge.id;
  });

  if (!chargeId) return; // al verwerkt door een gelijktijdige melding; niets meer te doen

  try {
    await deliverInvoiceEmail(db, chargeId);
  } catch (e) {
    console.error('[booking] factuurmail na aankoop mislukt (aankoop blijft geldig):', e);
  }
}

/**
 * Alle openstaande verlengingen en verlopen kaarten van een studio verwerken. Wordt aangeroepen
 * zodra staf Beheer opent; idempotent, dus vaker aanroepen kan geen kwaad.
 */
async function renewDue(res, db, myOrgs, body) {
  const orgId = orgIdOf(body?.orgId);
  if (!myOrgs.includes(orgId)) return json(res, 403, { error: 'Niet jouw studio.', build: BUILD });
  const nowIso = new Date().toISOString();
  const snap = await db.collection('memberships').where('orgId', '==', orgId).where('status', '==', 'active').get();
  let steps = 0;
  for (const d of snap.docs) {
    const r = await settleMembership(db, newId, d.ref, nowIso);
    steps += r.steps;
  }
  return json(res, 200, { memberships: snap.size, steps, build: BUILD });
}

// --- Facturen ---------------------------------------------------------------------

/** Logo van de studio als data-URL voor in de PDF: PNG en JPEG direct, SVG eerst gerasterd; anders null. */
async function fetchLogo(url) {
  if (!url) return null;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 2 * 1024 * 1024) return null;
    return await logoToDataUrl(buf, r.headers.get('content-type'));
  } catch {
    return null;
  }
}

/**
 * Post ophalen en zo nodig een factuurnummer toekennen. Een post van vóór de nummering krijgt er
 * bij de eerste aanvraag alsnog een, in een transactie, zodat de reeks doorloopt zonder gaten.
 * Geeft null als de post niet bestaat.
 */
async function loadInvoiceCharge(db, chargeId) {
  const ref = db.collection('charges').doc(chargeId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const charge = { id: snap.id, ...snap.data() };
  if (charge.invoiceNumber) return charge;
  const nowIso = new Date().toISOString();
  const orgId = orgIdOf(charge.orgId);
  return db.runTransaction(async (tx) => {
    const cSnap = await tx.get(ref);
    const c = { id: cSnap.id, ...cSnap.data() };
    if (c.invoiceNumber) return c;
    const orgRef = db.collection('orgs').doc(orgId);
    const orgSnap = await tx.get(orgRef);
    const invoiceNumber = reserveInvoiceNumber(tx, orgRef, orgSnap, nowIso);
    const patch = { invoiceNumber, invoiceIssuedAt: nowIso, vatRate: vatRateOf(c.vatRate), updatedAt: nowIso };
    tx.set(ref, patch, { merge: true });
    return { ...c, ...patch };
  });
}

/** Alles wat factuur en mail nodig hebben: studio, bedrijfsgegevens, lid, taal, logo, en de PDF. */
async function renderInvoice(db, charge) {
  const orgId = orgIdOf(charge.orgId);
  const [orgSnap, memberSnap] = await Promise.all([db.collection('orgs').doc(orgId).get(), db.collection('profiles').doc(String(charge.userId)).get()]);
  const org = orgSnap.exists ? orgSnap.data() : {};
  const memberData = memberSnap.exists ? memberSnap.data() : {};
  const lang = memberData.language === 'en' ? 'en' : 'nl';
  const business = businessOf({ ...org, name: org.name || orgId });
  const member = { name: String(memberData.displayName || memberData.email || charge.userId), email: String(memberData.email || '') };
  // Drukversie (PNG, ook van een SVG-logo) gaat voor; anders het gewone logo, dat de server zo nodig rastert.
  const logoDataUrl = (await fetchLogo(org.branding?.logoPrintUrl)) ?? (await fetchLogo(org.branding?.logoUrl));
  const brandColor = org.branding?.seedColor ?? null;
  const pdf = buildInvoicePdf({ lang, business, charge, member, logoDataUrl, brandColor });
  return { lang, business, member, pdf, fileName: invoiceFileName(lang, charge.invoiceNumber), logoPrintUrl: org.branding?.logoPrintUrl ?? null, brandColor };
}

/**
 * Factuur-PDF van een post. Staf van de studio mag elke post; een lid alleen zijn eigen. Het
 * antwoord draagt de PDF als base64.
 */
async function invoice(res, db, uid, myOrgs, isStaff, chargeId) {
  if (!chargeId) return json(res, 400, { error: 'Geen post opgegeven.', build: BUILD });
  const peek = await db.collection('charges').doc(chargeId).get();
  if (!peek.exists) return json(res, 404, { error: 'Post niet gevonden.', build: BUILD });
  const orgId = orgIdOf(peek.data().orgId);
  const mine = String(peek.data().userId) === uid;
  if (!(mine || (isStaff && myOrgs.includes(orgId)))) return json(res, 403, { error: 'Deze post is niet van jou.', build: BUILD });

  const charge = await loadInvoiceCharge(db, chargeId);
  const r = await renderInvoice(db, charge);
  return json(res, 200, { invoiceNumber: charge.invoiceNumber, fileName: r.fileName, pdfBase64: Buffer.from(r.pdf).toString('base64'), build: BUILD });
}

/**
 * Kern van 'factuur mailen', los van het HTTP-antwoord — ook gebruikt na een automatische
 * Mollie-betaling (mollieWebhook). Geeft null terug als mail niet ingericht is of het lid geen
 * e-mailadres heeft; de aanroeper beslist dan zelf wat daarmee te doen (foutmelding, of gewoon
 * doorgaan — een aankoop mag nooit vastlopen op een niet-verstuurde factuurmail).
 */
async function deliverInvoiceEmail(db, chargeId) {
  if (!mailConfigured()) return null;
  const charge = await loadInvoiceCharge(db, chargeId);
  const r = await renderInvoice(db, charge);
  const to = r.member.email.trim();
  if (!to) return null;

  const mail = buildInvoiceEmail({ lang: r.lang, business: r.business, charge, member: r.member, logoUrl: r.logoPrintUrl, brandColor: r.brandColor });
  const messageId = await sendViaResend({
    fromName: r.business.legalName,
    to,
    replyTo: r.business.invoiceEmail || undefined,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    attachments: [{ filename: r.fileName, content: Buffer.from(r.pdf).toString('base64') }],
  });
  const sentAt = new Date().toISOString();
  await db.collection('charges').doc(chargeId).set({ invoiceSentAt: sentAt, invoiceSentTo: to, invoiceMessageId: messageId, updatedAt: sentAt }, { merge: true });
  return { invoiceNumber: charge.invoiceNumber, sentTo: to, sentAt };
}

/**
 * Factuur per mail naar het lid, met de PDF als bijlage, via Resend. Alleen staf van de studio.
 * Op de post komt te staan wanneer en naar welk adres hij ging; opnieuw versturen mag altijd.
 */
async function sendInvoice(res, db, myOrgs, chargeId) {
  if (!chargeId) return json(res, 400, { error: 'Geen post opgegeven.', build: BUILD });
  if (!mailConfigured()) return json(res, 409, { error: 'Mail is nog niet ingericht: zet RESEND_API_KEY en INVOICE_FROM_EMAIL in Vercel.', build: BUILD });
  const peek = await db.collection('charges').doc(chargeId).get();
  if (!peek.exists) return json(res, 404, { error: 'Post niet gevonden.', build: BUILD });
  const orgId = orgIdOf(peek.data().orgId);
  if (!myOrgs.includes(orgId)) return json(res, 403, { error: 'Deze post is niet van jouw studio.', build: BUILD });

  const result = await deliverInvoiceEmail(db, chargeId);
  if (!result) return json(res, 409, { error: 'Dit lid heeft geen e-mailadres.', build: BUILD });
  return json(res, 200, { invoiceNumber: result.invoiceNumber, sentTo: result.sentTo, sentAt: result.sentAt, build: BUILD });
}

/**
 * Mollie meldt hier elke statuswijziging van een betaling (form-encoded, alleen `id` — verder
 * niets vertrouwbaars). De status wordt daarom altijd rechtstreeks bij Mollie opgevraagd, met de
 * sleutel van de studio, vóórdat er iets gebeurt. Idempotent: een dubbele of te late melding voor
 * een al verwerkte betaling doet niets. Antwoordt altijd snel; alleen bij een onverwachte fout
 * krijgt Mollie een 500, zodat hij het vanzelf opnieuw probeert.
 */
async function mollieWebhook(req, res, db, orgId) {
  const plain = (status, text) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end(text);
  };
  let body;
  try {
    body = await readBody(req);
  } catch {
    return plain(200, 'ok');
  }
  const paymentId = String(body?.id ?? '').trim();
  if (!paymentId) return plain(200, 'ok');

  const checkoutRef = db.collection('mollieCheckouts').doc(paymentId);
  const checkoutSnap = await checkoutRef.get();
  if (!checkoutSnap.exists) return plain(200, 'ok');
  const checkout = checkoutSnap.data();
  if (checkout.orgId !== orgId) return plain(200, 'ok');
  if (checkout.status !== 'pending') return plain(200, 'ok');

  const mollie = await getOrgMollieKey(db, orgId);
  if (!mollie) return plain(200, 'ok');

  let payment;
  try {
    payment = await getMolliePayment({ apiKey: mollie.apiKey, paymentId });
  } catch (e) {
    console.error('[booking] Mollie-betaling ophalen mislukt:', e);
    return plain(500, 'retry');
  }

  if (payment.status === 'paid') {
    try {
      await settlePurchase(db, checkout, paymentId);
    } catch (e) {
      console.error('[booking] aankoop verwerken mislukt:', e);
      return plain(500, 'retry');
    }
  } else if (['failed', 'expired', 'canceled'].includes(payment.status)) {
    await checkoutRef.set({ status: payment.status, updatedAt: new Date().toISOString() }, { merge: true });
  }
  return plain(200, 'ok');
}

/** Basis-URL van de app voor openbare links: uit de aanvraag, of vast via PUBLIC_APP_ORIGIN. */
function appOrigin(req) {
  const fixed = String(process.env.PUBLIC_APP_ORIGIN ?? '').trim();
  if (fixed) return fixed.replace(/\/+$/, '');
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'lift-log-phi.vercel.app').split(',')[0].trim();
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  return `${proto}://${host}`;
}

/** Korte WhatsApp-tekst bij de factuurlink, in de taal van het lid. */
function invoiceMessage(lang, { firstName, number, studio, amount, due, url, paid }) {
  if (lang === 'en') {
    return paid
      ? `Hi ${firstName}, here is your invoice ${number} from ${studio} (${amount}, paid). View and download: ${url}`
      : `Hi ${firstName}, here is your invoice ${number} from ${studio}: ${amount}, due before ${due}. View and download: ${url}`;
  }
  return paid
    ? `Hoi ${firstName}, hier is je factuur ${number} van ${studio} (${amount}, betaald). Bekijken en downloaden: ${url}`
    : `Hoi ${firstName}, hier is je factuur ${number} van ${studio}: ${amount}, te betalen vóór ${due}. Bekijken en downloaden: ${url}`;
}

/**
 * Openbare link naar de factuur, plus een korte tekst voor WhatsApp. De code wordt één keer
 * gemaakt en blijft daarna gelijk, zodat een eerder gestuurde link blijft werken.
 */
async function invoiceLink(req, res, db, uid, myOrgs, isStaff, chargeId) {
  if (!chargeId) return json(res, 400, { error: 'Geen post opgegeven.', build: BUILD });
  const ref = db.collection('charges').doc(chargeId);
  const peek = await ref.get();
  if (!peek.exists) return json(res, 404, { error: 'Post niet gevonden.', build: BUILD });
  const orgId = orgIdOf(peek.data().orgId);
  const mine = String(peek.data().userId) === uid;
  if (!(mine || (isStaff && myOrgs.includes(orgId)))) return json(res, 403, { error: 'Deze post is niet van jou.', build: BUILD });

  let charge = await loadInvoiceCharge(db, chargeId);
  if (!charge.invoiceToken) {
    const invoiceToken = randomBytes(16).toString('hex');
    await ref.set({ invoiceToken, updatedAt: new Date().toISOString() }, { merge: true });
    charge = { ...charge, invoiceToken };
  }
  const [orgSnap, memberSnap] = await Promise.all([db.collection('orgs').doc(orgId).get(), db.collection('profiles').doc(String(charge.userId)).get()]);
  const org = orgSnap.exists ? orgSnap.data() : {};
  const memberData = memberSnap.exists ? memberSnap.data() : {};
  const lang = memberData.language === 'en' ? 'en' : 'nl';
  const locale = lang === 'en' ? 'en-GB' : 'nl-NL';
  const business = businessOf({ ...org, name: org.name || orgId });
  const url = `${appOrigin(req)}/f/${charge.invoiceToken}`;
  const amount = `€ ${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(charge.amount) || 0)}`;
  const issued = charge.invoiceIssuedAt || charge.issuedAt || new Date().toISOString();
  const due = new Date(dueDateOf(issued)).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
  const firstName = String(memberData.displayName || '').trim().split(/\s+/)[0] || (lang === 'en' ? 'there' : 'daar');
  const text = invoiceMessage(lang, { firstName, number: charge.invoiceNumber, studio: business.legalName, amount, due, url, paid: charge.status === 'paid' });
  return json(res, 200, { invoiceNumber: charge.invoiceNumber, url, text, build: BUILD });
}

/** GET /f/{token}: de PDF voor wie de link heeft. Geen inlog; de code is het geheim. */
async function publicInvoice(res, db, token) {
  const plain = (status, text) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(text);
  };
  if (!/^[0-9a-f]{32}$/.test(token)) return plain(404, 'Factuur niet gevonden.');
  const snap = await db.collection('charges').where('invoiceToken', '==', token).get();
  const d = snap.docs[0];
  if (!d) return plain(404, 'Factuur niet gevonden.');
  const charge = await loadInvoiceCharge(db, d.id);
  const r = await renderInvoice(db, charge);
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${r.fileName}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.end(Buffer.from(r.pdf));
}

/**
 * GET /kalender/{token}: de .ics-kalenderfeed voor wie de link heeft. Geen inlog — een agenda-app
 * haalt deze URL zelf periodiek op. De sleutel wordt gehasht en tegen `calendarFeedTokens`
 * opgezocht (zelfde opzet als mcpKeys); alleen de hash staat in Firestore, nooit de sleutel zelf.
 * Twee soorten token (`kind`, ontbreekt = 'sporter' voor tokens van vóór dit onderscheid):
 * 'sporter' geeft de lessen waar het lid voor geboekt staat, 'trainer' geeft de lessen die diegene
 * zelf geeft (classes.trainerId), zoals ook "Mijn dag" op de Lessen-pagina filtert.
 */
async function calendarFeed(res, db, token) {
  const plain = (status, text) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(text);
  };
  if (!/^[A-Za-z0-9_-]{20,}$/.test(token)) return plain(404, 'Kalenderfeed niet gevonden.');

  const tokenSnap = await db.collection('calendarFeedTokens').doc(hashFeedToken(token)).get();
  if (!tokenSnap.exists) return plain(404, 'Kalenderfeed niet gevonden of ingetrokken.');
  const tokenData = tokenSnap.data() || {};
  const userId = String(tokenData.userId ?? '');
  const kind = tokenData.kind === 'trainer' ? 'trainer' : 'sporter';
  const profileSnap = userId ? await db.collection('profiles').doc(userId).get() : null;
  if (!profileSnap?.exists) return plain(404, 'Kalenderfeed niet gevonden.');
  const profile = profileSnap.data();
  if (kind === 'trainer' && profile.role !== 'trainer' && profile.role !== 'admin') return plain(404, 'Kalenderfeed niet gevonden.');
  const orgIds = Array.isArray(profile.orgIds) && profile.orgIds.length ? profile.orgIds : [profile.orgId || 'vanas'];

  const classesSnaps = await Promise.all(orgIds.map((orgId) => db.collection('classes').where('orgId', '==', orgId).get()));
  const today = todayIso();
  const classes = [];
  if (kind === 'trainer') {
    for (const snap of classesSnaps) {
      for (const d of snap.docs) {
        const c = d.data();
        if (c.trainerId !== userId || String(c.date ?? '') < today) continue;
        classes.push({ id: d.id, title: String(c.title || 'Les'), date: c.date, startTime: c.startTime || '00:00', endTime: c.endTime || null, room: c.room || null, description: c.description || null, sessionKind: c.sessionKind, cancelledAt: c.cancelledAt || null, bookingStatus: 'booked' });
      }
    }
  } else {
    const bookingsSnap = await db.collection('bookings').where('userId', '==', userId).get();
    const bookingStatusByClass = new Map();
    for (const d of bookingsSnap.docs) {
      const b = d.data();
      if (b.status === 'booked' || b.status === 'waitlist') bookingStatusByClass.set(b.classId, b.status);
    }
    for (const snap of classesSnaps) {
      for (const d of snap.docs) {
        const c = d.data();
        const bookingStatus = bookingStatusByClass.get(d.id);
        if (!bookingStatus || String(c.date ?? '') < today) continue;
        classes.push({ id: d.id, title: String(c.title || 'Les'), date: c.date, startTime: c.startTime || '00:00', endTime: c.endTime || null, room: c.room || null, description: c.description || null, sessionKind: c.sessionKind, cancelledAt: c.cancelledAt || null, bookingStatus });
      }
    }
  }
  classes.sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));

  const name = String(profile.displayName || '').trim();
  const calendarName =
    kind === 'trainer' ? (name ? `Lessen die ik geef — ${name}` : 'Lessen die ik geef') : name ? `Mijn lessen — ${name}` : 'Mijn lessen';
  const ics = buildIcsFeed({ classes, calendarName });
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'inline; filename="mijn-lessen.ics"');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.end(ics);
}

// --- Terugkerende lessen (Beheer → Lessoorten → "Terugkerend") -------------------------

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Hoeveel weken vooruit de ontbrekende lessen van een schema worden aangemaakt. */
const WEEKS_AHEAD = 8;

/**
 * Dagelijkse cron: zet voor elke lessoort met een `schedule` de ontbrekende lessen op het rooster.
 * Rekenkant in api/_lib/classSchedule.mjs (puur, met tests); hier alleen het lezen/schrijven.
 */
/**
 * Mag deze aanroep een cron-taak starten? Vercel stuurt `Authorization: Bearer $CRON_SECRET` mee.
 * Geeft `true` terug, of stuurt zelf de foutreactie en geeft `false`.
 */
function cronAuthorized(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    json(res, 500, { error: 'CRON_SECRET ontbreekt in de serveromgeving.', build: BUILD });
    return false;
  }
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  if (authHeader !== `Bearer ${secret}`) {
    json(res, 401, { error: 'Niet geautoriseerd.', build: BUILD });
    return false;
  }
  return true;
}

/**
 * Dagelijkse cron (rond 18:00): de avondronde van meldingen — lesherinneringen voor morgen,
 * geplande berichten van de studio, op zondag de wekelijkse check-in, op maandag "2 weken niet
 * getraind" voor trainers, en verjaardagen. Alles staat in api/_lib/notifications.mjs.
 */
async function eveningRun(req, res, db) {
  if (!cronAuthorized(req, res)) return;
  const report = await runEveningNotifications(db);
  return json(res, 200, { ...report, build: BUILD });
}

// --- Berichten van de studio (Beheer → Meldingen) -----------------------------------------

const BROADCASTS_PER_DAY = 30;

/**
 * Een bericht naar leden sturen: meteen, of op een gekozen dag in de avondronde. De doelgroep
 * wordt pas bij het versturen bepaald, zodat een gepland bericht ook wie er later bijkwam bereikt.
 */
async function sendBroadcast(res, db, uid, me, myOrgs, body) {
  const orgId = orgIdOf(body?.orgId);
  if (!myOrgs.includes(orgId)) return json(res, 403, { error: 'Niet jouw studio.', build: BUILD });

  const input = {
    title: String(body?.title ?? '').replace(/\s+/g, ' ').trim(),
    body: String(body?.body ?? '').trim(),
    audience: {
      type: String(body?.audience?.type ?? ''),
      id: body?.audience?.id ? String(body.audience.id) : null,
      label: String(body?.audience?.label ?? '').slice(0, 80),
    },
    scheduledFor: body?.scheduledFor ? String(body.scheduledFor) : null,
  };
  const today = amsterdamDate(new Date(), 0);
  const problem = validateBroadcast(input, amsterdamDate(new Date(), 1));
  if (problem) return json(res, 400, { error: problem, build: BUILD });

  if (!(await enforceRateLimit(db, res, uid, 'broadcast', BROADCASTS_PER_DAY, 24 * 60 * 60 * 1000))) return;

  const id = newId('bc');
  const ref = db.collection('broadcasts').doc(id);
  const doc = {
    id,
    orgId,
    title: input.title,
    body: input.body,
    audience: input.audience,
    scheduledFor: input.scheduledFor,
    status: input.scheduledFor ? 'scheduled' : 'sending',
    createdBy: uid,
    createdByName: String(me?.displayName || me?.email || ''),
    createdAt: new Date().toISOString(),
    sentAt: null,
    recipients: null,
    devices: null,
  };
  await ref.set(doc);
  if (input.scheduledFor) return json(res, 200, { broadcast: doc, build: BUILD });

  const result = await deliverBroadcast(db, id, doc, today);
  return json(res, 200, { broadcast: { ...doc, ...result }, build: BUILD });
}

/** De laatste berichten van een studio, nieuwste eerst. */
async function listBroadcasts(res, db, myOrgs, body) {
  const orgId = orgIdOf(body?.orgId);
  if (!myOrgs.includes(orgId)) return json(res, 403, { error: 'Niet jouw studio.', build: BUILD });
  const snap = await db.collection('broadcasts').where('orgId', '==', orgId).get();
  const list = snap.docs
    .map((d) => ({ ...d.data(), id: d.id }))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 50);
  return json(res, 200, { broadcasts: list, build: BUILD });
}

/** Een gepland bericht intrekken, zolang het nog niet verstuurd is. */
async function cancelBroadcast(res, db, myOrgs, broadcastId) {
  if (!broadcastId) return json(res, 400, { error: 'Geen bericht opgegeven.', build: BUILD });
  const ref = db.collection('broadcasts').doc(broadcastId);
  const snap = await ref.get();
  if (!snap.exists || !myOrgs.includes(orgIdOf(snap.data().orgId))) return json(res, 404, { error: 'Bericht niet gevonden.', build: BUILD });
  if (snap.data().status !== 'scheduled') return json(res, 400, { error: 'Dit bericht is al verstuurd.', build: BUILD });
  await ref.set({ status: 'cancelled', cancelledAt: new Date().toISOString() }, { merge: true });
  return json(res, 200, { cancelled: true, build: BUILD });
}

async function generateClasses(req, res, db) {
  if (!cronAuthorized(req, res)) return;

  const typesSnap = await db.collection('classTypes').get();
  const totals = { created: 0, autoBooked: 0, autoWaitlisted: 0, autoSkippedNoCredits: 0 };

  // Eerst opruimen: gegenereerde lessen van een verplaatst weekmoment of een verwijderde lessoort.
  const from = todayIso();
  const expected = new Map(
    typesSnap.docs.map((d) => [d.id, expectedIdsForSchedule(d.id, d.data().schedule, from, WEEKS_AHEAD)])
  );
  const futureSnap = await db.collection('classes').where('date', '>=', from).get();
  const stale = staleGeneratedClasses(futureSnap.docs.map((d) => ({ ...d.data(), id: d.id })), expected, from);
  await deleteClasses(db, stale.remove);
  const pruned = { removed: stale.remove.length, staleWithBookings: stale.keepBooked.length };

  for (const typeDoc of typesSnap.docs) {
    const ct = typeDoc.data();
    if (!Array.isArray(ct.schedule) || ct.schedule.length === 0) continue;
    const result = await generateForClassType(db, typeDoc.id, ct);
    totals.created += result.created;
    totals.autoBooked += result.autoBooked;
    totals.autoWaitlisted += result.autoWaitlisted;
    totals.autoSkippedNoCredits += result.autoSkippedNoCredits;
  }

  return json(res, 200, { ...totals, ...pruned, build: BUILD });
}

/**
 * Rekenkant van het rooster vullen voor één lessoort: de ontbrekende weekmomenten (tot
 * `WEEKS_AHEAD` weken vooruit) op het rooster zetten en daarna "elke week"-inschrijvingen op de
 * nieuwe lessen meeboeken. Gedeeld door de dagelijkse cron en het direct genereren na het opslaan
 * van een lessoort (zodat een trainer niet tot de volgende cron-run hoeft te wachten).
 */
async function generateForClassType(db, classTypeId, ct) {
  const from = todayIso();
  const schedule = ct.schedule;
  const all = occurrencesForSchedule(schedule, from, WEEKS_AHEAD);
  const result = { created: 0, autoBooked: 0, autoWaitlisted: 0, autoSkippedNoCredits: 0 };
  if (all.length === 0) return result;

  const allRefs = all.map((o) => db.collection('classes').doc(classIdForOccurrence(classTypeId, o.date, o.startTime)));
  const existingDocs = await db.getAll(...allRefs);
  const existingKeys = new Set(existingDocs.filter((d) => d.exists).map((d) => d.id));

  const missing = missingOccurrences(classTypeId, schedule, from, WEEKS_AHEAD, existingKeys);
  if (missing.length === 0) return result;

  const batch = db.batch();
  for (const o of missing) {
    const ref = db.collection('classes').doc(classIdForOccurrence(classTypeId, o.date, o.startTime));
    batch.set(ref, {
      id: ref.id,
      orgId: ct.orgId,
      title: ct.name,
      date: o.date,
      startTime: o.startTime,
      endTime: o.endTime,
      // Zonder vaste trainer staat de les zonder trainer op het rooster (bijv. wisselende trainers).
      trainerId: ct.defaultTrainerId || null,
      capacity: ct.capacity ?? 999,
      creditCost: ct.creditCost ?? 1,
      schemaId: ct.schemaId ?? null,
      classTypeId,
      room: ct.room ?? null,
      sessionKind: ct.sessionKind ?? 'group',
      description: ct.description ?? null,
      // Vaste PT van één lid (Profiel → Vaste lessen → PT-moment): alleen voor dat lid te boeken.
      privateFor: ct.privateFor ?? null,
      bookedCount: 0,
      waitlistCount: 0,
      cancelledAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    result.created++;
  }
  await batch.commit();

  // Nieuw gemaakte lessen: iedereen met een actieve "elke week"-inschrijving op dit weekmoment
  // meteen meeboeken. Alleen voor deze net aangemaakte lessen — die zijn per definitie nog niet
  // eerder geprobeerd, dus dit gebeurt precies één keer per les.
  const emptyPrivate = [];
  for (const o of missing) {
    const weekday = new Date(`${o.date}T00:00:00`).getDay();
    const classId = classIdForOccurrence(classTypeId, o.date, o.startTime);
    const outcome = await autoBookStandingBookings(db, ct.orgId, classId, classTypeId, weekday, o.startTime, o.date);
    result.autoBooked += outcome.booked;
    result.autoWaitlisted += outcome.skippedFull;
    result.autoSkippedNoCredits += outcome.skippedNoCredits;
    // Vaste PT in een week dat het lid niet komt (pauze, nog niet begonnen, geen credits): niet
    // als lege les op het rooster van de trainer laten staan.
    if (ct.privateFor && outcome.booked + outcome.skippedFull === 0) emptyPrivate.push(classId);
  }
  if (emptyPrivate.length > 0) {
    const cancelBatch = db.batch();
    const nowIso = new Date().toISOString();
    for (const id of emptyPrivate) cancelBatch.set(db.collection('classes').doc(id), { cancelledAt: nowIso, autoCancelled: true }, { merge: true });
    await cancelBatch.commit();
  }
  return result;
}

/**
 * Meteen het rooster vullen voor één lessoort, in plaats van tot de volgende dagelijkse cron te
 * wachten — voor als een trainer net een terugkerend weekmoment heeft opgeslagen en de les
 * verwacht te zien. Alleen staf van de eigen studio, en alleen als de lessoort een schema en een
 * vaste trainer heeft (anders is er niets te genereren).
 */
async function generateClassOccurrencesNow(res, db, myOrgs, isStaff, classTypeId) {
  if (!isStaff) return json(res, 403, { error: 'Alleen een trainer of beheerder kan het rooster vullen.', build: BUILD });
  if (!classTypeId) return json(res, 400, { error: 'Geen lessoort opgegeven.', build: BUILD });
  const snap = await db.collection('classTypes').doc(classTypeId).get();
  if (!snap.exists) return json(res, 404, { error: 'Deze lessoort bestaat niet (meer).', build: BUILD });
  const ct = snap.data();
  if (!myOrgs.includes(orgIdOf(ct.orgId))) return json(res, 403, { error: 'Deze lessoort hoort niet bij jouw studio.', build: BUILD });
  // Altijd eerst het rooster laten kloppen met de lessoort zoals hij nu is opgeslagen: verschoven of
  // weggehaalde weekmomenten opruimen en naam/eindtijd/ruimte doorzetten op wat al gepland staat.
  const synced = await syncClassType(db, classTypeId, ct);
  const empty = { created: 0, autoBooked: 0, autoWaitlisted: 0, autoSkippedNoCredits: 0 };
  const result =
    Array.isArray(ct.schedule) && ct.schedule.length > 0 ? await generateForClassType(db, classTypeId, ct) : empty;
  return json(res, 200, { ...result, ...synced, build: BUILD });
}

/**
 * Het rooster van de eigen studio opruimen: toekomstige lessen van een verwijderde lessoort (ook
 * handmatig geplande) en gegenereerde lessen van een verplaatst of weggehaald weekmoment. Lessen
 * waar al iemand op staat blijven staan (die afmelden doet de trainer bewust, met terugbetaling);
 * die komen terug in `staleWithBookings` zodat de app ze kan noemen. Aangeroepen na het verwijderen
 * van een lessoort en bij het openen van Beheer → Lessoorten, zodat het rooster niet op de
 * dagelijkse cron hoeft te wachten.
 */
async function pruneStaleClasses(res, db, myOrgs, isStaff) {
  if (!isStaff) return json(res, 403, { error: 'Alleen een trainer of beheerder kan het rooster aanpassen.', build: BUILD });
  const from = todayIso();
  const inMyOrg = (d) => myOrgs.includes(orgIdOf(d.orgId));
  const [typesSnap, futureSnap] = await Promise.all([
    db.collection('classTypes').get(),
    db.collection('classes').where('date', '>=', from).get(),
  ]);
  const expected = new Map(
    typesSnap.docs.filter((d) => inMyOrg(d.data())).map((d) => [d.id, expectedIdsForSchedule(d.id, d.data().schedule, from, WEEKS_AHEAD)])
  );
  const classes = futureSnap.docs.map((d) => ({ ...d.data(), id: d.id })).filter(inMyOrg);
  const stale = staleGeneratedClasses(classes, expected, from);
  await deleteClasses(db, stale.remove);
  return json(res, 200, { removed: stale.remove.length, staleWithBookings: stale.keepBooked.map(staleSummary), build: BUILD });
}

/** Toekomstige lessen van één lessoort (binnen de eigen studio's). Filter op datum in het geheugen: geen extra index nodig. */
async function futureClassesOfType(db, classTypeId, from, myOrgs) {
  const snap = await db.collection('classes').where('classTypeId', '==', classTypeId).get();
  return snap.docs
    .map((d) => ({ ...d.data(), id: d.id }))
    .filter((c) => typeof c.date === 'string' && c.date >= from && (!myOrgs || myOrgs.includes(orgIdOf(c.orgId))));
}

const staleSummary = (c) => ({ id: c.id, title: c.title ?? '', date: c.date, startTime: c.startTime ?? '', bookedCount: Number(c.bookedCount) || 0 });

async function deleteClasses(db, classes) {
  for (let i = 0; i < classes.length; i += 400) {
    const batch = db.batch();
    for (const c of classes.slice(i, i + 400)) batch.delete(db.collection('classes').doc(c.id));
    await batch.commit();
  }
}

/**
 * Na het opslaan van een lessoort: gegenereerde lessen die het schema niet meer oplevert weghalen
 * (als er niemand op staat) en op de lessen die blijven de naam, eindtijd, ruimte, omschrijving en
 * soort bijwerken. Alleen hier, niet in de dagelijkse cron, zodat een aanpassing op één losse les
 * blijft staan tot de trainer de lessoort zelf weer wijzigt.
 */
async function syncClassType(db, classTypeId, ct) {
  const from = todayIso();
  const schedule = Array.isArray(ct.schedule) ? ct.schedule : [];
  const expectedIds = expectedIdsForSchedule(classTypeId, schedule, from, WEEKS_AHEAD);
  const classes = await futureClassesOfType(db, classTypeId, from, [orgIdOf(ct.orgId)]);
  const stale = staleGeneratedClasses(classes, new Map([[classTypeId, expectedIds]]), from);
  await deleteClasses(db, stale.remove);

  const endTimeFor = (c) => {
    const weekday = new Date(`${c.date}T00:00:00`).getDay();
    return schedule.find((s) => s.weekday === weekday && s.startTime === c.startTime)?.endTime ?? c.endTime ?? null;
  };
  const updates = [];
  for (const c of classes) {
    if (!expectedIds.has(c.id)) continue;
    const u = classFieldUpdates(c, ct, endTimeFor(c));
    if (u) updates.push([c.id, u]);
  }
  for (let i = 0; i < updates.length; i += 400) {
    const batch = db.batch();
    for (const [id, u] of updates.slice(i, i + 400)) batch.update(db.collection('classes').doc(id), { ...u, updatedAt: new Date().toISOString() });
    await batch.commit();
  }
  return { removed: stale.remove.length, updated: updates.length, staleWithBookings: stale.keepBooked.map(staleSummary) };
}

/**
 * Voor één nieuw gegenereerde les: alle actieve "elke week"-inschrijvingen op dat weekmoment
 * (lessoort + weekdag + starttijd) proberen te boeken, net als een gewone reservering — plek en
 * saldo toegestaan? geboekt. Vol? wachtlijst. Geen saldo? die week overgeslagen, met een reden op
 * de inschrijving zodat de sporter dat op zijn Profiel kan zien.
 */
async function autoBookStandingBookings(db, orgId, classId, classTypeId, weekday, startTime, date) {
  const counts = { booked: 0, skippedFull: 0, skippedNoCredits: 0 };
  const snap = await db
    .collection('standingBookings')
    .where('orgId', '==', orgId)
    .where('classTypeId', '==', classTypeId)
    .where('weekday', '==', weekday)
    .where('startTime', '==', startTime)
    .where('active', '==', true)
    .get();

  for (const doc of snap.docs) {
    // Nog niet begonnen, of in een pauze (vakantie): deze week overslaan.
    if (!standingAppliesOn(doc.data(), date)) continue;
    const result = await attemptStandingBooking(db, orgId, classId, { ...doc.data(), id: doc.id });
    if (result) counts[result.outcome]++;
  }
  return counts;
}

/**
 * Eén automatische boekpoging, in een eigen transactie zodat een misser bij de een de anderen
 * niet blokkeert. Retourneert `{ outcome, date }` ('booked' | 'skippedFull' | 'skippedNoCredits'),
 * of null als de sporter al op een andere manier voor deze les staat (dan blijft de inschrijving
 * ongemoeid — niet overschrijven met een uitkomst die niet klopt).
 */
async function attemptStandingBooking(db, orgId, classId, standing) {
  const userId = String(standing.userId);
  const nowIso = new Date().toISOString();

  const result = await db.runTransaction(async (tx) => {
    const classRef = db.collection('classes').doc(classId);
    const classSnap = await tx.get(classRef);
    if (!classSnap.exists) return null;
    const cls = classSnap.data();
    const reopen = canReopenPrivateClass(cls, userId);
    if (cls.cancelledAt && !reopen) return null;
    if (cls.privateFor && cls.privateFor !== userId) return null;

    const mine = await tx.get(db.collection('bookings').where('classId', '==', classId).where('userId', '==', userId));
    if (mine.docs.some((d) => ['booked', 'waitlist'].includes(String(d.data().status)))) return null;

    const capacity = Number(cls.capacity) || 0;
    const booked = Number(cls.bookedCount) || 0;
    const cost = Number(cls.creditCost ?? 1) || 0;
    const onWaitlist = booked >= capacity;

    const accountRef = db.collection('creditAccounts').doc(accountId(orgId, userId));
    const accountSnap = await tx.get(accountRef);
    const balance = Number(accountSnap.exists ? accountSnap.data().balance : 0) || 0;

    if (!onWaitlist && balance < cost) return { outcome: 'skippedNoCredits', date: cls.date };

    const bookingId = newId('bk');
    tx.set(db.collection('bookings').doc(bookingId), {
      id: bookingId,
      orgId,
      classId,
      userId,
      status: onWaitlist ? 'waitlist' : 'booked',
      creditsSpent: onWaitlist ? 0 : cost,
      createdAt: nowIso,
      updatedAt: FieldValue.serverTimestamp(),
    });
    const reopened = reopen ? { cancelledAt: null, autoCancelled: false } : {};
    if (onWaitlist) {
      tx.set(classRef, { waitlistCount: FieldValue.increment(1), ...reopened }, { merge: true });
    } else {
      tx.set(classRef, { bookedCount: FieldValue.increment(1), ...reopened }, { merge: true });
      if (cost > 0) {
        tx.set(accountRef, { orgId, userId, balance: balance - cost, updatedAt: nowIso }, { merge: true });
        tx.set(db.collection('creditLedger').doc(newId('cl')), {
          orgId,
          userId,
          delta: -cost,
          reason: 'booking',
          classId,
          byUserId: userId,
          createdAt: nowIso,
        });
      }
    }
    return { outcome: onWaitlist ? 'skippedFull' : 'booked', date: cls.date };
  });

  if (result) {
    await db
      .collection('standingBookings')
      .doc(standing.id)
      .set({ lastOutcome: result.outcome, lastOutcomeDate: result.date, updatedAt: nowIso }, { merge: true });
  }
  return result;
}

// --- Betalingen (Mollie) ------------------------------------------------------------

/**
 * Mollie-sleutel koppelen. Eerst het formaat controleren, dan bij Mollie zelf laten bevestigen
 * (dat levert ook de bedrijfsnaam op); pas daarna de sleutel opslaan. Zo staat er nooit een
 * sleutel die niet werkt, en hoeft niemand dat via een mislukte betaling te ontdekken.
 */
async function savePaymentKey(res, db, myOrgs, body) {
  const orgId = orgIdOf(body?.orgId);
  if (!myOrgs.includes(orgId)) return json(res, 403, { error: 'Niet jouw studio.', build: BUILD });
  const mode = body?.mode === 'live' ? 'live' : body?.mode === 'test' ? 'test' : null;
  const apiKey = String(body?.apiKey ?? '').trim();
  if (!mode) return json(res, 400, { error: 'Kies test of live.', build: BUILD });
  const formatError = mollieKeyFormatError(mode, apiKey);
  if (formatError) return json(res, 400, { error: formatError, build: BUILD });

  const check = await verifyMollieKey(apiKey);
  if (!check.ok) return json(res, 409, { error: check.error, build: BUILD });

  const nowIso = new Date().toISOString();
  await db.collection('orgSecrets').doc(orgId).set({ [secretFieldFor(mode)]: apiKey, updatedAt: nowIso }, { merge: true });
  const keyLast4 = last4(apiKey);
  await db
    .collection('orgs')
    .doc(orgId)
    .set(
      {
        payments: {
          provider: 'mollie',
          [`${mode}KeyLast4`]: keyLast4,
          [`${mode}ConnectedAt`]: nowIso,
          [`${mode}OrganizationName`]: check.organizationName ?? null,
        },
        updatedAt: nowIso,
      },
      { merge: true }
    );
  return json(res, 200, { mode, last4: keyLast4, connectedAt: nowIso, organizationName: check.organizationName ?? null, build: BUILD });
}

/** Sleutel loskoppelen: uit orgSecrets weg, en het zichtbare restje op orgs mee leegmaken. */
async function removePaymentKey(res, db, myOrgs, body) {
  const orgId = orgIdOf(body?.orgId);
  if (!myOrgs.includes(orgId)) return json(res, 403, { error: 'Niet jouw studio.', build: BUILD });
  const mode = body?.mode === 'live' ? 'live' : body?.mode === 'test' ? 'test' : null;
  if (!mode) return json(res, 400, { error: 'Kies test of live.', build: BUILD });

  const nowIso = new Date().toISOString();
  await db.collection('orgSecrets').doc(orgId).set({ [secretFieldFor(mode)]: FieldValue.delete(), updatedAt: nowIso }, { merge: true });
  await db
    .collection('orgs')
    .doc(orgId)
    .set(
      { payments: { [`${mode}KeyLast4`]: null, [`${mode}ConnectedAt`]: null, [`${mode}OrganizationName`]: null }, updatedAt: nowIso },
      { merge: true }
    );
  return json(res, 200, { mode, build: BUILD });
}
