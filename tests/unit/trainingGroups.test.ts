import { describe, it, expect } from 'vitest';
import { groupExercisesIntoTrainings } from '../../src/utils/trainingGroups';
import type { Exercise, TrainingSessionLog } from '../../src/types';

/**
 * Waarom dit getest wordt: het blok "Trainingen" stond in de praktijk altijd leeg omdat het
 * wachtte op handmatige invoer. Nu leidt het zichzelf af uit de gelogde oefeningen. Gaat dat
 * groeperen mis, dan ziet een trainer een verkeerd aantal trainingen van een sporter — en daar
 * trekt hij conclusies uit.
 */

function ex(partial: Partial<Exercise> & { date: string }): Exercise {
  return { id: `ex_${Math.random().toString(36).slice(2)}`, ...partial };
}

describe('groupExercisesIntoTrainings', () => {
  it('zonder oefeningen en zonder logs is er niets', () => {
    expect(groupExercisesIntoTrainings([])).toEqual([]);
  });

  it('oefeningen van dezelfde dag vormen één training', () => {
    const groups = groupExercisesIntoTrainings([
      ex({ date: '2026-09-09', name: "Farmer's Carry" }),
      ex({ date: '2026-09-09', name: 'Dead Bug' }),
      ex({ date: '2026-09-09', name: 'Seated Cable Row' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].exerciseCount).toBe(3);
    expect(groups[0].exerciseNames).toEqual(["Farmer's Carry", 'Dead Bug', 'Seated Cable Row']);
  });

  it('het tijdstip in de datum doet er niet toe', () => {
    const groups = groupExercisesIntoTrainings([
      ex({ date: '2026-09-09T07:15:00.000Z', name: 'Squat' }),
      ex({ date: '2026-09-09T19:40:00.000Z', name: 'Bench' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].date).toBe('2026-09-09');
  });

  it('dezelfde oefening twee keer telt dubbel maar staat één keer in de opsomming', () => {
    const groups = groupExercisesIntoTrainings([
      ex({ date: '2026-09-09', name: 'Squat' }),
      ex({ date: '2026-09-09', name: 'Squat' }),
    ]);
    expect(groups[0].exerciseCount).toBe(2);
    expect(groups[0].exerciseNames).toEqual(['Squat']);
  });

  it('twee schema-dagen op één datum blijven twee trainingen', () => {
    const groups = groupExercisesIntoTrainings([
      ex({ date: '2026-09-09', name: 'Squat', schemaId: 's1', schemaDayIndex: 0 }),
      ex({ date: '2026-09-09', name: 'Row', schemaId: 's1', schemaDayIndex: 1 }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.schemaDayIndex).sort()).toEqual([0, 1]);
  });

  it('losse oefeningen staan los van een schema op dezelfde dag', () => {
    const groups = groupExercisesIntoTrainings([
      ex({ date: '2026-09-09', name: 'Squat', schemaId: 's1', schemaDayIndex: 0 }),
      ex({ date: '2026-09-09', name: 'Wandelen' }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.some((g) => g.schemaId === null)).toBe(true);
  });

  it('nieuwste training staat bovenaan', () => {
    const groups = groupExercisesIntoTrainings([
      ex({ date: '2026-09-01', name: 'Oud' }),
      ex({ date: '2026-09-11', name: 'Nieuw' }),
      ex({ date: '2026-09-05', name: 'Midden' }),
    ]);
    expect(groups.map((g) => g.date)).toEqual(['2026-09-11', '2026-09-05', '2026-09-01']);
  });

  it('een oefening zonder bruikbare datum valt weg in plaats van een lege regel te maken', () => {
    const groups = groupExercisesIntoTrainings([ex({ date: '', name: 'Kapot' }), ex({ date: '2026-09-09', name: 'Goed' })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].date).toBe('2026-09-09');
  });

  it('een oefening zonder naam telt wel mee maar vult de opsomming niet', () => {
    const groups = groupExercisesIntoTrainings([ex({ date: '2026-09-09' }), ex({ date: '2026-09-09', name: 'Squat' })]);
    expect(groups[0].exerciseCount).toBe(2);
    expect(groups[0].exerciseNames).toEqual(['Squat']);
  });

  describe('handmatig toegevoegde trainingslogs', () => {
    const log = (p: Partial<TrainingSessionLog> & { date: string }): TrainingSessionLog => ({
      id: 'sess1',
      schemaId: 's1',
      schemaDayIndex: 0,
      ...p,
    });

    it('levert de notitie bij de training van die dag', () => {
      const groups = groupExercisesIntoTrainings(
        [ex({ date: '2026-09-09', name: 'Squat', schemaId: 's1', schemaDayIndex: 0 })],
        [log({ date: '2026-09-09', notes: 'Zwaar maar goed' })]
      );
      expect(groups).toHaveLength(1);
      expect(groups[0].notes).toBe('Zwaar maar goed');
      expect(groups[0].sessionLogId).toBe('sess1');
    });

    it('blijft zichtbaar als er die dag geen oefeningen zijn gelogd', () => {
      // Anders verdwijnt een zojuist toegevoegd trainingslog stil, en dat is precies de klacht
      // die deze pagina had.
      const groups = groupExercisesIntoTrainings([], [log({ date: '2026-09-10', notes: 'Alleen cardio' })]);
      expect(groups).toHaveLength(1);
      expect(groups[0].exerciseCount).toBe(0);
      expect(groups[0].notes).toBe('Alleen cardio');
    });

    it('een lege notitie levert null op, geen lege aanhalingstekens', () => {
      const groups = groupExercisesIntoTrainings([], [log({ date: '2026-09-10', notes: '   ' })]);
      expect(groups[0].notes).toBeNull();
    });

    it('een afgeleide training zonder eigen log is niet te bewerken', () => {
      const groups = groupExercisesIntoTrainings([ex({ date: '2026-09-09', name: 'Squat' })]);
      expect(groups[0].sessionLogId).toBeNull();
    });
  });
});
