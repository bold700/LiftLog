/**
 * Vaste lessen ("elke week") op Profiel: welke komende lessen horen bij een vaste les en hoe staat
 * het ermee (geboekt, wachtlijst, pauze, afgelast, niet gelukt). Puur, zodat het testbaar is.
 */
import type { Booking, StudioClass } from '../services/classService';
import type { StandingBooking } from '../types';

export type SeriesStatus = 'booked' | 'waitlist' | 'paused' | 'cancelledClass' | 'skipped' | 'notStarted';

export interface SeriesOccurrence {
  cls: StudioClass;
  booking: Booking | null;
  status: SeriesStatus;
}

const weekdayOf = (dateIso: string) => {
  const [y, m, d] = dateIso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

export function inSeries(cls: Pick<StudioClass, 'classTypeId' | 'date' | 'startTime'>, s: Pick<StandingBooking, 'classTypeId' | 'weekday' | 'startTime'>): boolean {
  return cls.classTypeId === s.classTypeId && cls.startTime === s.startTime && weekdayOf(cls.date) === s.weekday;
}

export function isPausedOn(s: Pick<StandingBooking, 'pausedFrom' | 'pausedUntil'>, date: string): boolean {
  return !!s.pausedFrom && date >= s.pausedFrom && (!s.pausedUntil || date <= s.pausedUntil);
}

/** De eerstvolgende `limit` lessen van deze vaste les vanaf `fromDate`, met hun status. */
export function seriesOccurrences(
  s: StandingBooking,
  classes: StudioClass[],
  bookings: Booking[],
  fromDate: string,
  limit = 4
): SeriesOccurrence[] {
  const active = new Map(bookings.filter((b) => b.status === 'booked' || b.status === 'waitlist').map((b) => [b.classId, b]));
  return classes
    .filter((c) => c.date >= fromDate && inSeries(c, s))
    .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`))
    .slice(0, limit)
    .map((cls) => {
      const booking = active.get(cls.id) ?? null;
      let status: SeriesStatus;
      if (cls.cancelledAt) status = 'cancelledClass';
      else if (booking) status = booking.status === 'waitlist' ? 'waitlist' : 'booked';
      else if (s.startDate && cls.date < s.startDate) status = 'notStarted';
      else if (isPausedOn(s, cls.date)) status = 'paused';
      else status = 'skipped';
      return { cls, booking, status };
    });
}

/** Korte samenvatting van wat de server deed, voor de melding. */
export function describeStandingResult(r: {
  booked?: number;
  skippedFull?: number;
  skippedNoCredits?: number;
  cancelled?: number;
  refunded?: number;
}): string {
  const parts: string[] = [];
  const n = (k: number, one: string, many: string) => (k === 1 ? one : many.replace('{n}', String(k)));
  if (r.booked) parts.push(n(r.booked, '1 les geboekt', '{n} lessen geboekt'));
  if (r.skippedFull) parts.push(n(r.skippedFull, '1 keer op de wachtlijst', '{n} keer op de wachtlijst'));
  if (r.skippedNoCredits) parts.push(n(r.skippedNoCredits, '1 les niet geboekt (geen credits)', '{n} lessen niet geboekt (geen credits)'));
  if (r.cancelled) {
    const refund = r.refunded ? `, ${r.refunded === r.cancelled ? 'allemaal' : r.refunded} met credit terug` : ', geen credit terug (binnen de afmeldtermijn)';
    parts.push(`${n(r.cancelled, '1 les afgemeld', '{n} lessen afgemeld')}${refund}`);
  }
  return parts.length ? `${parts.join(' · ')}.` : 'Opgeslagen.';
}
