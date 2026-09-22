import { describe, it, expect, beforeEach } from 'vitest';
import { getSortedDayIndices, formatLastTrained } from '../../src/utils/schemaSessionUtils';
import type { Schema, Workout } from '../../src/types';

/** Minimale in-memory localStorage: genoeg voor getAllExercises() en dayCompletionStorage. */
class FakeStorage {
  private store = new Map<string, string>();
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: FakeStorage }).localStorage = new FakeStorage();
});

function seedWorkouts(workouts: Workout[]) {
  localStorage.setItem('liftlog_workouts', JSON.stringify(workouts));
}

const baseSchema: Schema = {
  id: 'schema1',
  name: 'Test schema',
  trainerId: 'trainer1',
  clientId: null,
  days: [
    { dayLabel: 'Dag 1', exercises: [{ exerciseId: 'e1', exerciseName: 'Squat', setsTarget: 3, repsTarget: 8, notes: '' }] },
    { dayLabel: 'Dag 2', exercises: [{ exerciseId: 'e2', exerciseName: 'Bench', setsTarget: 3, repsTarget: 8, notes: '' }] },
    { dayLabel: 'Dag 3', exercises: [{ exerciseId: 'e3', exerciseName: 'Deadlift', setsTarget: 3, repsTarget: 5, notes: '' }] },
  ],
} as Schema;

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

describe('getSortedDayIndices', () => {
  it('zet een nooit-getrainde dag boven een wel-getrainde', () => {
    seedWorkouts([
      { id: 'w1', date: daysAgo(2), exercises: [{ id: 'ex1', name: 'Squat', date: daysAgo(2), schemaId: 'schema1', schemaDayIndex: 0 }] },
    ]);
    expect(getSortedDayIndices(baseSchema)).toEqual([1, 2, 0]);
  });

  it('zet de langst-niet-getrainde dag boven de recent-getrainde, ook als dat langer dan 12 uur geleden is', () => {
    seedWorkouts([
      { id: 'w1', date: daysAgo(10), exercises: [{ id: 'ex1', name: 'Squat', date: daysAgo(10), schemaId: 'schema1', schemaDayIndex: 0 }] },
      { id: 'w2', date: daysAgo(2), exercises: [{ id: 'ex2', name: 'Bench', date: daysAgo(2), schemaId: 'schema1', schemaDayIndex: 1 }] },
      { id: 'w3', date: daysAgo(5), exercises: [{ id: 'ex3', name: 'Deadlift', date: daysAgo(5), schemaId: 'schema1', schemaDayIndex: 2 }] },
    ]);
    // Dag 0 (10 dagen geleden) is het langst niet gedaan → boven. Dag 1 (2 dagen geleden) het kortst → onder.
    expect(getSortedDayIndices(baseSchema)).toEqual([0, 2, 1]);
  });

  it('laat een pas afgeronde dag zakken, ook nadat het 12-uursvenster verstreken is', () => {
    seedWorkouts([
      { id: 'w1', date: daysAgo(1), exercises: [{ id: 'ex1', name: 'Squat', date: daysAgo(1), schemaId: 'schema1', schemaDayIndex: 0 }] },
    ]);
    const order = getSortedDayIndices(baseSchema);
    expect(order[order.length - 1]).toBe(0);
  });
});

describe('formatLastTrained', () => {
  const now = new Date('2026-09-22T12:00:00');
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  it('toont "Vandaag" voor de dag zelf', () => {
    expect(formatLastTrained(iso(now), now)).toBe('Vandaag');
  });

  it('toont "Gisteren" voor 1 dag geleden', () => {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    expect(formatLastTrained(iso(yesterday), now)).toBe('Gisteren');
  });

  it('toont het aantal dagen als het minder dan een week geleden is', () => {
    const d = new Date(now);
    d.setDate(d.getDate() - 3);
    expect(formatLastTrained(iso(d), now)).toBe('3 dagen geleden');
  });

  it('toont de datum als het een week of langer geleden is', () => {
    const d = new Date(now);
    d.setDate(d.getDate() - 8);
    expect(formatLastTrained(iso(d), now)).toBe(d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }));
  });
});
