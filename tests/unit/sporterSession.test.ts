import { describe, it, expect } from 'vitest';
import { loggedExercisesFromSporterLogs } from '../../src/utils/schemaSessionUtils';
import type { ExerciseLog } from '../../src/types';

const base: ExerciseLog = {
  id: 'log1',
  userId: 'sporter1',
  loggedBy: 'trainer1',
  trainerId: 'trainer1',
  exerciseName: 'Goblet Squat',
  exerciseId: null,
  weight: 20,
  sets: 2,
  reps: 10,
  notes: null,
  effort: null,
  date: new Date().toISOString(),
  schemaId: 'schema1',
  schemaDayIndex: 0,
  sessionId: null,
};

describe('loggedExercisesFromSporterLogs', () => {
  it('pakt de log van deze trainingsdag', () => {
    const out = loggedExercisesFromSporterLogs([base], 'schema1', 0);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'log1', name: 'Goblet Squat', weight: 20, sets: 2, reps: 10 });
  });

  it('laat logs van een andere workout of dag liggen', () => {
    const other = [
      { ...base, id: 'a', schemaId: 'schema2' },
      { ...base, id: 'b', schemaDayIndex: 1 },
    ];
    expect(loggedExercisesFromSporterLogs(other, 'schema1', 0)).toEqual([]);
  });

  it('telt een log van gisteren niet mee', () => {
    const yesterday = { ...base, date: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString() };
    expect(loggedExercisesFromSporterLogs([yesterday], 'schema1', 0)).toEqual([]);
  });

  it('telt een log van een uur geleden wel mee', () => {
    const recent = { ...base, date: new Date(Date.now() - 60 * 60 * 1000).toISOString() };
    expect(loggedExercisesFromSporterLogs([recent], 'schema1', 0)).toHaveLength(1);
  });

  it('slaat een log zonder oefeningnaam over', () => {
    expect(loggedExercisesFromSporterLogs([{ ...base, exerciseName: '' }], 'schema1', 0)).toEqual([]);
  });

  it('vertaalt ontbrekende waarden naar undefined, zodat de sessie ze net zo toont als eigen logs', () => {
    const sparse = { ...base, weight: null, sets: null, reps: null, notes: null };
    expect(loggedExercisesFromSporterLogs([sparse], 'schema1', 0)[0]).toMatchObject({
      weight: undefined,
      sets: undefined,
      reps: undefined,
    });
  });
});
