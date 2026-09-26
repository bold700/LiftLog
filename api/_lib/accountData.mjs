/**
 * Alles wat aan één persoon hangt: opruimen (account verwijderen, zelf of door de studio of na
 * lange inactiviteit) en exporteren ("Download mijn gegevens", AVG art. 15 en 20).
 *
 * Gedeeld door api/admin-account.mjs en de dagelijkse opruimtaak (api/_lib/accountRetention.mjs).
 */
import { amsterdamDate } from './classReminders.mjs';

/** Verwijdert alle documenten uit een query in batches van 400 (Firestore-limiet is 500). */
export async function deleteQueryInBatches(db, query) {
  let total = 0;
  for (;;) {
    const snap = await query.limit(400).get();
    if (snap.empty) return total;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    total += snap.size;
    if (snap.size < 400) return total;
  }
}

/**
 * Alles wat aan één persoon hangt: per-user collecties op userId, berichten, sleutels, vaste
 * afspraken, komende boekingen en het ranglijstdocument.
 *
 * Wat bewust blijft staan: facturen, betalingen, lidmaatschappen, het creditsaldo en boekingen uit
 * het verleden. Die heeft de studio nodig voor haar administratie (fiscale bewaarplicht); ze
 * verwijzen alleen nog naar een uid waar geen profiel meer bij hoort.
 */
export async function deleteUserData(db, uid) {
  const result = {};
  for (const name of [
    'logs',
    'checkins',
    'nutritionLogs',
    'measurements',
    'workoutRequests',
    'pushTokens',
    'calendarFeedTokens',
    'mcpKeys',
    'standingBookings',
  ]) {
    result[name] = await deleteQueryInBatches(db, db.collection(name).where('userId', '==', uid));
  }
  result.messages = await deleteQueryInBatches(db, db.collection('messages').where('participants', 'array-contains', uid));
  result.bookingsCancelled = await cancelFutureBookings(db, uid);
  const lb = db.collection('leaderboardPublic').doc(uid);
  const lbSnap = await lb.get();
  if (lbSnap.exists) await lb.delete();
  result.leaderboardPublic = lbSnap.exists ? 1 : 0;
  return result;
}

/**
 * Komende boekingen (en wachtlijstplekken) vrijgeven, zodat de plek in de les niet bezet blijft
 * door iemand die er niet meer is. Boekingen uit het verleden blijven voor de administratie.
 */
async function cancelFutureBookings(db, uid) {
  const today = amsterdamDate(new Date(), 0);
  const snap = await db.collection('bookings').where('userId', '==', uid).get();
  let cancelled = 0;
  for (const d of snap.docs) {
    const booking = d.data();
    if (!['booked', 'waitlist'].includes(String(booking.status))) continue;
    const classRef = db.collection('classes').doc(String(booking.classId));
    const classSnap = await classRef.get();
    if (!classSnap.exists || String(classSnap.data().date) < today) continue;
    const batch = db.batch();
    batch.set(d.ref, { status: 'cancelled', cancelledAt: new Date().toISOString(), refunded: false, cancelledReason: 'account-deleted' }, { merge: true });
    const counter = booking.status === 'waitlist' ? 'waitlistCount' : 'bookedCount';
    batch.set(classRef, { [counter]: Math.max(0, (Number(classSnap.data()[counter]) || 0) - 1) }, { merge: true });
    await batch.commit();
    cancelled++;
  }
  return cancelled;
}

/**
 * Bestanden van deze persoon in de opslag: profielfoto en voortgangsfoto's (zie storage.rules).
 * Best effort: zonder bucket (lokaal, of de variabele ontbreekt) of bij een fout blijft het bij de
 * database; de app ruimt bij zelf verwijderen de bestanden ook zelf op.
 * @param {{ deleteFiles: (opts: { prefix: string }) => Promise<unknown>, file: (path: string) => { delete: (opts?: object) => Promise<unknown> } } | null} bucket
 */
export async function deleteUserFiles(bucket, uid) {
  if (!bucket) return false;
  try {
    await bucket.deleteFiles({ prefix: `progress/${uid}/` });
    await bucket.file(`avatars/${uid}`).delete({ ignoreNotFound: true });
    return true;
  } catch (e) {
    console.error('[accountData] bestanden opruimen mislukte:', e);
    return false;
  }
}

// --- Exporteren ------------------------------------------------------------------------------

/** Per-persoon collecties met een veld `userId`, in de volgorde waarin ze in de export staan. */
const EXPORT_BY_USER_ID = [
  'measurements',
  'logs',
  'checkins',
  'nutritionLogs',
  'workoutRequests',
  'bookings',
  'standingBookings',
  'memberships',
  'charges',
  'creditAccounts',
  'creditLedger',
];

/** Firestore-waarden omzetten naar gewone JSON: tijdstempels als ISO-datum. */
export function toPlainJson(value) {
  if (value == null) return value ?? null;
  if (typeof value?.toDate === 'function') {
    const d = value.toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
  }
  if (Array.isArray(value)) return value.map(toPlainJson);
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = toPlainJson(v);
    return out;
  }
  return value;
}

const docsOf = (snap) => snap.docs.map((d) => toPlainJson({ id: d.id, ...d.data() }));

/**
 * Een kopie van alles wat over deze persoon is opgeslagen, als één JSON-object.
 * Niet erin: geheime koppelsleutels (kalenderfeed, AI-koppeling) en pushtokens; die zeggen niets
 * over de persoon en zijn in de verkeerde handen wel bruikbaar.
 */
export async function exportUserData(db, uid, authUser = null) {
  const profileSnap = await db.collection('profiles').doc(uid).get();
  const data = {
    exportedAt: new Date().toISOString(),
    about:
      'Dit zijn alle gegevens die VORM over jou bewaart. Vragen? Neem contact op met je studio of met support@bold700.com.',
    account: authUser
      ? {
          uid,
          email: authUser.email ?? null,
          createdAt: authUser.metadata?.creationTime ?? null,
          lastSignInAt: authUser.metadata?.lastSignInTime ?? null,
        }
      : { uid },
    profile: profileSnap.exists ? toPlainJson(profileSnap.data()) : null,
  };
  for (const name of EXPORT_BY_USER_ID) {
    data[name] = docsOf(await db.collection(name).where('userId', '==', uid).get());
  }
  const [asClient, asParticipant, messages] = await Promise.all([
    db.collection('workouts').where('clientId', '==', uid).get(),
    db.collection('workouts').where('participantIds', 'array-contains', uid).get(),
    db.collection('messages').where('participants', 'array-contains', uid).get(),
  ]);
  const workouts = new Map();
  for (const w of [...docsOf(asClient), ...docsOf(asParticipant)]) workouts.set(w.id, w);
  data.workouts = [...workouts.values()];
  data.messages = docsOf(messages);
  data.notIncluded = ['Koppelsleutels voor de agenda en AI-koppeling (geheim)', 'Pushmeldingstokens van je toestellen'];
  return data;
}
