import { describe, expect, it } from 'vitest';
import { formatKg, targetWeightFor, weightStep } from '../../src/utils/targetWeight';
import type { PreviousPerformance } from '../../src/utils/previousPerformance';

const prev = (p: Partial<PreviousPerformance>): PreviousPerformance => ({
  exerciseName: 'Squat',
  weight: 40,
  sets: 3,
  reps: 8,
  date: '2026-09-20T10:00:00.000Z',
  notes: null,
  ...p,
});

describe('targetWeightFor', () => {
  it('doel uit de workout gaat voor', () => {
    expect(targetWeightFor({ targetWeight: 50, repsTarget: 10 }, prev({}))).toEqual({ kg: 50, kind: 'schema', reason: '' });
  });

  it('zonder doel en zonder vorige keer: niets', () => {
    expect(targetWeightFor({ repsTarget: 10 }, null)).toBeNull();
    expect(targetWeightFor({ repsTarget: 10 }, prev({ weight: null }))).toBeNull();
  });

  it('te licht: stapje zwaarder', () => {
    expect(targetWeightFor({ repsTarget: 10 }, prev({ effort: 'light' }))).toMatchObject({ kg: 42.5, kind: 'suggested' });
  });

  it('te zwaar: stapje lichter, nooit onder nul', () => {
    expect(targetWeightFor({ repsTarget: 10 }, prev({ effort: 'heavy' }))?.kg).toBe(37.5);
    expect(targetWeightFor({ repsTarget: 10 }, prev({ weight: 1, effort: 'heavy' }))?.kg).toBe(1);
  });

  it('alle herhalingen gehaald: stapje zwaarder', () => {
    expect(targetWeightFor({ repsTarget: 8 }, prev({ weight: 20, reps: 8 }))?.kg).toBe(22);
  });

  it('herhalingen niet gehaald: zelfde gewicht', () => {
    expect(targetWeightFor({ repsTarget: 10 }, prev({ reps: 8 }))).toMatchObject({ kg: 40, reason: 'zelfde als vorige keer' });
  });
});

describe('weightStep', () => {
  it('kleine stappen bij licht gewicht', () => {
    expect(weightStep(8)).toBe(1);
    expect(weightStep(20)).toBe(2);
    expect(weightStep(60)).toBe(2.5);
  });
});

it('formatKg met komma', () => {
  expect(formatKg(22.5)).toBe('22,5 kg');
});
