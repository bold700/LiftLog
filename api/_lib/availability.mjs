/**
 * Trainer beschikbaarheid: per trainer per studio, per weekdag de uren waarop hij kan
 * (bijv. maandag 06:00–12:00 en 16:00–21:00, donderdag vrij). De app biedt alleen momenten aan
 * die binnen die uren vallen. Nog niets ingevuld: dan geldt de standaard van de studio.
 *
 * Opslag: `trainerAvailability/{orgId}__{userId}` = { orgId, userId, days: { '0'..'6': [{ from, to }] } }.
 * Alleen de server schrijft (de trainer zelf of een beheerder, via api/booking.mjs).
 */

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_WINDOWS_PER_DAY = 4;

export const availabilityDocId = (orgId, userId) => `${orgId}__${userId}`;

/**
 * Invoer netjes maken: alleen geldige tijden, van vóór tot, overlappende of aansluitende blokken
 * samengevoegd, gesorteerd, hooguit 4 per dag. Geeft `{ error }` of `{ value }`.
 */
export function cleanAvailability(raw) {
  const days = {};
  for (let wd = 0; wd <= 6; wd++) {
    const list = Array.isArray(raw?.[wd]) ? raw[wd] : Array.isArray(raw?.[String(wd)]) ? raw[String(wd)] : [];
    const windows = [];
    for (const w of list) {
      const from = String(w?.from ?? '');
      const to = String(w?.to ?? '');
      if (!TIME.test(from) || !TIME.test(to)) return { error: 'Vul tijden in als uu:mm.' };
      if (to <= from) return { error: 'De eindtijd moet na de begintijd liggen.' };
      windows.push({ from, to });
    }
    windows.sort((a, b) => a.from.localeCompare(b.from));
    const merged = [];
    for (const w of windows) {
      const last = merged[merged.length - 1];
      if (last && w.from <= last.to) last.to = w.to > last.to ? w.to : last.to;
      else merged.push({ ...w });
    }
    if (merged.length > MAX_WINDOWS_PER_DAY) return { error: `Hooguit ${MAX_WINDOWS_PER_DAY} blokken per dag.` };
    days[String(wd)] = merged;
  }
  return { value: days };
}

/** Blokken van één weekdag; `null` als de trainer niets heeft ingevuld (dan geen beperking). */
export function windowsOn(availability, weekday) {
  if (!availability || typeof availability !== 'object') return null;
  const list = availability[String(weekday)];
  return Array.isArray(list) ? list : [];
}

/** Valt dit moment helemaal binnen een blok van die dag? Zonder ingevulde beschikbaarheid: altijd ja. */
export function withinAvailability(availability, slot) {
  const windows = windowsOn(availability, slot.weekday);
  if (windows === null) return true;
  return windows.some((w) => slot.startTime >= w.from && slot.endTime <= w.to);
}
