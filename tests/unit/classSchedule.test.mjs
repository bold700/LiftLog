import { describe, expect, it } from 'vitest';
import { classIdForOccurrence, missingOccurrences, occurrencesForSchedule } from '../../api/_lib/classSchedule.mjs';

// Donderdag 2026-09-24, voor een voorspelbaar vertrekpunt (weekday-tabel: zo=0 .. za=6).
const THURSDAY = '2026-09-24';

describe('lesrooster: id per moment', () => {
  it('is deterministisch en uniek per lessoort, dag en tijd', () => {
    expect(classIdForOccurrence('ct_1', '2026-09-24', '19:00')).toBe('cls_gen_ct_1_2026-09-24_1900');
    expect(classIdForOccurrence('ct_1', '2026-09-24', '19:00')).toBe(classIdForOccurrence('ct_1', '2026-09-24', '19:00'));
    expect(classIdForOccurrence('ct_1', '2026-09-24', '19:00')).not.toBe(classIdForOccurrence('ct_1', '2026-10-01', '19:00'));
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
