import { describe, expect, it } from 'vitest';
import { buildSporterFeedback, suggestNextWeight } from '../../src/utils/trainingFeedback';
import type { ExerciseLog, SessionCheckin } from '../../src/types';

const log = (p: Partial<ExerciseLog> & { exerciseName: string; date: string }): ExerciseLog => ({
  id: p.id ?? p.exerciseName + p.date,
  userId: 'bas',
  loggedBy: 'bas',
  trainerId: 'kenny',
  weight: null,
  sets: null,
  reps: null,
  createdAt: p.date,
  ...p,
});

describe('suggestNextWeight', () => {
  it('te licht → een stap erbij, te zwaar → houden of een stap eraf, goed → houden', () => {
    expect(suggestNextWeight('light', 10)).toBe('Probeer 12,5 kg');
    expect(suggestNextWeight('heavy', 10)).toBe('Houd 10 kg, of terug naar 7,5 kg');
    expect(suggestNextWeight('good', 10)).toBe('Houd 10 kg');
    expect(suggestNextWeight(null, 22.5)).toBe('Houd 22,5 kg');
  });
  it('zonder gewicht (bodyweight) alleen een tekst', () => {
    expect(suggestNextWeight('light', null)).toBe('Maak het zwaarder');
    expect(suggestNextWeight('heavy', 0)).toBe('Maak het lichter of minder herhalingen');
    expect(suggestNextWeight('good', undefined)).toBe('Zo houden');
  });
});

describe('buildSporterFeedback', () => {
  const now = new Date('2026-09-08T12:00:00Z');
  const logs = [
    log({ exerciseName: 'Dumbbell Row', date: '2026-09-01T20:00:00Z', weight: 9, sets: 3, reps: 10, effort: 'good' }),
    log({ exerciseName: 'Dumbbell Row', date: '2026-09-07T20:00:00Z', weight: 10, sets: 3, reps: 10, effort: 'heavy', notes: 'set 2 en 3 haal ik niet', schemaId: 'thuis' }),
    log({ exerciseName: 'Dead Bug', date: '2026-09-07T20:10:00Z', sets: 3, reps: 10, effort: 'light', schemaId: 'thuis' }),
    log({ exerciseName: 'Lunges', date: '2026-09-07T20:20:00Z', weight: 0, sets: 2, reps: 10, notes: 'met gewicht niet stabiel', schemaId: 'thuis' }),
    log({ exerciseName: 'Glute Bridge', date: '2026-09-07T20:30:00Z', sets: 2, reps: 12, effort: 'good', schemaId: 'thuis' }),
    log({ exerciseName: 'Oude oefening', date: '2026-05-01T20:00:00Z', weight: 50, effort: 'light' }),
  ];
  const checkins: SessionCheckin[] = [
    { id: 'c1', userId: 'bas', loggedBy: 'bas', trainerId: 'kenny', schemaId: 'thuis', schemaDayIndex: 0, dayLabel: 'Dag 1', feeling: 4, note: 'Arnold press lastig', date: '2026-09-07T20:40:00Z', createdAt: '2026-09-07T20:40:00Z' },
    { id: 'c0', userId: 'bas', loggedBy: 'bas', trainerId: 'kenny', schemaId: 'thuis', schemaDayIndex: 0, dayLabel: 'Dag 1', feeling: 3, note: null, date: '2026-09-01T20:40:00Z', createdAt: '2026-09-01T20:40:00Z' },
  ];

  it('neemt per oefening de laatste log en zet signalen en notities bovenaan', () => {
    const fb = buildSporterFeedback(logs, checkins, { now });
    expect(fb.exercises.map((e) => e.exerciseName)).toEqual(['Dead Bug', 'Dumbbell Row', 'Lunges', 'Glute Bridge']);
    const row = fb.exercises.find((e) => e.exerciseName === 'Dumbbell Row')!;
    expect(row.weight).toBe(10);
    expect(row.effort).toBe('heavy');
    expect(row.suggestion).toBe('Houd 10 kg, of terug naar 7,5 kg');
    expect(fb.exercises.find((e) => e.exerciseName === 'Dead Bug')!.suggestion).toBe('Maak het zwaarder');
  });
  it('laat oude logs buiten de periode weg en pakt de laatste check-in', () => {
    const fb = buildSporterFeedback(logs, checkins, { now, days: 60 });
    expect(fb.exercises.some((e) => e.exerciseName === 'Oude oefening')).toBe(false);
    expect(fb.checkin?.id).toBe('c1');
    expect(fb.lastActivity).toBe('2026-09-07T20:40:00Z');
  });
  it('filtert op workout als schemaId is meegegeven', () => {
    const fb = buildSporterFeedback(logs, checkins, { now, schemaId: 'ander' });
    expect(fb.exercises).toEqual([]);
    expect(fb.checkin).toBeNull();
    expect(fb.lastActivity).toBeNull();
  });
});
