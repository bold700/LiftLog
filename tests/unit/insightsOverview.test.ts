import { describe, expect, it } from 'vitest';
import type { Exercise, Schema } from '../../src/types';
import {
  computeOverviewStats,
  computePlanCompletion,
  formatLogDetails,
  formatRecentWhen,
  formatVolume,
  getRecentLogs,
  isWithinLastDays,
} from '../../src/utils/insightsOverview';

// Woensdag 23 september 2026, 10:00 lokale tijd.
const NOW = new Date(2026, 8, 23, 10, 0);

let n = 0;
const ex = (date: string, extra: Partial<Exercise> = {}): Exercise => ({
  id: `e${n++}`,
  name: 'Bench Press',
  date,
  ...extra,
});

describe('isWithinLastDays', () => {
  it('telt vandaag en de voorgaande dagen mee, niet eerder of later', () => {
    expect(isWithinLastDays('2026-09-23', 30, NOW)).toBe(true);
    expect(isWithinLastDays('2026-08-25', 30, NOW)).toBe(true);
    expect(isWithinLastDays('2026-08-24', 30, NOW)).toBe(false);
    expect(isWithinLastDays('2026-09-24', 30, NOW)).toBe(false);
    expect(isWithinLastDays('onzin', 30, NOW)).toBe(false);
  });
});

describe('computeOverviewStats', () => {
  it('telt trainingsdagen, niet losse logs, en slaat notities zonder naam over', () => {
    const stats = computeOverviewStats(
      [
        ex('2026-09-23'),
        ex(new Date(2026, 8, 23, 7, 30).toISOString()),
        ex('2026-09-21'),
        ex('2026-09-20', { name: '' }),
        ex('2026-07-01'),
      ],
      NOW
    );
    expect(stats.sessions).toBe(2);
  });

  it('volume = gewicht × sets × reps, ontbrekende sets/reps tellen als 1', () => {
    const stats = computeOverviewStats(
      [
        ex('2026-09-22', { weight: 80, sets: 4, reps: 8 }),
        ex('2026-09-22', { weight: 100 }),
        ex('2026-09-22', { sets: 3, reps: 10 }),
        ex('2026-06-01', { weight: 500, sets: 5, reps: 5 }),
      ],
      NOW
    );
    expect(stats.volumeKg).toBe(80 * 4 * 8 + 100);
  });

  it('reeks: aaneengesloten weken met een training; een lege lopende week breekt hem nog niet', () => {
    // Deze week (ma 21 sep) niets, wel de drie weken ervoor, daarvoor een gat.
    const stats = computeOverviewStats(
      [ex('2026-09-18'), ex('2026-09-08'), ex('2026-09-01'), ex('2026-08-12')],
      NOW
    );
    expect(stats.streakWeeks).toBe(3);

    expect(computeOverviewStats([ex('2026-09-21'), ex('2026-09-14')], NOW).streakWeeks).toBe(2);
    expect(computeOverviewStats([ex('2026-09-01')], NOW).streakWeeks).toBe(0);
    expect(computeOverviewStats([], NOW)).toEqual({ sessions: 0, volumeKg: 0, streakWeeks: 0 });
  });
});

describe('computePlanCompletion', () => {
  const day = (names: string[]) => ({ exercises: names.map((exerciseName) => ({ exerciseName })) });
  const schema = {
    id: 's1',
    name: 'Kracht',
    trainerId: 't',
    clientId: null,
    createdAt: '2026-01-01',
    days: [day(['Squat']), day(['Bench']), day(['Deadlift']), day([])],
  } as unknown as Schema;

  it('deel van de schemadagen dat deze week gedaan is (lege dagen tellen niet)', () => {
    const logs = [
      ex('2026-09-21', { schemaId: 's1', schemaDayIndex: 0 }),
      ex('2026-09-21', { schemaId: 's1', schemaDayIndex: 0 }),
      ex('2026-09-17', { schemaId: 's1', schemaDayIndex: 1 }),
    ];
    expect(computePlanCompletion(logs, [schema], [], NOW)).toBe(33);

    const completions = [{ schemaId: 's1', schemaDayIndex: 2, completedAt: new Date(2026, 8, 22).toISOString() }];
    expect(computePlanCompletion(logs, [schema], completions, NOW)).toBe(67);
  });

  it('null zonder schema in gebruik of als het schema niet (meer) bestaat', () => {
    expect(computePlanCompletion([ex('2026-09-21')], [schema], [], NOW)).toBeNull();
    expect(computePlanCompletion([ex('2026-09-21', { schemaId: 'weg', schemaDayIndex: 0 })], [schema], [], NOW)).toBeNull();
  });
});

describe('opmaak', () => {
  it('volume in kg of ton', () => {
    expect(formatVolume(850)).toBe('850 kg');
    expect(formatVolume(4830)).toBe('4,8t');
    expect(formatVolume(48200)).toBe('48t');
  });

  it('details van een log', () => {
    expect(formatLogDetails({ weight: 80, sets: 4, reps: 8 })).toBe('80 kg · 4 × 8');
    expect(formatLogDetails({ weight: 22.5 })).toBe('22,5 kg');
    expect(formatLogDetails({ sets: 3, reps: 10 })).toBe('3 × 10');
    expect(formatLogDetails({ sets: 1 })).toBe('1 set');
    expect(formatLogDetails({})).toBe('');
  });

  it('wanneer: vandaag, gisteren, weekdag, daarna datum', () => {
    expect(formatRecentWhen(new Date(2026, 8, 23, 7, 12), true, NOW)).toBe('Vandaag 07:12');
    expect(formatRecentWhen(new Date(2026, 8, 22, 18, 4), true, NOW)).toBe('Gisteren 18:04');
    expect(formatRecentWhen(new Date(2026, 8, 21, 18, 4), true, NOW)).toBe('Ma 18:04');
    expect(formatRecentWhen(new Date(2026, 8, 19), false, NOW)).toBe('Za');
    expect(formatRecentWhen(new Date(2026, 8, 12), false, NOW)).toBe('12 sep');
    expect(formatRecentWhen(new Date(2025, 11, 30), false, NOW)).toBe('30 dec 2025');
  });

  it('recente logs: nieuwste eerst, maximaal N', () => {
    const logs = [
      ex('2026-09-20', { name: 'Oud' }),
      ex(new Date(2026, 8, 23, 7, 12).toISOString(), { name: 'Nieuw', weight: 80, sets: 4, reps: 8 }),
      ex('2026-09-22', { name: 'Gisteren' }),
    ];
    const recent = getRecentLogs(logs, 2, NOW);
    expect(recent.map((r) => r.name)).toEqual(['Nieuw', 'Gisteren']);
    expect(recent[0]).toMatchObject({ details: '80 kg · 4 × 8', when: 'Vandaag 07:12' });
  });
});
