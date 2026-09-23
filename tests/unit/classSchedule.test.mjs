import { describe, expect, it } from 'vitest';
import {
  classFieldUpdates,
  classIdForOccurrence,
  expectedIdsForSchedule,
  missingOccurrences,
  occurrencesForSchedule,
  staleGeneratedClasses,
  standingAppliesOn,
  standingBookingId,
  inStandingSeries,
  weekdayOf,
} from '../../api/_lib/classSchedule.mjs';

// Donderdag 2026-09-24, voor een voorspelbaar vertrekpunt (weekday-tabel: zo=0 .. za=6).
const THURSDAY = '2026-09-24';

describe('lesrooster: id per moment', () => {
  it('is deterministisch en uniek per lessoort, dag en tijd', () => {
    expect(classIdForOccurrence('ct_1', '2026-09-24', '19:00')).toBe('cls_gen_ct_1_2026-09-24_1900');
    expect(classIdForOccurrence('ct_1', '2026-09-24', '19:00')).toBe(classIdForOccurrence('ct_1', '2026-09-24', '19:00'));
    expect(classIdForOccurrence('ct_1', '2026-09-24', '19:00')).not.toBe(classIdForOccurrence('ct_1', '2026-10-01', '19:00'));
  });
});

describe('lesrooster: id per "elke week"-inschrijving', () => {
  it('is deterministisch en uniek per lessoort, sporter en weekmoment', () => {
    expect(standingBookingId('ct_1', 'u1', 4, '19:00')).toBe('sb_ct_1_u1_4_1900');
    expect(standingBookingId('ct_1', 'u1', 4, '19:00')).toBe(standingBookingId('ct_1', 'u1', 4, '19:00'));
    expect(standingBookingId('ct_1', 'u1', 4, '19:00')).not.toBe(standingBookingId('ct_1', 'u1', 1, '19:00'));
    expect(standingBookingId('ct_1', 'u1', 4, '19:00')).not.toBe(standingBookingId('ct_1', 'u2', 4, '19:00'));
  });
});

describe('lesrooster: momenten uit het schema', () => {
  it('levert precies één moment per week voor één weekmoment', () => {
    const schedule = [{ weekday: 4, startTime: '19:00', endTime: '20:00' }]; // donderdag
    const out = occurrencesForSchedule(schedule, THURSDAY, 3);
    expect(out).toEqual([
      { date: '2026-09-24', startTime: '19:00', endTime: '20:00' },
      { date: '2026-10-01', startTime: '19:00', endTime: '20:00' },
      { date: '2026-10-08', startTime: '19:00', endTime: '20:00' },
    ]);
  });

  it('telt vandaag mee als het de juiste weekdag is', () => {
    const out = occurrencesForSchedule([{ weekday: 4, startTime: '19:00', endTime: '20:00' }], THURSDAY, 1);
    expect(out[0].date).toBe(THURSDAY);
  });

  it('combineert meerdere weekmomenten van dezelfde lessoort, elk met hun eigen eindtijd', () => {
    const schedule = [
      { weekday: 4, startTime: '19:00', endTime: '20:30' }, // donderdag, 90 min
      { weekday: 1, startTime: '18:00', endTime: '18:45' }, // maandag, 45 min
    ];
    const out = occurrencesForSchedule(schedule, THURSDAY, 2);
    // 14 dagen vanaf donderdag 24-09: twee donderdagen en twee maandagen vallen erbinnen.
    expect(out).toEqual([
      { date: '2026-09-24', startTime: '19:00', endTime: '20:30' },
      { date: '2026-09-28', startTime: '18:00', endTime: '18:45' },
      { date: '2026-10-01', startTime: '19:00', endTime: '20:30' },
      { date: '2026-10-05', startTime: '18:00', endTime: '18:45' },
    ]);
  });

  it('geeft niets terug zonder weekmomenten', () => {
    expect(occurrencesForSchedule([], THURSDAY, 4)).toEqual([]);
  });
});

describe('lesrooster: wat nog ontbreekt', () => {
  it('laat een moment weg zodra het al bestaat (gemaakt of afgelast, maakt niet uit)', () => {
    const schedule = [{ weekday: 4, startTime: '19:00', endTime: '20:00' }];
    const existing = new Set([classIdForOccurrence('ct_1', '2026-09-24', '19:00')]);
    const out = missingOccurrences('ct_1', schedule, THURSDAY, 2, existing);
    expect(out).toEqual([{ date: '2026-10-01', startTime: '19:00', endTime: '20:00' }]);
  });

  it('geeft alles terug als er nog niets bestaat', () => {
    const schedule = [{ weekday: 4, startTime: '19:00', endTime: '20:00' }];
    const out = missingOccurrences('ct_1', schedule, THURSDAY, 2, new Set());
    expect(out).toHaveLength(2);
  });
});

