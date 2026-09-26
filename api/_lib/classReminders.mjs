/**
 * Lesherinneringen: wie krijgt er vanavond een seintje over de lessen van morgen, en met welke tekst?
 *
 * Puur (geen Firestore), zodat het getest kan worden; het lezen en versturen staat in
 * api/booking.mjs (`classReminders`). Eén melding per persoon, ook als iemand morgen meerdere
 * lessen heeft: twee piepjes voor twee lessen op één dag is er één te veel.
 */

/** Datum (YYYY-MM-DD) in Nederlandse tijd, `offsetDays` dagen na `now`. Lessen staan in lokale tijd. */
export function amsterdamDate(now, offsetDays = 0) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' }).format(now);
  const [y, m, d] = today.split('-').map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + offsetDays));
  return shifted.toISOString().slice(0, 10);
}

const AMS_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Amsterdam',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Hoeveel ms de Nederlandse klok op moment `ms` voorloopt op UTC (1 uur in de winter, 2 in de zomer). */
function amsterdamOffsetMs(ms) {
  const p = Object.fromEntries(AMS_PARTS.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - ms;
}

/**
 * Het moment waarop een les begint: datum (YYYY-MM-DD) en tijd (HH:MM) zijn Nederlandse tijd.
 * `new Date("2026-09-26T07:00:00")` zou op de server (UTC) 07:00 UTC zijn, dus 09:00 hier.
 * @returns {Date|null}
 */
export function amsterdamDateTime(date, time = '00:00') {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date ?? ''));
  const t = /^(\d{1,2}):(\d{2})/.exec(String(time ?? '00:00'));
  if (!m || !t) return null;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +t[1], +t[2]);
  // Twee keer: rond de wisseling van zomer- naar wintertijd hangt de verschuiving van het moment zelf af.
  let ms = wall - amsterdamOffsetMs(wall);
  ms = wall - amsterdamOffsetMs(ms);
  return new Date(ms);
}

/** "09:00" → "9:00": zo schrijf je een tijd in een bericht. */
function shortTime(hhmm) {
  const [h, m] = String(hhmm || '').split(':');
  if (!h || m === undefined) return String(hhmm || '');
  return `${Number(h)}:${m}`;
}

/**
 * @param {Array<{ id: string, title?: string, startTime?: string, room?: string|null, cancelledAt?: unknown }>} classes
 *   lessen van de dag waarover we herinneren
 * @param {Array<{ id: string, classId: string, userId: string, status: string, reminderSentAt?: unknown }>} bookings
 *   boekingen van die lessen
 * @returns {Array<{ userId: string, bookingIds: string[], title: string, body: string }>}
 */
export function buildClassReminders(classes, bookings) {
  const byId = new Map(classes.filter((c) => !c.cancelledAt).map((c) => [c.id, c]));
  /** @type {Map<string, { bookingIds: string[], classes: typeof classes }>} */
  const perUser = new Map();

  for (const b of bookings) {
    // Alleen echte plekken: wachtlijst of afgemeld krijgt geen "tot morgen".
    if (b.status !== 'booked' || b.reminderSentAt) continue;
    const cls = byId.get(b.classId);
    if (!cls || !b.userId) continue;
    const entry = perUser.get(b.userId) ?? { bookingIds: [], classes: [] };
    entry.bookingIds.push(b.id);
    if (!entry.classes.some((c) => c.id === cls.id)) entry.classes.push(cls);
    perUser.set(b.userId, entry);
  }

  const out = [];
  for (const [userId, { bookingIds, classes: list }] of perUser) {
    list.sort((a, b) => String(a.startTime || '').localeCompare(String(b.startTime || '')));
    const afmelden = 'Kun je niet? Meld je op tijd af in de app.';
    if (list.length === 1) {
      const c = list[0];
      out.push({
        userId,
        bookingIds,
        title: `Morgen: ${c.title || 'Les'} om ${shortTime(c.startTime)}`,
        body: c.room ? `In ${c.room}. ${afmelden}` : afmelden,
      });
    } else {
      out.push({
        userId,
        bookingIds,
        title: `Morgen ${list.length} lessen`,
        body: `${list.map((c) => `${c.title || 'Les'} ${shortTime(c.startTime)}`).join(' · ')}. ${afmelden}`,
      });
    }
  }
  return out;
}
