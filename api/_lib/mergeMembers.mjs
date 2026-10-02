/**
 * Twee accounts van dezelfde persoon samenvoegen (Beheer → lid → Samenvoegen). Bijvoorbeeld een
 * account dat de studio aanmaakte (richard@studio.nl) en een account waarmee de persoon zelf inlogt.
 *
 * Alles van het account dat weggaat (`fromId`) komt bij het account dat blijft (`keepId`):
 * trainingen, metingen, voeding, check-ins, boekingen, vaste afspraken, PT-momenten, abonnementen,
 * facturen, credits (opgeteld), berichten, groepen en workouts. Lege profielvelden van het
 * account dat blijft worden aangevuld. Daarna gaan het profiel en het login-account van `fromId`
 * weg (dat doet de aanroeper, api/admin-account.mjs).
 *
 * Met `dryRun` verandert er niets en komt er alleen terug wat er zou gebeuren, voor de bevestiging.
 * Alleen gewone Firestore-aanroepen (where/get/doc/set/delete), zodat het ook in de tests draait.
 */

/** Collecties met een veld `userId` die gewoon naar het andere account gaan. */
const MOVE_BY_USER_ID = [
  'logs',
  'checkins',
  'nutritionLogs',
  'measurements',
  'workoutRequests',
  'memberships',
  'charges',
  'creditLedger',
  'rescheduleRequests',
  'mollieCheckouts',
];

/** Inloggegevens van het account dat weggaat: die horen niet bij het andere account. */
const DELETE_BY_USER_ID = ['pushTokens', 'calendarFeedTokens', 'mcpKeys'];

/** Profielvelden die nooit worden overgenomen: identiteit, rechten en toestemmingen. */
const PROFILE_SKIP = new Set([
  'userId',
  'email',
  'orgId',
  'orgIds',
  'orgRoles',
  'role',
  'platformAdmin',
  'createdByAdmin',
  'createdAt',
  'updatedAt',
  'healthConsent',
  'healthConsentAt',
  'healthConsentVersion',
  'mergedFrom',
]);

/** Veel documenten (trainingen, voeding): in blokken tegelijk, zodat het binnen de tijd van de server blijft. */
async function inChunks(docs, fn, size = 100) {
  for (let i = 0; i < docs.length; i += size) await Promise.all(docs.slice(i, i + size).map(fn));
}

const isEmpty = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
const accountId = (orgId, userId) => `${orgId}__${userId}`;
const replaceIn = (list, fromId, keepId) => [...new Set((Array.isArray(list) ? list : []).map((x) => (x === fromId ? keepId : x)))];

/** Profielvelden van `from` die op `keep` nog leeg zijn. */
export function profileFill(keep, from) {
  const out = {};
  for (const [k, v] of Object.entries(from ?? {})) {
    if (PROFILE_SKIP.has(k) || isEmpty(v)) continue;
    if (isEmpty(keep?.[k])) out[k] = v;
  }
  return out;
}

/** De id van een vaste afspraak (zie classSchedule.standingBookingId), voor het andere account. */
const standingIdFor = (s, userId) => `sb_${s.classTypeId}_${userId}_${s.weekday}_${String(s.startTime).replace(':', '')}`;

/**
 * Samenvoegen (of met `dryRun` alleen tellen). Geeft per onderdeel hoeveel er overgaat, plus
 * waarschuwingen (bijv. twee actieve abonnementen) die de beheerder vooraf moet zien.
 */
