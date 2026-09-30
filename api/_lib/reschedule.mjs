/**
 * Verzetten na afmelden. Meldt een sporter zich op tijd af voor een PT-moment (credit terug), dan
 * biedt de app meteen andere momenten bij dezelfde trainer aan: de komende twee weken, binnen de
 * beschikbaarheid van de trainer (of de openingstijden van de studio als die niets invulde), waar
 * trainer en ruimte vrij zijn. Momenten die direct aansluiten op een andere les van de trainer
 * komen eerst: zo vult de trainer hele dagdelen in plaats van losse gaten. De sporter vraagt aan,
 * de trainer keurt goed (api/booking.mjs: rescheduleOptions, requestReschedule, answerReschedule).
 *
 * Pure functies zonder Firestore, zodat server en tests hetzelfde rekenen.
 */
import { windowsOn } from './availability.mjs';
import { DEFAULT_HOURS, fromMin, toMin } from './scheduleConflicts.mjs';
import { weekdayOf } from './classSchedule.mjs';

/** Zoveel dagen vooruit (vandaag meegeteld) bieden we momenten aan. */
export const RESCHEDULE_DAYS = 14;
/** Zo lang van tevoren moet een nieuw moment minstens liggen, zodat de trainer kan bevestigen. */
export const MIN_LEAD_MINUTES = 120;
/** Zoveel aansluitende momenten tonen we bovenaan. */
export const MAX_ADJACENT = 6;
const STEP_MIN = 30;

export const rescheduleRequestId = (fromClassId) => `rr_${fromClassId}`;
export const rescheduledClassId = (requestId) => `cls_rs_${requestId}`;

const roomKey = (room) => String(room ?? '').trim().toLowerCase() || null;

/** Mag deze afgemelde les verzet worden? Alleen een persoonlijk PT-moment met een trainer. */
export function canRescheduleClass(cls, userId) {
  return !!cls && !!cls.trainerId && !cls.privateForGroup && !!userId && cls.privateFor === userId;
}

/**
 * Wat bezet is op een dag: lessen (niet afgelast) van deze trainer of in deze ruimte, en openstaande
 * verzoeken voor deze trainer. `items`: [{ date, startTime, endTime, trainerId, room, cancelledAt }].
 */
export function busyByDate(items, { trainerId, room }) {
  const rk = roomKey(room);
  const out = {};
  for (const it of items) {
    if (!it || it.cancelledAt) continue;
    const mine = !!trainerId && it.trainerId === trainerId;
    const sameRoom = !!rk && roomKey(it.room) === rk;
    if (!mine && !sameRoom) continue;
    (out[it.date] ??= []).push({ startTime: it.startTime, endTime: it.endTime, trainer: mine });
  }
  return out;
}

/**
 * Vrije momenten voor een nieuw PT-moment.
 * - `dates`: de dagen om te bekijken ("YYYY-MM-DD").
 * - `duration`: lengte in minuten (zoals de afgemelde les).
 * - `availability`: beschikbaarheid van de trainer (per weekdag blokken) of null.
 * - `hours`: openingstijden van de studio ({ firstStart, lastStart }), als de trainer niets invulde.
 * - `busy`: uitkomst van busyByDate.
 * - `tooSoon(date, startTime)`: ligt dit moment te dichtbij (of in het verleden)?
 * - `exclude`: het afgemelde moment zelf ({ date, startTime }), dat bieden we niet opnieuw aan.
 *
 * Geeft `{ adjacent, days }`: bovenaan de aansluitende momenten (vroegste eerst, hooguit 6), en per
 * dag alle vrije tijden (aansluitend gemarkeerd).
 */
export function rescheduleOptions({ dates, duration, availability = null, hours = DEFAULT_HOURS, busy = {}, tooSoon = () => false, exclude = null }) {
  const days = [];
  if (!(duration > 0)) return { adjacent: [], days };
  for (const date of dates) {
    const weekday = weekdayOf(date);
    const windows = windowsOn(availability, weekday);
    const ranges =
      windows === null
        ? [{ first: toMin(hours.firstStart), lastStart: toMin(hours.lastStart), end: 24 * 60 }]
        : windows.map((w) => ({ first: toMin(w.from), lastStart: toMin(w.to) - duration, end: toMin(w.to) }));
    const taken = (busy[date] ?? []).map((b) => ({ start: toMin(b.startTime), end: toMin(b.endTime), trainer: b.trainer !== false }));
    // Aansluiten telt alleen op lessen van de trainer zelf, niet op iemand anders in dezelfde ruimte.
    const edges = new Set(taken.filter((b) => b.trainer).flatMap((b) => [b.start, b.end]));
    const seen = new Set();
    const times = [];
    const consider = (start) => {
      if (seen.has(start) || start < 0 || start + duration > 24 * 60) return;
      seen.add(start);
      if (!ranges.some((r) => start >= r.first && start <= r.lastStart && start + duration <= r.end)) return;
      if (taken.some((b) => start < b.end && b.start < start + duration)) return;
      const startTime = fromMin(start);
      if (exclude && exclude.date === date && exclude.startTime === startTime) return;
      if (tooSoon(date, startTime)) return;
      times.push({ date, startTime, endTime: fromMin(start + duration), adjacent: edges.has(start) || edges.has(start + duration) });
    };
    for (const e of edges) {
      consider(e);
      consider(e - duration);
    }
    for (const r of ranges) for (let s = r.first; s <= r.lastStart; s += STEP_MIN) consider(s);
    times.sort((a, b) => toMin(a.startTime) - toMin(b.startTime));
    if (times.length) days.push({ date, times });
  }
  const adjacent = days.flatMap((d) => d.times.filter((t) => t.adjacent)).slice(0, MAX_ADJACENT);
  return { adjacent, days };
}

/** Is dit moment (nog) een van de aangeboden opties? */
export function isOffered(options, date, startTime) {
  return options.days.some((d) => d.date === date && d.times.some((t) => t.startTime === startTime));
}
