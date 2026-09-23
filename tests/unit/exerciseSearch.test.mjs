import { describe, expect, it } from 'vitest';
import { searchExercises } from '../../api/_lib/exerciseGifIndex.mjs';

describe('searchExercises', () => {
  it('vindt oefeningen uit de VORM-catalogus die niet in de ExerciseDB-dataset zitten', () => {
    // Bulgarian Split Squat staat wel in de app-catalogus (mega_exercise_db.json), maar niet
    // letterlijk in de ingekochte ExerciseDB-set — dit gaf voorheen "geen opties", ook op een
    // deel van de naam en op de exacte naam.
    expect(searchExercises({ term: 'bulga' })).toContain('Bulgarian Split Squat');
    expect(searchExercises({ term: 'Bulgarian Split Squat' })).toContain('Bulgarian Split Squat');
  });

  it('vindt oefeningen op een Nederlandse alias', () => {
    expect(searchExercises({ term: 'bankdrukken' })).toContain('barbell bench press');
    expect(searchExercises({ term: 'kniebuiging' }).length).toBeGreaterThan(0);
    expect(searchExercises({ term: 'opdrukken' })).toContain('push-up');
  });

  it('geeft geen dubbele namen terug voor oefeningen die in beide bronnen voorkomen', () => {
    const results = searchExercises({ term: 'push-up' });
    const pushUps = results.filter((n) => n.toLowerCase() === 'push-up');
    expect(pushUps.length).toBeLessThanOrEqual(1);
  });

  it('lege term geeft resultaten terug (alfabetisch), geen lege lijst', () => {
    expect(searchExercises({ term: '', limit: 10 }).length).toBe(10);
  });
});
