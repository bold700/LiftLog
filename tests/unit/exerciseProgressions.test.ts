import { describe, expect, it } from 'vitest';
import {
  complaintKeyOf,
  complaintOfLimitationArea,
  standardAdvice,
  standardAlternative,
} from '../../src/data/exerciseProgressions';

describe('oefeningenbibliotheek: standaard van het systeem', () => {
  it('herkent de soort oefening aan de naam', () => {
    expect(standardAdvice('Dumbbell Lunge')?.family).toBe('Lunge / split squat');
    expect(standardAdvice('Bulgarian Split Squat')?.family).toBe('Lunge / split squat');
    expect(standardAdvice('Goblet Squat')?.family).toBe('Squat-patroon');
    expect(standardAdvice('Hipthrust')?.family).toBe('Heupbrug / hip thrust');
    expect(standardAdvice('Kettlebell Swing')?.family).toBe('Heupscharnier (hinge)');
    expect(standardAdvice('Incline Push-Up (handen op bank)')?.family).toBe('Duwen horizontaal (borst)');
    expect(standardAdvice('Lat pull')?.family).toBe('Trekken (rug)');
    expect(standardAdvice('Dead Bug')?.family).toBe('Core / buik');
    expect(standardAdvice('Lateral Mini-Band Walk')?.family).toBe('Heupspieren met band');
    expect(standardAdvice('Onbekende oefening xyz')).toBeNull();
  });

  it('geeft regressie en progressie mee', () => {
    const a = standardAdvice('Dumbbell Lunge');
    expect(a?.regressions.length).toBeGreaterThan(0);
    expect(a?.progressions.length).toBeGreaterThan(0);
  });

  it('vertaalt vrije tekst naar een klacht', () => {
    expect(complaintKeyOf('lage rug')).toBe('rug');
    expect(complaintKeyOf('Zwangerschap 5 weken')).toBe('zwanger');
    expect(complaintKeyOf('knieën')).toBe('knie');
    expect(complaintKeyOf('achillespees')).toBe('enkel');
    expect(complaintKeyOf('hoofdpijn')).toBeNull();
  });

  it('geeft een alternatief bij een klacht, met het algemene advies als vangnet', () => {
    expect(standardAlternative('Dumbbell Lunge', 'knie')).toMatch(/reverse lunge|step-up/i);
    expect(standardAlternative('Hipthrust', 'zwanger')).toMatch(/resistance band/i);
    expect(standardAlternative('Onbekende oefening', 'knie')).toMatch(/knie boven de voet/i);
    expect(standardAlternative('Dumbbell Lunge', 'hoofdpijn')).toBeNull();
  });

  it('koppelt een beperking van het profiel aan een klacht', () => {
    expect(complaintOfLimitationArea('onderrug')).toBe('rug');
    expect(complaintOfLimitationArea('knie')).toBe('knie');
    expect(complaintOfLimitationArea('overig')).toBeNull();
  });
});

describe('alternatief bij een beperking in de les', () => {
  it('eigen notitie van de sporter gaat voor', async () => {
    const { alternativeForLimitation } = await import('../../src/utils/exerciseAlternatives');
    expect(alternativeForLimitation('Dumbbell Lunge', { area: 'knie', alternative: 'Alleen step-ups', note: null }, null)).toBe(
      'Alleen step-ups'
    );
  });
  it('daarna wat de studio vastlegde, dan de standaard', async () => {
    const { alternativeForLimitation } = await import('../../src/utils/exerciseAlternatives');
    const note = {
      orgId: 'o1',
      exerciseName: 'Dumbbell Lunge',
      key: 'dumbbell-lunge',
      regressions: [],
      progressions: [],
      alternatives: [{ reason: 'Knieën', exercise: 'Box step-up 20 cm' }],
      tip: '',
      updatedBy: null,
      updatedAt: '',
    };
    expect(alternativeForLimitation('Dumbbell Lunge', { area: 'knie', alternative: '', note: 'Herstellende' }, note)).toBe(
      'Box step-up 20 cm'
    );
    expect(alternativeForLimitation('Dumbbell Lunge', { area: 'knie', alternative: '', note: null }, null)).toMatch(
      /reverse lunge/i
    );
    expect(alternativeForLimitation('Dumbbell Lunge', { area: 'overig', alternative: '', note: 'zwanger' }, null)).toMatch(
      /steun/i
    );
  });
});
