/**
 * Regels rond boeken, afmelden en de wachtlijst, als losse pure functies zodat ze te testen zijn
 * zonder database. Gebruikt door api/booking.mjs.
 *
 * Afspraken van de studio (Kenny):
 * - Te laat afmelden (binnen het gratis-venster) kost je de credit; afmelden kan wel altijd, zodat
 *   de plek vrijkomt.
 * - Bedenktijd: binnen een uur na het boeken kun je altijd gratis afmelden (per ongeluk geboekt).
 * - Valt er iemand af, dan schuift de eerste van de wachtlijst meteen door en betaalt zijn credit.
 *   Die krijgt een melding en heeft (via de bedenktijd) een uur om gratis af te melden; dan schuift
 *   de volgende door, enzovoort. Wie niet genoeg credits heeft, wordt overgeslagen.
 */

/** Bedenktijd na het boeken (of doorschuiven): zo lang is afmelden altijd gratis. */
export const BOOKING_GRACE_MINUTES = 60;

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

/** Waar komt een nieuwe reservering terecht: een plek als die er is, anders de wachtlijst. */
export function placeNewBooking(cls) {
  return (Number(cls?.bookedCount) || 0) >= (Number(cls?.capacity) || 0) ? 'waitlist' : 'booked';
}

/**
 * Een vrije plek met iemand op de wachtlijst kan alleen ontstaan als niemand op de wachtlijst genoeg
 * credits had om door te schuiven. Wie dan credits bijkoopt, kan zich alsnog aanmelden.
 */
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

/**
 * Wie schuift er door als er een plek vrijkomt? De eerste op de wachtlijst (volgorde van aanmelden)
 * die de les kan betalen; wie te weinig credits heeft, wordt overgeslagen en blijft op de lijst.
 * candidates: [{ id, createdAt, balance, cost }]
 */
export function pickPromotion(candidates) {
  const sorted = [...candidates].sort(
    (a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || String(a.id).localeCompare(String(b.id))
  );
  return sorted.find((c) => (Number(c.balance) || 0) >= (Number(c.cost) || 0)) ?? null;
}
