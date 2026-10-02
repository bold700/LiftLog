import { describe, expect, it } from 'vitest';
import { bodyChange, bodyChangeSentence, comparableMeasurements } from '../../src/utils/bodyChange';
import type { Measurement } from '../../src/services/measurementService';

const m = (id: string, date: string, weightKg: number | null, bodyFatPct: number | null, scan?: Record<string, number>) =>
  ({ id, date, weightKg, bodyFatPct, bodyScan: scan ? { values: scan } : null }) as unknown as Measurement;

describe('waar zitten de kilo\'s', () => {
  it('splitst een bodyscan in vet, spier en de rest', () => {
    const a = m('a', '2026-09-01', 88.1, null, { weightKg: 88.1, fatMassKg: 27.3, skeletalMuscleKg: 33.9 });
    const b = m('b', '2026-10-03', 90.1, null, { weightKg: 90.1, fatMassKg: 28.7, skeletalMuscleKg: 34.3 });
    const c = bodyChange(a, b)!;
    expect(c).toMatchObject({ days: 32, weightKg: 2, fatKg: 1.4, muscleKg: 0.4, otherKg: 0.2 });
    expect(bodyChangeSentence(c)).toBe('2,0 kg zwaarder: 1,4 kg vet erbij, 0,4 kg spier erbij en 0,2 kg water en overig erbij.');
  });

  it('zonder spiermeting: vet en vetvrij uit gewicht en vetpercentage', () => {
    const c = bodyChange(m('a', '2026-09-01', 80, 20), m('b', '2026-09-15', 79, 18))!;
    expect(c.fatKg).toBe(-1.8);
    expect(c.muscleKg).toBeNull();
    expect(c.otherKg).toBe(0.8);
    expect(bodyChangeSentence(c)).toBe('1,0 kg lichter: 1,8 kg vet eraf en 0,8 kg vetvrije massa (spier, water, bot) erbij.');
  });

  it('alleen metingen met gewicht en vet tellen mee, oud naar nieuw', () => {
    const list = comparableMeasurements([m('c', '2026-09-20', 80, 19), m('x', '2026-09-10', 81, null), m('a', '2026-09-01', 82, 20)]);
    expect(list.map((x) => x.id)).toEqual(['a', 'c']);
    expect(bodyChange(m('x', '2026-09-10', 81, null), m('a', '2026-09-01', 82, 20))).toBeNull();
  });
});