export async function mergeMembers(db, { orgId, keepId, fromId, keepProfile, fromProfile, byUserId = null, nowIso = new Date().toISOString(), dryRun = false }) {
  const counts = {};
  const warnings = [];
  const add = (k, n = 1) => {
    counts[k] = (counts[k] ?? 0) + n;
  };
  const write = async (fn) => {
    if (!dryRun) await fn();
  };
  const byUser = (name, id) => db.collection(name).where('userId', '==', id).get();

  // 1) Gewone gegevens: userId omzetten.
  for (const name of MOVE_BY_USER_ID) {
    const snap = await byUser(name, fromId);
    await write(() => inChunks(snap.docs, (d) => db.collection(name).doc(d.id).set({ userId: keepId }, { merge: true })));
    if (snap.docs.length) add(name, snap.docs.length);
  }
  const memberships = [...(await byUser('memberships', keepId)).docs, ...(await byUser('memberships', fromId)).docs].filter((d) =>
    ['active', 'scheduled', 'starting'].includes(String(d.data().status))
  );
  if (memberships.length > 1) warnings.push(`Na samenvoegen zijn er ${memberships.length} lopende abonnementen. Stop er eventueel een bij Abonnement en credits.`);

  // 2) Boekingen: omzetten; staat het andere account al in dezelfde les, dan vervalt de dubbele.
  const keepActive = new Set(
    (await byUser('bookings', keepId)).docs.filter((d) => ['booked', 'waitlist'].includes(String(d.data().status))).map((d) => String(d.data().classId))
  );
  for (const d of (await byUser('bookings', fromId)).docs) {
    const b = d.data();
    const active = ['booked', 'waitlist'].includes(String(b.status));
    if (active && keepActive.has(String(b.classId))) {
      add('duplicateBookings');
      await write(async () => {
        await db.collection('bookings').doc(d.id).set({ userId: keepId, status: 'cancelled', cancelledAt: nowIso, cancelledReason: 'merged-duplicate' }, { merge: true });
        const classRef = db.collection('classes').doc(String(b.classId));
        const cls = await classRef.get();
        const counter = b.status === 'waitlist' ? 'waitlistCount' : 'bookedCount';
        if (cls.exists) await classRef.set({ [counter]: Math.max(0, (Number(cls.data()[counter]) || 0) - 1) }, { merge: true });
      });
    } else {
      add('bookings');
      await write(() => db.collection('bookings').doc(d.id).set({ userId: keepId }, { merge: true }));
    }
  }

  // 3) Vaste afspraken: de id bevat het account, dus opnieuw aanmaken onder de nieuwe id.
  for (const d of (await byUser('standingBookings', fromId)).docs) {
    const s = d.data();
    const id = standingIdFor(s, keepId);
    const exists = (await db.collection('standingBookings').doc(id).get()).exists;
    add(exists ? 'duplicateStanding' : 'standingBookings');
    await write(async () => {
      if (!exists) await db.collection('standingBookings').doc(id).set({ ...s, id, userId: keepId, updatedAt: nowIso });
      await db.collection('standingBookings').doc(d.id).delete();
    });
  }

  // 4) PT-momenten en hun lessen: alleen voor dit lid; de les-id's blijven gelijk.
  for (const name of ['classTypes', 'classes']) {
    const snap = await db.collection(name).where('privateFor', '==', fromId).get();
    await write(() => inChunks(snap.docs, (d) => db.collection(name).doc(d.id).set({ privateFor: keepId }, { merge: true })));
    if (snap.docs.length) add(name === 'classTypes' ? 'personalSlots' : 'personalClasses', snap.docs.length);
  }

  // 5) Lijsten met leden: groepen, groepslessen, workouts, groepssessies, berichten.
  const inList = [
    ['groups', 'memberIds'],
    ['classTypes', 'groupMemberIds'],
    ['classes', 'groupMemberIds'],
    ['workouts', 'participantIds'],
    ['sessions', 'participantIds'],
  ];
  for (const [name, field] of inList) {
    const snap = await db.collection(name).where(field, 'array-contains', fromId).get();
    await write(() => inChunks(snap.docs, (d) => db.collection(name).doc(d.id).set({ [field]: replaceIn(d.data()[field], fromId, keepId) }, { merge: true })));
    if (snap.docs.length) add(name === 'workouts' || name === 'sessions' ? name : 'groups', snap.docs.length);
  }
  const ownWorkouts = await db.collection('workouts').where('clientId', '==', fromId).get();
  for (const d of ownWorkouts.docs) await write(() => db.collection('workouts').doc(d.id).set({ clientId: keepId }, { merge: true }));
  if (ownWorkouts.docs.length) add('workouts', ownWorkouts.docs.length);
  const messages = await db.collection('messages').where('participants', 'array-contains', fromId).get();
  for (const d of messages.docs) {
    const m = d.data();
    await write(() =>
      db.collection('messages').doc(d.id).set(
        {
          participants: replaceIn(m.participants, fromId, keepId),
          ...(m.senderId === fromId ? { senderId: keepId } : {}),
          ...(m.recipientId === fromId ? { recipientId: keepId } : {}),
        },
        { merge: true }
      )
    );
  }
  if (messages.docs.length) add('messages', messages.docs.length);

  // 6) Credits optellen.
  const fromAcc = await db.collection('creditAccounts').doc(accountId(orgId, fromId)).get();
  const fromBalance = fromAcc.exists ? Number(fromAcc.data().balance) || 0 : 0;
  if (fromAcc.exists) {
    const keepAcc = await db.collection('creditAccounts').doc(accountId(orgId, keepId)).get();
    const keepBalance = keepAcc.exists ? Number(keepAcc.data().balance) || 0 : 0;
    counts.credits = fromBalance;
    await write(async () => {
      await db.collection('creditAccounts').doc(accountId(orgId, keepId)).set({ orgId, userId: keepId, balance: keepBalance + fromBalance, updatedAt: nowIso }, { merge: true });
      await db.collection('creditAccounts').doc(accountId(orgId, fromId)).delete();
      if (fromBalance !== 0) {
        await db.collection('creditLedger').doc(`cl_merge_${fromId}_${keepId}`).set({
          orgId,
          userId: keepId,
          delta: fromBalance,
          reason: 'merge',
          note: `Samengevoegd met ${fromProfile?.email || fromId}`,
          byUserId,
          createdAt: nowIso,
        });
      }
    });
  }

  // 7) Betaalgegevens (Mollie-klant) alleen als het blijvende account er nog geen heeft.
  const fromMollie = await db.collection('mollieCustomers').doc(accountId(orgId, fromId)).get();
  if (fromMollie.exists) {
    const keepMollie = await db.collection('mollieCustomers').doc(accountId(orgId, keepId)).get();
    await write(async () => {
      if (!keepMollie.exists) await db.collection('mollieCustomers').doc(accountId(orgId, keepId)).set(fromMollie.data());
      await db.collection('mollieCustomers').doc(accountId(orgId, fromId)).delete();
    });
    if (!keepMollie.exists) add('payment');
  }

  // 8) Inlogsleutels en ranglijst van het account dat weggaat.
  for (const name of DELETE_BY_USER_ID) {
    const snap = await byUser(name, fromId);
    for (const d of snap.docs) await write(() => db.collection(name).doc(d.id).delete());
  }
  await write(async () => {
    const lb = await db.collection('leaderboardPublic').doc(fromId).get();
    if (lb.exists) await db.collection('leaderboardPublic').doc(fromId).delete();
  });

  // 9) Profiel aanvullen.
  const fill = profileFill(keepProfile, fromProfile);
  if (Object.keys(fill).length) counts.profileFields = Object.keys(fill).length;
  await write(() =>
    db.collection('profiles').doc(keepId).set({ ...fill, mergedFrom: [...(keepProfile?.mergedFrom ?? []), fromProfile?.email || fromId], updatedAt: nowIso }, { merge: true })
  );

  return { counts, warnings, profileFill: Object.keys(fill) };
}
