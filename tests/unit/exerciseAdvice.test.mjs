import { describe, expect, it } from 'vitest';
import { buildExerciseAdvicePrompt, normalizeExerciseAdvice } from '../../api/_lib/exerciseAdvice.mjs';

describe('slim voorstel oefeningenbibliotheek', () => {
  it('neemt de klacht en de catalogus mee in de vraag', () => {
    const p = buildExerciseAdvicePrompt('Dumbbell Lunge', 'achillespees', ['Goblet Squat', 'Dumbbell Step-Up']);
    expect(p).toMatch(/Klacht van de sporter: achillespees/);
    expect(p).toMatch(/Catalogus: Goblet Squat; Dumbbell Step-Up/);
    expect(buildExerciseAdvicePrompt('Dumbbell Lunge', '')).not.toMatch(/Klacht van de sporter/);
  });

  it('brengt het antwoord van het model veilig in vorm', () => {
    const out = normalizeExerciseAdvice({
      regressions: [{ exercise: ' Dumbbell Step-Up ', note: 'lage box' }, 'Glute Bridge', '', { note: 'tempo' }, { exercise: 'x' }],
      progressions: 'geen lijst',
      alternatives: [{ reason: 'Achillespees', exercise: 'Stationary Bike / Fiets', note: '' }, { reason: 'x' }],
    });
    expect(out.regressions).toEqual([
      { exercise: 'Dumbbell Step-Up', note: 'lage box' },
      { exercise: 'Glute Bridge', note: '' },
      { exercise: '', note: 'tempo' },
    ]);
    expect(out.progressions).toEqual([]);
    expect(out.alternatives).toEqual([{ reason: 'Achillespees', exercise: 'Stationary Bike / Fiets', note: '' }]);
  });
});
