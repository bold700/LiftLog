import { describe, expect, it } from 'vitest';
import { normalizeExerciseKey, buildExerciseCatalog, candidatesForExerciseDbLookup } from '../../api/exerciseCatalog.mjs';

describe('normalizeExerciseKey', () => {
  it('kleine letters, geen accenten of leestekens, enkele spaties', () => {
    expect(normalizeExerciseKey('  Barbell   Back-Squat! ')).toBe('barbell back-squat');
    expect(normalizeExerciseKey('Élévation latérale')).toBe('elevation laterale');
    expect(normalizeExerciseKey(null)).toBe('');
  });
});

describe('buildExerciseCatalog', () => {
  it('resolvet op hoofdletters, kleine typefouten en deelnamen naar de catalogusnaam', () => {
    const cat = buildExerciseCatalog(['Barbell Back Squat', 'Lat Pulldown', 'Barbell Back Squat']);
    expect(cat.names).toHaveLength(2);
    expect(cat.resolve('BARBELL back squat')).toBe('Barbell Back Squat');
    expect(cat.resolve('Barbel Back Squat')).toBe('Barbell Back Squat');
    expect(cat.resolve('Lat pulldown machine')).toBe('Lat Pulldown');
    expect(cat.resolve('Zwemmen')).toBeNull();
    expect(cat.resolve('')).toBeNull();
  });
});

describe('candidatesForExerciseDbLookup', () => {
  it('geeft zoektermen terug voor een catalogusnaam en niets voor lege invoer', () => {
    expect(candidatesForExerciseDbLookup('')).toEqual([]);
    const c = candidatesForExerciseDbLookup('Barbell Back Squat');
    expect(c.length).toBeGreaterThan(0);
    expect(c.map((s) => s.toLowerCase())).toContain('barbell back squat');
  });
});
