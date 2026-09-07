import { describe, expect, it } from 'vitest';
import {
  todayIso,
  toIsoDate,
  addWeeks,
  getWeeksBetween,
  formatExerciseDetails,
  formatWarmupSummary,
  formatCardioSummary,
  formatCooldownSummary,
  formatStretchingSummary,
} from '../../src/utils/format';

describe('datums', () => {
  it('toIsoDate gebruikt de lokale kalenderdag, niet UTC', () => {
    expect(toIsoDate(new Date(2026, 0, 5, 0, 30))).toBe('2026-01-05');
    expect(toIsoDate(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('addWeeks blijft op kalenderdagen, ook over zomertijd en jaargrens', () => {
    expect(addWeeks('2026-03-23', 1)).toBe('2026-03-30'); // zomertijd 29 maart
    expect(addWeeks('2026-12-28', 1)).toBe('2027-01-04');
    expect(addWeeks('2026-01-05', 0)).toBe('2026-01-05');
  });
  it('getWeeksBetween rondt af op hele weken', () => {
    expect(getWeeksBetween('2026-09-07', '2026-10-18')).toBe(6);
    expect(getWeeksBetween('2026-09-07', '2026-09-10')).toBe(0);
    expect(getWeeksBetween('2026-09-07', '2026-09-07')).toBe(0);
  });
});

describe('samenvattingen', () => {
  it('formatExerciseDetails laat lege delen weg', () => {
    expect(formatExerciseDetails({ weight: 80, sets: 3, reps: 10 })).toBe('80 kg · 3 sets · 10 reps');
    expect(formatExerciseDetails({ weight: 0, sets: 1, reps: 1 })).toBe('1 set · 1 rep');
    expect(formatExerciseDetails({ weight: null as unknown as number, sets: 0, reps: 0 })).toBe('');
  });
  it('Formule 7-onderdelen', () => {
    expect(formatWarmupSummary({ organisation: 'FIETSEN', durationMinutes: 8 })).toBe('FIETSEN, 8 min');
    expect(formatWarmupSummary({ organisation: null })).toBeNull();
    expect(formatWarmupSummary(null)).toBeNull();
    expect(
      formatCardioSummary({
        organisation: null,
        zones: [
          { zone: 1, organisation: 'LOPEN', durationMinutes: 10 },
          { zone: 2, organisation: null, durationMinutes: null },
        ],
      })
    ).toBe('Zone 1 LOPEN 10 min');
    expect(formatCardioSummary({ organisation: null, zones: [] })).toBeNull();
    expect(formatCooldownSummary({ organisation: 'LOPEN', durationMinutes: 5 })).toBe('LOPEN, 5 min');
    expect(formatStretchingSummary([{ muscleGroup: 'Hamstrings', stretchDurationSeconds: 30, repetitions: 2 }, { muscleGroup: ' ' }])).toBe(
      'Hamstrings 30s 2×'
    );
    expect(formatStretchingSummary([])).toBeNull();
  });
});
