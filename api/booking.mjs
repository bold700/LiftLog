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
 *   { action: 'book',    classId, weekly? }             sporter reserveert (of komt op de wachtlijst);
 *                                                        weekly: true zet dit weekmoment ook op "elke week"
 *   { action: 'cancel',  bookingId }                   afmelden; credit terug binnen de annuleertermijn
 *                                                        (instelbaar per studio, zie bookingPolicy hieronder)
 *   { action: 'setStandingBooking', standingBookingId, active }  "elke week inschrijven" aan/uit zetten
 *   { action: 'generateClassOccurrences', classTypeId }  rooster meteen vullen voor deze lessoort (staf),
 *                                                        in plaats van tot de volgende cron te wachten
 *   { action: 'grant',   userId, amount, note }        credits toekennen (alleen trainer/beheerder)
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
 *
 * GET /api/cron/generate-classes (rewrite naar ?cron=generateClasses): dagelijkse Vercel-cron die
 * lessen van een terugkerende lessoort op het rooster zet (zie api/_lib/classSchedule.mjs). Zit
 * bewust in dit endpoint in plaats van een eigen bestand: het Hobby-plan van Vercel staat maximaal
 * 12 Serverless Functions per deployment toe, en dat aantal zat al vol. Boekt daarna ook meteen
 * iedereen met een actieve "elke week"-inschrijving voor dat weekmoment in (plek/saldo toegestaan?
 * geboekt; vol? wachtlijst; geen saldo? die week overgeslagen — zie `lastOutcome` op het document).
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
import { last4, mollieKeyFormatError, secretFieldFor, verifyMollieKey } from './_lib/molliePayments.mjs';
import { classIdForOccurrence, missingOccurrences, occurrencesForSchedule, standingBookingId } from './_lib/classSchedule.mjs';

const BUILD = (process.env.VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 7);

/** Tot hoeveel uur voor aanvang je kosteloos kunt afmelden. Daarna is de credit op. */
const FREE_CANCEL_HOURS = 12;

/** Bovengrens op één keer credits toekennen; beschermt tegen een typefout met een nul te veel. */
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
  const isCron = req.method === 'GET' && req.query?.cron === 'generateClasses';
  if (req.method !== 'POST' && !publicToken && !isCron) return json(res, 405, { error: 'Method not allowed', build: BUILD });

  const admin = getAdmin();
  if (admin.error) {
    console.error('[booking] Firebase Admin niet beschikbaar:', admin.error);
    return json(res, 500, { error: 'Serverconfiguratie onvolledig.', build: BUILD });
  }
  const { auth, db } = admin;

  if (publicToken) return publicInvoice(res, db, publicToken);
  if (isCron) return generateClasses(req, res, db);

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
        return await book(res, db, uid, myOrgs, String(body.classId ?? '').trim(), body.weekly === true);
      case 'cancel':
        return await cancel(res, db, uid, myOrgs, isStaff, String(body.bookingId ?? '').trim());
      case 'setStandingBooking':
        return await setStandingBooking(res, db, uid, myOrgs, String(body.standingBookingId ?? '').trim(), body.active === true);
      case 'generateClassOccurrences':
        return await generateClassOccurrencesNow(res, db, myOrgs, isStaff, String(body.classTypeId ?? '').trim());
      case 'grant':
        if (!isStaff) return json(res, 403, { error: 'Alleen een trainer of beheerder kan credits toekennen.', build: BUILD });
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
      default:
        return json(res, 400, { error: 'Onbekende actie.', build: BUILD });
    }
  } catch (e) {
    // Een verwachte weigering (geen plek, geen saldo) komt hier als Error langs met een nette tekst.
    const message = e instanceof Error ? e.message : 'Er ging iets mis.';
    if (e?.expected) return json(res, 409, { error: message, build: BUILD });
    console.error('[booking] mislukt:', e);
    return json(res, 500, { error: 'Reservering verwerken mislukt.', build: BUILD });
  }
}

/** Weigering die de gebruiker moet zien (geen plek, geen saldo) — geen serverfout. */
function refuse(message) {
  const err = new Error(message);
  err.expected = true;
  return err;
}

/**
 * Reserveren. In één transactie: plek controleren, credit afschrijven, reservering vastleggen.
 * Zit de les vol, dan kom je op de wachtlijst — zonder dat er een credit af gaat.
 */
