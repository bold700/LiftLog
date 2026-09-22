import { describe, expect, it } from 'vitest';
import type { Exercise } from '../../src/types';
import { computeExerciseProgress, computeTrainingBalance, type ExerciseTraits } from '../../src/utils/exerciseInsights';

let n = 0;
const ex = (date: string, extra: Partial<Exercise> = {}): Exercise => ({ id: `e${n++}`, name: 'Bench', date, ...extra });

describe('computeExerciseProgress', () => {
  it('één punt per dag (zwaarste), oud → nieuw, met max, laatste en vorige', () => {
    const p = computeExerciseProgress([
      ex('2026-09-12', { weight: 90 }),
      ex('2026-09-09', { weight: 87.5 }),
      ex('2026-09-22T08:00:00', { weight: 90 }),
      ex('2026-09-22T08:20:00', { weight: 92.5 }),
      ex('2026-09-15', { weight: 95 }),
      ex('2026-09-16', {}),
    ]);
    expect(p?.sessions.map((s) => s.weight)).toEqual([87.5, 90, 95, 92.5]);
    expect(p).toMatchObject({ max: 95, latest: 92.5, previous: 95 });
  });

  it('één sessie: geen vorige; zonder gewicht: null', () => {
    expect(computeExerciseProgress([ex('2026-09-12', { weight: 40 })])).toMatchObject({ previous: null });
    expect(computeExerciseProgress([ex('2026-09-12')])).toBeNull();
  });
});

describe('computeTrainingBalance', () => {
  const TRAITS: Record<string, ExerciseTraits> = {
    Bench: { movementType: 'Push', primaryRegions: ['Chest Primary'] },
    Row: { movementType: 'Pull', primaryRegions: ['Body Back Lats Primary'] },
    Curl: { movementType: 'Isolatie', primaryRegions: ['Biceps Primary'] },
    Squat: { movementType: 'Squat', primaryRegions: ['Quads Primary'] },
    Plank: { movementType: 'Core', primaryRegions: ['Abs Primary'] },
    Onbekend: { primaryRegions: ['Body Back Hamstrings Primary'] },
  };
  const traits = (name: string) => TRAITS[name] ?? null;

  it('telt per log en laat onbekende eigenschappen buiten die verhouding', () => {
    const b = computeTrainingBalance(
      ['Bench', 'Bench', 'Bench', 'Row', 'Curl', 'Squat', 'Plank', 'Onbekend', 'Niet bestaand'].map((name) =>
        ex('2026-09-20', { name })
      ),
      traits
    );
    expect(b.pushPull).toEqual({ a: 'Push', b: 'Pull', aPct: 75 });
    // Boven: 3 bench + row + curl = 5; onder: squat + onbekend (hamstrings) = 2; plank telt niet.
    expect(b.upperLower).toEqual({ a: 'Bovenlichaam', b: 'Onderlichaam', aPct: 71 });
    // Compound: 3 bench + row + squat = 5; isolatie: curl = 1.
    expect(b.compoundIsolation).toEqual({ a: 'Compound', b: 'Isolatie', aPct: 83 });
  });

  it('zonder data: null', () => {
    expect(computeTrainingBalance([], traits)).toEqual({ pushPull: null, upperLower: null, compoundIsolation: null });
  });
});
