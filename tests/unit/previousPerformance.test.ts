import { describe, it, expect } from 'vitest';
import {
  buildPreviousPerformance,
  fromLocalExercises,
  fromSporterLogs,
  describePrevious,
  type PreviousPerformance,
} from '../../src/utils/previousPerformance';
import type { Exercise, ExerciseLog } from '../../src/types';

const entry = (over: Partial<PreviousPerformance>): PreviousPerformance => ({
  exerciseName: 'Lat Pulldown',
  weight: 25,
  sets: 3,
  reps: 10,
  date: '2026-09-12T10:00:00.000Z',
  notes: null,
  ...over,
});

describe('buildPreviousPerformance', () => {
  it('pakt per oefening de eerste (nieuwste) regel', () => {
    const map = buildPreviousPerformance([
      entry({ weight: 27.5, date: '2026-09-16T10:00:00.000Z' }),
      entry({ weight: 25, date: '2026-09-12T10:00:00.000Z' }),
    ]);
    expect(map.get('lat pulldown')?.weight).toBe(27.5);
  });

  it('houdt oefeningen uit elkaar, ongeacht hoofdletters en spaties', () => {
    const map = buildPreviousPerformance([
      entry({ exerciseName: '  lat PULLDOWN ', weight: 30 }),
      entry({ exerciseName: 'Kettlebell Deadlift', weight: 40 }),
    ]);
    expect(map.get('lat pulldown')?.weight).toBe(30);
    expect(map.get('kettlebell deadlift')?.weight).toBe(40);
  });

  it('slaat regels zonder naam over', () => {
    expect(buildPreviousPerformance([entry({ exerciseName: '  ' })]).size).toBe(0);
  });
});

describe('fromLocalExercises', () => {
  const ex = (over: Partial<Exercise>): Exercise =>
    ({ id: 'e1', name: 'Lat Pulldown', weight: 25, sets: 3, reps: 10, date: '2026-09-12T10:00:00.000Z', ...over }) as Exercise;

  it('laat de logs van de lopende training buiten beschouwing', () => {
    const map = fromLocalExercises(
      [ex({ id: 'vandaag', weight: 30 }), ex({ id: 'oud', weight: 25 })],
      new Set(['vandaag'])
    );
    expect(map.get('lat pulldown')?.weight).toBe(25);
  });

  it('geeft niets terug als alleen de log van vandaag bestaat', () => {
    expect(fromLocalExercises([ex({ id: 'vandaag' })], new Set(['vandaag'])).size).toBe(0);
  });
});

describe('fromSporterLogs', () => {
  const log = (over: Partial<ExerciseLog>): ExerciseLog =>
    ({
      id: 'l1', userId: 'sporter1', loggedBy: 'trainer1', trainerId: 'trainer1',
      exerciseName: 'Lat Pulldown', exerciseId: null, weight: 25, sets: 3, reps: 10,
      notes: null, effort: null, date: '2026-09-12T10:00:00.000Z',
      schemaId: 's1', schemaDayIndex: 0, sessionId: null, ...over,
    }) as ExerciseLog;

  it('gebruikt de laatste log van de sporter', () => {
    const map = fromSporterLogs([log({ id: 'a', weight: 27.5 }), log({ id: 'b', weight: 25 })], new Set());
    expect(map.get('lat pulldown')?.weight).toBe(27.5);
  });

  it('laat wat er nu net gelogd is buiten beschouwing', () => {
    const map = fromSporterLogs([log({ id: 'nu', weight: 30 }), log({ id: 'eerder', weight: 25 })], new Set(['nu']));
    expect(map.get('lat pulldown')?.weight).toBe(25);
  });
});

describe('describePrevious', () => {
  it('toont gewicht met reps', () => {
    expect(describePrevious(entry({}))).toBe('25 kg × 10');
  });

  it('toont sets × reps als er geen gewicht is (lichaamsgewicht)', () => {
    expect(describePrevious(entry({ weight: null }))).toBe('3 × 10');
  });

  it('valt terug op sets als reps ontbreken', () => {
    expect(describePrevious(entry({ weight: null, reps: null }))).toBe('3 sets');
  });

  it('toont alleen het gewicht als reps ontbreken', () => {
    expect(describePrevious(entry({ reps: null, sets: null }))).toBe('25 kg');
  });
});
