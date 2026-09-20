/**
 * Terugkerende lessen (Beheer → Lessoorten → "Terugkerend"): een lessoort met een `schedule`
 * (bijv. "elke donderdag 19:00") hoeft niet elke week met de hand op het rooster gezet te worden.
 * `api/generate-classes.mjs` roept `missingOccurrences` hier dagelijks voor aan en zet de
 * ontbrekende lessen zelf op het rooster, tot `weeksAhead` weken vooruit.
 *
 * Puur en zonder Firestore, zodat dit los te testen is; de cron-endpoint doet het lezen/schrijven.
 */

/** Deterministieke id, zodat "bestaat deze les al" een simpele lookup is en er nooit een dubbele ontstaat. */
export function classIdForOccurrence(classTypeId, date, startTime) {
  return `cls_gen_${classTypeId}_${date}_${startTime.replace(':', '')}`;
}

function isoDay(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Array van ISO-dagen van vandaag (inclusief) tot en met `weeksAhead` weken vooruit. */
function upcomingDays(fromDateIso, weeksAhead) {
  const [y, m, d] = fromDateIso.split('-').map(Number);
  const start = new Date(y, m - 1, d);
  const out = [];
  for (let i = 0; i < weeksAhead * 7; i++) {
    const dt = new Date(start);
    dt.setDate(start.getDate() + i);
    out.push(dt);
  }
  return out;
}

/** Alle bezette momenten die uit `schedule` volgen voor de komende `weeksAhead` weken. */
export function occurrencesForSchedule(schedule, fromDateIso, weeksAhead) {
  const days = upcomingDays(fromDateIso, weeksAhead);
  const out = [];
  for (const day of days) {
    const iso = isoDay(day);
    for (const slot of schedule) {
      if (slot.weekday === day.getDay()) out.push({ date: iso, startTime: slot.startTime });
    }
  }
  return out;
}

/**
 * Welke van die momenten nog geen les op het rooster hebben. `existingKeys` is een Set van
 * `classIdForOccurrence(...)`-waarden die al bestaan (gegenereerd of handmatig aangepast/afgelast —
 * een afgelaste les telt ook mee als "bestaat", anders komt hij bij de volgende cron-run terug).
 */
export function missingOccurrences(classTypeId, schedule, fromDateIso, weeksAhead, existingKeys) {
  return occurrencesForSchedule(schedule, fromDateIso, weeksAhead).filter(
    (o) => !existingKeys.has(classIdForOccurrence(classTypeId, o.date, o.startTime))
  );
}
