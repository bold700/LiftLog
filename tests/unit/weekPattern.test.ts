import { describe, expect, it } from 'vitest';
import { weekIndex as serverWeekIndex } from '../../api/_lib/classSchedule.mjs';
import { nlCount, onPatternWeek, weekIndex, weekWeight } from '../../src/utils/weekPattern';
import { inSeries } from '../../src/utils/standingSeries';

describe('weekPattern (app)', () => {
  it('telt de weken net als de server', () => {
    for (const d of ['1970-01-04', '1970-01-05', '2026-03-29', '2026-10-01', '2027-01-01']) expect(weekIndex(d)).toBe(serverWeekIndex(d));
  });

  it('om de week: alleen de eigen weken horen bij de reeks', () => {
    const p = { everyWeeks: 2, weekParity: ((weekIndex('2026-10-01') % 2) + 2) % 2 };
    expect(onPatternWeek(p, '2026-10-01')).toBe(true);
    expect(onPatternWeek(p, '2026-10-08')).toBe(false);
    const s = { classTypeId: 'ct', weekday: 4, startTime: '18:00', ...p };
    expect(inSeries({ classTypeId: 'ct', date: '2026-10-08', startTime: '18:00' }, s)).toBe(false);
    expect(inSeries({ classTypeId: 'ct', date: '2026-10-15', startTime: '18:00' }, s)).toBe(true);
  });

  it('telt als een halve voor x per week', () => {
    expect(weekWeight({ everyWeeks: 2 })).toBe(0.5);
    expect(weekWeight({})).toBe(1);
    expect(nlCount(1.5)).toBe('1,5');
    expect(nlCount(2)).toBe('2');
  });
});