async function book(res, db, uid, myOrgs, classId, weekly) {
  if (!classId) return json(res, 400, { error: 'Geen les opgegeven.', build: BUILD });

  // Eerst het eigen abonnement bijwerken (verlenging die nog openstond), dan pas reserveren.
  // Onbeperkt plan: de les kost niets.
  const preSnap = await db.collection('classes').doc(classId).get();
  const preOrg = preSnap.exists ? orgIdOf(preSnap.data().orgId) : null;
  let unlimited = false;
  if (preOrg && myOrgs.includes(preOrg)) {
    const m = await activeMembership(db, preOrg, uid);
    if (m) {
      await settleMembership(db, newId, db.collection('memberships').doc(m.id), new Date().toISOString());
      const still = await activeMembership(db, preOrg, uid);
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
    if (cls.cancelledAt) throw refuse('Deze les is afgelast.');

    const startsAt = classStartsAt(cls);
    if (startsAt && startsAt.getTime() < Date.now()) throw refuse('Deze les is al geweest.');

    // Al gereserveerd? Dan niets doen in plaats van een tweede plek innemen.
    const mine = await tx.get(
      db.collection('bookings').where('classId', '==', classId).where('userId', '==', uid)
    );
    const active = mine.docs.filter((d) => ['booked', 'waitlist'].includes(String(d.data().status)));
    if (active.length > 0) throw refuse('Je staat al ingeschreven voor deze les.');

    const capacity = Number(cls.capacity) || 0;
    const booked = Number(cls.bookedCount) || 0;
    const cost = unlimited ? 0 : Number(cls.creditCost ?? 1) || 0;
    const onWaitlist = booked >= capacity;

    const accountRef = db.collection('creditAccounts').doc(accountId(orgId, uid));
    const accountSnap = await tx.get(accountRef);
    const balance = Number(accountSnap.exists ? accountSnap.data().balance : 0) || 0;

    // Op de wachtlijst kost het niets; de credit gaat er pas af als je doorschuift.
    if (!onWaitlist && balance < cost) {
      throw refuse(
        cost === 1
          ? 'Je hebt geen credits meer. Vraag je trainer om nieuwe.'
          : `Deze les kost ${cost} credits; je hebt er ${balance}.`
      );
    }

    const bookingId = newId('bk');
    const now = new Date().toISOString();
    tx.set(db.collection('bookings').doc(bookingId), {
      id: bookingId,
      orgId,
      classId,
      userId: uid,
      status: onWaitlist ? 'waitlist' : 'booked',
      creditsSpent: onWaitlist ? 0 : cost,
      createdAt: now,
      updatedAt: FieldValue.serverTimestamp(),
    });

    if (onWaitlist) {
      tx.set(classRef, { waitlistCount: FieldValue.increment(1) }, { merge: true });
    } else {
      tx.set(classRef, { bookedCount: FieldValue.increment(1) }, { merge: true });
      if (cost > 0) {
        tx.set(accountRef, { orgId, userId: uid, balance: balance - cost, updatedAt: now }, { merge: true });
        tx.set(db.collection('creditLedger').doc(newId('cl')), {
          orgId,
          userId: uid,
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
        .doc(standingBookingId(cls.classTypeId, uid, weekday, cls.startTime));
      tx.set(
        sbRef,
        {
          id: sbRef.id,
          orgId,
          userId: uid,
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
    };
  });

  return json(res, 200, { ...result, build: BUILD });
}

/**
 * Afmelden. Binnen de annuleertermijn krijg je je credit terug; daarna niet — anders meldt
 * iedereen zich op het laatste moment af en staat de zaal leeg.
 * Komt er een plek vrij, dan schuift de eerste van de wachtlijst door.
 */
async function cancel(res, db, uid, myOrgs, isStaff, bookingId) {
  if (!bookingId) return json(res, 400, { error: 'Geen reservering opgegeven.', build: BUILD });

  const result = await db.runTransaction(async (tx) => {
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

    return { cancelled: true, refunded: refund, promotedUserId: promoted ? String(promoted.data.userId) : null };
  });

  return json(res, 200, { ...result, build: BUILD });
}

/** "Elke week inschrijven" aan- of uitzetten. Alleen de sporter van wie de inschrijving is. */
async function setStandingBooking(res, db, uid, myOrgs, standingId, active) {
  if (!standingId) return json(res, 400, { error: 'Geen inschrijving opgegeven.', build: BUILD });
  const ref = db.collection('standingBookings').doc(standingId);
  const snap = await ref.get();
  if (!snap.exists) return json(res, 404, { error: 'Deze inschrijving bestaat niet (meer).', build: BUILD });
  const data = snap.data();
  if (!myOrgs.includes(orgIdOf(data.orgId))) return json(res, 403, { error: 'Deze inschrijving hoort niet bij jouw studio.', build: BUILD });
  if (data.userId !== uid) return json(res, 403, { error: 'Dit is niet jouw inschrijving.', build: BUILD });
  await ref.set({ active, updatedAt: new Date().toISOString() }, { merge: true });
  return json(res, 200, { active, build: BUILD });
}

/** Credits toekennen of afboeken. Elke mutatie komt ook in het grootboek te staan. */
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

  const charge = await loadInvoiceCharge(db, chargeId);
  const r = await renderInvoice(db, charge);
  const to = r.member.email.trim();
  if (!to) return json(res, 409, { error: 'Dit lid heeft geen e-mailadres.', build: BUILD });

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
  return json(res, 200, { invoiceNumber: charge.invoiceNumber, sentTo: to, sentAt, build: BUILD });
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
async function generateClasses(req, res, db) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return json(res, 500, { error: 'CRON_SECRET ontbreekt in de serveromgeving.', build: BUILD });
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  if (authHeader !== `Bearer ${secret}`) return json(res, 401, { error: 'Niet geautoriseerd.', build: BUILD });

  const typesSnap = await db.collection('classTypes').get();
  const totals = { created: 0, autoBooked: 0, autoWaitlisted: 0, autoSkippedNoCredits: 0 };
  const skippedNoTrainer = [];

  for (const typeDoc of typesSnap.docs) {
    const ct = typeDoc.data();
    if (!Array.isArray(ct.schedule) || ct.schedule.length === 0) continue;
    if (!ct.defaultTrainerId) {
      skippedNoTrainer.push(typeDoc.id);
      continue;
    }
    const result = await generateForClassType(db, typeDoc.id, ct);
    totals.created += result.created;
    totals.autoBooked += result.autoBooked;
    totals.autoWaitlisted += result.autoWaitlisted;
    totals.autoSkippedNoCredits += result.autoSkippedNoCredits;
  }

  return json(res, 200, { ...totals, skippedNoTrainer, build: BUILD });
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
      trainerId: ct.defaultTrainerId,
      capacity: ct.capacity ?? 999,
      creditCost: ct.creditCost ?? 1,
      schemaId: ct.schemaId ?? null,
      classTypeId,
      room: ct.room ?? null,
      sessionKind: ct.sessionKind ?? 'group',
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
  for (const o of missing) {
    const weekday = new Date(`${o.date}T00:00:00`).getDay();
    const classId = classIdForOccurrence(classTypeId, o.date, o.startTime);
    const outcome = await autoBookStandingBookings(db, ct.orgId, classId, classTypeId, weekday, o.startTime);
    result.autoBooked += outcome.booked;
    result.autoWaitlisted += outcome.skippedFull;
    result.autoSkippedNoCredits += outcome.skippedNoCredits;
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
  if (!Array.isArray(ct.schedule) || ct.schedule.length === 0 || !ct.defaultTrainerId) {
    return json(res, 200, { created: 0, autoBooked: 0, autoWaitlisted: 0, autoSkippedNoCredits: 0, build: BUILD });
  }
  const result = await generateForClassType(db, classTypeId, ct);
  return json(res, 200, { ...result, build: BUILD });
}

/**
 * Voor één nieuw gegenereerde les: alle actieve "elke week"-inschrijvingen op dat weekmoment
 * (lessoort + weekdag + starttijd) proberen te boeken, net als een gewone reservering — plek en
 * saldo toegestaan? geboekt. Vol? wachtlijst. Geen saldo? die week overgeslagen, met een reden op
 * de inschrijving zodat de sporter dat op zijn Profiel kan zien.
 */
async function autoBookStandingBookings(db, orgId, classId, classTypeId, weekday, startTime) {
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
    const result = await attemptStandingBooking(db, orgId, classId, doc.data());
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
    if (!classSnap.exists || classSnap.data().cancelledAt) return null;
    const cls = classSnap.data();

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
    if (onWaitlist) {
      tx.set(classRef, { waitlistCount: FieldValue.increment(1) }, { merge: true });
    } else {
      tx.set(classRef, { bookedCount: FieldValue.increment(1) }, { merge: true });
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
