import { describe, expect, it } from 'vitest';
import { absenceCovers, absenceLabel, absenceOn, busyReason, cleanAbsence, nthOfMonth, substituteOptions } from '../../api/_lib/absence.mjs';

describe('afwezigheid trainer', () => {
  it('de hoeveelste weekdag van de maand, en de laatste', () => {
    // Oktober 2026: do 1, 8, 15, 22, 29.
    expect(nthOfMonth('2026-10-01')).toEqual({ nth: 1, last: false });
    expect(nthOfMonth('2026-10-22')).toEqual({ nth: 4, last: false });
    expect(nthOfMonth('2026-10-29')).toEqual({ nth: 5, last: true });
    expect(nthOfMonth('2026-10-25')).toEqual({ nth: 4, last: true });
  });

  it('elke 1e donderdag van de maand', () => {
    const a = { kind: 'monthly', from: '2026-10-01', until: null, nth: 1, weekday: 4 };
    expect(absenceCovers(a, '2026-10-01')).toBe(true);
    expect(absenceCovers(a, '2026-10-08')).toBe(false);
    expect(absenceCovers(a, '2026-11-05')).toBe(true);
    expect(absenceCovers(a, '2026-11-06')).toBe(false);
    expect(absenceCovers({ ...a, until: '2026-10-31' }, '2026-11-05')).toBe(false);
    expect(absenceCovers({ ...a, nth: -1 }, '2026-10-29')).toBe(true);
    expect(absenceCovers({ ...a, nth: -1 }, '2026-10-22')).toBe(false);
    expect(absenceLabel(a)).toBe('elke 1e donderdag van de maand');
    expect(absenceLabel({ ...a, nth: -1 })).toBe('elke laatste donderdag van de maand');
  });

  it('losse dagen: van t/m', () => {
    const a = { kind: 'dates', from: '2026-10-05', until: '2026-10-09', trainerId: 't1' };
    expect(absenceCovers(a, '2026-10-04')).toBe(false);
    expect(absenceCovers(a, '2026-10-07')).toBe(true);
    expect(absenceOn([a], 't1', '2026-10-09')).toBe(a);
    expect(absenceOn([a], 't2', '2026-10-09')).toBeNull();
    expect(absenceLabel(a)).toBe('05-10-2026 t/m 09-10-2026');
  });

  it('invullen controleren', () => {
    expect(cleanAbsence({ kind: 'dates', from: '2026-10-05' }, '2026-10-01').value).toMatchObject({ from: '2026-10-05', until: '2026-10-05' });
    expect(cleanAbsence({ kind: 'dates', from: '2026-09-01', until: '2026-09-02' }, '2026-10-01').error).toMatch(/verleden/);
    expect(cleanAbsence({ kind: 'dates', from: '2026-10-01', until: '2027-12-01' }, '2026-10-01').error).toMatch(/jaar/);
    expect(cleanAbsence({ kind: 'monthly', from: '2026-10-01', nth: 1, weekday: 4 }, '2026-10-01').value).toMatchObject({ until: null, nth: 1, weekday: 4 });
  });

  it('wie kan invallen: vrij eerst, de vaste invaller bovenaan, bezet met reden', () => {
    const cls = { id: 'c1', date: '2026-10-01', startTime: '18:00', endTime: '19:00', trainerId: 'k' };
    const classes = [cls, { id: 'c2', date: '2026-10-01', startTime: '18:30', endTime: '19:30', trainerId: 's', title: 'Yoga' }];
    const trainers = [
      { userId: 'k', name: 'Kenny' },
      { userId: 's', name: 'Simone' },
      { userId: 'a', name: 'Anne' },
      { userId: 'b', name: 'Bas' },
    ];
    const availability = { b: { 4: [{ from: '06:00', to: '12:00' }] } };
    const opts = substituteOptions(cls, { trainers, absentId: 'k', preferredId: 'b', classes, absences: [], availabilityOf: (id) => availability[id] ?? null });
    expect(opts.map((o) => [o.userId, o.busy])).toEqual([
      ['a', null],
      ['b', 'niet beschikbaar'],
      ['s', 'geeft dan Yoga'],
    ]);
    expect(busyReason('a', cls, { classes, absences: [{ trainerId: 'a', kind: 'dates', from: '2026-10-01', until: '2026-10-01' }] })).toBe('afwezig');
  });
});