describe('lesrooster: verouderde lessen opruimen', () => {
  const schedule = [{ weekday: 4, startTime: '19:15', endTime: '20:15' }];
  const expected = new Map([['ct_1', expectedIdsForSchedule('ct_1', schedule, THURSDAY, 2)]]);
  const cls = (id, date, extra = {}) => ({ id, classTypeId: 'ct_1', date, bookedCount: 0, waitlistCount: 0, ...extra });

  it('laat lessen staan die het huidige schema oplevert', () => {
    const ok = cls(classIdForOccurrence('ct_1', '2026-09-24', '19:15'), '2026-09-24');
    expect(staleGeneratedClasses([ok], expected, THURSDAY)).toEqual({ remove: [], keepBooked: [] });
  });

  it('haalt een verschoven moment zonder inschrijvingen weg, en houdt er een met inschrijvingen', () => {
    const empty = cls(classIdForOccurrence('ct_1', '2026-09-24', '20:00'), '2026-09-24');
    const booked = cls(classIdForOccurrence('ct_1', '2026-10-01', '20:00'), '2026-10-01', { bookedCount: 2 });
    const waiting = cls(classIdForOccurrence('ct_1', '2026-10-08', '20:00'), '2026-10-08', { waitlistCount: 1 });
    const out = staleGeneratedClasses([empty, booked, waiting], expected, THURSDAY);
    expect(out.remove.map((c) => c.id)).toEqual([empty.id]);
    expect(out.keepBooked.map((c) => c.id)).toEqual([booked.id, waiting.id]);
  });

  it('ruimt alles van een verwijderde lessoort op, ook handmatig geplande lessen', () => {
    const gone = { ...cls(classIdForOccurrence('ct_2', '2026-09-24', '19:00'), '2026-09-24'), classTypeId: 'ct_2' };
    const goneManual = { ...cls('cls_manual', '2026-09-25'), classTypeId: 'ct_2' };
    expect(staleGeneratedClasses([gone, goneManual], expected, THURSDAY).remove).toEqual([gone, goneManual]);
  });

  it('blijft af van het verleden en van handmatig geplande lessen', () => {
    const past = cls(classIdForOccurrence('ct_1', '2026-09-17', '20:00'), '2026-09-17');
    const manual = cls('cls_abc', '2026-09-24');
    expect(staleGeneratedClasses([past, manual], expected, THURSDAY)).toEqual({ remove: [], keepBooked: [] });
  });

  it('zonder schema verwacht het niets meer', () => {
    expect(expectedIdsForSchedule('ct_1', [], THURSDAY, 2).size).toBe(0);
  });
});

describe('lesrooster: lessoort-wijzigingen doorzetten', () => {
  const ct = { name: 'Boksen', room: 'Zaal 1', description: null, sessionKind: 'group' };

  it('geeft alleen de velden die echt anders zijn', () => {
    const existing = { title: 'boksen', endTime: '21:00', room: 'Zaal 1', description: null, sessionKind: 'group', capacity: 12 };
    expect(classFieldUpdates(existing, ct, '20:15')).toEqual({ title: 'Boksen', endTime: '20:15' });
  });

  it('geeft null als alles al klopt', () => {
    const existing = { title: 'Boksen', endTime: '20:15', room: 'Zaal 1', description: null, sessionKind: 'group' };
    expect(classFieldUpdates(existing, ct, '20:15')).toBeNull();
  });
});

describe('vaste lessen: welke datum telt mee', () => {
  const sb = (extra = {}) => ({ classTypeId: 'ct_1', weekday: 6, startTime: '09:00', active: true, ...extra });

  it('herkent de lessen van hetzelfde weekmoment', () => {
    expect(weekdayOf('2026-09-26')).toBe(6); // zaterdag
    expect(inStandingSeries({ classTypeId: 'ct_1', date: '2026-09-26', startTime: '09:00' }, sb())).toBe(true);
    expect(inStandingSeries({ classTypeId: 'ct_1', date: '2026-09-26', startTime: '10:00' }, sb())).toBe(false);
    expect(inStandingSeries({ classTypeId: 'ct_1', date: '2026-09-27', startTime: '09:00' }, sb())).toBe(false);
    expect(inStandingSeries({ classTypeId: 'ct_2', date: '2026-09-26', startTime: '09:00' }, sb())).toBe(false);
  });

  it('telt pas vanaf de startdatum, en niet als hij uit staat', () => {
    expect(standingAppliesOn(sb({ startDate: '2026-10-03' }), '2026-09-26')).toBe(false);
    expect(standingAppliesOn(sb({ startDate: '2026-10-03' }), '2026-10-03')).toBe(true);
    expect(standingAppliesOn(sb({ active: false }), '2026-10-03')).toBe(false);
  });

  it('slaat een pauze over, met of zonder einddatum', () => {
    const paused = sb({ pausedFrom: '2026-10-10', pausedUntil: '2026-10-17' });
    expect(standingAppliesOn(paused, '2026-10-03')).toBe(true);
    expect(standingAppliesOn(paused, '2026-10-10')).toBe(false);
    expect(standingAppliesOn(paused, '2026-10-17')).toBe(false);
    expect(standingAppliesOn(paused, '2026-10-24')).toBe(true);
    expect(standingAppliesOn(sb({ pausedFrom: '2026-10-10', pausedUntil: null }), '2027-01-02')).toBe(false);
  });
});
