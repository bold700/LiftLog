/**
 * Terugkerende lessen (Beheer → Lessoorten → "Terugkerend"): een lessoort met een `schedule`
 * (bijv. "elke donderdag 19:00") hoeft niet elke week met de hand op het rooster gezet te worden.
 * De cron-actie in api/booking.mjs (?cron=generateClasses) roept `missingOccurrences` hier
 * dagelijks voor aan en zet de ontbrekende lessen zelf op het rooster, tot `weeksAhead` weken
 * vooruit.
 *
 * Puur en zonder Firestore, zodat dit los te testen is; booking.mjs doet het lezen/schrijven.
 */

/** Deterministieke id, zodat "bestaat deze les al" een simpele lookup is en er nooit een dubbele ontstaat. */
export function classIdForOccurrence(classTypeId, date, startTime) {
  return `cls_gen_${classTypeId}_${date}_${startTime.replace(':', '')}`;
}

/**
 * Deterministieke id voor een "elke week inschrijven"-instelling: één per lessoort, sporter en
 * weekmoment. Vinkt een sporter dezelfde les nog een keer aan, dan zet dit gewoon dezelfde
 * instelling weer op actief in plaats van een dubbele aan te maken.
 */
export function standingBookingId(classTypeId, userId, weekday, startTime) {
  return `sb_${classTypeId}_${userId}_${weekday}_${startTime.replace(':', '')}`;
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
      if (slot.weekday === day.getDay()) out.push({ date: iso, startTime: slot.startTime, endTime: slot.endTime });
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

/** Voorvoegsel van de id's die het rooster zelf aanmaakt voor een lessoort (zie `classIdForOccurrence`). */
export function generatedPrefix(classTypeId) {
  return `cls_gen_${classTypeId}_`;
}

/**
 * Welke lessen niet meer kloppen met hun lessoort: het weekmoment is verplaatst of weg, of de
 * lessoort zelf bestaat niet meer. Alleen lessen vanaf `fromDateIso` (het verleden blijft zoals
 * het was). Bestaat de lessoort nog, dan gaat het alleen om lessen die het rooster zelf maakte (een
 * handmatig geplande les met die lessoort blijft staan). Is de lessoort verwijderd, dan hoort geen
 * enkele toekomstige les ervan nog op het rooster, ook niet een handmatig geplande.
 *
 * `classes`: [{ id, classTypeId, date, bookedCount, waitlistCount }].
 * `expectedIdsByType`: Map classTypeId → Set met de id's die het huidige schema oplevert; een
 * lessoort die ontbreekt in de Map bestaat niet (meer).
 *
 * Geeft `remove` (verouderd en niemand ingeschreven of op de wachtlijst: veilig weg) en
 * `keepBooked` (verouderd maar met inschrijvingen: blijft staan, de trainer beslist).
 */
export function staleGeneratedClasses(classes, expectedIdsByType, fromDateIso) {
  const remove = [];
  const keepBooked = [];
  for (const c of classes) {
    if (!c || !c.classTypeId || typeof c.id !== 'string') continue;
    if (!c.date || c.date < fromDateIso) continue;
    const expected = expectedIdsByType.get(c.classTypeId);
    if (expected) {
      if (!c.id.startsWith(generatedPrefix(c.classTypeId)) || expected.has(c.id)) continue;
    }
    const hasPeople = (Number(c.bookedCount) || 0) > 0 || (Number(c.waitlistCount) || 0) > 0;
    (hasPeople ? keepBooked : remove).push(c);
  }
  return { remove, keepBooked };
}

/** De id's die het schema van een lessoort vanaf `fromDateIso` oplevert, voor `staleGeneratedClasses`. */
export function expectedIdsForSchedule(classTypeId, schedule, fromDateIso, weeksAhead) {
  const ids = new Set();
  if (!Array.isArray(schedule)) return ids;
  for (const o of occurrencesForSchedule(schedule, fromDateIso, weeksAhead)) ids.add(classIdForOccurrence(classTypeId, o.date, o.startTime));
  return ids;
}

/**
 * Velden van een lessoort die op zijn al geplande (toekomstige) lessen moeten meeveranderen: naam,
 * eindtijd, ruimte, omschrijving en soort. Capaciteit, prijs en trainer bewust niet: daar hebben
 * mensen al op geboekt. Geeft alleen de velden terug die echt anders zijn, of null.
 */
export function classFieldUpdates(existing, ct, endTime) {
  const want = {
    title: ct.name,
    endTime: endTime ?? null,
    room: ct.room ?? null,
    description: ct.description ?? null,
    sessionKind: ct.sessionKind ?? 'group',
  };
  const out = {};
  for (const [k, v] of Object.entries(want)) {
    if ((existing[k] ?? null) !== v) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}
