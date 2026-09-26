/**
 * Regels rond boeken, afmelden en de wachtlijst, als losse pure functies zodat ze te testen zijn
 * zonder database. Gebruikt door api/booking.mjs.
 *
 * Afspraken van de studio (Kenny):
 * - Te laat afmelden (binnen het gratis-venster) kost je de credit; afmelden kan wel altijd, zodat
 *   de plek vrijkomt.
 * - Bedenktijd: binnen een uur na het boeken kun je altijd gratis afmelden (per ongeluk geboekt).
 * - De wachtlijst schuift niet automatisch door. Komt er een plek vrij, dan krijgt iedereen op de
 *   wachtlijst een melding en mag zich aanmelden; wie het eerst is, heeft de plek. Een uur lang
 *   (of tot de les begint) is die plek alleen voor de wachtlijst; daarna voor iedereen.
 */

/** Bedenktijd na het boeken: zo lang is afmelden altijd gratis. */
export const BOOKING_GRACE_MINUTES = 60;

/** Zo lang heeft de wachtlijst voorrang op een vrijgekomen plek. */
export const WAITLIST_PRIORITY_MINUTES = 60;

/**
 * Gratis-afmeldvenster van de studio in uur. Ook 0 is een geldige keuze (tot de start gratis);
 * alleen zonder (geldige) instelling geldt de standaard van de server.
 */
export function freeCancelHoursOf(policy, fallback) {
  const raw = policy?.freeCancelHours;
  if (raw === null || raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * Krijgt iemand die afmeldt zijn credit terug?
 * - Niets betaald: niets terug te geven.
 * - Les afgelast: altijd terug.
 * - Ruim op tijd (meer uren dan het venster): terug.
 * - Anders alleen binnen de bedenktijd na het boeken, en alleen als de les nog niet begonnen is.
 */
export function refundOnCancel({ spent, classCancelled, hoursLeft, freeCancelHours, minutesSinceBooked }) {
  if (!(spent > 0)) return false;
  if (classCancelled) return true;
  if (hoursLeft >= freeCancelHours) return true;
  return hoursLeft > 0 && minutesSinceBooked >= 0 && minutesSinceBooked <= BOOKING_GRACE_MINUTES;
}

/** Wanneer telt een reservering als "geboekt" voor de bedenktijd: bij aanmelden vanaf de wachtlijst het moment van aanmelden. */
export function bookedAtOf(booking) {
  return String(booking?.claimedAt || booking?.promotedAt || booking?.createdAt || '');
}

/** Minuten sinds een ISO-tijdstip; zonder geldig tijdstip "heel lang geleden". */
export function minutesSince(iso, nowMs) {
  const t = Date.parse(String(iso || ''));
  return Number.isFinite(t) ? (nowMs - t) / 60_000 : Infinity;
}

/** Tot wanneer de wachtlijst voorrang heeft op een plek die nu vrijkomt: een uur, maar nooit na de start. */
export function waitlistPriorityUntil(nowMs, startsAtMs) {
  const until = nowMs + WAITLIST_PRIORITY_MINUTES * 60_000;
  return new Date(Number.isFinite(startsAtMs) ? Math.min(until, startsAtMs) : until).toISOString();
}

/** Heeft de wachtlijst op dit moment voorrang op de vrije plekken van deze les? */
export function waitlistHasPriority(cls, nowMs) {
  if (!((Number(cls?.waitlistCount) || 0) > 0)) return false;
  const until = Date.parse(String(cls?.waitlistPriorityUntil || ''));
  return Number.isFinite(until) && until > nowMs;
}

/**
 * Waar komt een nieuwe reservering terecht (iemand die nog niet op de wachtlijst staat)?
 * Vol, of er is een vrije plek maar die is nu voor de wachtlijst: dan op de wachtlijst.
 */
export function placeNewBooking(cls, nowMs) {
  const capacity = Number(cls?.capacity) || 0;
  const booked = Number(cls?.bookedCount) || 0;
  if (booked >= capacity) return 'waitlist';
  return waitlistHasPriority(cls, nowMs) ? 'waitlist' : 'booked';
}

/** Is er een plek vrij die iemand die al op de wachtlijst staat nu kan pakken? */
export function spotFreeForWaitlister(cls) {
  return (Number(cls?.bookedCount) || 0) < (Number(cls?.capacity) || 0);
}

/**
 * Plek op de wachtlijst (1 = eerste), op volgorde van aanmelden. Alleen de positie, niet wie er
 * voor of na staat.
 */
export function waitlistPosition(entries, bookingId) {
  const sorted = [...entries].sort(
    (a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || String(a.id).localeCompare(String(b.id))
  );
  const i = sorted.findIndex((e) => e.id === bookingId);
  return i >= 0 ? i + 1 : null;
}
