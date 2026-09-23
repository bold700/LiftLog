import { describe, it, expect } from 'vitest';
import { describeStandingResult, seriesOccurrences } from '../../src/utils/standingSeries';
import type { Booking, StudioClass } from '../../src/services/classService';
import type { StandingBooking } from '../../src/types';

// Zaterdagen: 3, 10, 17, 24 oktober 2026.
const cls = (id: string, date: string, extra: Partial<StudioClass> = {}) =>
  ({ id, orgId: 'o', title: 'HIIT', date, startTime: '09:00', endTime: '10:00', classTypeId: 'ct', cancelledAt: null, ...extra }) as StudioClass;
const bk = (classId: string, status: Booking['status'] = 'booked') => ({ id: `b_${classId}`, orgId: 'o', classId, userId: 'u', status, creditsSpent: 1, createdAt: '' }) as Booking;
const sb = (extra: Partial<StandingBooking> = {}) =>
  ({ id: 's', orgId: 'o', userId: 'u', classTypeId: 'ct', weekday: 6, startTime: '09:00', active: true, startDate: null, pausedFrom: null, pausedUntil: null, lastOutcome: null, lastOutcomeDate: null, createdAt: '', updatedAt: '', ...extra }) as StandingBooking;

const classes = [
  cls('a', '2026-10-03'),
  cls('b', '2026-10-10'),
  cls('c', '2026-10-17', { cancelledAt: '2026-09-01' }),
  cls('d', '2026-10-24'),
  cls('x', '2026-10-03', { startTime: '18:00' }),
  cls('oud', '2026-09-26'),
];

describe('seriesOccurrences', () => {
  it('alleen dit weekmoment, vanaf vandaag, oudste eerst, met status', () => {
    const out = seriesOccurrences(sb({ pausedFrom: '2026-10-24', pausedUntil: '2026-10-24' }), classes, [bk('a'), bk('b', 'waitlist'), bk('x')], '2026-10-01');
    expect(out.map((o) => [o.cls.id, o.status])).toEqual([
      ['a', 'booked'],
      ['b', 'waitlist'],
      ['c', 'cancelledClass'],
      ['d', 'paused'],
    ]);
  });
  it('vóór de startdatum en zonder boeking: nog niet begonnen; daarna niet geboekt = overgeslagen', () => {
    const out = seriesOccurrences(sb({ startDate: '2026-10-10' }), classes, [], '2026-10-01', 2);
    expect(out.map((o) => o.status)).toEqual(['notStarted', 'skipped']);
  });
  it('zelf afgemeld ("deze keer niet") is iets anders dan niet geboekt', () => {
    const cancelled = { ...bk('a'), status: 'cancelled' } as Booking;
    expect(seriesOccurrences(sb(), classes, [cancelled], '2026-10-01', 2).map((o) => o.status)).toEqual(['optedOut', 'skipped']);
  });
  it('een PT-moment dat van het rooster ging omdat het lid niet kwam, is afgemeld en niet afgelast', () => {
    const pt = [cls('p', '2026-10-03', { privateFor: 'u', cancelledAt: '2026-09-30', autoCancelled: true })];
    expect(seriesOccurrences(sb(), pt, [], '2026-10-01')[0].status).toBe('optedOut');
    expect(seriesOccurrences(sb({ pausedFrom: '2026-10-01' }), pt, [], '2026-10-01')[0].status).toBe('paused');
  });
});

describe('describeStandingResult', () => {
  it('vat samen wat er gebeurde', () => {
    expect(describeStandingResult({ booked: 3, skippedFull: 0, skippedNoCredits: 1 })).toBe('3 lessen geboekt · 1 les niet geboekt (geen credits).');
    expect(describeStandingResult({ cancelled: 2, refunded: 2 })).toBe('2 lessen afgemeld, allemaal met credit terug.');
    expect(describeStandingResult({ cancelled: 1, refunded: 0 })).toBe('1 les afgemeld, geen credit terug (binnen de afmeldtermijn).');
    expect(describeStandingResult({})).toBe('Opgeslagen.');
  });
});
