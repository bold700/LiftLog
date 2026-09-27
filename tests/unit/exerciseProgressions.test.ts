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
    expect(standardAdvice('Lat pull')?.family).toBe('Trekken verticaal (lat)');
    expect(standardAdvice('Seated Row Machine')?.family).toBe('Trekken horizontaal (roeien)');
    expect(standardAdvice('Dead Bug')?.family).toBe('Core / buik');
    expect(standardAdvice('Lateral Mini-Band Walk')?.family).toBe('Heupspieren met band');
    expect(standardAdvice('Onbekende oefening xyz')).toBeNull();
  });

  it('geeft regressie en progressie als oefeningen uit de database, via de ladder', () => {
    const a = standardAdvice('Dumbbell Lunge');
    expect(a?.regressions[0]).toEqual({ exercise: 'Dumbbell Step-Up', note: 'lage box' });
    expect(a?.progressions.map((r) => r.exercise)).toContain('Bulgarian Split Squat');
  });

  it('noemt een oefening nooit als voorstel voor zichzelf (lat pulldown)', () => {
    const a = standardAdvice('Lat Pulldown');
    const all = [...(a?.regressions ?? []), ...(a?.progressions ?? [])].map((r) => r.exercise.toLowerCase());
    expect(all).not.toContain('lat pulldown');
    expect(a?.regressions.filter((r) => r.exercise)).toEqual([]);
    expect(a?.progressions.map((r) => r.exercise)).toEqual(['Assisted Pull-Up', 'Chin-Up', 'Pull-Up', '', '']);
    expect(a?.alternatives.schouder).toEqual({ exercise: '', note: 'neutrale greep, niet achter de nek' });
  });

  it('vertaalt vrije tekst naar een klacht', () => {
    expect(complaintKeyOf('lage rug')).toBe('rug');
    expect(complaintKeyOf('Zwangerschap 5 weken')).toBe('zwanger');
    expect(complaintKeyOf('knieën')).toBe('knie');
    expect(complaintKeyOf('achillespees')).toBe('enkel');
    expect(complaintKeyOf('hoofdpijn')).toBeNull();
  });

  it('geeft een alternatief bij een klacht, met het algemene advies als vangnet', () => {
    expect(standardAlternative('Dumbbell Lunge', 'knie')?.exercise).toBe('Dumbbell Step-Up');
    expect(standardAlternative('Hipthrust', 'zwanger')?.note).toMatch(/resistance band/i);
    expect(standardAlternative('Onbekende oefening', 'knie')).toEqual({
      exercise: '',
      note: expect.stringMatching(/knie boven de voet/i),
    });
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
    expect(
      alternativeForLimitation('Dumbbell Lunge', { area: 'knie', alternative: 'Alleen step-ups', note: null }, null)
    ).toEqual({
      exercise: '',
      note: 'Alleen step-ups',
    });
  });
  it('daarna wat de studio vastlegde, dan de standaard', async () => {
    const { alternativeForLimitation } = await import('../../src/utils/exerciseAlternatives');
    const note = {
      orgId: 'o1',
      exerciseName: 'Dumbbell Lunge',
      key: 'dumbbell-lunge',
      regressions: [],
      progressions: [],
      alternatives: [{ reason: 'Knieën', exercise: 'Dumbbell Step-Up', note: 'box 20 cm' }],
      tip: '',
      updatedBy: null,
      updatedAt: '',
    };
    expect(alternativeForLimitation('Dumbbell Lunge', { area: 'knie', alternative: '', note: 'Herstellende' }, note)).toEqual({
      exercise: 'Dumbbell Step-Up',
      note: 'box 20 cm',
    });
    expect(alternativeForLimitation('Dumbbell Lunge', { area: 'knie', alternative: '', note: null }, null)?.exercise).toBe(
      'Dumbbell Step-Up'
    );
    expect(alternativeForLimitation('Dumbbell Lunge', { area: 'overig', alternative: '', note: 'zwanger' }, null)?.note).toMatch(
      /steun/i
    );
  });
});

describe('les: andere oefening per deelnemer', () => {
  it('geeft alleen echte oefeningen, zonder de oefening zelf en zonder dubbelingen', async () => {
    const { substituteOptions } = await import('../../src/utils/exerciseAlternatives');
    const opts = substituteOptions('Lat Pulldown', [{ area: 'schouder', alternative: '', note: null }], null);
    const all = [...opts.complaint, ...opts.easier, ...opts.harder].map((r) => r.exercise);
    expect(all).not.toContain('Lat Pulldown');
    expect(all.every((x) => x.trim() !== '')).toBe(true);
    expect(new Set(all).size).toBe(all.length);
    expect(opts.harder.map((r) => r.exercise)).toEqual(['Assisted Pull-Up', 'Chin-Up', 'Pull-Up']);
  });
  it('zet een klacht-alternatief voorop, met de klacht erbij', async () => {
    const { substituteOptions } = await import('../../src/utils/exerciseAlternatives');
    const opts = substituteOptions('Dumbbell Lunge', [{ area: 'knie', alternative: '', note: null }], null);
    expect(opts.complaint[0]).toMatchObject({ exercise: 'Dumbbell Step-Up', reason: 'Knie' });
    expect(opts.easier.map((r) => r.exercise)).not.toContain('Dumbbell Step-Up');
  });
  it('koppelt een log met alternatief terug aan de geplande oefening', async () => {
    const { plannedNameOfLog } = await import('../../src/utils/exerciseAlternatives');
    expect(plannedNameOfLog({ exerciseName: 'Goblet Squat', substituteFor: 'Barbell Back Squat' })).toBe('Barbell Back Squat');
    expect(plannedNameOfLog({ exerciseName: 'Goblet Squat', substituteFor: null })).toBe('Goblet Squat');
  });
});
