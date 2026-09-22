import { describe, it, expect } from 'vitest';
import type { Exercise } from '../../src/types';
import {
  DEFAULT_LOG_FILTER,
  NO_SCHEMA,
  exerciseNames,
  filterLogs,
  groupLogsByDay,
  logDayLabel,
  logRowDetails,
  workoutOptions,
} from '../../src/utils/logList';

const now = new Date(2026, 8, 22, 20, 0); // di 22 september 2026
const ex = (id: string, date: string, name: string, extra: Partial<Exercise> = {}): Exercise => ({ id, date, name, ...extra });

const logs: Exercise[] = [
  ex('a', '2026-09-22T08:00:00', 'Bench Press', { weight: 92.5, sets: 4, reps: 6, schemaId: 's1' }),
  ex('b', '2026-09-22T08:10:00', 'Pull-up', { sets: 3, reps: 10, schemaId: 's1' }),
  ex('c', '2026-09-21', 'Squat', { weight: 110, sets: 5, reps: 5 }),
  ex('d', '2026-08-01', 'bench press', { weight: 80, sets: 3, reps: 8 }),
  ex('e', '2026-09-20', '   '),
];

describe('filterLogs', () => {
  it('toont standaard de laatste 30 dagen en slaat regels zonder naam over', () => {
    expect(filterLogs(logs, DEFAULT_LOG_FILTER, now).map((l) => l.id)).toEqual(['a', 'b', 'c']);
  });
  it('filtert op oefening zonder op hoofdletters te letten', () => {
    const r = filterLogs(logs, { periodDays: null, exerciseName: 'BENCH PRESS', schemaId: null }, now);
    expect(r.map((l) => l.id)).toEqual(['a', 'd']);
  });
  it('filtert op schema of op los gelogd', () => {
    expect(filterLogs(logs, { periodDays: null, exerciseName: null, schemaId: 's1' }, now).map((l) => l.id)).toEqual(['a', 'b']);
    expect(filterLogs(logs, { periodDays: null, exerciseName: null, schemaId: NO_SCHEMA }, now).map((l) => l.id)).toEqual(['c', 'd']);
  });
});

describe('opties voor de filters', () => {
  it('geeft unieke namen alfabetisch', () => {
    expect(exerciseNames(logs)).toEqual(['Bench Press', 'Pull-up', 'Squat']);
  });
  it('geeft de schema’s en of er los gelogd is', () => {
    expect(workoutOptions(logs)).toEqual({ schemaIds: ['s1'], hasLoose: true });
  });
});

describe('groupLogsByDay', () => {
  it('nieuwste dag en nieuwste log eerst', () => {
    const days = groupLogsByDay(filterLogs(logs, DEFAULT_LOG_FILTER, now), now);
    expect(days.map((d) => d.day)).toEqual(['2026-09-22', '2026-09-21']);
    expect(days[0].logs.map((l) => l.id)).toEqual(['b', 'a']);
    expect(days[0].label).toBe('Vandaag · dinsdag 22 september');
    expect(days[1].label).toBe('Gisteren · maandag 21 september');
  });
  it('zet het jaar erbij buiten dit jaar', () => {
    expect(logDayLabel('2025-12-31', now)).toBe('Woensdag 31 december 2025');
    expect(logDayLabel('2026-09-19', now)).toBe('Zaterdag 19 september');
  });
});

describe('logRowDetails', () => {
  it('gewicht en sets × reps', () => {
    expect(logRowDetails({ weight: 92.5, sets: 4, reps: 6 })).toBe('92,5 kg · 4 × 6');
  });
  it('eigen gewicht zonder gewicht', () => {
    expect(logRowDetails({ sets: 3, reps: 10 })).toBe('Eigen gewicht · 3 × 10');
    expect(logRowDetails({})).toBe('');
  });
});
