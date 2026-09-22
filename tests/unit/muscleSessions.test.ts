import { describe, expect, it } from 'vitest';
import type { Exercise } from '../../src/types';
import { countMuscleSessions, muscleLabel } from '../../src/utils/muscleSessions';

let n = 0;
const ex = (name: string, date: string): Exercise => ({ id: `e${n++}`, name, date });

const REGIONS: Record<string, string[]> = {
  Bench: ['Chest Primary', 'Triceps Primary'],
  Row: ['Body Back Lats Primary', 'Body Back Upper Back Primary'],
  Squat: ['Quads Primary'],
  Cardio: [],
};
const resolve = (name: string) => REGIONS[name] ?? [];

describe('muscleLabel', () => {
  it('vertaalt regio’s naar lijstnamen, voor- en achterkant samen', () => {
    expect(muscleLabel('Chest Primary')).toBe('Borst');
    expect(muscleLabel('Body Back Shoulders Primary')).toBe('Schouders');
    expect(muscleLabel('Shoulders Secondary')).toBe('Schouders');
    expect(muscleLabel('Body Back Tricpes Primary')).toBe('Triceps');
    expect(muscleLabel('Onbekend Primary')).toBeNull();
  });
});

describe('countMuscleSessions', () => {
  it('telt trainingsdagen per spiergroep, niet losse logs', () => {
    const result = countMuscleSessions(
      [
        ex('Bench', '2026-09-21'),
        ex('Bench', '2026-09-21T09:00:00'),
        ex('Bench', '2026-09-18'),
        ex('Squat', '2026-09-18'),
        ex('Row', '2026-09-19'),
        ex('Cardio', '2026-09-19'),
        { id: 'note', date: '2026-09-20' } as Exercise,
      ],
      resolve
    );
    expect(result).toEqual([
      { label: 'Borst', sessions: 2 },
      { label: 'Triceps', sessions: 2 },
      { label: 'Quadriceps', sessions: 1 },
      { label: 'Rug', sessions: 1 },
    ]);
  });

  it('leeg zonder logs', () => {
    expect(countMuscleSessions([], resolve)).toEqual([]);
  });
});
