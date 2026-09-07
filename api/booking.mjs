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
 *   { action: 'book',    classId }                     sporter reserveert (of komt op de wachtlijst)
 *   { action: 'cancel',  bookingId }                   afmelden; credit terug binnen de annuleertermijn
 *   { action: 'grant',   userId, amount, note }        credits toekennen (alleen trainer/beheerder)
 *
 * Beveiliging:
 *  - Vereist een geldig Firebase ID-token (Bearer).
 *  - Alles blijft binnen de studio van de aanvrager; een sporter reserveert alleen voor zichzelf.
 *  - Credits toekennen kan alleen staf, en alleen aan iemand in de eigen studio.
 */
import { getAdmin } from './_lib/firebaseAdmin.mjs';
import { orgIdOf, newId } from './_lib/liftlogData.mjs';
import { FieldValue } from 'firebase-admin/firestore';

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
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed', build: BUILD });

  const admin = getAdmin();
  if (admin.error) {
    console.error('[booking] Firebase Admin niet beschikbaar:', admin.error);
    return json(res, 500, { error: 'Serverconfiguratie onvolledig.', build: BUILD });
  }
  const { auth, db } = admin;

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
        return await book(res, db, uid, myOrgs, String(body.classId ?? '').trim());
      case 'cancel':
        return await cancel(res, db, uid, myOrgs, isStaff, String(body.bookingId ?? '').trim());
      case 'grant':
        if (!isStaff) return json(res, 403, { error: 'Alleen een trainer of beheerder kan credits toekennen.', build: BUILD });
        return await grant(res, db, uid, myOrgs, body);
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
async function book(res, db, uid, myOrgs, classId) {
  if (!classId) return json(res, 400, { error: 'Geen les opgegeven.', build: BUILD });

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
    const cost = Number(cls.creditCost ?? 1) || 0;
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

    const startsAt = cls ? classStartsAt(cls) : null;
    const hoursLeft = startsAt ? (startsAt.getTime() - Date.now()) / 3_600_000 : Infinity;
    const spent = Number(booking.creditsSpent) || 0;
    // De les is afgelast: dan altijd terug, ongeacht het tijdstip.
    const refund = spent > 0 && (cls?.cancelledAt ? true : hoursLeft >= FREE_CANCEL_HOURS);

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
