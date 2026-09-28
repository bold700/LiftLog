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
 *   de volgende door, enzovoort.
 * - Heeft de eerste op de wachtlijst te weinig credits, dan wordt die niet meteen overgeslagen: de
 *   plek wordt een uur voor hem vastgehouden (melding aan hem én aan trainer/beheer), zodat hij
 *   credits kan kopen of de trainer kan ingrijpen. Pas daarna gaat de plek naar de volgende.
 * Het systeem ondersteunt; de trainer beslist en kan altijd ingrijpen.
 */

/** Zo lang wordt een plek vastgehouden voor de eerste op de wachtlijst die nog credits moet kopen. */
export const HOLD_MINUTES = 60;

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
 * - De studio meldt iemand af en heeft "credit altijd terug bij afmelden door de studio" aan: terug
 *   (zolang de les nog niet begonnen is). Standaard uit: dan geldt hetzelfde als voor de sporter.
 * - Anders alleen binnen de bedenktijd na het boeken, en alleen als de les nog niet begonnen is.
 */
export function refundOnCancel({ spent, classCancelled, hoursLeft, freeCancelHours, minutesSinceBooked, byStudio = false, studioCancelRefund = false }) {
  if (!(spent > 0)) return false;
  if (classCancelled) return true;
  if (hoursLeft >= freeCancelHours) return true;
  if (byStudio && studioCancelRefund && hoursLeft > 0) return true;
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
 * Wat gebeurt er met een vrije plek? Op volgorde van de wachtlijst:
 * - kan betalen → doorschuiven ('promote');
 * - kan niet betalen en had voor deze les nog geen kans → plek vasthouden ('hold');
 * - kon eerder al niet betalen (kans verlopen) en nog steeds niet → overslaan.
 * candidates: [{ id, createdAt, balance, cost, offerExpired }]
 */
export function chooseForFreeSpot(candidates) {
  const sorted = [...candidates].sort(
    (a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || String(a.id).localeCompare(String(b.id))
  );
  for (const c of sorted) {
    if ((Number(c.balance) || 0) >= (Number(c.cost) || 0)) return { kind: 'promote', candidate: c };
    if (!c.offerExpired) return { kind: 'hold', candidate: c };
  }
  return null;
}

/** Tot wanneer een plek wordt vastgehouden: een uur, maar nooit na de start van de les. */
export function holdUntil(nowMs, startsAtMs) {
  const until = nowMs + HOLD_MINUTES * 60_000;
  return new Date(Number.isFinite(startsAtMs) ? Math.min(until, startsAtMs) : until).toISOString();
}

/** Wordt er nu een plek vastgehouden voor iemand anders dan deze persoon? */
export function heldForSomeoneElse(cls, userId, nowMs) {
  if (!cls?.holdUserId) return false;
  const until = Date.parse(String(cls.holdUntil || ''));
  return Number.isFinite(until) && until > nowMs && cls.holdUserId !== userId;
}

/** Is de vastgehouden plek verlopen (en moet hij door naar de volgende)? */
export function holdExpired(cls, nowMs) {
  if (!cls?.holdUserId) return false;
  const until = Date.parse(String(cls.holdUntil || ''));
  return !Number.isFinite(until) || until <= nowMs;
}
