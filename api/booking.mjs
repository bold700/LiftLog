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
 *   { action: 'rescheduleOptions', classId }         na afmelden van een PT-moment: vrije momenten bij dezelfde
 *                                                     trainer (twee weken, binnen zijn beschikbaarheid, aansluitend eerst)
 *   { action: 'requestReschedule', classId, date, startTime }  nieuw moment aanvragen (sporter; de trainer keurt
 *                                                     goed) of meteen inplannen (staf)
 *   { action: 'rescheduleRequests' }                  openstaande verzoeken (staf) of je eigen verzoeken (sporter)
 *   { action: 'moveStandingPt', standingBookingId, weekday, startTime, endTime, trainerId?, fromDate }
 *                                                     vast PT-moment (reeks) naar een andere dag/tijd/trainer, vanaf
 *                                                     een datum; afspraken vanaf die datum met credit terug (staf)
 *   { action: 'moveOccurrence', bookingId, date, startTime }  één PT-afspraak verzetten: credit terug, nieuw moment
 *                                                     meteen vast (staf)
 *   { action: 'planStatus', userId? }                 abonnement van het lid: waarvoor, hoe vaak per week, hoeveel
 *                                                     vaste momenten er al staan (Moment inplannen)
 *   { action: 'weeklyPtOptions', userId?, trainerId?, duration? }  vrije weekmomenten voor een vast PT-moment
 *   { action: 'requestStandingPt', weekday, startTime, endTime, startDate }  sporter vraagt een vast PT-moment aan;
 *                                                     de trainer keurt goed (zelfde lijst als verzetten)
 *   { action: 'answerReschedule', requestId, approve }  verzoek goedkeuren of afwijzen (trainer of beheerder)
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
 *   { action: 'setMemberActive', userId, active }      lid (de)activeren bij deze studio (beheerder)
 *   { action: 'setTrainsAsMember', userId, on }        trainer/beheerder traint ook mee als lid: betaalt
 *                                                        credits, kan abonnement en facturen krijgen (beheerder)
 *   { action: 'saveGroup', groupId?, name, kind, memberIds, payerId }  groep (bedrijf/gezin/vrienden) opslaan (staf)
 *   { action: 'addPersonalSlot', groupId, … }          vaste groepsles: alle leden elke week, betaald uit het groepstegoed (staf)
 *   { action: 'removeGroupSlot', classTypeId }         vaste groepsles stoppen; komende lessen afgelast, groep krijgt alles terug (staf)
 *   { action: 'deleteGroup', groupId }                 groep weghalen, als er geen abonnement of tegoed meer op staat (staf)
 *                                                        grant/assign/unassign met `groupId` i.p.v. `userId`: het groepstegoed;
 *                                                        de posten van een groepsabonnement gaan naar het hoofdprofiel
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
import { getAdmin, getStorageBucket } from './_lib/firebaseAdmin.mjs';
import { runAccountRetention } from './_lib/accountRetention.mjs';
import { clearPublishedLeaderboard } from './_lib/leaderboardCleanup.mjs';
import { orgIdOf, newId } from './_lib/liftlogData.mjs';
import { absenceCovers, absenceLabel, absenceOn, busyReason, cleanAbsence, substituteOptions } from './_lib/absence.mjs';
import { actingOrg, isAdminIn, isInactiveIn, isStaffAnywhere, isStaffIn, orgsOf, paysAsMemberIn, roleIn } from './_lib/orgRoles.mjs';
import { randomBytes } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { activeMembership, newCharge, newMembership, settleMembership } from './_lib/subscriptions.mjs';
import { billingOf, firstPeriod } from './_lib/billingCycle.mjs';
import { cleanGroupInput, euros, groupChargeOnBook, groupHolderId, groupPricingOf, groupRefundOnCancel, MAX_GROUP_ADJUST } from './_lib/groups.mjs';
import { businessOf, dueDateOf, reserveInvoiceNumber, vatRateOf } from './_lib/invoice.mjs';
import { buildInvoicePdf, invoiceFileName } from './_lib/invoicePdf.mjs';
import { logoToDataUrl } from './_lib/invoiceLogo.mjs';
import { buildInvoiceEmail, mailConfigured, sendViaResend } from './_lib/invoiceEmail.mjs';
import { hashFeedToken, buildIcsFeed } from './_lib/calendarFeed.mjs';
import { last4, mollieKeyFormatError, secretFieldFor, verifyMollieKey, getOrgMollieKey, createMollieCustomer, createMolliePayment, getMolliePayment } from './_lib/molliePayments.mjs';
import { enforceRateLimit } from './_lib/requireUser.mjs';
import { allConflicts, blocksDoubleBooking, findConflicts, hoursOf, outsideAvailability, suggestionsFor, weeklyFreeSlots } from './_lib/scheduleConflicts.mjs';
import { coversOf, perWeekOf, planCoversKind } from './_lib/planCoverage.mjs';
import { availabilityDocId, cleanAvailability } from './_lib/availability.mjs';
import { amsterdamDate, amsterdamDateTime } from './_lib/classReminders.mjs';
import { busyByDate, canRescheduleClass, isOffered, MIN_LEAD_MINUTES, RESCHEDULE_DAYS, rescheduleOptions, rescheduledClassId, rescheduleRequestId } from './_lib/reschedule.mjs';
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
  isBiweekly,
  missingOccurrences,
  onPatternWeek,
  patternFields,
  occurrencesForSchedule,
  personalClassTypeId,
  privateClassEmptyAfter,
  staleGeneratedClasses,
  standingAppliesOn,
  standingBookingId,
} from './_lib/classSchedule.mjs';
import {
  bookedAtOf,
  chooseForFreeSpot,
  freeCancelHoursOf,
  heldForSomeoneElse,
  holdExpired,
  holdUntil,
  minutesSince,
  placeNewBooking,
  refundOnCancel,
  spotFreeForWaitlister,
  waitlistPosition,
} from './_lib/bookingRules.mjs';

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
  return amsterdamDateTime(data.date, data.startTime ?? '00:00');
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  const publicToken = req.method === 'GET' ? String(req.query?.invoice ?? '').trim() : '';
  const cronName = req.method === 'GET' ? String(req.query?.cron ?? '') : '';
  const isCron = cronName === 'generateClasses' || cronName === 'evening' || cronName === 'classReminders';
  const feedToken = req.method === 'GET' ? String(req.query?.feed ?? '').trim() : '';
  const payToken = req.method === 'GET' ? String(req.query?.pay ?? '').trim() : '';
  const mollieWebhookOrgId = req.method === 'POST' ? String(req.query?.mollieWebhook ?? '').trim() : '';
  if (req.method !== 'POST' && !publicToken && !isCron && !feedToken && !payToken) return json(res, 405, { error: 'Method not allowed', build: BUILD });

  const admin = getAdmin();
  if (admin.error) {
    console.error('[booking] Firebase Admin niet beschikbaar:', admin.error);
    return json(res, 500, { error: 'Serverconfiguratie onvolledig.', build: BUILD });
  }
  const { auth, db } = admin;

  if (publicToken) return publicInvoice(res, db, publicToken);
  if (feedToken) return calendarFeed(res, db, feedToken);
  if (payToken) return payInvoice(req, res, db, payToken);
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
  // Elk verzoek handelt in één studio: die de app als actief meestuurt (mits je daar lid bent).
  // Je rol is die in díe studio; trainer bij de ene studio geeft geen rechten bij een andere.
  const actOrg = actingOrg(meData, body?.actingOrgId);
  const myOrgs = [actOrg];
  const myRole = roleIn(meData, actOrg);
  const isStaff = myRole === 'trainer' || myRole === 'admin';
  // Inactief lid bij deze studio: kijken mag (eigen geschiedenis, facturen), boeken en kopen niet.
  const INACTIVE_BLOCKED = new Set(['book', 'purchasePlan', 'addStandingBooking']);
  if (isInactiveIn(meData, actOrg) && INACTIVE_BLOCKED.has(String(body?.action)) && !(isStaff && body?.userId && body.userId !== uid)) {
    return json(res, 403, { error: 'Je lidmaatschap bij deze studio staat op inactief. Neem contact op met de studio.', build: BUILD });
  }

  try {
    switch (body?.action) {
      case 'setMemberActive':
        if (myRole !== 'admin') return json(res, 403, { error: 'Alleen een beheerder kan leden (de)activeren.', build: BUILD });
        return await setMemberActive(res, db, uid, actOrg, String(body.userId ?? '').trim(), body.active === true);
      case 'setTrainsAsMember':
        if (myRole !== 'admin') return json(res, 403, { error: 'Alleen een beheerder kan dit instellen.', build: BUILD });
        return await setTrainsAsMember(res, db, actOrg, String(body.userId ?? '').trim(), body.on === true);
      case 'book':
        return await book(
          res, db, uid, myOrgs,
          String(body.classId ?? '').trim(),
          body.weekly === true,
          isStaff,
          body.userId ? String(body.userId).trim() : null,
          body.extra === true,
          !paysAsMemberIn(meData, actOrg)
        );
      case 'cancel':
        return await cancel(res, db, uid, myOrgs, isStaff, String(body.bookingId ?? '').trim());
      case 'rescheduleOptions':
        return await getRescheduleOptions(res, db, uid, actOrg, isStaff, String(body.classId ?? '').trim());
      case 'requestReschedule':
        return await requestReschedule(res, db, uid, actOrg, isStaff, body);
      case 'planStatus':
        return await planStatus(res, db, uid, actOrg, isStaff, String(body.userId ?? '').trim() || uid);
      case 'weeklyPtOptions':
        return await weeklyPtOptions(res, db, uid, actOrg, isStaff, body);
      case 'requestStandingPt':
        return await requestStandingPt(res, db, uid, actOrg, isStaff, body);
      case 'singlePtOptions':
        return await singlePtOptions(res, db, uid, actOrg, isStaff, body);
      case 'bookSinglePt':
        return await bookSinglePt(res, db, uid, actOrg, isStaff, body);
      case 'rescheduleRequests':
        return await listRescheduleRequests(res, db, uid, actOrg, isStaff);
      case 'answerReschedule':
        if (!isStaff) return json(res, 403, { error: 'Alleen een trainer of beheerder kan een verzoek beantwoorden.', build: BUILD });
        return await answerReschedule(res, db, uid, actOrg, myRole, String(body.requestId ?? '').trim(), body.approve === true);
      case 'cancelClass':
        if (!isStaff) return json(res, 403, { error: 'Alleen trainers en beheerders kunnen een les afgelasten.', build: BUILD });
        return await cancelWholeClass(res, db, uid, myOrgs, String(body.classId ?? '').trim());
      case 'waitlistPositions':
        return await waitlistPositions(res, db, uid, myOrgs);
      case 'trainerNames':
        return await trainerNames(res, db, myOrgs, isStaff, orgIdOf(body.orgId ?? meData.orgId));
      case 'settleWaitlists':
        return json(res, 200, { settled: await settleExpiredHolds(db, myOrgs), build: BUILD });
      case 'releaseHold':
        if (!isStaff) return json(res, 403, { error: 'Alleen een trainer of beheerder kan een plek vrijgeven.', build: BUILD });
        return await releaseHold(res, db, uid, myOrgs, String(body.classId ?? '').trim());
      case 'setStandingBooking':
        return await setStandingBooking(res, db, uid, myOrgs, isStaff, String(body.standingBookingId ?? '').trim(), body.active === true);
      case 'addStandingBooking':
        return await addStandingBooking(res, db, uid, myOrgs, isStaff, body);
      case 'moveStandingPt':
        if (!isStaff) return json(res, 403, { error: 'Alleen een trainer of beheerder kan een reeks wijzigen.', build: BUILD });
        return await moveStandingPt(res, db, uid, myOrgs, body);
      case 'moveOccurrence':
        if (!isStaff) return json(res, 403, { error: 'Alleen een trainer of beheerder kan een afspraak direct verzetten.', build: BUILD });
        return await moveOccurrence(res, db, uid, actOrg, myOrgs, body);
      case 'pauseStandingBooking':
        return await pauseStandingBooking(res, db, uid, myOrgs, isStaff, body);
      case 'addPersonalSlot':
        return await addPersonalSlot(res, db, uid, myOrgs, isStaff, body);
      case 'checkSchedule':
        if (!isStaff) return json(res, 403, { error: 'Alleen een trainer of beheerder kan het rooster controleren.', build: BUILD });
        return await checkSchedule(res, db, actOrg, body);
      case 'getAvailability':
        if (!isStaff) return json(res, 403, { error: 'Alleen trainers en beheerders hebben een beschikbaarheid.', build: BUILD });
        return await getAvailability(res, db, actOrg, String(body.userId ?? '').trim() || uid);
      case 'saveAvailability': {
        const target = String(body.userId ?? '').trim() || uid;
        if (!(isStaff && target === uid) && myRole !== 'admin') {
          return json(res, 403, { error: 'Je kunt alleen je eigen beschikbaarheid wijzigen (of als beheerder die van een trainer).', build: BUILD });
        }
        return await saveAvailability(res, db, actOrg, uid, target, body.days);
      }
      case 'listAbsences':
        if (!isStaff) return json(res, 403, { error: 'Alleen trainers en beheerders.', build: BUILD });
        return await listAbsences(res, db, actOrg, String(body.trainerId ?? '').trim() || null);
      case 'saveAbsence':
        if (!isStaff) return json(res, 403, { error: 'Alleen trainers en beheerders.', build: BUILD });
        return await saveAbsence(res, db, uid, actOrg, myRole, body);
      case 'deleteAbsence':
        if (!isStaff) return json(res, 403, { error: 'Alleen trainers en beheerders.', build: BUILD });
        return await deleteAbsence(res, db, uid, actOrg, myRole, String(body.id ?? '').trim());
      case 'absenceOverview':
        if (!isStaff) return json(res, 403, { error: 'Alleen trainers en beheerders.', build: BUILD });
        return await absenceOverview(res, db, actOrg);
      case 'setClassTrainer':
        if (!isStaff) return json(res, 403, { error: 'Alleen een trainer of beheerder kan de trainer van een les wijzigen.', build: BUILD });
        return await setClassTrainer(res, db, actOrg, body);
      case 'scheduleConflicts':
        if (!isStaff) return json(res, 403, { error: 'Alleen een trainer of beheerder kan het rooster controleren.', build: BUILD });
        return await listScheduleConflicts(res, db, actOrg);
      case 'removeGroupSlot':
        if (!isStaff) return json(res, 403, { error: 'Alleen een trainer of beheerder kan een groepsles stoppen.', build: BUILD });
        return await removeGroupSlot(res, db, uid, myOrgs, String(body.classTypeId ?? '').trim());
      case 'generateClassOccurrences':
        return await generateClassOccurrencesNow(res, db, myOrgs, isStaff, String(body.classTypeId ?? '').trim());
      case 'pruneStaleClasses':
        return await pruneStaleClasses(res, db, myOrgs, isStaff);
      case 'saveGroup':
        if (!isStaff) return json(res, 403, { error: 'Alleen een trainer of beheerder kan groepen beheren.', build: BUILD });
        return await saveGroup(res, db, uid, myOrgs, body);
      case 'deleteGroup':
        if (!isStaff) return json(res, 403, { error: 'Alleen een trainer of beheerder kan groepen beheren.', build: BUILD });
        return await deleteGroup(res, db, myOrgs, String(body.groupId ?? '').trim());
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

/**
 * Lid (de)activeren in de studio van de beheerder (Beheer → lid → Deactiveren/Activeren).
 *
 * Deactiveren: het lid komt op `inactiveOrgs`. Wat nog openstaat bij deze studio wordt opgeruimd:
 * komende reserveringen en wachtlijstplekken worden afgemeld (als afmelding door de studio, dus
 * volgens het creditbeleid van de studio), vaste lessen gaan uit en het abonnement stopt, zodat er
 * niet meer gefactureerd wordt. Account, geschiedenis, metingen en facturen blijven staan.
 * Activeren: van de lijst af, en de vaste lessen die door het deactiveren uit gingen staan weer aan.
 * Een abonnement kent de beheerder daarna zelf opnieuw toe.
 */
async function setMemberActive(res, db, adminUid, orgId, userId, active) {
  if (!userId) return json(res, 400, { error: 'Geen lid opgegeven.', build: BUILD });
  if (userId === adminUid) return json(res, 400, { error: 'Je kunt jezelf niet (de)activeren.', build: BUILD });
  const ref = db.collection('profiles').doc(userId);
  const snap = await ref.get();
  const target = snap.exists ? snap.data() : null;
  if (!target || !orgsOf(target).includes(orgId)) return json(res, 404, { error: 'Dit lid hoort niet bij jouw studio.', build: BUILD });
  const nowIso = new Date().toISOString();
  const inactive = Array.isArray(target.inactiveOrgs) ? target.inactiveOrgs.map(String) : [];
  const standingRef = (id) => db.collection('standingBookings').doc(id);

  if (active) {
    await ref.set({ inactiveOrgs: inactive.filter((o) => o !== orgId), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    const paused = await db.collection('standingBookings').where('orgId', '==', orgId).where('userId', '==', userId).where('pausedByInactive', '==', true).get();
    for (const d of paused.docs) await standingRef(d.id).set({ active: true, pausedByInactive: FieldValue.delete(), updatedAt: nowIso }, { merge: true });
    return json(res, 200, { active: true, standingRestored: paused.docs.length, build: BUILD });
  }

  await ref.set({ inactiveOrgs: [...new Set([...inactive, orgId])], updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  // Vaste lessen uit (onthouden welke, zodat activeren ze terugzet).
  const standing = await db.collection('standingBookings').where('orgId', '==', orgId).where('userId', '==', userId).where('active', '==', true).get();
  for (const d of standing.docs) await standingRef(d.id).set({ active: false, pausedByInactive: true, updatedAt: nowIso }, { merge: true });
  // Komende reserveringen en wachtlijstplekken afmelden.
  const today = todayIso();
  const open = await db.collection('bookings').where('orgId', '==', orgId).where('userId', '==', userId).get();
  let cancelled = 0;
  for (const d of open.docs) {
    const b = d.data();
    if (!['booked', 'waitlist'].includes(String(b.status))) continue;
    const cls = await db.collection('classes').doc(String(b.classId)).get();
    if (cls.exists && String(cls.data().date ?? '') < today) continue;
    const r = await cancelBookingCore(db, adminUid, [orgId], true, d.id).catch(() => null);
    if (!r) continue;
    cancelled++;
    // Kwam er een plek vrij, dan hoort de wachtlijst dat net als bij een gewone afmelding.
    const { notice, ...result } = r;
    await notifyAfterCancel(db, adminUid, notice, result).catch(() => null);
  }
  // Abonnement stoppen: een inactief lid wordt niet meer gefactureerd.
  const membership = await activeMembership(db, orgId, userId).catch(() => null);
  if (membership) {
    await db.collection('memberships').doc(membership.id).set({ status: 'cancelled', cancelledAt: nowIso, byUserId: adminUid, updatedAt: nowIso }, { merge: true });
  }
  return json(res, 200, { active: false, standingPaused: standing.docs.length, bookingsCancelled: cancelled, membershipStopped: !!membership, build: BUILD });
}

/**
 * Trainer of beheerder traint bij deze studio ook mee als lid (Beheer → lid → "Traint ook mee als
 * lid"). Aan: boeken kost credits, en abonnement, credits en facturen werken als bij een sporter.
 * Uit: weer gratis meedoen als staf; dat kan pas als er geen abonnement meer loopt, anders zou er
 * gefactureerd worden voor lessen die niets meer kosten. Per studio, en alleen de server schrijft
 * `trainsAsMemberOrgs` (zie firestore.rules).
 */
async function setTrainsAsMember(res, db, orgId, userId, on) {
  if (!userId) return json(res, 400, { error: 'Geen lid opgegeven.', build: BUILD });
  const ref = db.collection('profiles').doc(userId);
  const snap = await ref.get();
  const target = snap.exists ? snap.data() : null;
  if (!target || !orgsOf(target).includes(orgId)) return json(res, 404, { error: 'Dit lid hoort niet bij jouw studio.', build: BUILD });
  if (!isStaffIn(target, orgId)) return json(res, 409, { error: 'Dit geldt alleen voor trainers en beheerders; een sporter traint altijd als lid.', build: BUILD });
  if (!on && (await activeMembership(db, orgId, userId).catch(() => null))) {
    return json(res, 409, { error: 'Stop eerst het abonnement; daarna kan meetrainen als lid uit.', build: BUILD });
  }
  const list = Array.isArray(target.trainsAsMemberOrgs) ? target.trainsAsMemberOrgs.map(String) : [];
  const next = on ? [...new Set([...list, orgId])] : list.filter((o) => o !== orgId);
  await ref.set({ trainsAsMemberOrgs: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return json(res, 200, { trainsAsMember: on, build: BUILD });
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
 * Zit de les vol, dan kom je op de wachtlijst, zonder dat er een credit af gaat (die gaat er pas af
 * als je doorschuift). Sta je al op de wachtlijst en is er toch een plek vrij (niemand kon
 * doorschuiven, bijv. te weinig credits), dan meld je je hiermee alsnog aan.
 */
/**
 * extra: alleen staf. De trainer beslist dat iemand er nog bij kan, ook als de les vol zit of de
 * plek even voor een ander wordt vastgehouden (een extra plek boven het maximum).
 */
async function book(res, db, uid, myOrgs, classId, weekly, isStaff, targetUserId, extra = false, selfFree = isStaff) {
  if (!classId) return json(res, 400, { error: 'Geen les opgegeven.', build: BUILD });

  // Staf kan iemand anders inschrijven (bijv. een sporter die via WhatsApp afmeldde er weer bij
  // zetten); de credit gaat dan gewoon van diegene af, niet van de staf zelf.
  // Gratis boeken: staf die als trainer meedoet. Staf die ook als lid meetraint, betaalt gewoon.
  let beneficiaryUid = uid;
  let beneficiaryFree = selfFree;
  if (targetUserId && targetUserId !== uid) {
    if (!isStaff) return json(res, 403, { error: 'Alleen een trainer of beheerder kan iemand anders inschrijven.', build: BUILD });
    const targetSnap = await db.collection('profiles').doc(targetUserId).get();
    if (!targetSnap.exists) return json(res, 404, { error: 'Sporter niet gevonden.', build: BUILD });
    const target = targetSnap.data() ?? {};
    const targetOrgs = Array.isArray(target.orgIds) && target.orgIds.length ? target.orgIds.map(String) : [orgIdOf(target.orgId)];
    if (!myOrgs.some((o) => targetOrgs.includes(o))) return json(res, 403, { error: 'Deze sporter zit niet in jouw studio.', build: BUILD });
    if (isInactiveIn(target, myOrgs[0])) return json(res, 409, { error: 'Dit lid staat op inactief. Activeer het lid eerst in Beheer.', build: BUILD });
    beneficiaryUid = targetUserId;
    beneficiaryFree = !paysAsMemberIn(target, myOrgs[0]);
  }
  if (extra && !isStaff) return json(res, 403, { error: 'Alleen een trainer of beheerder kan iemand er extra bij zetten.', build: BUILD });

  // Een verlopen vastgehouden plek eerst doorgeven aan de volgende, zodat iedereen eerlijk zijn beurt krijgt.
  const holdSnap = await db.collection('classes').doc(classId).get();
  if (holdSnap.exists && holdExpired(holdSnap.data(), Date.now())) {
    const r = await settleHold(db, classId).catch(() => null);
    if (r) await notifyFreeSpot(db, r.orgId, r.cls, r);
  }

  // Eerst het eigen abonnement bijwerken (verlenging die nog openstond), dan pas reserveren.
  // Onbeperkt plan: de les kost niets.
  const preSnap = await db.collection('classes').doc(classId).get();
  const preOrg = preSnap.exists ? orgIdOf(preSnap.data().orgId) : null;
  let unlimited = false;
  if (preOrg && myOrgs.includes(preOrg)) {
    // Gaat vandaag een gepland abonnement in, dan eerst dat (credits van de eerste periode).
    await startScheduledMemberships(db, { orgId: preOrg, userId: beneficiaryUid }).catch(() => 0);
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
    // Groepsles: alleen voor leden van de groep; de groep betaalt, niet het lid.
    const group = cls.privateForGroup ? await readGroupLesson(tx, db, cls, orgId) : null;
    if (group && !group.memberIds.includes(beneficiaryUid)) throw refuse('Deze les is van een groep waar deze sporter niet in zit.');
    const reopen = canReopenPrivateClass(cls, beneficiaryUid);
    if (cls.cancelledAt && !reopen) throw refuse('Deze les is afgelast.');

    const startsAt = classStartsAt(cls);
    if (startsAt && startsAt.getTime() < Date.now()) throw refuse('Deze les is al geweest.');

    // Al gereserveerd? Dan niets doen in plaats van een tweede plek innemen.
    const mine = await tx.get(
      db.collection('bookings').where('classId', '==', classId).where('userId', '==', beneficiaryUid)
    );
    const active = mine.docs.filter((d) => ['booked', 'waitlist'].includes(String(d.data().status)));
    if (active.some((d) => d.data().status === 'booked')) {
      throw refuse(beneficiaryUid === uid ? 'Je staat al ingeschreven voor deze les.' : 'Deze sporter staat al ingeschreven voor deze les.');
    }
    // Al op de wachtlijst: met een vrije plek is dit aanmelden (de plek pakken), anders niets te doen.
    const claim = active.find((d) => d.data().status === 'waitlist') ?? null;
    // Een plek die voor een ander wordt vastgehouden, is voor jou (nog) niet vrij.
    const heldForOther = !extra && heldForSomeoneElse(cls, beneficiaryUid, Date.now());
    if (claim && heldForOther) {
      throw refuse('Deze plek wordt nog even vastgehouden voor de eerste op de wachtlijst.');
    }
    if (claim && !extra && !spotFreeForWaitlister(cls)) {
      throw refuse(beneficiaryUid === uid ? 'Je staat al op de wachtlijst. Valt er iemand af, dan schuif je vanzelf door.' : 'Deze sporter staat al op de wachtlijst.');
    }

    const cost = unlimited || beneficiaryFree || group ? 0 : Number(cls.creditCost ?? 1) || 0;
    const onWaitlist = claim || extra ? false : heldForOther || placeNewBooking(cls) === 'waitlist';

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

    const now = new Date().toISOString();
    const bookingId = claim ? claim.id : newId('bk');
    if (claim) {
      // Aanmelden vanaf de wachtlijst: dezelfde reservering wordt een echte boeking. `claimedAt`
      // telt voor de bedenktijd (je koos op dit moment voor de les).
      tx.set(claim.ref, { status: 'booked', creditsSpent: cost, claimedAt: now, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    } else {
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
    }

    const reopened = reopen ? { cancelledAt: null, autoCancelled: false } : {};
    if (onWaitlist) {
      tx.set(classRef, { waitlistCount: FieldValue.increment(1), ...reopened }, { merge: true });
    } else if (claim) {
      // Aangemeld: een plek die voor jou werd vastgehouden, is nu van jou.
      tx.set(
        classRef,
        {
          bookedCount: FieldValue.increment(1),
          waitlistCount: FieldValue.increment(-1),
          ...(cls.holdUserId === beneficiaryUid ? { holdBookingId: null, holdUserId: null, holdUntil: null } : {}),
        },
        { merge: true }
      );
    } else {
      tx.set(classRef, { bookedCount: FieldValue.increment(1), ...reopened }, { merge: true });
    }
    if (!onWaitlist && group) {
      const c = groupChargeOnBook(group.pricing, cls, beneficiaryUid);
      writeGroupMoney(tx, db, group, { orgId, classRef, classId, paidIds: c.paidIds, total: c.total, delta: -c.charge, byUserId: uid, nowIso: now, reason: 'booking' });
    }
    if (!onWaitlist) {
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
 * Afmelden. Binnen de annuleertermijn (of de bedenktijd na boeken) krijg je je credit terug;
 * daarna niet — anders meldt iedereen zich op het laatste moment af en staat de zaal leeg.
 * Komt er een plek vrij, dan schuift de eerste van de wachtlijst door (zie cancelBookingCore).
 */
async function cancel(res, db, uid, myOrgs, isStaff, bookingId) {
  if (!bookingId) return json(res, 400, { error: 'Geen reservering opgegeven.', build: BUILD });
  const { notice, ...result } = await cancelBookingCore(db, uid, myOrgs, isStaff, bookingId);
  await notifyAfterCancel(db, uid, notice, result);
  // Een PT-moment op tijd afgemeld (credit terug): de app biedt meteen een ander moment aan.
  const reschedule =
    result.refunded && notice?.cls && canRescheduleClass(notice.cls, notice.bookingUserId)
      ? { classId: notice.cls.id, userId: notice.bookingUserId }
      : null;
  return json(res, 200, { ...result, reschedule, build: BUILD });
}

/**
 * Een hele les afgelasten (trainer ziek, zaal dicht). De les gaat eerst op afgelast, zodat iedereen
 * daarna afgemeld wordt mét zijn credit terug (een afgelaste les telt nooit als te laat afmelden)
 * en er niemand van de wachtlijst doorschuift. Elke ingeschrevene en wachtende krijgt een melding.
 */
async function cancelWholeClass(res, db, uid, myOrgs, classId) {
  if (!classId) return json(res, 400, { error: 'Geen les opgegeven.', build: BUILD });
  const classRef = db.collection('classes').doc(classId);
  const snap = await classRef.get();
  if (!snap.exists) return json(res, 404, { error: 'Deze les bestaat niet (meer).', build: BUILD });
  const cls = snap.data();
  const orgId = orgIdOf(cls.orgId);
  if (!myOrgs.includes(orgId)) return json(res, 403, { error: 'Deze les hoort niet bij jouw studio.', build: BUILD });

  const nowIso = new Date().toISOString();
  // autoCancelled uit: de vaste-PT-planning mag een les die de studio zelf afgelastte niet heropenen.
  await classRef.set({ cancelledAt: cls.cancelledAt || nowIso, autoCancelled: false, ...NO_HOLD, updatedAt: nowIso }, { merge: true });

  const bookings = await db.collection('bookings').where('classId', '==', classId).get();
  const open = bookings.docs.filter((d) => ['booked', 'waitlist'].includes(String(d.data().status)));
  const orgSnap = await db.collection('orgs').doc(orgId).get();
  const notify = notificationEnabled(orgSnap.exists ? orgSnap.data() : null, 'classCancelled');
  let cancelled = 0;
  let refunded = 0;
  for (const d of open) {
    const waitlist = d.data().status === 'waitlist';
    try {
      const result = await cancelBookingCore(db, uid, myOrgs, true, d.id);
      cancelled += 1;
      if (result.refunded) refunded += 1;
      const userId = String(d.data().userId);
      if (notify && userId !== uid) {
        try {
          await sendPushToUser(db, userId, {
            ...pushMessages.classCancelledByStudio(cls, { refunded: result.refunded, waitlist }),
            data: { kind: 'classCancelled' },
          });
        } catch (e) {
          console.warn('[booking] melding afgelaste les mislukt:', e?.message ?? e);
        }
      }
    } catch (e) {
      console.warn('[booking] afmelden bij afgelaste les mislukt:', d.id, e?.message ?? e);
    }
  }
  // Tellers netjes op nul, ook als er onderweg iets niet lukte en opnieuw geprobeerd wordt.
  if (cancelled === open.length) await classRef.set({ bookedCount: 0, waitlistCount: 0 }, { merge: true });
  // Groepsles afgelast door de studio: wat de groep voor deze les betaalde, gaat helemaal terug.
  if (cls.privateForGroup) await refundGroupLesson(db, classRef, classId, orgId, uid);
  return json(res, 200, { cancelled, refunded, failed: open.length - cancelled, build: BUILD });
}

/**
 * Meldingen na afmelden: de studio meldde iemand anders af ("Les geannuleerd"), en/of iemand van
 * de wachtlijst schoof door. Nooit laten mislukken: de afmelding zelf is al gelukt.
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
    // Vrije plek: doorgeschoven, of vastgehouden voor iemand zonder credits (zie notifyFreeSpot).
    await notifyFreeSpot(db, notice.orgId, notice.cls, {
      promotedUserId: result.promotedUserId,
      promotedCost: notice.promotedCost,
      heldUserId: notice.heldUserId,
      holdUntil: notice.holdUntil,
    });
  } catch (e) {
    console.error('[booking] melding na afmelden mislukt', e);
  }
}

/**
 * Namen van de trainers van een studio ({ [uid]: naam }), voor bij de lessen. Een lid mag de
 * profielen van trainers niet lezen (firestore.rules); daarom geeft de server alleen de naam, en
 * alleen als de beheerder "Naam van de trainer tonen aan sporters" aan heeft gezet. Nooit een
 * e-mailadres: zonder naam blijft de trainer naamloos.
 */
async function trainerNames(res, db, myOrgs, isStaff, orgId) {
  if (!myOrgs.includes(orgId)) return json(res, 403, { error: 'Geen lid van deze studio.', build: BUILD });
  const orgSnap = await db.collection('orgs').doc(orgId).get();
  const show = isStaff || orgSnap.data()?.showTrainerNames === true;
  if (!show) return json(res, 200, { names: {}, build: BUILD });
  const members = await db.collection('profiles').where('orgIds', 'array-contains', orgId).get();
  const names = {};
  for (const d of members.docs) {
    const p = d.data();
    const name = typeof p.displayName === 'string' ? p.displayName.trim() : '';
    if (isStaffIn(p, orgId) && name) names[d.id] = name;
  }
  return json(res, 200, { names, build: BUILD });
}

/**
 * Op welke plek sta je op de wachtlijst, per les ({ [classId]: 2 }). Alleen de positie: wie er voor
 * of na je staat blijft onzichtbaar (een lid kan de boekingen van anderen ook niet lezen).
 */
async function waitlistPositions(res, db, uid, myOrgs) {
  const mine = await db.collection('bookings').where('userId', '==', uid).where('status', '==', 'waitlist').get();
  const positions = {};
  for (const d of mine.docs) {
    const b = d.data();
    if (!myOrgs.includes(orgIdOf(b.orgId))) continue;
    const classId = String(b.classId);
    const all = await db.collection('bookings').where('classId', '==', classId).where('status', '==', 'waitlist').get();
    const pos = waitlistPosition(
      all.docs.map((x) => ({ id: x.id, createdAt: x.data().createdAt })),
      d.id
    );
    if (pos) positions[classId] = pos;
  }
  return json(res, 200, { positions, build: BUILD });
}

/**
 * Wat doorschuiven kost per persoon op de wachtlijst: net als bij boeken niets voor staf (tenzij die
 * ook als lid meetraint) en voor een onbeperkt abonnement. Buiten de transactie opgezocht
 * (abonnementen zijn queries); de transactie leest daarna zelf de actuele wachtlijst en saldo's.
 */
async function waitlistCosts(db, classId) {
  const clsSnap = await db.collection('classes').doc(classId).get();
  if (!clsSnap.exists) return {};
  const cls = clsSnap.data();
  const orgId = orgIdOf(cls.orgId);
  const baseCost = Number(cls.creditCost ?? 1) || 0;
  const waiting = await db.collection('bookings').where('classId', '==', classId).where('status', '==', 'waitlist').get();
  const costs = {};
  for (const d of waiting.docs) {
    const userId = String(d.data().userId);
    if (userId in costs) continue;
    let cost = baseCost;
    const prof = await db.collection('profiles').doc(userId).get();
    if (prof.exists && !paysAsMemberIn(prof.data(), orgId)) cost = 0;
    else if (cost > 0) {
      const m = await activeMembership(db, orgId, userId).catch(() => null);
      if (m) {
        const plan = await db.collection('plans').doc(String(m.planId)).get();
        if (plan.exists && plan.data().credits == null) cost = 0;
      }
    }
    costs[userId] = cost;
  }
  return costs;
}

/** In een transactie: wie staat er op de wachtlijst en wat kan ieder betalen. Alleen lezen. */
async function readWaitlistCandidates(tx, db, orgId, cls, classId, costs) {
  const waiting = await tx.get(db.collection('bookings').where('classId', '==', classId).where('status', '==', 'waitlist'));
  const candidates = [];
  for (const d of waiting.docs) {
    const w = d.data();
    const userId = String(w.userId);
    const cost = costs[userId] ?? (Number(cls.creditCost ?? 1) || 0);
    const accountRef = db.collection('creditAccounts').doc(accountId(orgId, userId));
    const account = await tx.get(accountRef);
    const balance = Number(account.exists ? account.data().balance : 0) || 0;
    candidates.push({ id: d.id, ref: d.ref, userId, createdAt: w.createdAt, balance, cost, accountRef, offerExpired: !!w.offerExpiredAt });
  }
  return candidates;
}

const NO_HOLD = { holdBookingId: null, holdUserId: null, holdUntil: null };

/**
 * Eén vrije plek invullen (alleen schrijven). `fromCancel`: de plek komt vrij doordat iemand met een
 * plek afmeldt; bij doorschuiven blijft het aantal bezette plekken dan gelijk.
 */
function applyFreeSpot(tx, db, { choice, classRef, orgId, classId, nowIso, startsAtMs, byUserId, fromCancel }) {
  const nowMs = Date.parse(nowIso);
  if (choice?.kind === 'promote') {
    const c = choice.candidate;
    tx.set(c.ref, { status: 'booked', creditsSpent: c.cost, promotedAt: nowIso, updatedAt: nowIso }, { merge: true });
    tx.set(
      classRef,
      { waitlistCount: FieldValue.increment(-1), ...(fromCancel ? {} : { bookedCount: FieldValue.increment(1) }), ...NO_HOLD },
      { merge: true }
    );
    if (c.cost > 0) {
      tx.set(c.accountRef, { orgId, userId: c.userId, balance: c.balance - c.cost, updatedAt: nowIso }, { merge: true });
      tx.set(db.collection('creditLedger').doc(newId('cl')), {
        orgId,
        userId: c.userId,
        delta: -c.cost,
        reason: 'booking',
        classId,
        byUserId,
        createdAt: nowIso,
      });
    }
    return { promotedUserId: c.userId, promotedCost: c.cost };
  }
  if (choice?.kind === 'hold') {
    const c = choice.candidate;
    const until = holdUntil(nowMs, startsAtMs);
    tx.set(c.ref, { offeredAt: nowIso, offerUntil: until }, { merge: true });
    tx.set(
      classRef,
      { holdBookingId: c.id, holdUserId: c.userId, holdUntil: until, ...(fromCancel ? { bookedCount: FieldValue.increment(-1) } : {}) },
      { merge: true }
    );
    return { heldUserId: c.userId, holdUntil: until };
  }
  tx.set(classRef, { ...(fromCancel ? { bookedCount: FieldValue.increment(-1) } : {}), ...NO_HOLD }, { merge: true });
  return {};
}

/** Het eigenlijke afmelden, ook gebruikt bij het stoppen of pauzeren van een vaste les. */
/** `forceRefund`: de studio verzet de afspraak; de credit komt dan altijd terug, ook binnen de afmeldtermijn. */
async function cancelBookingCore(db, uid, myOrgs, isStaff, bookingId, { forceRefund = false } = {}) {
  const pre = await db.collection('bookings').doc(bookingId).get();
  const costs = pre.exists ? await waitlistCosts(db, String(pre.data().classId)) : {};
  return db.runTransaction(async (tx) => {
    // Firestore: eerst alles lezen, dan pas schrijven.
    const bookingRef = db.collection('bookings').doc(bookingId);
    const bookingSnap = await tx.get(bookingRef);
    if (!bookingSnap.exists) throw refuse('Deze reservering bestaat niet (meer).');

    const booking = bookingSnap.data();
    const orgId = orgIdOf(booking.orgId);
    if (!myOrgs.includes(orgId)) throw refuse('Deze reservering hoort niet bij jouw studio.');
    // Een sporter meldt alleen zichzelf af; staf mag ook voor een ander afmelden.
    if (booking.userId !== uid && !isStaff) throw refuse('Je kunt alleen je eigen reservering afzeggen.');
    if (!['booked', 'waitlist'].includes(String(booking.status))) throw refuse('Deze reservering staat al open.');

    const classId = String(booking.classId);
    const classRef = db.collection('classes').doc(classId);
    const classSnap = await tx.get(classRef);
    const cls = classSnap.exists ? classSnap.data() : null;

    // Studio's stellen zelf in tot hoeveel uur van tevoren afmelden gratis is (Beheer → Instellingen);
    // zonder instelling geldt het standaard aantal uur van de server. Ook 0 uur is een keuze.
    const orgSnap = await tx.get(db.collection('orgs').doc(orgId));
    const freeCancelHours = freeCancelHoursOf(orgSnap.data()?.bookingPolicy, FREE_CANCEL_HOURS);

    const nowMs = Date.now();
    const startsAt = cls ? classStartsAt(cls) : null;
    const startsAtMs = startsAt ? startsAt.getTime() : NaN;
    const hoursLeft = startsAt ? (startsAtMs - nowMs) / 3_600_000 : Infinity;
    const spent = Number(booking.creditsSpent) || 0;
    // Te laat is te laat, behalve bij een afgelaste les of binnen de bedenktijd na boeken/doorschuiven.
    const refundRule = {
      classCancelled: !!cls?.cancelledAt,
      hoursLeft,
      freeCancelHours,
      minutesSinceBooked: minutesSince(bookedAtOf(booking), nowMs),
      // Afgemeld door de studio (niet door de sporter zelf): de studio bepaalt of de credit dan terug gaat.
      byStudio: isStaff && String(booking.userId) !== uid,
      studioCancelRefund: orgSnap.data()?.studioCancelRefund === true,
    };
    const refund = forceRefund && isStaff ? spent > 0 : refundOnCancel({ spent, ...refundRule });
    // Groepsles: op tijd afgemeld maakt de les goedkoper voor de groep. Een afgelaste les rekent
    // cancelWholeClass in één keer af.
    const group = cls?.privateForGroup && booking.status === 'booked' && !cls.cancelledAt ? await readGroupLesson(tx, db, cls, orgId) : null;
    const groupRefund = group && refundOnCancel({ spent: 1, ...refundRule }) ? groupRefundOnCancel(group.pricing, cls, String(booking.userId)) : null;

    // Komt er een plek vrij? Bij afmelden met een plek, of als degene voor wie een plek werd
    // vastgehouden van de wachtlijst gaat.
    const isHolder = booking.status === 'waitlist' && cls?.holdBookingId === bookingId;
    const spotFrees = cls && !cls.cancelledAt && hoursLeft > 0 && (booking.status === 'booked' || isHolder);
    let choice = null;
    if (spotFrees) {
      const holdActive = !isHolder && !!cls.holdUserId && !holdExpired(cls, nowMs);
      const candidates = (await readWaitlistCandidates(tx, db, orgId, cls, classId, costs))
        .filter((c) => c.id !== bookingId && !(holdActive && c.id === cls.holdBookingId))
        // Er wordt al een plek vastgehouden: deze plek gaat alleen naar iemand die kan betalen.
        .map((c) => (holdActive ? { ...c, offerExpired: true } : c));
      choice = chooseForFreeSpot(candidates);
    }

    const now = new Date(nowMs).toISOString();
    tx.set(bookingRef, { status: 'cancelled', cancelledAt: now, refunded: refund || !!groupRefund?.refund, ...(groupRefund ? { groupRefund: groupRefund.refund } : {}) }, { merge: true });
    if (groupRefund) {
      writeGroupMoney(tx, db, group, { orgId, classRef, classId, paidIds: groupRefund.paidIds, total: groupRefund.total, delta: groupRefund.refund, byUserId: uid, nowIso: now, reason: 'refund' });
    }

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

    let outcome = {};
    if (booking.status === 'waitlist') {
      tx.set(classRef, { waitlistCount: FieldValue.increment(-1), ...(isHolder ? NO_HOLD : {}) }, { merge: true });
      if (spotFrees) outcome = applyFreeSpot(tx, db, { choice, classRef, orgId, classId, nowIso: now, startsAtMs, byUserId: uid, fromCancel: false });
    } else if (spotFrees) {
      outcome = applyFreeSpot(tx, db, { choice, classRef, orgId, classId, nowIso: now, startsAtMs, byUserId: uid, fromCancel: true });
    } else {
      tx.set(classRef, { bookedCount: FieldValue.increment(-1) }, { merge: true });
    }

    // Privé-les (vaste PT) waar nu niemand meer op staat: van het rooster van de trainer af. De
    // credit-regel hierboven keek nog naar de les zoals hij was, dus dit geeft geen gratis afmelding.
    const promotedHere = !!outcome.promotedUserId && booking.status === 'booked';
    const emptied = privateClassEmptyAfter(cls, {
      bookedDelta: booking.status === 'booked' && !promotedHere ? -1 : 0,
      waitlistDelta: booking.status === 'waitlist' || promotedHere ? -1 : 0,
    });
    if (emptied) tx.set(classRef, { cancelledAt: now, autoCancelled: true }, { merge: true });

    return {
      cancelled: true,
      refunded: refund || !!groupRefund?.refund,
      promotedUserId: outcome.promotedUserId ?? null,
      // Alleen voor de meldingen hierna; gaat niet mee in het antwoord.
      notice: {
        orgId,
        bookingUserId: String(booking.userId),
        cls: cls ? { id: classId, title: cls.title, date: cls.date, startTime: cls.startTime, trainerId: cls.trainerId ?? null, privateFor: cls.privateFor ?? null, privateForGroup: cls.privateForGroup ?? null } : null,
        promotedCost: outcome.promotedCost ?? 0,
        heldUserId: outcome.heldUserId ?? null,
        holdUntil: outcome.holdUntil ?? null,
      },
    };
  });
}

/**
 * Een vastgehouden plek afronden: verlopen (of door de trainer vrijgegeven met `force`), dan gaat de
 * plek naar de volgende op de wachtlijst. Degene voor wie hij werd vastgehouden blijft op de
 * wachtlijst, maar krijgt voor deze les geen tweede keer voorrang zonder credits.
 */
async function settleHold(db, classId, { force = false, byUserId = 'system' } = {}) {
  const costs = await waitlistCosts(db, classId);
  return db.runTransaction(async (tx) => {
    const classRef = db.collection('classes').doc(classId);
    const snap = await tx.get(classRef);
    if (!snap.exists) return null;
    const cls = snap.data();
    const nowMs = Date.now();
    if (!cls.holdUserId) return null;
    if (!force && !holdExpired(cls, nowMs)) return null;

    const orgId = orgIdOf(cls.orgId);
    const startsAt = classStartsAt(cls);
    const startsAtMs = startsAt ? startsAt.getTime() : NaN;
    const open = !cls.cancelledAt && !(startsAtMs <= nowMs);
    const holderRef = cls.holdBookingId ? db.collection('bookings').doc(String(cls.holdBookingId)) : null;
    const holderSnap = holderRef ? await tx.get(holderRef) : null;
    const candidates = open
      ? (await readWaitlistCandidates(tx, db, orgId, cls, classId, costs)).map((c) => (c.id === cls.holdBookingId ? { ...c, offerExpired: true } : c))
      : [];
    const choice = open && (Number(cls.bookedCount) || 0) < (Number(cls.capacity) || 0) ? chooseForFreeSpot(candidates) : null;

    const nowIso = new Date(nowMs).toISOString();
    if (holderSnap?.exists && holderSnap.data().status === 'waitlist') tx.set(holderRef, { offerExpiredAt: nowIso }, { merge: true });
    tx.set(classRef, NO_HOLD, { merge: true });
    const outcome = open ? applyFreeSpot(tx, db, { choice, classRef, orgId, classId, nowIso, startsAtMs, byUserId, fromCancel: false }) : {};
    return {
      orgId,
      cls: { title: cls.title, date: cls.date, startTime: cls.startTime, trainerId: cls.trainerId ?? null },
      ...outcome,
    };
  });
}

/** Alle verlopen vastgehouden plekken afronden (bij het openen van het rooster, en in de dagelijkse crons). */
async function settleExpiredHolds(db, myOrgs = null) {
  const nowIso = new Date().toISOString();
  const snap = await db.collection('classes').where('holdUntil', '<=', nowIso).get();
  let settled = 0;
  for (const d of snap.docs) {
    const c = d.data();
    if (!c.holdUserId) continue;
    if (myOrgs && !myOrgs.includes(orgIdOf(c.orgId))) continue;
    const r = await settleHold(db, d.id).catch((e) => {
      console.error('[booking] vastgehouden plek afronden mislukt', e);
      return null;
    });
    if (r) {
      settled++;
      await notifyFreeSpot(db, r.orgId, r.cls, r);
    }
  }
  return settled;
}

/** Trainer/beheerder geeft een vastgehouden plek meteen door aan de volgende. */
async function releaseHold(res, db, uid, myOrgs, classId) {
  if (!classId) return json(res, 400, { error: 'Geen les opgegeven.', build: BUILD });
  const snap = await db.collection('classes').doc(classId).get();
  if (!snap.exists || !myOrgs.includes(orgIdOf(snap.data().orgId))) return json(res, 404, { error: 'Deze les bestaat niet (meer).', build: BUILD });
  const r = await settleHold(db, classId, { force: true, byUserId: uid });
  if (r) await notifyFreeSpot(db, r.orgId, r.cls, r);
  return json(res, 200, { released: !!r, promotedUserId: r?.promotedUserId ?? null, build: BUILD });
}

/**
 * Meldingen bij een vrije plek: doorgeschoven ("Je bent ingeschreven!"), of een plek vastgehouden
 * voor iemand zonder credits (melding aan die persoon én aan de trainer van de les en de beheerders,
 * zodat zij kunnen ingrijpen). Nooit laten mislukken.
 */
async function notifyFreeSpot(db, orgId, cls, outcome) {
  try {
    if (!outcome?.promotedUserId && !outcome?.heldUserId) return;
    if (!(await orgNotificationEnabled(db, orgId, 'waitlistPromoted'))) return;
    if (outcome.promotedUserId) {
      await sendPushToUser(db, outcome.promotedUserId, {
        ...pushMessages.waitlistPromoted(cls, outcome.promotedCost ?? 0),
        data: { kind: 'waitlistPromoted' },
      });
    }
    if (outcome.heldUserId) {
      await sendPushToUser(db, outcome.heldUserId, { ...pushMessages.waitlistHold(cls, outcome.holdUntil), data: { kind: 'waitlistHold' } });
      const holderSnap = await db.collection('profiles').doc(outcome.heldUserId).get();
      const holderName = (holderSnap.exists && (holderSnap.data().displayName || holderSnap.data().email)) || 'Iemand';
      const staff = new Set();
      if (cls?.trainerId) staff.add(String(cls.trainerId));
      const admins = await db.collection('profiles').where('orgIds', 'array-contains', orgId).get();
      for (const a of admins.docs) if (isAdminIn(a.data(), orgId)) staff.add(a.id);
      staff.delete(outcome.heldUserId);
      for (const staffId of staff) {
        await sendPushToUser(db, staffId, {
          ...pushMessages.waitlistHoldStaff(holderName, cls, outcome.holdUntil),
          data: { kind: 'waitlistHoldStaff' },
        }).catch(() => null);
      }
    }
  } catch (e) {
    console.error('[booking] melding vrije plek mislukt', e);
  }
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
async function cancelSeriesBookings(db, uid, myOrgs, isStaff, standing, inRange, { forceRefund = false, silent = false } = {}) {
  const classIds = new Set((await futureSeriesClasses(db, standing)).filter((c) => inRange(c.date)).map((c) => c.id));
  if (classIds.size === 0) return { cancelled: 0, refunded: 0 };
  const snap = await db.collection('bookings').where('userId', '==', standing.userId).get();
  let cancelled = 0;
  let refunded = 0;
  for (const d of snap.docs) {
    const b = d.data();
    if (!classIds.has(String(b.classId)) || !['booked', 'waitlist'].includes(String(b.status))) continue;
    const r = await cancelBookingCore(db, uid, myOrgs, isStaff, d.id, { forceRefund }).catch(() => null);
    if (r) {
      if (!silent) await notifyAfterCancel(db, uid, r.notice, r);
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
  if (ct.privateForGroup && !(ct.groupMemberIds ?? []).map(String).includes(targetUserId)) {
    return json(res, 403, { error: 'Dit is een groepsles van een groep waar deze sporter niet in zit.', build: BUILD });
  }
  const slot = (Array.isArray(ct.schedule) ? ct.schedule : []).find((sl) => Number(sl.weekday) === weekday && sl.startTime === startTime);
  if (!slot) return json(res, 400, { error: 'Dit weekmoment staat niet (meer) bij deze lessoort.', build: BUILD });
  // Om de week: een les die zelf om de week is, volgt die weken; anders kiest het lid (even/oneven vanaf de startdatum).
  const pattern = isBiweekly(slot) ? { everyWeeks: 2, weekParity: Number(slot.weekParity ?? 0) } : patternFields(body?.everyWeeks, startDate, weekday);

  // Een sporter plant zelf alleen in wat zijn abonnement toestaat (soort les, keer per week). Staf
  // ziet in de app een waarschuwing maar beslist zelf.
  if (!isStaff && !ct.privateForGroup) {
    const status = await planUsage(db, orgId, targetUserId);
    const refusal = planRefusal(status, ct.sessionKind, standingBookingId(classTypeId, targetUserId, weekday, startTime), weightOf(pattern));
    if (refusal) return json(res, 409, { error: refusal, build: BUILD });
  }

  const standing = await writeStanding(db, { orgId, userId: targetUserId, classTypeId, weekday, startTime, startDate, createdByUserId: uid, pattern });
  const counts = await bookExistingForStanding(db, standing);
  return json(res, 200, { standingBookingId: standing.id, ...counts, build: BUILD });
}

/** De vaste les (weer) vastleggen, actief en zonder pauze. Deterministische id: nooit dubbel. */
async function writeStanding(db, { orgId, userId, classTypeId, weekday, startTime, startDate, createdByUserId, pattern = {} }) {
  const id = standingBookingId(classTypeId, userId, weekday, startTime);
  const now = new Date().toISOString();
  const standing = {
    id,
    orgId,
    userId,
    classTypeId,
    weekday,
    startTime,
    // Elke week (1) of om de week (2, in de even of oneven weken).
    everyWeeks: isBiweekly(pattern) ? 2 : 1,
    weekParity: isBiweekly(pattern) ? Number(pattern.weekParity ?? 0) : null,
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
  if (myOrgs.some((o) => isInactiveIn(t, o))) throw refuse('Dit lid staat op inactief. Activeer het lid eerst in Beheer.', 409);
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
const WEEKDAY_NL = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];

/** "Botst met Bootcamp (maandag 09:00–10:00): zelfde trainer." */
function conflictMessage(c) {
  const why = c.sameTrainer && c.sameRoom ? 'zelfde trainer en ruimte' : c.sameTrainer ? 'zelfde trainer' : `ruimte ${c.other.room} is dan bezet`;
  return `Dit moment botst met ${c.other.name} (${WEEKDAY_NL[c.other.weekday]} ${c.other.startTime}–${c.other.endTime}): ${why}.`;
}

/** Beschikbaarheid van een trainer in een studio (per weekdag blokken), of null als die niets invulde. */
async function availabilityOf(db, orgId, userId) {
  if (!userId) return null;
  const snap = await db.collection('trainerAvailability').doc(availabilityDocId(orgId, userId)).get();
  return snap.exists ? snap.data()?.days ?? null : null;
}

async function getAvailability(res, db, orgId, userId) {
  return json(res, 200, { userId, days: await availabilityOf(db, orgId, userId), build: BUILD });
}

/** Beschikbaarheid opslaan (de trainer zelf, of een beheerder voor een trainer van de studio). */
async function saveAvailability(res, db, orgId, uid, userId, rawDays) {
  const tSnap = await db.collection('profiles').doc(userId).get();
  if (!tSnap.exists || !isStaffIn(tSnap.data(), orgId)) return json(res, 400, { error: 'Deze persoon is geen trainer in jouw studio.', build: BUILD });
  const cleaned = cleanAvailability(rawDays);
  if (cleaned.error) return json(res, 400, { error: cleaned.error, build: BUILD });
  await db.collection('trainerAvailability').doc(availabilityDocId(orgId, userId)).set({
    orgId,
    userId,
    days: cleaned.value,
    updatedBy: uid,
    updatedAt: new Date().toISOString(),
  });
  return json(res, 200, { userId, days: cleaned.value, build: BUILD });
}

// --- Afwezigheid en invallers (api/_lib/absence.mjs) ------------------------------------------

/** Trainers en beheerders van de studio, met naam. */
async function orgTrainers(db, orgId) {
  const snap = await db.collection('profiles').where('orgIds', 'array-contains', orgId).get();
  return snap.docs
    .map((d) => ({ userId: d.id, ...d.data() }))
    .filter((p) => isStaffIn(p, orgId))
    .map((p) => ({ userId: p.userId, name: String(p.displayName || p.email || 'Trainer') }));
}

/** Afwezigheden van de studio die nog niet voorbij zijn. */
async function currentAbsences(db, orgId) {
  const today = todayIso();
  const snap = await db.collection('trainerAbsences').where('orgId', '==', orgId).get();
  return snap.docs.map((d) => ({ ...d.data(), id: d.id })).filter((a) => !a.until || a.until >= today);
}

/** Lessen van de studio van vandaag tot zover het rooster vooruit staat, nog niet begonnen. */
async function upcomingOrgClasses(db, orgId) {
  const from = todayIso();
  const until = amsterdamDate(new Date(), WEEKS_AHEAD * 7);
  const snap = await db.collection('classes').where('date', '>=', from).where('date', '<=', until).get();
  const now = Date.now();
  return snap.docs
    .map((d) => ({ ...d.data(), id: d.id }))
    .filter((c) => orgIdOf(c.orgId) === orgId && (classStartsAt(c)?.getTime() ?? 0) > now);
}

/**
 * Een andere trainer op één les zetten. De oorspronkelijke trainer blijft bewaard
 * (`originalTrainerId`), zodat terugzetten kan en de app "invaller" kan tonen. Wie is ingeschreven
 * krijgt een melding.
 */
async function assignClassTrainer(db, cls, trainerId, { via = null, names = {} } = {}) {
  const original = cls.originalTrainerId || cls.trainerId || null;
  const back = trainerId === original;
  const update = {
    trainerId,
    originalTrainerId: back ? null : original,
    substituteVia: back ? null : via,
    updatedAt: new Date().toISOString(),
  };
  await db.collection('classes').doc(cls.id).set(update, { merge: true });
  Object.assign(cls, update);
  const bookings = await db.collection('bookings').where('classId', '==', cls.id).get();
  const who = names[trainerId] || 'een andere trainer';
  const message = back
    ? { title: `${cls.title || 'Les'}: toch ${who}`, body: `${dayLabelNl(cls.date)} ${cls.startTime} geeft ${who} de les weer zelf.` }
    : pushMessages.substitute(cls, who, names[original] || null, dayLabelNl(cls.date));
  for (const d of bookings.docs) {
    const b = d.data();
    if (!['booked', 'waitlist'].includes(String(b.status))) continue;
    try {
      await sendPushToUser(db, String(b.userId), { ...message, data: { kind: 'classChanged', classId: cls.id } });
    } catch (e) {
      console.warn('[booking] melding invaller mislukt:', e?.message ?? e);
    }
  }
}

/**
 * Afwezigheden met een vaste invaller toepassen: lessen van de afwezige trainer op die dagen gaan
 * naar de invaller, als die vrij is. Wat niet lukt, blijft open staan in Beheer (Lessen zonder
 * trainer). Bij opslaan van een afwezigheid en elke avond (nieuwe lessen op het rooster).
 */
async function applyAbsences(db, orgId, onlyIds = null) {
  const absences = await currentAbsences(db, orgId);
  const active = absences.filter((a) => a.substituteId && (!onlyIds || onlyIds.includes(a.id)));
  if (active.length === 0) return { assigned: 0 };
  const [classes, trainers] = await Promise.all([upcomingOrgClasses(db, orgId), orgTrainers(db, orgId)]);
  const names = Object.fromEntries(trainers.map((t) => [t.userId, t.name]));
  const availability = {};
  let assigned = 0;
  for (const cls of classes.sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`))) {
    if (cls.cancelledAt) continue;
    const absence = absenceOn(active, cls.trainerId, cls.date);
    if (!absence || !names[absence.substituteId]) continue;
    if (!(absence.substituteId in availability)) availability[absence.substituteId] = await availabilityOf(db, orgId, absence.substituteId);
    if (busyReason(absence.substituteId, cls, { classes, absences, availability: availability[absence.substituteId] })) continue;
    await assignClassTrainer(db, cls, absence.substituteId, { via: absence.id, names });
    assigned++;
  }
  return { assigned };
}

/** Elke avond: voor alle studio's met een vaste invaller (nieuwe lessen op het rooster). */
async function runAbsences(db) {
  const snap = await db.collection('trainerAbsences').get();
  const today = todayIso();
  const orgs = [...new Set(snap.docs.map((d) => d.data()).filter((a) => a.substituteId && (!a.until || a.until >= today)).map((a) => orgIdOf(a.orgId)))];
  let assigned = 0;
  for (const orgId of orgs) assigned += (await applyAbsences(db, orgId)).assigned;
  return assigned;
}

/** Wie mag afwezigheid van deze trainer beheren: de trainer zelf, of een beheerder. */
async function requireAbsenceTrainer(db, uid, orgId, myRole, trainerId) {
  if (trainerId !== uid && myRole !== 'admin') throw refuse('Je kunt alleen je eigen afwezigheid beheren (of als beheerder die van een trainer).', 403);
  const snap = await db.collection('profiles').doc(trainerId).get();
  if (!snap.exists || !isStaffIn(snap.data(), orgId) || !orgsOf(snap.data()).includes(orgId)) throw refuse('Deze persoon is geen trainer in jouw studio.', 400);
}

async function listAbsences(res, db, orgId, trainerId) {
  const all = await currentAbsences(db, orgId);
  const list = (trainerId ? all.filter((a) => a.trainerId === trainerId) : all).sort((a, b) => a.from.localeCompare(b.from));
  return json(res, 200, { absences: list.map((a) => ({ ...a, label: absenceLabel(a) })), build: BUILD });
}

async function saveAbsence(res, db, uid, orgId, myRole, body) {
  const trainerId = String(body?.trainerId ?? '').trim() || uid;
  await requireAbsenceTrainer(db, uid, orgId, myRole, trainerId);
  const cleaned = cleanAbsence(body, todayIso());
  if (cleaned.error) return json(res, 400, { error: cleaned.error, build: BUILD });
  const value = cleaned.value;
  if (value.substituteId) {
    if (value.substituteId === trainerId) return json(res, 400, { error: 'Kies een andere trainer als invaller.', build: BUILD });
    const s = await db.collection('profiles').doc(value.substituteId).get();
    if (!s.exists || !isStaffIn(s.data(), orgId) || !orgsOf(s.data()).includes(orgId)) {
      return json(res, 400, { error: 'De invaller is geen trainer in jouw studio.', build: BUILD });
    }
  }
  const existingId = String(body?.id ?? '').trim();
  let id = existingId;
  const now = new Date().toISOString();
  let createdAt = now;
  if (existingId) {
    const snap = await db.collection('trainerAbsences').doc(existingId).get();
    if (!snap.exists || snap.data().orgId !== orgId || snap.data().trainerId !== trainerId) return json(res, 404, { error: 'Deze afwezigheid bestaat niet (meer).', build: BUILD });
    createdAt = snap.data().createdAt ?? now;
  } else {
    id = `ab_${trainerId}_${randomBytes(4).toString('hex')}`;
  }
  const absence = { id, orgId, trainerId, ...value, createdBy: uid, createdAt, updatedAt: now };
  await db.collection('trainerAbsences').doc(id).set(absence);
  const { assigned } = await applyAbsences(db, orgId, [id]);
  const classes = await upcomingOrgClasses(db, orgId);
  const open = classes.filter((c) => !c.cancelledAt && c.trainerId === trainerId && absenceCovers(absence, c.date)).length;
  return json(res, 200, { absence: { ...absence, label: absenceLabel(absence) }, assigned, open, build: BUILD });
}

/** Afwezigheid weghalen: lessen die via deze afwezigheid naar een invaller gingen, gaan terug. */
async function deleteAbsence(res, db, uid, orgId, myRole, id) {
  const ref = db.collection('trainerAbsences').doc(id);
  const snap = id ? await ref.get() : null;
  if (!snap?.exists || snap.data().orgId !== orgId) return json(res, 404, { error: 'Deze afwezigheid bestaat niet (meer).', build: BUILD });
  await requireAbsenceTrainer(db, uid, orgId, myRole, snap.data().trainerId);
  const [classes, trainers] = await Promise.all([upcomingOrgClasses(db, orgId), orgTrainers(db, orgId)]);
  const names = Object.fromEntries(trainers.map((t) => [t.userId, t.name]));
  let restored = 0;
  for (const cls of classes) {
    if (cls.substituteVia !== id || !cls.originalTrainerId) continue;
    await assignClassTrainer(db, cls, cls.originalTrainerId, { names });
    restored++;
  }
  await ref.delete();
  return json(res, 200, { deleted: true, restored, build: BUILD });
}

/**
 * Beheer → Lessen zonder trainer: komende lessen waarvan de trainer afwezig is, met wie kan
 * invallen (vrij eerst, de vaste invaller bovenaan). En de lessen die al een invaller hebben.
 */
async function absenceOverview(res, db, orgId) {
  const [absences, classes, trainers] = await Promise.all([currentAbsences(db, orgId), upcomingOrgClasses(db, orgId), orgTrainers(db, orgId)]);
  const names = Object.fromEntries(trainers.map((t) => [t.userId, t.name]));
  const availability = {};
  for (const t of trainers) availability[t.userId] = await availabilityOf(db, orgId, t.userId);
  const sorted = classes.filter((c) => !c.cancelledAt).sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));
  const summary = (c) => ({
    classId: c.id,
    title: String(c.title ?? ''),
    date: c.date,
    startTime: c.startTime,
    endTime: c.endTime,
    trainerId: c.trainerId ?? null,
    trainerName: names[c.trainerId] ?? null,
    bookedCount: Number(c.bookedCount) || 0,
    privateFor: c.privateFor ?? null,
  });
  const open = [];
  for (const c of sorted) {
    const absence = absenceOn(absences, c.trainerId, c.date);
    if (!absence) continue;
    open.push({
      ...summary(c),
      absenceLabel: absenceLabel(absence),
      options: substituteOptions(c, {
        trainers,
        absentId: c.trainerId,
        preferredId: absence.substituteId ?? null,
        classes,
        absences,
        availabilityOf: (id) => availability[id] ?? null,
      }),
    });
  }
  const covered = sorted
    .filter((c) => c.originalTrainerId && c.originalTrainerId !== c.trainerId)
    .map((c) => ({ ...summary(c), originalTrainerId: c.originalTrainerId, originalTrainerName: names[c.originalTrainerId] ?? null }));
  return json(res, 200, { open, covered, build: BUILD });
}

/** Andere trainer op één les (alleen deze keer), of terug naar de eigen trainer. */
async function setClassTrainer(res, db, orgId, body) {
  const classId = String(body?.classId ?? '').trim();
  const trainerId = String(body?.trainerId ?? '').trim();
  const snap = classId ? await db.collection('classes').doc(classId).get() : null;
  if (!snap?.exists || orgIdOf(snap.data().orgId) !== orgId) return json(res, 404, { error: 'Deze les bestaat niet (meer).', build: BUILD });
  const cls = { ...snap.data(), id: snap.id };
  if (!trainerId) return json(res, 400, { error: 'Kies een trainer.', build: BUILD });
  if (cls.trainerId === trainerId) return json(res, 200, { trainerId, build: BUILD });
  const trainers = await orgTrainers(db, orgId);
  if (!trainers.some((t) => t.userId === trainerId)) return json(res, 400, { error: 'Deze trainer hoort niet bij jouw studio.', build: BUILD });
  const [absences, sameDay, sched] = await Promise.all([
    currentAbsences(db, orgId),
    db.collection('classes').where('date', '==', cls.date).get(),
    scheduleContext(db, orgId),
  ]);
  const classes = sameDay.docs.map((d) => ({ ...d.data(), id: d.id })).filter((c) => orgIdOf(c.orgId) === orgId);
  // Beschikbaarheid telt hier niet: de trainer kiest bewust. Afwezig of al een les: dan niet.
  const reason = busyReason(trainerId, cls, { classes, absences, availability: null });
  const name = trainers.find((t) => t.userId === trainerId)?.name ?? 'Deze trainer';
  if (reason === 'afwezig') return json(res, 409, { error: `${name} is die dag afwezig.`, build: BUILD });
  if (reason && sched.block) return json(res, 409, { error: `${name} ${reason}.`, build: BUILD });
  await assignClassTrainer(db, cls, trainerId, { names: Object.fromEntries(trainers.map((t) => [t.userId, t.name])) });
  return json(res, 200, { trainerId, originalTrainerId: cls.originalTrainerId ?? null, build: BUILD });
}

// --- Abonnement en vaste momenten (api/_lib/planCoverage.mjs) -----------------------------------

/** Abonnement van een lid en hoeveel vaste momenten er al staan (of aangevraagd zijn). */
async function planUsage(db, orgId, userId) {
  const membership = await activeMembership(db, orgId, userId);
  const planSnap = membership?.planId ? await db.collection('plans').doc(String(membership.planId)).get() : null;
  const plan = planSnap?.exists ? { id: planSnap.id, ...planSnap.data() } : null;
  const [standingSnap, pendingSnap] = await Promise.all([
    db.collection('standingBookings').where('orgId', '==', orgId).where('userId', '==', userId).where('active', '==', true).get(),
    db.collection('rescheduleRequests').where('userId', '==', userId).where('status', '==', 'pending').get(),
  ]);
  const standingIds = standingSnap.docs.map((d) => d.id);
  // Om de week telt als een halve keer per week.
  const weights = Object.fromEntries(standingSnap.docs.map((d) => [d.id, weightOf(d.data())]));
  const used = sumWeights(Object.values(weights));
  const pending = sumWeights(pendingSnap.docs.filter((d) => d.data().kind === 'standing' && d.data().orgId === orgId).map((d) => weightOf(d.data())));
  return { plan, standingIds, weights, used, pending };
}

/** Hoe zwaar een vast moment telt voor "x per week": elke week 1, om de week 0,5. */
const weightOf = (item) => (isBiweekly(item) ? 0.5 : 1);
const sumWeights = (list) => Math.round(list.reduce((a, b) => a + b, 0) * 2) / 2;
/** "1,5" */
const nlNumber = (n) => String(n).replace('.', ',');

/** Waarom een sporter dit niet zelf mag inplannen, of null. `standingId` telt niet mee als hij er al staat. */
function planRefusal(status, sessionKind, standingId = null, cost = 1) {
  const { plan } = status;
  if (!plan) return 'Je hebt nog geen abonnement. Kies er een onder Profiel → Abonnement, of vraag het de studio.';
  if (!planCoversKind(plan, sessionKind ?? 'group')) {
    return coversOf(plan) === 'pt'
      ? 'Je abonnement is voor personal training; een groepsles kun je niet vast inplannen.'
      : 'Je abonnement is voor groepslessen; een PT-moment kun je niet vast inplannen.';
  }
  const limit = perWeekOf(plan);
  const already = standingId && status.standingIds.includes(standingId) ? status.weights?.[standingId] ?? 1 : 0;
  const planned = status.used + status.pending - already;
  if (limit != null && planned + cost > limit) {
    return `Je abonnement is voor ${limit}x per week en je hebt er al ${nlNumber(planned)} ingepland.`;
  }
  return null;
}

async function planStatus(res, db, uid, orgId, isStaff, userId) {
  if (userId !== uid && !isStaff) return json(res, 403, { error: 'Alleen je eigen abonnement.', build: BUILD });
  const [status, profileSnap] = await Promise.all([planUsage(db, orgId, userId), db.collection('profiles').doc(userId).get()]);
  if (!profileSnap.exists || !orgsOf(profileSnap.data()).includes(orgId)) return json(res, 404, { error: 'Dit lid hoort niet bij jouw studio.', build: BUILD });
  const { plan } = status;
  return json(res, 200, {
    plan: plan ? { id: plan.id, name: String(plan.name ?? ''), covers: coversOf(plan), perWeek: perWeekOf(plan) } : null,
    used: status.used,
    pending: status.pending,
    trainerId: profileSnap.exists ? profileSnap.data()?.trainerId ?? null : null,
    build: BUILD,
  });
}

/** Vrije weekmomenten bij een trainer (sporter: zijn eigen trainer; staf: de gekozen trainer). */
async function freeWeeklySlots(db, orgId, trainerId, duration, ignoreClassTypeId = null, pattern = null) {
  const [sched, availability, pendingSnap] = await Promise.all([
    scheduleContext(db, orgId),
    availabilityOf(db, orgId, trainerId),
    db.collection('rescheduleRequests').where('trainerId', '==', trainerId).where('status', '==', 'pending').get(),
  ]);
  const extraBusy = pendingSnap.docs.map((d) => d.data()).filter((r) => r.kind === 'standing');
  const classTypes = ignoreClassTypeId ? sched.types.filter((t) => t.id !== ignoreClassTypeId) : sched.types;
  return weeklyFreeSlots({ trainerId, classTypes, availability, hours: sched.hours, duration, extraBusy, pattern });
}

const cleanDuration = (v) => {
  const n = Math.round(Number(v) || 60);
  return Math.min(180, Math.max(30, n));
};

async function weeklyPtOptions(res, db, uid, orgId, isStaff, body) {
  // Sporter: altijd bij zijn eigen trainer. Staf: de gekozen trainer, anders die van het lid.
  const userId = isStaff ? String(body?.userId ?? '').trim() || uid : uid;
  let trainerId = isStaff ? String(body?.trainerId ?? '').trim() : '';
  if (!trainerId) {
    const p = await db.collection('profiles').doc(userId).get();
    if (!p.exists || !orgsOf(p.data()).includes(orgId)) return json(res, 404, { error: 'Dit lid hoort niet bij jouw studio.', build: BUILD });
    trainerId = String(p.data()?.trainerId ?? '');
  }
  if (!trainerId) return json(res, 409, { error: 'Er is nog geen vaste trainer gekozen.', build: BUILD });
  const duration = cleanDuration(body?.duration);
  // Reeks wijzigen (staf): het huidige moment van dit lid telt niet als bezet.
  const ignore = isStaff ? String(body?.ignoreClassTypeId ?? '').trim() || null : null;
  // Om de week: per weekdag de even of oneven week vanaf de startdatum; de andere week is dan niet bezet.
  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.startDate ?? '')) ? String(body.startDate) : todayIso();
  const pattern = Number(body?.everyWeeks) === 2 ? (weekday) => patternFields(2, startDate, weekday) : null;
  return json(res, 200, { trainerId, duration, days: await freeWeeklySlots(db, orgId, trainerId, duration, ignore, pattern), build: BUILD });
}

/**
 * Sporter vraagt een vast PT-moment aan bij zijn eigen trainer: binnen zijn abonnement (soort en
 * keer per week) en op een vrij weekmoment. De trainer keurt goed in Beheer (zelfde lijst als
 * verzetten); dan zet de server het moment vast zoals staf dat doet.
 */
async function requestStandingPt(res, db, uid, orgId, isStaff, body) {
  if (isStaff) return json(res, 400, { error: 'Als trainer of beheerder plan je een PT-moment direct in.', build: BUILD });
  const weekday = Number(body?.weekday);
  const startTime = String(body?.startTime ?? '').trim();
  const endTime = String(body?.endTime ?? '').trim();
  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.startDate ?? '')) ? String(body.startDate) : todayIso();
  const me = await db.collection('profiles').doc(uid).get();
  const trainerId = String(me.data()?.trainerId ?? '');
  if (!trainerId) return json(res, 409, { error: 'Je hebt nog geen vaste trainer. Vraag de studio om er een te koppelen.', build: BUILD });

  const pattern = patternFields(body?.everyWeeks, startDate, weekday);
  const refusal = planRefusal(await planUsage(db, orgId, uid), '1on1', null, weightOf(pattern));
  if (refusal) return json(res, 409, { error: refusal, build: BUILD });

  const duration = toMinutes(endTime) - toMinutes(startTime);
  const days = await freeWeeklySlots(db, orgId, trainerId, cleanDuration(duration), null, pattern);
  const offered = days.some((d) => d.weekday === weekday && d.times.some((t) => t.startTime === startTime && t.endTime === endTime));
  if (!offered) return json(res, 409, { error: 'Dit moment is niet (meer) vrij. Kies een ander moment.', build: BUILD });

  const id = `rs_${uid}_${weekday}_${startTime.replace(':', '')}`;
  const ref = db.collection('rescheduleRequests').doc(id);
  const existing = await ref.get();
  if (existing.exists && existing.data().status === 'pending') return json(res, 409, { error: 'Dit moment heb je al aangevraagd.', build: BUILD });
  const nowIso = new Date().toISOString();
  const request = {
    id,
    kind: 'standing',
    orgId,
    userId: uid,
    trainerId,
    title: 'Personal Training',
    weekday,
    startTime,
    endTime,
    startDate,
    ...pattern,
    date: startDate,
    status: 'pending',
    requestedBy: uid,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  await ref.set(request);
  try {
    await sendPushToUser(db, trainerId, { ...pushMessages.standingRequested(request, String(me.data()?.displayName || 'Een sporter')), data: { kind: 'rescheduleRequest' } });
  } catch (e) {
    console.warn('[booking] melding vast PT-moment aangevraagd mislukt:', e?.message ?? e);
  }
  return json(res, 200, { requestId: id, status: 'pending', build: BUILD });
}

/** Goedkeuren van een aangevraagd vast PT-moment: vastzetten zoals staf dat doet (met botsingscontrole). */
async function approveStandingRequest(db, approverUid, orgId, request) {
  const out = captureRes();
  await addPersonalSlot(out, db, approverUid, [orgId], true, {
    userId: request.userId,
    weekday: request.weekday,
    startTime: request.startTime,
    endTime: request.endTime,
    startDate: request.startDate,
    trainerId: request.trainerId,
    everyWeeks: request.everyWeeks ?? 1,
  });
  if (out.statusCode !== 200) return { error: out.body?.error || 'Vastzetten mislukt.', status: out.statusCode };
  const nowIso = new Date().toISOString();
  await db.collection('rescheduleRequests').doc(request.id).set(
    { status: 'approved', classTypeId: out.body?.classTypeId ?? null, answeredBy: approverUid, answeredAt: nowIso, updatedAt: nowIso },
    { merge: true }
  );
  try {
    await sendPushToUser(db, request.userId, { ...pushMessages.standingApproved(request), data: { kind: 'rescheduleAnswered' } });
  } catch (e) {
    console.warn('[booking] melding vast PT-moment bevestigd mislukt:', e?.message ?? e);
  }
  return { classTypeId: out.body?.classTypeId ?? null };
}

// --- Losse afspraak: één keer een PT-moment, geen reeks ----------------------------------------

/** Zoveel dagen vooruit (vandaag meegeteld) bieden we een losse PT-afspraak aan. */
const SINGLE_PT_DAYS = 28;

/** Voor wie en bij welke trainer: een sporter bij zijn eigen trainer; staf kiest lid en trainer. */
async function singlePtParties(db, uid, orgId, isStaff, body) {
  const userId = isStaff ? String(body?.userId ?? '').trim() || uid : uid;
  const p = await db.collection('profiles').doc(userId).get();
  if (!p.exists || !orgsOf(p.data()).includes(orgId)) throw refuse('Dit lid hoort niet bij jouw studio.', 404);
  const trainerId = (isStaff ? String(body?.trainerId ?? '').trim() : '') || String(p.data()?.trainerId ?? '');
  if (!trainerId) throw refuse(isStaff ? 'Kies een trainer.' : 'Je hebt nog geen vaste trainer. Vraag de studio om er een te koppelen.', 409);
  if (trainerId !== uid) {
    const t = await db.collection('profiles').doc(trainerId).get();
    if (!t.exists || !isStaffIn(t.data(), orgId) || !orgsOf(t.data()).includes(orgId)) throw refuse('Deze trainer hoort niet bij jouw studio.', 400);
  }
  return { userId, trainerId, member: p.data() };
}

/** Vrije momenten voor een losse PT-afspraak: de komende vier weken, binnen de beschikbaarheid. */
async function singlePtOptions(res, db, uid, orgId, isStaff, body) {
  const { trainerId } = await singlePtParties(db, uid, orgId, isStaff, body);
  const duration = cleanDuration(body?.duration);
  const options = await optionsFor(db, orgId, { trainerId, room: null, duration, exclude: null }, { days: SINGLE_PT_DAYS });
  return json(res, 200, { trainerId, duration, ...options, build: BUILD });
}

/**
 * Een losse PT-afspraak: staf plant meteen in (credit eraf zoals bij boeken), een sporter vraagt
 * aan en de trainer keurt goed in dezelfde lijst als verzetten. Dat loopt via hetzelfde verzoek als
 * verzetten (kind 'single'), zodat goedkeuren, afwijzen en meldingen hetzelfde werken.
 */
async function bookSinglePt(res, db, uid, orgId, isStaff, body) {
  const { userId, trainerId, member } = await singlePtParties(db, uid, orgId, isStaff, body);
  const date = String(body?.date ?? '').trim();
  const startTime = String(body?.startTime ?? '').trim();
  const duration = cleanDuration(body?.duration);
  if (!isStaff && isInactiveIn(member, orgId)) return json(res, 403, { error: 'Je lidmaatschap bij deze studio staat op inactief.', build: BUILD });
  const options = await optionsFor(db, orgId, { trainerId, room: null, duration, exclude: null }, { days: SINGLE_PT_DAYS });
  if (!isOffered(options, date, startTime)) return json(res, 409, { error: 'Dit moment is niet (meer) vrij. Kies een ander moment.', build: BUILD });
  const endTime = options.days.find((d) => d.date === date).times.find((t) => t.startTime === startTime).endTime;

  const requestId = `r1_${userId}_${date.replaceAll('-', '')}_${startTime.replace(':', '')}`;
  const reqRef = db.collection('rescheduleRequests').doc(requestId);
  const existing = await reqRef.get();
  if (existing.exists && existing.data().status === 'pending') return json(res, 409, { error: 'Dit moment is al aangevraagd.', build: BUILD });
  const nowIso = new Date().toISOString();
  const request = {
    id: requestId,
    kind: 'single',
    orgId,
    userId,
    trainerId,
    fromClassId: null,
    fromDate: null,
    fromStartTime: null,
    title: DEFAULT_PT_BASE.name,
    date,
    startTime,
    endTime,
    room: null,
    creditCost: DEFAULT_PT_BASE.creditCost,
    schemaId: null,
    sessionKind: DEFAULT_PT_BASE.sessionKind,
    description: null,
    baseClassTypeId: null,
    status: 'pending',
    requestedBy: uid,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  await reqRef.set(request);

  if (isStaff) {
    const done = await approveRequest(db, uid, orgId, request);
    if (done.error) {
      await reqRef.delete();
      return json(res, done.status ?? 409, { error: done.error, build: BUILD });
    }
    return json(res, 200, { requestId, status: 'approved', classId: done.classId, build: BUILD });
  }
  try {
    await sendPushToUser(db, trainerId, { ...pushMessages.singleRequested(request, String(member?.displayName || 'Een sporter')), data: { kind: 'rescheduleRequest' } });
  } catch (e) {
    console.warn('[booking] melding losse afspraak aangevraagd mislukt:', e?.message ?? e);
  }
  return json(res, 200, { requestId, status: 'pending', build: BUILD });
}

// --- Afspraken wijzigen: één afspraak of de hele reeks (staf) ---------------------------------

const WEEKDAY_NAMES = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];

/**
 * Hele reeks wijzigen: het vaste PT-moment gaat vanaf `fromDate` naar een andere dag, tijd of
 * trainer. Eerst het nieuwe moment vastzetten (met botsingscontrole, het oude telt niet mee); lukt
 * dat, dan de afspraken van de oude reeks vanaf die datum afmelden met de credit terug en de oude
 * reeks weghalen. Afspraken vóór die datum blijven gewoon staan.
 */
async function moveStandingPt(res, db, uid, myOrgs, body) {
  const standing = await loadStandingForActor(db, uid, myOrgs, true, String(body?.standingBookingId ?? '').trim());
  const ctSnap = await db.collection('classTypes').doc(String(standing.classTypeId)).get();
  const ct = ctSnap.exists ? ctSnap.data() : null;
  if (!ct?.privateFor) return json(res, 400, { error: 'Alleen een vast PT-moment kun je zo wijzigen.', build: BUILD });
  const fromDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.fromDate ?? '')) ? String(body.fromDate) : todayIso();
  if (fromDate < todayIso()) return json(res, 400, { error: 'Kies een datum vanaf vandaag.', build: BUILD });

  const out = captureRes();
  await addPersonalSlot(out, db, uid, myOrgs, true, {
    userId: standing.userId,
    baseClassTypeId: ct.baseClassTypeId || '',
    weekday: body?.weekday,
    startTime: body?.startTime,
    endTime: body?.endTime,
    trainerId: String(body?.trainerId ?? '').trim() || ct.defaultTrainerId || '',
    startDate: fromDate,
    ignoreClassTypeId: standing.classTypeId,
    // Zonder keuze blijft het ritme (elke week of om de week) zoals het was.
    everyWeeks: body?.everyWeeks ?? standing.everyWeeks ?? 1,
  });
  if (out.statusCode !== 200) return json(res, out.statusCode, { ...out.body, build: BUILD });

  // Zelfde weekmoment (alleen trainer of eindtijd anders): de reeks is ter plekke bijgewerkt.
  let cancelled = 0;
  let refunded = 0;
  if (out.body.classTypeId !== standing.classTypeId) {
    const r = await cancelSeriesBookings(db, uid, myOrgs, true, standing, (date) => date >= fromDate, { forceRefund: true, silent: true });
    cancelled = r.cancelled;
    refunded = r.refunded;
    const future = await futureClassesOfType(db, String(standing.classTypeId), fromDate, [orgIdOf(standing.orgId)]);
    await deleteClasses(db, future.filter((c) => !(Number(c.bookedCount) > 0) && !(Number(c.waitlistCount) > 0)));
    await db.collection('classTypes').doc(String(standing.classTypeId)).delete();
    await db.collection('standingBookings').doc(String(standing.id)).delete();
  }
  if (standing.userId !== uid) {
    try {
      await sendPushToUser(db, standing.userId, {
        title: 'Vast PT-moment gewijzigd',
        body: `Vanaf ${fromDate.split('-').reverse().join('-')}: ${Number(body?.everyWeeks ?? standing.everyWeeks) === 2 ? 'om de week op' : 'elke'} ${WEEKDAY_NAMES[Number(body?.weekday)] ?? 'week'} om ${String(body?.startTime ?? '')}.`,
        data: { kind: 'standingChanged' },
      });
    } catch (e) {
      console.warn('[booking] melding reeks gewijzigd mislukt:', e?.message ?? e);
    }
  }
  return json(res, 200, { ...out.body, cancelled, refunded, build: BUILD });
}

/**
 * Eén PT-afspraak verzetten (staf): het nieuwe moment moet vrij zijn bij de trainer; dan de oude
 * afspraak afmelden met de credit terug en het nieuwe moment meteen vastzetten en boeken.
 */
async function moveOccurrence(res, db, uid, orgId, myOrgs, body) {
  const bookingId = String(body?.bookingId ?? '').trim();
  const snap = bookingId ? await db.collection('bookings').doc(bookingId).get() : null;
  if (!snap?.exists) return json(res, 404, { error: 'Deze afspraak bestaat niet (meer).', build: BUILD });
  const booking = snap.data();
  if (orgIdOf(booking.orgId) !== orgId) return json(res, 403, { error: 'Deze afspraak hoort niet bij jouw studio.', build: BUILD });
  if (booking.status !== 'booked') return json(res, 409, { error: 'Deze afspraak staat niet (meer) geboekt.', build: BUILD });
  const cls = await rescheduleSource(db, uid, orgId, true, String(booking.classId));
  const date = String(body?.date ?? '').trim();
  const startTime = String(body?.startTime ?? '').trim();
  const options = await optionsFor(db, orgId, slotOf(cls));
  if (!isOffered(options, date, startTime)) return json(res, 409, { error: 'Dit moment is niet (meer) vrij. Kies een ander moment.', build: BUILD });

  await cancelBookingCore(db, uid, myOrgs, true, bookingId, { forceRefund: true });
  const out = captureRes();
  await requestReschedule(out, db, uid, orgId, true, { classId: cls.id, date, startTime });
  if (out.statusCode !== 200) {
    return json(res, out.statusCode, { error: `${out.body?.error || 'Verzetten mislukt.'} De oude afspraak is afgemeld en de credit staat terug.`, build: BUILD });
  }
  if (booking.userId !== uid) {
    try {
      const old = `${dayLabelNl(cls.date)} ${cls.startTime}`;
      await sendPushToUser(db, String(booking.userId), {
        title: 'PT-moment verzet',
        body: `Je afspraak van ${old} is verzet naar ${dayLabelNl(date)} ${startTime}.`,
        data: { kind: 'rescheduleAnswered' },
      });
    } catch (e) {
      console.warn('[booking] melding verzet mislukt:', e?.message ?? e);
    }
  }
  return json(res, 200, { ...out.body, build: BUILD });
}

const dayLabelNl = (date) =>
  /^\d{4}-\d{2}-\d{2}$/.test(String(date))
    ? new Intl.DateTimeFormat('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`)).replace(/\./g, '')
    : String(date);

// --- Verzetten na afmelden (api/_lib/reschedule.mjs) ------------------------------------------

/** Vangt het antwoord van een bestaande actie op, zodat die hier hergebruikt kan worden. */
function captureRes() {
  return {
    statusCode: 200,
    body: null,
    setHeader() {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    end(payload) {
      this.body = payload ? JSON.parse(payload) : null;
    },
  };
}

/** De afgemelde PT-les, als de beller die mag verzetten: het lid zelf, of staf van de studio. */
async function rescheduleSource(db, uid, orgId, isStaff, classId) {
  if (!classId) throw refuse('Geen les opgegeven.', 400);
  const snap = await db.collection('classes').doc(classId).get();
  if (!snap.exists) throw refuse('Deze les bestaat niet (meer).', 404);
  const cls = { ...snap.data(), id: classId };
  if (orgIdOf(cls.orgId) !== orgId) throw refuse('Deze les hoort niet bij jouw studio.', 403);
  if (!canRescheduleClass(cls, cls.privateFor)) throw refuse('Alleen een persoonlijk PT-moment met een trainer kun je verzetten.', 400);
  if (cls.privateFor !== uid && !isStaff) throw refuse('Dit is niet jouw les.', 403);
  return cls;
}

/**
 * Vrije momenten voor een nieuw PT-moment bij deze trainer (zie rescheduleOptions): zelfde duur,
 * niet op het afgemelde moment zelf (`exclude`).
 */
async function optionsFor(db, orgId, { trainerId, room, duration, exclude }, { ignoreRequestId = null, days = RESCHEDULE_DAYS } = {}) {
  const now = new Date();
  const dates = Array.from({ length: days }, (_, i) => amsterdamDate(now, i));
  const [orgSnap, availability, classSnap, pendingSnap, absences] = await Promise.all([
    db.collection('orgs').doc(orgId).get(),
    availabilityOf(db, orgId, trainerId),
    db.collection('classes').where('date', '>=', dates[0]).where('date', '<=', dates[dates.length - 1]).get(),
    db.collection('rescheduleRequests').where('trainerId', '==', trainerId).where('status', '==', 'pending').get(),
    currentAbsences(db, orgId),
  ]);
  // Openstaande verzoeken bij deze trainer houden dat moment vrij voor wie het vroeg.
  const pending = pendingSnap.docs.filter((d) => d.id !== ignoreRequestId).map((d) => d.data());
  const busy = busyByDate([...classSnap.docs.map((d) => d.data()), ...pending], { trainerId, room });
  const minStart = now.getTime() + MIN_LEAD_MINUTES * 60 * 1000;
  return rescheduleOptions({
    // Op dagen dat de trainer afwezig is, biedt de app hem niet aan.
    dates: dates.filter((d) => !absenceOn(absences, trainerId, d)),
    duration,
    availability,
    hours: hoursOf(orgSnap.exists ? orgSnap.data() : null),
    busy,
    tooSoon: (date, startTime) => amsterdamDateTime(date, startTime).getTime() < minStart,
    exclude,
  });
}

/** Wat optionsFor nodig heeft van de afgemelde les. */
const slotOf = (cls) => ({
  trainerId: cls.trainerId,
  room: cls.room ?? null,
  duration: toMinutes(cls.endTime) - toMinutes(cls.startTime),
  exclude: { date: cls.date, startTime: cls.startTime },
});

const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm ?? '').split(':').map(Number);
  return h * 60 + m;
};

async function getRescheduleOptions(res, db, uid, orgId, isStaff, classId) {
  const cls = await rescheduleSource(db, uid, orgId, isStaff, classId);
  const options = await optionsFor(db, orgId, slotOf(cls));
  return json(res, 200, { classId, title: cls.title ?? '', trainerId: cls.trainerId, ...options, build: BUILD });
}

/**
 * Nieuw moment aanvragen. Een sporter vraagt aan (de trainer krijgt een melding en keurt goed);
 * staf plant meteen in. Eén verzoek per afgemelde les; na een afwijzing kan het opnieuw.
 */
async function requestReschedule(res, db, uid, orgId, isStaff, body) {
  const cls = await rescheduleSource(db, uid, orgId, isStaff, String(body?.classId ?? '').trim());
  const date = String(body?.date ?? '').trim();
  const startTime = String(body?.startTime ?? '').trim();
  const userId = cls.privateFor;

  const bookings = await db.collection('bookings').where('classId', '==', cls.id).where('userId', '==', userId).get();
  if (bookings.docs.some((d) => ['booked', 'waitlist'].includes(String(d.data().status)))) {
    return json(res, 409, { error: 'Je staat nog ingeschreven voor deze les. Meld je eerst af.', build: BUILD });
  }
  const requestId = rescheduleRequestId(cls.id);
  const reqRef = db.collection('rescheduleRequests').doc(requestId);
  const existing = await reqRef.get();
  if (existing.exists && ['pending', 'approved'].includes(String(existing.data().status))) {
    return json(res, 409, { error: 'Voor deze les loopt al een verzoek.', build: BUILD });
  }
  const options = await optionsFor(db, orgId, slotOf(cls));
  if (!isOffered(options, date, startTime)) {
    return json(res, 409, { error: 'Dit moment is niet (meer) vrij. Kies een ander moment.', build: BUILD });
  }
  const endTime = options.days.find((d) => d.date === date).times.find((t) => t.startTime === startTime).endTime;
  const nowIso = new Date().toISOString();
  const request = {
    id: requestId,
    orgId,
    userId,
    trainerId: cls.trainerId,
    fromClassId: cls.id,
    fromDate: cls.date,
    fromStartTime: cls.startTime,
    title: cls.title ?? '',
    date,
    startTime,
    endTime,
    room: cls.room ?? null,
    creditCost: Number(cls.creditCost ?? 1) || 0,
    schemaId: cls.schemaId ?? null,
    sessionKind: cls.sessionKind ?? '1on1',
    description: cls.description ?? null,
    baseClassTypeId: cls.classTypeId ?? null,
    status: 'pending',
    requestedBy: uid,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  await reqRef.set(request);

  if (isStaff) {
    const done = await approveRequest(db, uid, orgId, request);
    if (done.error) {
      await reqRef.delete();
      return json(res, done.status ?? 409, { error: done.error, build: BUILD });
    }
    return json(res, 200, { requestId, status: 'approved', classId: done.classId, build: BUILD });
  }

  try {
    const me = await db.collection('profiles').doc(uid).get();
    const name = String(me.data()?.displayName || 'Een sporter');
    await sendPushToUser(db, cls.trainerId, { ...pushMessages.rescheduleRequested(request, name), data: { kind: 'rescheduleRequest' } });
  } catch (e) {
    console.warn('[booking] melding verzoek verzetten mislukt:', e?.message ?? e);
  }
  return json(res, 200, { requestId, status: 'pending', build: BUILD });
}

/**
 * Goedkeuren: het moment nog één keer controleren, de les aanmaken en het lid inschrijven via
 * dezelfde weg als gewoon boeken (credit eraf, zelfde regels). Lukt boeken niet, dan gaat de les weg.
 */
async function approveRequest(db, approverUid, orgId, request) {
  const slot = {
    trainerId: request.trainerId,
    room: request.room,
    duration: toMinutes(request.endTime) - toMinutes(request.startTime),
    exclude: { date: request.fromDate, startTime: request.fromStartTime },
  };
  const options = await optionsFor(db, orgId, slot, { ignoreRequestId: request.id, days: request.kind === 'single' ? SINGLE_PT_DAYS : RESCHEDULE_DAYS });
  if (!isOffered(options, request.date, request.startTime)) {
    return { error: 'Dit moment is inmiddels bezet of ligt te dichtbij. Wijs het verzoek af; de sporter kan een ander moment kiezen.' };
  }
  const classId = rescheduledClassId(request.id);
  const nowIso = new Date().toISOString();
  const classRef = db.collection('classes').doc(classId);
  await classRef.set({
    id: classId,
    orgId,
    title: request.title,
    date: request.date,
    startTime: request.startTime,
    endTime: request.endTime,
    trainerId: request.trainerId,
    capacity: 1,
    creditCost: request.creditCost,
    schemaId: request.schemaId,
    classTypeId: null,
    baseClassTypeId: request.baseClassTypeId,
    rescheduledFrom: request.fromClassId,
    room: request.room,
    description: request.description,
    sessionKind: request.sessionKind,
    privateFor: request.userId,
    privateForGroup: null,
    groupMemberIds: [],
    bookedCount: 0,
    waitlistCount: 0,
    cancelledAt: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  const out = captureRes();
  try {
    await book(out, db, approverUid, [orgId], classId, false, true, request.userId, false, true);
  } catch (e) {
    out.statusCode = e?.status ?? 409;
    out.body = { error: e?.expected ? e.message : 'Inschrijven mislukt.' };
    if (!e?.expected) console.error('[booking] inschrijven na verzetten mislukt', e);
  }
  if (out.statusCode !== 200) {
    await classRef.delete();
    return { error: out.body?.error || 'Inschrijven mislukt.', status: out.statusCode };
  }
  await db.collection('rescheduleRequests').doc(request.id).set(
    { status: 'approved', classId, answeredBy: approverUid, answeredAt: nowIso, updatedAt: nowIso },
    { merge: true }
  );
  if (request.userId !== approverUid) {
    try {
      await sendPushToUser(db, request.userId, { ...pushMessages.rescheduleApproved(request), data: { kind: 'rescheduleAnswered' } });
    } catch (e) {
      console.warn('[booking] melding verzetten bevestigd mislukt:', e?.message ?? e);
    }
  }
  return { classId };
}

/** Staf: openstaande verzoeken van de studio. Sporter: je eigen verzoeken voor komende momenten. */
async function listRescheduleRequests(res, db, uid, orgId, isStaff) {
  const today = amsterdamDate(new Date());
  let list;
  if (isStaff) {
    const snap = await db.collection('rescheduleRequests').where('orgId', '==', orgId).where('status', '==', 'pending').get();
    list = snap.docs.map((d) => d.data());
  } else {
    const snap = await db.collection('rescheduleRequests').where('userId', '==', uid).get();
    list = snap.docs.map((d) => d.data()).filter((r) => r.orgId === orgId && r.date >= today);
  }
  list = list.filter((r) => r.date >= today || r.status === 'pending');
  const names = {};
  if (isStaff) {
    for (const id of [...new Set(list.flatMap((r) => [r.userId, r.trainerId]).filter(Boolean))]) {
      const p = await db.collection('profiles').doc(id).get();
      names[id] = p.exists ? String(p.data()?.displayName || p.data()?.email || '') : '';
    }
  }
  const requests = list
    .sort((a, b) => String(a.date + a.startTime).localeCompare(String(b.date + b.startTime)))
    .map((r) => ({
      id: r.id,
      userId: r.userId,
      userName: names[r.userId] ?? null,
      trainerId: r.trainerId,
      trainerName: names[r.trainerId] ?? null,
      title: r.title,
      fromClassId: r.fromClassId,
      fromDate: r.fromDate,
      fromStartTime: r.fromStartTime,
      date: r.date,
      startTime: r.startTime,
      endTime: r.endTime,
      status: r.status,
      classId: r.classId ?? null,
      kind: r.kind === 'standing' || r.kind === 'single' ? r.kind : 'reschedule',
      weekday: r.kind === 'standing' ? Number(r.weekday) : null,
      everyWeeks: r.kind === 'standing' && isBiweekly(r) ? 2 : null,
      startDate: r.startDate ?? null,
    }));
  return json(res, 200, { requests, build: BUILD });
}

/** Verzoek beantwoorden: de trainer van het verzoek, of een beheerder. */
async function answerReschedule(res, db, uid, orgId, myRole, requestId, approve) {
  if (!requestId) return json(res, 400, { error: 'Geen verzoek opgegeven.', build: BUILD });
  const ref = db.collection('rescheduleRequests').doc(requestId);
  const snap = await ref.get();
  if (!snap.exists || snap.data().orgId !== orgId) return json(res, 404, { error: 'Dit verzoek bestaat niet (meer).', build: BUILD });
  const request = snap.data();
  if (request.trainerId !== uid && myRole !== 'admin') {
    return json(res, 403, { error: 'Alleen de trainer van dit moment of een beheerder kan dit verzoek beantwoorden.', build: BUILD });
  }
  if (request.status !== 'pending') return json(res, 409, { error: 'Dit verzoek is al beantwoord.', build: BUILD });

  if (request.kind === 'standing') {
    if (approve) {
      const done = await approveStandingRequest(db, uid, orgId, request);
      if (done.error) return json(res, done.status ?? 409, { error: done.error, build: BUILD });
      return json(res, 200, { status: 'approved', build: BUILD });
    }
    const at = new Date().toISOString();
    await ref.set({ status: 'declined', answeredBy: uid, answeredAt: at, updatedAt: at }, { merge: true });
    try {
      await sendPushToUser(db, request.userId, { ...pushMessages.standingDeclined(request), data: { kind: 'rescheduleAnswered' } });
    } catch (e) {
      console.warn('[booking] melding vast PT-moment afgewezen mislukt:', e?.message ?? e);
    }
    return json(res, 200, { status: 'declined', build: BUILD });
  }

  if (approve) {
    const done = await approveRequest(db, uid, orgId, request);
    if (done.error) return json(res, done.status ?? 409, { error: done.error, build: BUILD });
    return json(res, 200, { status: 'approved', classId: done.classId, build: BUILD });
  }
  const nowIso = new Date().toISOString();
  await ref.set({ status: 'declined', answeredBy: uid, answeredAt: nowIso, updatedAt: nowIso }, { merge: true });
  try {
    await sendPushToUser(db, request.userId, { ...pushMessages.rescheduleDeclined(request), data: { kind: 'rescheduleAnswered' } });
  } catch (e) {
    console.warn('[booking] melding verzoek afgewezen mislukt:', e?.message ?? e);
  }
  return json(res, 200, { status: 'declined', build: BUILD });
}

/** Lessoorten, ruimtes, openingstijden en de blokkeer-instelling van een studio. */
async function scheduleContext(db, orgId) {
  const [typesSnap, orgSnap] = await Promise.all([db.collection('classTypes').get(), db.collection('orgs').doc(orgId).get()]);
  const org = orgSnap.exists ? orgSnap.data() : {};
  return {
    types: typesSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((ct) => orgIdOf(ct.orgId) === orgId),
    rooms: Array.isArray(org?.rooms) ? org.rooms.map(String) : [],
    hours: hoursOf(org),
    block: blocksDoubleBooking(org),
  };
}

/**
 * Controle vóór het opslaan van een lessoort (Beheer → Lessoorten): botst een weekmoment met een
 * andere lessoort (zelfde trainer of ruimte)? Met voorstellen per botsend moment.
 */
async function checkSchedule(res, db, orgId, body) {
  const input = body?.classType ?? {};
  const schedule = (Array.isArray(input.schedule) ? input.schedule : [])
    .slice(0, 50)
    .map((s) => ({ weekday: Number(s?.weekday), startTime: String(s?.startTime ?? ''), endTime: String(s?.endTime ?? '') }));
  const candidate = {
    id: String(input.id ?? ''),
    name: String(input.name ?? ''),
    defaultTrainerId: input.defaultTrainerId ? String(input.defaultTrainerId) : null,
    room: input.room ? String(input.room) : null,
    schedule,
  };
  const sched = await scheduleContext(db, orgId);
  const availability = await availabilityOf(db, orgId, candidate.defaultTrainerId);
  const conflicts = findConflicts(candidate, sched.types);
  const suggestions = {};
  for (const c of conflicts) {
    if (!suggestions[c.slotIndex]) suggestions[c.slotIndex] = suggestionsFor(candidate, c.slot, sched.types, sched.rooms, sched.hours, availability);
  }
  // Buiten de beschikbaarheid van de trainer: geen blokkade, wel een waarschuwing.
  const outside = outsideAvailability(candidate, availability);
  return json(res, 200, { block: sched.block, conflicts, suggestions, outside, build: BUILD });
}

/** Alle botsingen die nu op het rooster staan, om één keer recht te zetten. */
async function listScheduleConflicts(res, db, orgId) {
  const sched = await scheduleContext(db, orgId);
  return json(res, 200, { block: sched.block, conflicts: allConflicts(sched.types), build: BUILD });
}

/** Een vast PT-moment zonder gekozen lessoort. */
const DEFAULT_PT_BASE = { name: 'Personal Training', creditCost: 1, sessionKind: '1on1', schemaId: null, room: null, description: null, defaultTrainerId: null };

async function addPersonalSlot(res, db, uid, myOrgs, isStaff, body) {
  if (!isStaff) return json(res, 403, { error: 'Alleen een trainer of beheerder kan een PT-moment vastzetten.', build: BUILD });
  // Met `groupId`: een vaste groepsles voor alle leden van de groep (Beheer → Groepen).
  const groupId = String(body?.groupId ?? '').trim();
  const userId = groupId ? '' : String(body?.userId ?? '').trim();
  const baseClassTypeId = String(body?.baseClassTypeId ?? '').trim();
  const weekday = Number(body?.weekday);
  const startTime = String(body?.startTime ?? '').trim();
  const endTime = String(body?.endTime ?? '').trim();
  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.startDate ?? '')) ? String(body.startDate) : todayIso();
  const isTime = (v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
  // Een PT-moment voor één lid heeft geen lessoort nodig: dan "Personal Training", 1-op-1, 1 credit.
  // Een vaste groepsles (groep) gaat wel uit van een lessoort.
  if (!(userId || groupId) || (groupId && !baseClassTypeId)) return json(res, 400, { error: 'Kies een lid en een lessoort.', build: BUILD });
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6 || !isTime(startTime) || !isTime(endTime)) {
    return json(res, 400, { error: 'Kies een dag en een begin- en eindtijd.', build: BUILD });
  }
  if (endTime <= startTime) return json(res, 400, { error: 'De eindtijd ligt voor de begintijd.', build: BUILD });
  // Om de week: in de even of oneven weken, vanaf de eerste keer op of na de startdatum.
  const pattern = patternFields(body?.everyWeeks, startDate, weekday);

  const group = groupId ? await loadGroup(db, myOrgs, groupId) : null;
  if (!group) await requireMemberOfMyOrgs(db, myOrgs, userId);
  const baseSnap = baseClassTypeId ? await db.collection('classTypes').doc(baseClassTypeId).get() : null;
  if (baseSnap && !baseSnap.exists) return json(res, 404, { error: 'Deze lessoort bestaat niet (meer).', build: BUILD });
  const base = baseSnap ? baseSnap.data() : { ...DEFAULT_PT_BASE, orgId: myOrgs[0] };
  const orgId = orgIdOf(base.orgId);
  if (!myOrgs.includes(orgId)) return json(res, 403, { error: 'Deze lessoort hoort niet bij jouw studio.', build: BUILD });
  if (base.privateFor || base.privateForGroup) return json(res, 400, { error: 'Kies een gewone lessoort als basis.', build: BUILD });

  // Trainer: gekozen, anders de vaste trainer van de lessoort, anders wie het instelt.
  const trainerId = String(body?.trainerId ?? '').trim() || base.defaultTrainerId || uid;
  if (trainerId !== uid) {
    const tSnap = await db.collection('profiles').doc(trainerId).get();
    const tr = tSnap.exists ? tSnap.data() : null;
    const trOrgs = tr ? (Array.isArray(tr.orgIds) && tr.orgIds.length ? tr.orgIds.map(String) : [orgIdOf(tr.orgId)]) : [];
    if (!tr || !isStaffIn(tr, orgId) || !trOrgs.includes(orgId)) {
      return json(res, 400, { error: 'Deze trainer hoort niet bij jouw studio.', build: BUILD });
    }
  }

  const id = personalClassTypeId(group ? groupHolderId(group.id) : userId, weekday, startTime);
  const now = new Date().toISOString();
  const ref = db.collection('classTypes').doc(id);
  const existing = await ref.get();
  const ct = {
    id,
    orgId,
    name: base.name,
    // Eén lid per PT-moment; een groepsles heeft een plek per lid van de groep.
    capacity: group ? group.memberIds.length : 1,
    creditCost: base.creditCost ?? 1,
    defaultTrainerId: trainerId,
    schemaId: base.schemaId ?? null,
    schedule: [{ weekday, startTime, endTime, ...pattern }],
    room: base.room ?? null,
    sessionKind: base.sessionKind ?? '1on1',
    description: base.description ?? null,
    privateFor: group ? null : userId,
    ...(group ? { privateForGroup: group.id, groupMemberIds: group.memberIds } : {}),
    baseClassTypeId: baseClassTypeId || null,
    createdAt: existing.exists ? existing.data().createdAt ?? now : now,
    updatedAt: now,
  };
  // Dubbel plannen: zelfde trainer of ruimte op een overlappend moment kan niet (als de studio dat blokkeert).
  const sched = await scheduleContext(db, orgId);
  // Reeks wijzigen: het oude PT-moment van hetzelfde lid telt niet als botsing (dat gaat weg).
  const ignoreId = String(body?.ignoreClassTypeId ?? '').trim();
  const types = ignoreId ? sched.types.filter((t) => !(t.id === ignoreId && t.privateFor && t.privateFor === userId)) : sched.types;
  if (sched.block) {
    const conflicts = findConflicts(ct, types);
    if (conflicts.length) {
      return json(res, 409, {
        error: conflictMessage(conflicts[0]),
        conflicts,
        suggestions: suggestionsFor(ct, conflicts[0].slot, types, sched.rooms, sched.hours, await availabilityOf(db, orgId, trainerId)),
        build: BUILD,
      });
    }
  }
  await ref.set(ct);

  // Eerst de vaste les (bij een groep: één per lid), dan het rooster: nieuw gemaakte lessen worden
  // zo meteen geboekt.
  const standings = [];
  for (const memberId of group ? group.memberIds : [userId]) {
    standings.push(await writeStanding(db, { orgId, userId: memberId, classTypeId: id, weekday, startTime, startDate, createdByUserId: uid, pattern }));
  }
  if (existing.exists) {
    // Van elke week naar om de week (of naar de andere week): de afspraken in de weken die vervallen
    // worden afgemeld met de credit terug; daarna haalt het opruimen de lege lessen weg.
    if (isBiweekly(pattern)) {
      for (const standing of standings) {
        await cancelSeriesBookings(db, uid, myOrgs, true, { ...standing, everyWeeks: 1 }, (date) => date >= startDate && !onPatternWeek(pattern, date), {
          forceRefund: true,
          silent: true,
        });
      }
    }
    await syncClassType(db, id, ct);
  }
  const generated = await generateForClassType(db, id, ct);
  const counts = { booked: 0, skippedFull: 0, skippedNoCredits: 0 };
  for (const standing of standings) {
    const c = await bookExistingForStanding(db, standing);
    for (const k of Object.keys(counts)) counts[k] += c[k];
  }
  return json(res, 200, {
    classTypeId: id,
    standingBookingId: standings[0].id,
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
async function removeGroupSlot(res, db, uid, myOrgs, classTypeId) {
  const ref = db.collection('classTypes').doc(classTypeId);
  const snap = classTypeId ? await ref.get() : null;
  const ct = snap?.exists ? snap.data() : null;
  if (!ct || !ct.privateForGroup || !myOrgs.includes(orgIdOf(ct.orgId))) return json(res, 404, { error: 'Deze groepsles bestaat niet (meer).', build: BUILD });
  const orgId = orgIdOf(ct.orgId);
  // Komende lessen afgelasten zoals de studio dat doet: iedereen afgemeld, de groep krijgt alles terug.
  const future = await futureClassesOfType(db, classTypeId, todayIso(), [orgId]);
  let cancelled = 0;
  const nowIso = new Date().toISOString();
  for (const cls of future) {
    if (cls.cancelledAt && !(Number(cls.bookedCount) > 0)) continue;
    const classRef = db.collection('classes').doc(cls.id);
    await classRef.set({ cancelledAt: cls.cancelledAt || nowIso, autoCancelled: false, updatedAt: nowIso }, { merge: true });
    const bookings = await db.collection('bookings').where('classId', '==', cls.id).get();
    for (const d of bookings.docs) {
      if (!['booked', 'waitlist'].includes(String(d.data().status))) continue;
      if (await cancelBookingCore(db, uid, myOrgs, true, d.id).catch(() => null)) cancelled++;
    }
    await refundGroupLesson(db, classRef, cls.id, orgId, uid);
  }
  const standings = await db.collection('standingBookings').where('classTypeId', '==', classTypeId).get();
  for (const d of standings.docs) await db.collection('standingBookings').doc(d.id).delete();
  await deleteClasses(db, (await futureClassesOfType(db, classTypeId, todayIso(), [orgId])).filter((c) => !(Number(c.bookedCount) > 0) && !(Number(c.waitlistCount) > 0)));
  await ref.delete();
  return json(res, 200, { removed: true, cancelled, build: BUILD });
}

/**
 * Leden van een groep gewijzigd: de vaste groepslessen volgen. Nieuwe leden krijgen de vaste les en
 * worden op de komende lessen gezet; wie uit de groep gaat, wordt afgemeld en zijn vaste les stopt.
 */
async function syncGroupSlots(db, uid, myOrgs, group, prevMemberIds) {
  const cts = await db.collection('classTypes').where('privateForGroup', '==', group.id).get();
  if (cts.docs.length === 0) return;
  const added = group.memberIds.filter((id) => !prevMemberIds.includes(id));
  const removed = prevMemberIds.filter((id) => !group.memberIds.includes(id));
  const nowIso = new Date().toISOString();
  for (const d of cts.docs) {
    const ct = { ...d.data(), groupMemberIds: group.memberIds, capacity: group.memberIds.length, updatedAt: nowIso };
    await db.collection('classTypes').doc(d.id).set(ct, { merge: true });
    await syncClassType(db, d.id, ct);
    const slot = (Array.isArray(ct.schedule) ? ct.schedule : [])[0];
    if (!slot) continue;
    for (const memberId of removed) {
      const sRef = db.collection('standingBookings').doc(standingBookingId(d.id, memberId, slot.weekday, slot.startTime));
      const sSnap = await sRef.get();
      if (!sSnap.exists) continue;
      await cancelSeriesBookings(db, uid, myOrgs, true, { ...sSnap.data(), id: sRef.id }, () => true);
      await sRef.delete();
    }
    for (const memberId of added) {
      const standing = await writeStanding(db, { orgId: orgIdOf(ct.orgId), userId: memberId, classTypeId: d.id, weekday: slot.weekday, startTime: slot.startTime, startDate: todayIso(), createdByUserId: uid, pattern: slot });
      await bookExistingForStanding(db, standing);
    }
  }
}

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
  const amount = Number(body?.amount);
  const note = typeof body?.note === 'string' ? body.note.slice(0, 200) : '';
  const group = body?.groupId ? await loadGroup(db, myOrgs, body.groupId) : null;
  const targetUserId = group ? groupHolderId(group.id) : String(body?.userId ?? '').trim();

  if (!targetUserId) return json(res, 400, { error: 'Geen sporter opgegeven.', build: BUILD });
  // Groepstegoed is in euro's (op de cent), persoonlijk tegoed in hele credits.
  if (group) {
    if (!Number.isFinite(amount) || euros(amount) === 0 || Math.abs(amount) > MAX_GROUP_ADJUST) {
      return json(res, 400, { error: `Vul een bedrag in tussen -€${MAX_GROUP_ADJUST} en €${MAX_GROUP_ADJUST}.`, build: BUILD });
    }
  } else if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > MAX_GRANT) {
    return json(res, 400, { error: `Vul een heel aantal credits in tussen -${MAX_GRANT} en ${MAX_GRANT}.`, build: BUILD });
  }

  let orgId = group?.orgId ?? null;
  if (!group) {
    const targetSnap = await db.collection('profiles').doc(targetUserId).get();
    if (!targetSnap.exists) return json(res, 404, { error: 'Sporter niet gevonden.', build: BUILD });
    const target = targetSnap.data() ?? {};
    const targetOrgs = Array.isArray(target.orgIds) && target.orgIds.length ? target.orgIds.map(String) : [orgIdOf(target.orgId)];
    // De studio waar jullie elkaar treffen; credits horen bij één studio.
    orgId = myOrgs.find((o) => targetOrgs.includes(o));
    if (!orgId) return json(res, 403, { error: 'Deze sporter zit niet in jouw studio.', build: BUILD });
  }
  const groupFields = group ? { groupId: group.id, memberIds: group.memberIds, unit: 'eur' } : {};
  const delta = group ? euros(amount) : amount;

  const result = await db.runTransaction(async (tx) => {
    const accountRef = db.collection('creditAccounts').doc(accountId(orgId, targetUserId));
    const snap = await tx.get(accountRef);
    const balance = Number(snap.exists ? snap.data().balance : 0) || 0;
    const next = group ? euros(balance + delta) : balance + delta;
    if (next < 0) {
      throw refuse(group ? `Dat zou het groepstegoed op €${next} zetten; er staat €${balance}.` : `Dat zou het saldo op ${next} zetten; er staan er ${balance}.`);
    }

    const now = new Date().toISOString();
    tx.set(accountRef, { orgId, userId: targetUserId, ...groupFields, balance: next, updatedAt: now }, { merge: true });
    tx.set(db.collection('creditLedger').doc(newId('cl')), {
      orgId,
      userId: targetUserId,
      ...(group ? { groupId: group.id, unit: 'eur' } : {}),
      delta,
      reason: 'manual',
      note,
      byUserId: uid,
      createdAt: now,
    });
    return { balance: next };
  });

  return json(res, 200, { ...result, build: BUILD });
}

// --- Groepen ----------------------------------------------------------------------

/** Een groep van jouw studio, of een weigering (404) als die niet bestaat of van een andere studio is. */
async function loadGroup(db, myOrgs, groupId) {
  const id = String(groupId ?? '').trim();
  const snap = id ? await db.collection('groups').doc(id).get() : null;
  const g = snap?.exists ? snap.data() : null;
  if (!g || !myOrgs.includes(orgIdOf(g.orgId))) throw refuse('Deze groep hoort niet bij jouw studio.', 404);
  return { ...g, id, orgId: orgIdOf(g.orgId), memberIds: (g.memberIds ?? []).map(String), payerId: String(g.payerId) };
}

/**
 * Groepsles binnen een transactie: de groep (wie mag), de groepsprijs van de studio en het
 * groepstegoed. Alleen lezen; vóór de eerste write aanroepen (Firestore eist dat).
 */
async function readGroupLesson(tx, db, cls, orgId) {
  const groupId = String(cls.privateForGroup);
  const gSnap = await tx.get(db.collection('groups').doc(groupId));
  const orgSnap = await tx.get(db.collection('orgs').doc(orgId));
  const accountRef = db.collection('creditAccounts').doc(accountId(orgId, groupHolderId(groupId)));
  const aSnap = await tx.get(accountRef);
  return {
    groupId,
    memberIds: gSnap.exists ? (gSnap.data().memberIds ?? []).map(String) : [],
    pricing: groupPricingOf(orgSnap.exists ? orgSnap.data() : {}),
    accountRef,
    balance: euros(aSnap.exists ? aSnap.data().balance : 0),
  };
}

/** Wat de groep voor deze les betaalt bijwerken, en het verschil (+ terug, − af) op het groepstegoed. */
function writeGroupMoney(tx, db, group, { orgId, classRef, classId, paidIds, total, delta, byUserId, nowIso, reason }) {
  tx.set(classRef, { groupPaidIds: paidIds, groupSpent: euros(total) }, { merge: true });
  if (!euros(delta)) return;
  const holder = groupHolderId(group.groupId);
  tx.set(group.accountRef, { orgId, userId: holder, groupId: group.groupId, unit: 'eur', balance: euros(group.balance + delta), updatedAt: nowIso }, { merge: true });
  tx.set(db.collection('creditLedger').doc(newId('cl')), {
    orgId,
    userId: holder,
    groupId: group.groupId,
    unit: 'eur',
    delta: euros(delta),
    reason,
    classId,
    byUserId,
    createdAt: nowIso,
  });
}

/** Afgelaste groepsles: alles wat de groep ervoor betaalde terug op het groepstegoed. */
async function refundGroupLesson(db, classRef, classId, orgId, byUserId) {
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(classRef);
    const cls = snap.exists ? snap.data() : null;
    if (!cls?.privateForGroup) return;
    const group = await readGroupLesson(tx, db, cls, orgId);
    const spent = euros(cls.groupSpent);
    writeGroupMoney(tx, db, group, { orgId, classRef, classId, paidIds: [], total: 0, delta: spent, byUserId, nowIso: new Date().toISOString(), reason: 'refund' });
  });
}

/**
 * Groep aanmaken of bijwerken (Beheer → Groepen). Alle leden moeten actief lid van de studio zijn.
 * Tegoed en abonnement volgen mee: wie het groepssaldo mag zien (`memberIds` op het creditAccount)
 * en wie de volgende factuur krijgt (`billToUserId` op het lidmaatschap).
 */
async function saveGroup(res, db, uid, myOrgs, body) {
  const input = cleanGroupInput(body);
  if (input.error) return json(res, 400, { error: input.error, build: BUILD });
  const orgId = myOrgs[0];
  for (const memberId of input.value.memberIds) await requireMemberOfMyOrgs(db, myOrgs, memberId);

  const existingId = String(body?.groupId ?? '').trim();
  if (existingId) await loadGroup(db, myOrgs, existingId);
  const groupId = existingId || newId('g');
  const ref = db.collection('groups').doc(groupId);
  const prev = existingId ? (await ref.get()).data() ?? {} : {};
  const now = new Date().toISOString();
  const group = {
    id: groupId,
    orgId,
    ...input.value,
    createdAt: prev.createdAt ?? now,
    createdBy: prev.createdBy ?? uid,
    updatedAt: now,
  };
  await ref.set(group);
  if (existingId) await syncGroupSlots(db, uid, myOrgs, group, (prev.memberIds ?? []).map(String));

  const holder = groupHolderId(groupId);
  const accountRef = db.collection('creditAccounts').doc(accountId(orgId, holder));
  if ((await accountRef.get()).exists) await accountRef.set({ memberIds: group.memberIds, groupId, updatedAt: now }, { merge: true });
  const current = await activeMembership(db, orgId, holder);
  if (current && current.billToUserId !== group.payerId) {
    await db.collection('memberships').doc(current.id).set({ billToUserId: group.payerId, updatedAt: now }, { merge: true });
  }
  return json(res, 200, { group, build: BUILD });
}

/**
 * Groep weghalen. Loopt er nog een abonnement of staat er nog tegoed op, dan eerst dat regelen:
 * anders blijft er gefactureerd worden, of verdwijnen credits waar al voor betaald is.
 */
async function deleteGroup(res, db, myOrgs, groupId) {
  const group = await loadGroup(db, myOrgs, groupId);
  const holder = groupHolderId(group.id);
  if (await activeMembership(db, group.orgId, holder)) {
    return json(res, 409, { error: 'Stop eerst het abonnement van deze groep.', build: BUILD });
  }
  const slots = await db.collection('classTypes').where('privateForGroup', '==', group.id).get();
  if (slots.docs.length > 0) return json(res, 409, { error: 'Stop eerst de vaste groepslessen van deze groep.', build: BUILD });
  const account = await db.collection('creditAccounts').doc(accountId(group.orgId, holder)).get();
  const balance = Number(account.exists ? account.data().balance : 0) || 0;
  if (balance > 0) return json(res, 409, { error: `Er staan nog ${balance} credits op deze groep. Zet die eerst op 0.`, build: BUILD });
  await db.collection('groups').doc(group.id).delete();
  return json(res, 200, { deleted: true, build: BUILD });
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
  // Groep: het abonnement staat op het groepstegoed, de posten gaan naar het hoofdprofiel.
  const group = body?.groupId ? await loadGroup(db, myOrgs, body.groupId) : null;
  const targetUserId = group ? groupHolderId(group.id) : String(body?.userId ?? '').trim();
  const planId = String(body?.planId ?? '').trim();
  if (!targetUserId || !planId) return json(res, 400, { error: 'Lid of abonnement ontbreekt.', build: BUILD });

  let orgId = group?.orgId ?? null;
  if (!group) {
    const targetSnap = await db.collection('profiles').doc(targetUserId).get();
    if (!targetSnap.exists) return json(res, 404, { error: 'Lid niet gevonden.', build: BUILD });
    orgId = sharedOrg(myOrgs, targetSnap.data() ?? {});
    if (!orgId) return json(res, 403, { error: 'Dit lid zit niet in jouw studio.', build: BUILD });
  }

  const planSnap = await db.collection('plans').doc(planId).get();
  if (!planSnap.exists || orgIdOf(planSnap.data().orgId) !== orgId) return json(res, 404, { error: 'Abonnement niet gevonden.', build: BUILD });
  const plan = { id: planSnap.id, ...planSnap.data() };

  // Ingangsdatum in de toekomst: alleen vastleggen. Op die dag start het abonnement pas (eerste
  // factuur en credits), zie startScheduledMemberships. Tot dan blijft een lopend abonnement gewoon lopen.
  const startDay = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.startDate ?? '')) ? String(body.startDate) : null;
  if (startDay && startDay > amsterdamDate(new Date())) {
    if (group) return json(res, 400, { error: 'Een groepsabonnement gaat meteen in.', build: BUILD });
    const nowIso = new Date().toISOString();
    await cancelScheduled(db, orgId, targetUserId, nowIso);
    const id = newId('mb');
    await db.collection('memberships').doc(id).set({
      id,
      orgId,
      userId: targetUserId,
      planId: plan.id,
      planName: plan.name,
      status: 'scheduled',
      startsOn: startDay,
      byUserId: uid,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    return json(res, 200, { membershipId: id, scheduled: true, startsOn: startDay, balance: null, first: null, build: BUILD });
  }

  const r = await beginMembership(db, { orgId, targetUserId, plan, group, byUserId: uid });
  return json(res, 200, { ...r, build: BUILD });
}

/** Geplande (nog niet gestarte) abonnementen van een lid laten vervallen: de nieuwe keuze geldt. */
async function cancelScheduled(db, orgId, userId, nowIso, exceptId = null) {
  const snap = await db.collection('memberships').where('orgId', '==', orgId).where('userId', '==', userId).where('status', '==', 'scheduled').get();
  for (const d of snap.docs) {
    if (d.id === exceptId) continue;
    await db.collection('memberships').doc(d.id).set({ status: 'cancelled', cancelledAt: nowIso, updatedAt: nowIso }, { merge: true });
  }
}

/**
 * Een abonnement laten ingaan: een lopend abonnement stopt, de eerste factuur (met nummer) en de
 * credits komen erbij. Volgt het factuurritme van de studio: de eerste periode is dan op maat tot
 * de eerstvolgende factuurdatum. `startDay` is de ingangsdatum (bij een gepland abonnement dat
 * later start dan gepland: de periode telt vanaf die dag). `membershipId`: het geplande document.
 */
async function beginMembership(db, { orgId, targetUserId, plan, group = null, byUserId, membershipId = newId('mb'), startDay = null }) {
  const billTo = group ? group.payerId : targetUserId;
  const groupFields = group ? { groupId: group.id } : {};
  const groupAccountFields = group ? { groupId: group.id, memberIds: group.memberIds, unit: 'eur' } : {};
  const today = amsterdamDate(new Date());
  const nowIso = new Date().toISOString();
  const day = startDay && startDay <= today ? startDay : today;
  // Vandaag: het tijdstip van nu; een dag die al voorbij is: vanaf het begin van die dag.
  const startIso = day === today ? nowIso : `${day}T00:00:00.000Z`;

  await cancelScheduled(db, orgId, targetUserId, nowIso, membershipId);
  const current = await activeMembership(db, orgId, targetUserId);
  // Factureert de studio op een vast ritme (eigenaar, Beheer → Instellingen), dan is de eerste
  // periode op maat: tot de eerstvolgende factuurdatum, prijs en credits naar rato.
  const first = group ? null : await firstPeriodFor(db, orgId, plan, day);
  const membership = {
    ...newMembership({ id: membershipId, orgId, userId: targetUserId, plan, nowIso: startIso, byUserId, first }),
    ...(startDay ? { startsOn: startDay } : {}),
    ...(group ? { billToUserId: billTo, groupId: group.id } : {}),
  };
  // Groep: de prijs van het abonnement komt als tegoed in euro's op de groep (zie groups.mjs).
  const credits = group ? euros(plan.price) : first && first.credits != null ? first.credits : plan.credits == null ? 0 : Number(plan.credits) || 0;

  const balance = await db.runTransaction(async (tx) => {
    const accountRef = db.collection('creditAccounts').doc(accountId(orgId, targetUserId));
    const aSnap = await tx.get(accountRef);
    const saldo = Number(aSnap.exists ? aSnap.data().balance : 0) || 0;
    const orgRef = db.collection('orgs').doc(orgId);
    const orgSnap = await tx.get(orgRef);
    if (current && current.id !== membershipId) tx.set(db.collection('memberships').doc(current.id), { status: 'cancelled', cancelledAt: nowIso, updatedAt: nowIso }, { merge: true });
    tx.set(db.collection('memberships').doc(membership.id), membership);
    // Eerste post: de eerste periode (maand of de kaart zelf), tenzij het plan gratis is. Met factuurnummer.
    if ((first ? first.amount : Number(plan.price) || 0) > 0) {
      const invoiceNumber = reserveInvoiceNumber(tx, orgRef, orgSnap, nowIso);
      const charge = newCharge({ id: newId('ch'), orgId, userId: billTo, plan, membershipId: membership.id, periodStartIso: startIso, nowIso, invoiceNumber, first });
      tx.set(db.collection('charges').doc(charge.id), { ...charge, ...groupFields });
    }
    if (credits > 0) {
      tx.set(accountRef, { orgId, userId: targetUserId, ...groupAccountFields, balance: group ? euros(saldo + credits) : saldo + credits, updatedAt: nowIso }, { merge: true });
      tx.set(db.collection('creditLedger').doc(newId('cl')), {
        orgId,
        userId: targetUserId,
        ...(group ? { groupId: group.id, unit: 'eur' } : {}),
        delta: credits,
        reason: 'plan',
        planId: plan.id,
        note: `${plan.name} gestart`,
        byUserId,
        createdAt: nowIso,
      });
    }
    return group ? euros(saldo + credits) : saldo + credits;
  });

  return { membershipId: membership.id, balance, first };
}

/**
 * Geplande abonnementen die vandaag (of eerder) ingaan laten starten. Loopt bij boeken, bij het
 * openen van Beheer (renewDue) en in de avondronde, zodat het op de ingangsdatum gebeurt ook als
 * niemand de app opent. Elk gepland abonnement wordt maar één keer gestart (eerst "claimen").
 */
async function startScheduledMemberships(db, { orgId = null, userId = null } = {}) {
  const today = amsterdamDate(new Date());
  let q = db.collection('memberships').where('status', '==', 'scheduled');
  if (orgId) q = q.where('orgId', '==', orgId);
  if (userId) q = q.where('userId', '==', userId);
  const snap = await q.get();
  let started = 0;
  for (const d of snap.docs) {
    const m = d.data();
    if (!m.startsOn || m.startsOn > today) continue;
    const ref = db.collection('memberships').doc(d.id);
    const claimed = await db.runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (!s.exists || s.data().status !== 'scheduled') return false;
      tx.set(ref, { status: 'starting', updatedAt: new Date().toISOString() }, { merge: true });
      return true;
    });
    if (!claimed) continue;
    const planSnap = await db.collection('plans').doc(String(m.planId)).get();
    if (!planSnap.exists) {
      await ref.set({ status: 'cancelled', cancelledAt: new Date().toISOString(), cancelReason: 'Abonnement bestaat niet meer.' }, { merge: true });
      continue;
    }
    try {
      await beginMembership(db, { orgId: m.orgId, targetUserId: m.userId, plan: { id: planSnap.id, ...planSnap.data() }, byUserId: m.byUserId || 'system', membershipId: d.id, startDay: m.startsOn });
      started += 1;
    } catch (e) {
      console.warn('[booking] gepland abonnement starten mislukt:', e?.message ?? e);
      await ref.set({ status: 'scheduled', updatedAt: new Date().toISOString() }, { merge: true });
    }
  }
  return started;
}

/** De eerste periode volgens het factuurritme van de studio, of null (zie api/_lib/billingCycle.mjs). */
async function firstPeriodFor(db, orgId, plan, day = amsterdamDate(new Date())) {
  const orgSnap = await db.collection('orgs').doc(orgId).get();
  return firstPeriod(plan, billingOf(orgSnap.exists ? orgSnap.data() : null), day);
}

/** Lidmaatschap stoppen; credits die er staan blijven staan. */
async function unassign(res, db, uid, myOrgs, body) {
  const group = body?.groupId ? await loadGroup(db, myOrgs, body.groupId) : null;
  const targetUserId = group ? groupHolderId(group.id) : String(body?.userId ?? '').trim();
  if (!targetUserId) return json(res, 400, { error: 'Geen lid opgegeven.', build: BUILD });
  let orgId = group?.orgId ?? null;
  if (!group) {
    const targetSnap = await db.collection('profiles').doc(targetUserId).get();
    if (!targetSnap.exists) return json(res, 404, { error: 'Lid niet gevonden.', build: BUILD });
    orgId = sharedOrg(myOrgs, targetSnap.data() ?? {});
    if (!orgId) return json(res, 403, { error: 'Dit lid zit niet in jouw studio.', build: BUILD });
  }

  const nowIso = new Date().toISOString();
  // Een gepland abonnement (ingangsdatum later) vervalt altijd mee; `scheduledOnly`: alleen dat.
  await cancelScheduled(db, orgId, targetUserId, nowIso);
  if (body?.scheduledOnly === true) return json(res, 200, { stopped: false, build: BUILD });
  const current = await activeMembership(db, orgId, targetUserId);
  if (!current) return json(res, 200, { stopped: false, build: BUILD });
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
  // Vast factuurritme van de studio: de eerste periode (en dus deze betaling) is op maat.
  const first = await firstPeriodFor(db, orgId, plan);

  const orgSnap = await db.collection('orgs').doc(orgId).get();
  const orgName = orgSnap.exists ? String(orgSnap.data()?.name || orgId) : orgId;
  const origin = appOrigin(req);

  // Automatisch afschrijven aan (Beheer → Facturatie → Betalingen) en een terugkerend abonnement:
  // deze eerste betaling geeft meteen de machtiging voor de volgende periodes.
  const withMandate = autoCollectOn(orgSnap.exists ? orgSnap.data() : null) && plan.period !== 'once';
  let payment;
  try {
    const customerId = withMandate ? await ensureMollieCustomer(db, mollie, orgId, uid) : null;
    payment = await createMolliePayment({
      apiKey: mollie.apiKey,
      ...(customerId ? { customerId, sequenceType: 'first' } : {}),
      amount: first ? first.amount : price,
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
    // Wat er betaald wordt voor de eerste periode; bij verwerken geldt precies dit.
    first: first ?? null,
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
  // Was de betaling voor een eerste periode op maat, dan geldt die (zie purchasePlan).
  const first = checkout.first ?? null;
  const membership = newMembership({ id: newId('mb'), orgId, userId, plan, nowIso, byUserId: userId, first });
  const credits = first && first.credits != null ? first.credits : plan.credits == null ? 0 : Number(plan.credits) || 0;

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
    const charge = newCharge({ id: newId('ch'), orgId, userId, plan, membershipId: membership.id, periodStartIso: nowIso, nowIso, invoiceNumber, first });
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
  // Eerst geplande abonnementen die vandaag ingaan laten starten, dan de verlengingen.
  await startScheduledMemberships(db, { orgId }).catch((e) => console.warn('[booking] geplande abonnementen:', e?.message ?? e));
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
async function deliverInvoiceEmail(db, chargeId, origin = appOrigin(null)) {
  if (!mailConfigured()) return null;
  const charge = await loadInvoiceCharge(db, chargeId);
  const r = await renderInvoice(db, charge);
  const to = r.member.email.trim();
  if (!to) return null;

  // Open factuur en de studio betaalt via Mollie: een knop "Direct betalen via iDEAL" in de mail.
  const payUrl = await payUrlFor(db, charge, origin);
  const mail = buildInvoiceEmail({ lang: r.lang, business: r.business, charge, member: r.member, logoUrl: r.logoPrintUrl, brandColor: r.brandColor, payUrl });
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
      // Een factuur betaald (betaallink of incasso), of een zelf-aankoop.
      if (checkout.kind === 'charge') await settleChargePayment(db, checkout, paymentId, appOrigin(req));
      else await settlePurchase(db, checkout, paymentId);
      // Eerste betaling met machtiging: voortaan kan de app zelf afschrijven.
      if (payment.mandateId && payment.customerId) await saveMandate(db, checkout, mollie.mode, payment);
    } catch (e) {
      console.error('[booking] betaling verwerken mislukt:', e);
      return plain(500, 'retry');
    }
  } else if (['failed', 'expired', 'canceled'].includes(payment.status)) {
    const at = new Date().toISOString();
    await checkoutRef.set({ status: payment.status, updatedAt: at }, { merge: true });
    // Incasso mislukt (bijv. te weinig saldo of machtiging ingetrokken): de factuur blijft open,
    // de studio ziet het in Facturatie en het lid kan via de betaallink alsnog betalen.
    if (checkout.kind === 'charge' && checkout.recurring) {
      await db.collection('charges').doc(String(checkout.chargeId)).set({ collectStatus: 'failed', collectFailedAt: at, collectFailReason: payment.status, updatedAt: at }, { merge: true });
    }
  }
  return plain(200, 'ok');
}

// --- Betalen via Mollie: betaallink per factuur en automatisch afschrijven -------------------
//
// Elke open factuur heeft een vaste betaallink (/b/{code}, dezelfde code als de factuurlink). Wie
// erop klikt krijgt een verse Mollie-betaling; zo verloopt een link in WhatsApp of de mail nooit.
// Staat automatisch afschrijven aan (orgs.payments.autoCollect), dan is de eerste betaling van een
// terugkerend abonnement er een met machtiging (sequenceType 'first'); daarna schrijft de dagelijkse
// ronde nieuwe facturen zelf af (sequenceType 'recurring'). Klant en machtiging per lid staan in
// `mollieCustomers` (alleen de server), apart voor test en live.

/** Staat automatisch afschrijven aan bij deze studio? */
const autoCollectOn = (org) => org?.payments?.autoCollect === true;

/** Hoe lang een aangemaakte Mollie-betaling hergebruikt wordt voor dezelfde betaallink. */
const PAY_REUSE_MS = 10 * 60 * 1000;

/** Klant bij Mollie voor dit lid (in de huidige modus), aangemaakt als die er nog niet is. */
async function ensureMollieCustomer(db, mollie, orgId, userId) {
  const ref = db.collection('mollieCustomers').doc(accountId(orgId, userId));
  const snap = await ref.get();
  const current = snap.exists ? snap.data()?.[mollie.mode] : null;
  if (current?.customerId) return current.customerId;
  const p = await db.collection('profiles').doc(userId).get();
  const customerId = await createMollieCustomer({
    apiKey: mollie.apiKey,
    name: String(p.data()?.displayName || '').trim() || undefined,
    email: String(p.data()?.email || '').trim() || undefined,
    metadata: { orgId, userId },
  });
  const at = new Date().toISOString();
  await ref.set({ orgId, userId, [mollie.mode]: { customerId, mandateId: null, createdAt: at }, updatedAt: at }, { merge: true });
  return customerId;
}

/** Na een eerste betaling: de machtiging bewaren, zodat volgende facturen vanzelf afgeschreven worden. */
async function saveMandate(db, checkout, mode, payment) {
  const at = new Date().toISOString();
  await db.collection('mollieCustomers').doc(accountId(checkout.orgId, checkout.userId)).set(
    { orgId: checkout.orgId, userId: checkout.userId, [mode]: { customerId: payment.customerId, mandateId: payment.mandateId, mandateAt: at }, updatedAt: at },
    { merge: true }
  );
}

/** Code voor de openbare factuur- en betaallink; één keer gemaakt en daarna gelijk. */
async function ensureInvoiceToken(db, charge) {
  if (charge.invoiceToken) return charge.invoiceToken;
  const invoiceToken = randomBytes(16).toString('hex');
  await db.collection('charges').doc(charge.id).set({ invoiceToken, updatedAt: new Date().toISOString() }, { merge: true });
  charge.invoiceToken = invoiceToken;
  return invoiceToken;
}

/** Betaallink voor een open factuur, of null (al betaald, of de studio betaalt niet via Mollie). */
async function payUrlFor(db, charge, origin) {
  if (!charge || charge.status !== 'open' || !(Number(charge.amount) > 0)) return null;
  if (!(await getOrgMollieKey(db, orgIdOf(charge.orgId)))) return null;
  return `${origin}/b/${await ensureInvoiceToken(db, charge)}`;
}

/**
 * GET /b/{code}: een open factuur betalen. Maakt een Mollie-betaling (of hergebruikt een net
 * gemaakte) en stuurt door naar de betaalpagina. Geen inlog; de code is het geheim, net als bij
 * /f/{code}. Hoort de factuur bij een terugkerend abonnement en staat automatisch afschrijven aan,
 * dan geeft deze betaling ook de machtiging af.
 */
async function payInvoice(req, res, db, token) {
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
  const charge = { id: d.id, ...d.data() };
  if (charge.status === 'paid') return plain(200, 'Deze factuur is al betaald. Dank je wel!');
  if (charge.status !== 'open' || !(Number(charge.amount) > 0)) return plain(409, 'Deze factuur kan niet (meer) online betaald worden. Neem contact op met de studio.');
  const orgId = orgIdOf(charge.orgId);
  const mollie = await getOrgMollieKey(db, orgId);
  if (!mollie) return plain(409, 'Online betalen is bij deze studio nog niet ingesteld. Maak het bedrag over zoals op de factuur staat.');

  const redirect = (url) => {
    res.statusCode = 302;
    res.setHeader('Location', url);
    res.setHeader('Cache-Control', 'no-store');
    res.end();
  };
  const recent = charge.payCheckout;
  if (recent?.url && recent.mode === mollie.mode && Date.now() - Date.parse(recent.at) < PAY_REUSE_MS) return redirect(recent.url);

  const orgSnap = await db.collection('orgs').doc(orgId).get();
  const org = orgSnap.exists ? orgSnap.data() : {};
  const loaded = await loadInvoiceCharge(db, charge.id);
  const planPeriod = loaded.membershipId && loaded.planId ? (await db.collection('plans').doc(String(loaded.planId)).get()).data()?.period : null;
  const recurringPlan = !!planPeriod && planPeriod !== 'once';
  const withMandate = autoCollectOn(org) && recurringPlan;
  const origin = appOrigin(req);
  let payment;
  try {
    const customerId = withMandate ? await ensureMollieCustomer(db, mollie, orgId, String(loaded.userId)) : null;
    payment = await createMolliePayment({
      apiKey: mollie.apiKey,
      amount: loaded.amount,
      description: `Factuur ${loaded.invoiceNumber} — ${org.name || orgId}`,
      redirectUrl: `${origin}/?betaald=${encodeURIComponent(loaded.id)}#profiel`,
      webhookUrl: `${origin}/mollie-webhook/${orgId}`,
      ...(customerId ? { customerId, sequenceType: 'first' } : {}),
      metadata: { chargeId: loaded.id },
    });
  } catch (e) {
    console.error('[booking] betaallink: Mollie-betaling aanmaken mislukt:', e);
    return plain(502, 'Betalen bij Mollie lukte nu niet. Probeer het zo nog eens.');
  }
  const at = new Date().toISOString();
  await db.collection('mollieCheckouts').doc(payment.id).set({
    kind: 'charge',
    chargeId: loaded.id,
    orgId,
    userId: String(loaded.userId),
    mode: mollie.mode,
    status: 'pending',
    withMandate,
    createdAt: at,
    updatedAt: at,
  });
  await db.collection('charges').doc(loaded.id).set({ payCheckout: { paymentId: payment.id, url: payment.checkoutUrl, mode: mollie.mode, at }, updatedAt: at }, { merge: true });
  return redirect(payment.checkoutUrl);
}

/** Factuur betaald via Mollie (betaallink of incasso): op betaald, en de betaalde factuur mailen. */
async function settleChargePayment(db, checkout, paymentId, origin) {
  const at = new Date().toISOString();
  const chargeRef = db.collection('charges').doc(String(checkout.chargeId));
  const done = await db.runTransaction(async (tx) => {
    const checkoutRef = db.collection('mollieCheckouts').doc(paymentId);
    const cSnap = await tx.get(checkoutRef);
    if (!cSnap.exists || cSnap.data().status !== 'pending') return false;
    const chSnap = await tx.get(chargeRef);
    tx.set(checkoutRef, { status: 'completed', completedAt: at, updatedAt: at }, { merge: true });
    // Al op betaald gezet (bijv. toch overgemaakt en afgevinkt): niets dubbel boeken.
    if (!chSnap.exists || chSnap.data().status !== 'open') return false;
    tx.set(
      chargeRef,
      { status: 'paid', paidAt: at, paidBy: 'mollie', molliePaymentId: paymentId, ...(checkout.recurring ? { collectStatus: 'paid' } : {}), payCheckout: null, updatedAt: at },
      { merge: true }
    );
    return true;
  });
  if (!done) return;
  try {
    await deliverInvoiceEmail(db, String(checkout.chargeId), origin);
  } catch (e) {
    console.warn('[booking] betaalde factuur mailen mislukt:', e?.message ?? e);
  }
}

/**
 * Dagelijkse ronde, per studio met automatisch afschrijven: eerst de verlengingen bijwerken (zodat
 * de facturen van de nieuwe periode er staan), dan elke open, vervallen factuur van een lid met een
 * machtiging afschrijven. Een mislukte incasso wordt niet vanzelf opnieuw geprobeerd: de studio ziet
 * hem in Facturatie en het lid kan via de betaallink betalen.
 */
async function runAutoCollect(db, origin) {
  const nowIso = new Date().toISOString();
  const report = { studios: 0, renewed: 0, started: 0, skipped: 0 };
  const orgs = await db.collection('orgs').get();
  for (const orgDoc of orgs.docs) {
    const org = orgDoc.data();
    if (!autoCollectOn(org)) continue;
    const orgId = orgDoc.id;
    const mollie = await getOrgMollieKey(db, orgId);
    if (!mollie) continue;
    report.studios += 1;

    const memberships = await db.collection('memberships').where('orgId', '==', orgId).where('status', '==', 'active').get();
    for (const m of memberships.docs) {
      if (!m.data().nextRenewalAt || m.data().nextRenewalAt > nowIso) continue;
      const r = await settleMembership(db, newId, db.collection('memberships').doc(m.id), nowIso).catch(() => ({ steps: 0 }));
      report.renewed += r.steps;
    }

    const open = await db.collection('charges').where('orgId', '==', orgId).where('status', '==', 'open').get();
    for (const c of open.docs) {
      const charge = { id: c.id, ...c.data() };
      if (charge.collectStatus === 'pending' || charge.collectStatus === 'failed') continue;
      // Het lid is net zelf aan het betalen via de betaallink: niet ook nog afschrijven.
      if (charge.payCheckout?.at && Date.now() - Date.parse(charge.payCheckout.at) < 60 * 60 * 1000) continue;
      if (charge.dueAt && charge.dueAt > nowIso) continue;
      if (!(Number(charge.amount) > 0)) continue;
      const cust = await db.collection('mollieCustomers').doc(accountId(orgId, String(charge.userId))).get();
      const mandate = cust.exists ? cust.data()?.[mollie.mode] : null;
      if (!mandate?.customerId || !mandate?.mandateId) {
        report.skipped += 1;
        continue;
      }
      const loaded = await loadInvoiceCharge(db, charge.id);
      try {
        const payment = await createMolliePayment({
          apiKey: mollie.apiKey,
          amount: loaded.amount,
          description: `Factuur ${loaded.invoiceNumber} — ${org.name || orgId}`,
          webhookUrl: `${origin}/mollie-webhook/${orgId}`,
          customerId: mandate.customerId,
          mandateId: mandate.mandateId,
          sequenceType: 'recurring',
          metadata: { chargeId: loaded.id },
        });
        const at = new Date().toISOString();
        await db.collection('mollieCheckouts').doc(payment.id).set({
          kind: 'charge',
          recurring: true,
          chargeId: loaded.id,
          orgId,
          userId: String(loaded.userId),
          mode: mollie.mode,
          status: 'pending',
          createdAt: at,
          updatedAt: at,
        });
        await db.collection('charges').doc(loaded.id).set({ collectStatus: 'pending', collectPaymentId: payment.id, collectStartedAt: at, updatedAt: at }, { merge: true });
        report.started += 1;
      } catch (e) {
        const at = new Date().toISOString();
        console.warn('[autoCollect] incasso starten mislukt:', e?.message ?? e);
        await db.collection('charges').doc(loaded.id).set({ collectStatus: 'failed', collectFailedAt: at, collectFailReason: String(e?.message || e).slice(0, 200), updatedAt: at }, { merge: true });
      }
    }
  }
  return report;
}

/** Basis-URL van de app voor openbare links: uit de aanvraag, of vast via PUBLIC_APP_ORIGIN. */
function appOrigin(req) {
  const fixed = String(process.env.PUBLIC_APP_ORIGIN ?? '').trim();
  if (fixed) return fixed.replace(/\/+$/, '');
  if (!req) return 'https://lift-log-phi.vercel.app';
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'lift-log-phi.vercel.app').split(',')[0].trim();
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  return `${proto}://${host}`;
}

/** Korte WhatsApp-tekst bij de factuurlink, in de taal van het lid. */
function invoiceMessage(lang, { firstName, number, studio, amount, due, url, paid, payUrl = null }) {
  if (lang === 'en') {
    return paid
      ? `Hi ${firstName}, here is your invoice ${number} from ${studio} (${amount}, paid). View and download: ${url}`
      : `Hi ${firstName}, here is your invoice ${number} from ${studio}: ${amount}, due before ${due}.${payUrl ? ` Pay now: ${payUrl}` : ''} View and download: ${url}`;
  }
  return paid
    ? `Hoi ${firstName}, hier is je factuur ${number} van ${studio} (${amount}, betaald). Bekijken en downloaden: ${url}`
    : `Hoi ${firstName}, hier is je factuur ${number} van ${studio}: ${amount}, te betalen vóór ${due}.${payUrl ? ` Direct betalen: ${payUrl}` : ''} Bekijken en downloaden: ${url}`;
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
  const payUrl = await payUrlFor(db, charge, appOrigin(req));
  const text = invoiceMessage(lang, { firstName, number: charge.invoiceNumber, studio: business.legalName, amount, due, url, paid: charge.status === 'paid', payUrl });
  return json(res, 200, { invoiceNumber: charge.invoiceNumber, url, payUrl, text, build: BUILD });
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
  if (kind === 'trainer' && !isStaffAnywhere(profile)) return plain(404, 'Kalenderfeed niet gevonden.');
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
  // Opruimen hoort bij dezelfde dagelijkse ronde (Hobby-plan: één cron per dag per taak). Een fout
  // hier mag de meldingen niet tegenhouden, en andersom.
  try {
    report.retention = await runAccountRetention({
      db,
      auth: getAdmin().auth,
      bucket: await getStorageBucket(),
      notify: notifyRetention(db),
    });
  } catch (e) {
    console.error('[eveningRun] inactieve accounts nalopen mislukte:', e);
    report.retention = { error: String(e?.message || e) };
  }
  try {
    report.leaderboardRemoved = await clearPublishedLeaderboard(db);
  } catch (e) {
    console.error('[eveningRun] ranglijst opruimen mislukte:', e);
  }
  // Vangnet: vastgehouden wachtlijstplekken die niemand meer heeft afgerond (normaal gebeurt dat
  // zodra iemand het rooster opent, boekt of afmeldt).
  report.holdsSettled = await settleExpiredHolds(db).catch(() => 0);
  // Abonnementen met een ingangsdatum van vandaag laten starten (eerste factuur en credits).
  report.membershipsStarted = await startScheduledMemberships(db).catch((e) => {
    console.error('[eveningRun] geplande abonnementen starten mislukte:', e);
    return 0;
  });
  // Afwezige trainers met een vaste invaller: nieuwe lessen op het rooster naar de invaller.
  report.substitutes = await runAbsences(db).catch((e) => {
    console.error('[eveningRun] invallers toewijzen mislukte:', e);
    return 0;
  });
  // Automatisch afschrijven: verlengingen bijwerken en open facturen met machtiging incasseren.
  try {
    report.autoCollect = await runAutoCollect(db, appOrigin(req));
  } catch (e) {
    console.error('[eveningRun] automatisch afschrijven mislukte:', e);
    report.autoCollect = { error: String(e?.message || e) };
  }
  return json(res, 200, { ...report, build: BUILD });
}

/** Waarschuwing voor een inactief account: pushmelding, en e-mail als mail is ingericht. */
function notifyRetention(db) {
  return async (uid, message, authUser) => {
    await sendPushToUser(db, uid, { ...message, data: { kind: 'accountRetention' } }).catch(() => 0);
    if (authUser?.email && mailConfigured()) {
      await sendViaResend({
        fromName: 'VORM',
        to: authUser.email,
        subject: message.title,
        text: message.body,
        html: `<p>${message.body.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c])}</p>`,
      });
    }
  };
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
  await settleExpiredHolds(db).catch(() => 0);

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
      // Vaste groepsles (Beheer → Groepen): alleen voor de leden van die groep, betaald uit het groepstegoed.
      privateForGroup: ct.privateForGroup ?? null,
      groupMemberIds: ct.groupMemberIds ?? null,
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
    if ((ct.privateFor || ct.privateForGroup) && outcome.booked + outcome.skippedFull === 0) emptyPrivate.push(classId);
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
    // Groepsles: alleen leden van de groep, en de groep betaalt. Is het groepstegoed op, dan toch
    // boeken: er is vooruit gefactureerd, de trainer ziet het tekort bij Groepen.
    const group = cls.privateForGroup ? await readGroupLesson(tx, db, cls, orgId) : null;
    if (group && !group.memberIds.includes(userId)) return null;

    const mine = await tx.get(db.collection('bookings').where('classId', '==', classId).where('userId', '==', userId));
    if (mine.docs.some((d) => ['booked', 'waitlist'].includes(String(d.data().status)))) return null;

    const capacity = Number(cls.capacity) || 0;
    const booked = Number(cls.bookedCount) || 0;
    const cost = group ? 0 : Number(cls.creditCost ?? 1) || 0;
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
      if (group) {
        const c = groupChargeOnBook(group.pricing, cls, userId);
        writeGroupMoney(tx, db, group, { orgId, classRef, classId, paidIds: c.paidIds, total: c.total, delta: -c.charge, byUserId: 'system', nowIso, reason: 'booking' });
      }
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
