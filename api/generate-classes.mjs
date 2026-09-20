/**
 * Cron (zie vercel.json): zet dagelijks de ontbrekende lessen van elke lessoort met een `schedule`
 * op het rooster, tot WEEKS_AHEAD weken vooruit. Zie api/_lib/classSchedule.mjs voor de rekenkant.
 *
 * Beveiliging: Vercel ondertekent een cron-aanroep met `Authorization: Bearer $CRON_SECRET` zodra
 * die env-var gezet is. Zonder CRON_SECRET geconfigureerd weigert dit endpoint alles — een open,
 * ongeauthenticeerde route die op het rooster kan schrijven is geen risico dat we willen lopen.
 */
import { getAdmin } from './_lib/firebaseAdmin.mjs';
import { classIdForOccurrence, missingOccurrences, occurrencesForSchedule } from './_lib/classSchedule.mjs';

const WEEKS_AHEAD = 8;

function json(res, status, body) {
  const payload = JSON.stringify(body);
  if (typeof res.status === 'function') {
    res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(payload);
    return;
  }
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(payload);
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return json(res, 500, { error: 'CRON_SECRET ontbreekt in de serveromgeving.' });
  if (req.headers.authorization !== `Bearer ${secret}`) return json(res, 401, { error: 'Niet geautoriseerd.' });

  const { db, error } = getAdmin();
  if (error) return json(res, 500, { error });

  const from = todayIso();
  const typesSnap = await db.collection('classTypes').get();
  let created = 0;
  const skippedNoTrainer = [];

  for (const typeDoc of typesSnap.docs) {
    const ct = typeDoc.data();
    const schedule = Array.isArray(ct.schedule) ? ct.schedule : [];
    if (schedule.length === 0) continue;
    if (!ct.defaultTrainerId) {
      skippedNoTrainer.push(typeDoc.id);
      continue;
    }

    const all = occurrencesForSchedule(schedule, from, WEEKS_AHEAD);
    if (all.length === 0) continue;
    const allRefs = all.map((o) => db.collection('classes').doc(classIdForOccurrence(typeDoc.id, o.date, o.startTime)));
    const existingDocs = await db.getAll(...allRefs);
    const existingKeys = new Set(existingDocs.filter((d) => d.exists).map((d) => d.id));

    const missing = missingOccurrences(typeDoc.id, schedule, from, WEEKS_AHEAD, existingKeys);
    if (missing.length === 0) continue;
    const batch = db.batch();
    for (const o of missing) {
      const ref = db.collection('classes').doc(classIdForOccurrence(typeDoc.id, o.date, o.startTime));
      batch.set(ref, {
        id: ref.id,
        orgId: ct.orgId,
        title: ct.name,
        date: o.date,
        startTime: o.startTime,
        endTime: null,
        trainerId: ct.defaultTrainerId,
        capacity: ct.capacity ?? 999,
        creditCost: ct.creditCost ?? 1,
        schemaId: ct.schemaId ?? null,
        classTypeId: typeDoc.id,
        bookedCount: 0,
        waitlistCount: 0,
        cancelledAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      created++;
    }
    await batch.commit();
  }

  return json(res, 200, { created, skippedNoTrainer });
}
