import { describe, expect, it } from 'vitest';
import { buildExerciseCatalog } from '../../api/_lib/exerciseCatalog.mjs';
import { buildPhotoSystem, normalizePhotoWorkout, PHOTO_DEFAULT_REPS, PHOTO_DEFAULT_SETS } from '../../api/_lib/workoutPhoto.mjs';

const cat = buildExerciseCatalog(['Goblet Squat', 'Barbell Deadlift', 'Dumbbell Front Raise', 'Dumbbell Biceps Curl', 'One Arm Dumbbell Row']);

describe('workout van een foto', () => {
  it('neemt de oefeningen over, met catalogusnaam als die past en anders de naam van de foto', () => {
    // Zoals het schema van Wendy: oefening, gewicht/materiaal en een opmerking, geen sets of herhalingen.
    const parsed = {
      name: 'Wendy',
      days: [
        {
          dayLabel: '',
          exercises: [
            { nameOnPhoto: 'Goblet squat', catalogName: 'Goblet Squat', sets: null, reps: null, weightKg: 12, weightText: '12 kg', notes: 'Helemaal tot de grond zakken.' },
            { nameOnPhoto: 'Deadlift', catalogName: 'Barbell Deadlift', weightKg: null, weightText: '12,5 of 15 kg', notes: 'Gewone deadlift als alternatief voor de one-leg deadlift.' },
            { nameOnPhoto: 'Hip bridge', catalogName: null, weightText: '20 kg + blauw elastiek', notes: '' },
            { nameOnPhoto: 'Side steps', catalogName: null, weightText: 'Blauw elastiek' },
            { nameOnPhoto: 'One-arm row', catalogName: 'One Arm Dumbbell Row', sets: 3, reps: 12, weightKg: 7.5, weightText: '7,5 kg' },
            { nameOnPhoto: '', catalogName: null },
          ],
        },
      ],
    };
    const { name, days } = normalizePhotoWorkout(parsed, cat.resolve);
    expect(name).toBe('Wendy');
    expect(days).toHaveLength(1);
    expect(days[0].dayLabel).toBe('Dag 1');
    const ex = days[0].exercises;
    expect(ex.map((e) => e.exerciseName)).toEqual(['Goblet Squat', 'Barbell Deadlift', 'Hip bridge', 'Side steps', 'One Arm Dumbbell Row']);
    expect(ex[0]).toMatchObject({ setsTarget: PHOTO_DEFAULT_SETS, repsTarget: PHOTO_DEFAULT_REPS, targetWeight: 12 });
    expect(ex[0].notes).toBe('Gewicht/materiaal: 12 kg. Helemaal tot de grond zakken.');
    // Twee gewichten: geen doelgewicht, de trainer kiest; het staat wel in de notitie.
    expect(ex[1].targetWeight).toBeUndefined();
    expect(ex[1].notes).toContain('12,5 of 15 kg');
    expect(ex[2].notes).toBe('Gewicht/materiaal: 20 kg + blauw elastiek.');
    expect(ex[4]).toMatchObject({ setsTarget: 3, repsTarget: 12, targetWeight: 7.5 });
  });

  it('meerdere dagen blijven apart; lege dagen en een lege foto geven niets', () => {
    const two = normalizePhotoWorkout(
      { days: [{ dayLabel: 'Dag A', exercises: [{ nameOnPhoto: 'Goblet squat' }] }, { dayLabel: 'Dag B', exercises: [] }, { dayLabel: 'Dag C', exercises: [{ nameOnPhoto: 'Bicep curl' }] }] },
      cat.resolve
    );
    expect(two.name).toBe('Workout van foto');
    expect(two.days.map((d) => d.dayLabel)).toEqual(['Dag A', 'Dag C']);
    expect(normalizePhotoWorkout({}, cat.resolve).days).toEqual([]);
    expect(normalizePhotoWorkout(null, cat.resolve).days).toEqual([]);
  });

  it('de instructie vraagt om alleen over te nemen wat er staat, met de catalogus erbij', () => {
    const sys = buildPhotoSystem('\nCATALOGUS');
    expect(sys).toMatch(/verzin geen oefeningen/);
    expect(sys.endsWith('CATALOGUS')).toBe(true);
  });
});
