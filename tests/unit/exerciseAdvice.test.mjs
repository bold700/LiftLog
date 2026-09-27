import { describe, expect, it } from 'vitest';
import { buildExerciseAdvicePrompt, normalizeExerciseAdvice } from '../../api/_lib/exerciseAdvice.mjs';

describe('slim voorstel oefeningenbibliotheek', () => {
  it('neemt de klacht mee in de vraag', () => {
    expect(buildExerciseAdvicePrompt('Dumbbell Lunge', 'achillespees')).toMatch(/Klacht van de sporter: achillespees/);
    expect(buildExerciseAdvicePrompt('Dumbbell Lunge', '')).not.toMatch(/Klacht van de sporter/);
  });

  it('brengt het antwoord van het model veilig in vorm', () => {
    const out = normalizeExerciseAdvice({
      regressions: ['  Split squat met steun ', '', 5, 'a', 'b', 'c'],
      progressions: 'geen lijst',
      alternatives: [{ reason: 'Achillespees', exercise: 'Split squat op de plek' }, { reason: 'x' }],
    });
    expect(out.regressions).toEqual(['Split squat met steun', 'a', 'b']);
    expect(out.progressions).toEqual([]);
    expect(out.alternatives).toEqual([{ reason: 'Achillespees', exercise: 'Split squat op de plek' }]);
  });
});
