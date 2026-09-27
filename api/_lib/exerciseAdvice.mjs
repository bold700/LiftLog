/**
 * Slim voorstel voor de oefeningenbibliotheek (via api/generate-workout.mjs, mode "exercise_advice").
 * Het model geeft regressies, progressies en, als de trainer een klacht noemt, een alternatief.
 * Alleen voor staf; het is een voorstel, de trainer neemt het over of past het aan.
 */

export const EXERCISE_ADVICE_SYSTEM = [
  'Je bent een ervaren personal trainer en fysiotherapeutisch geschoold. Je helpt een collega-trainer in een kleine studio.',
  'Geef voor één oefening: makkelijkere varianten (regressies), zwaardere varianten (progressies) en, als er een klacht wordt genoemd, een veilig alternatief voor die klacht.',
  'Schrijf in het Nederlands, kort en praktisch (maximaal 12 woorden per punt), zoals een trainer het in de les zegt. Gebruik gangbare oefennamen.',
  'Geen medische diagnoses. Bij twijfel of pijn: advies om te overleggen met een fysiotherapeut of huisarts, maar geef wel een veilig alternatief.',
  'Antwoord ALLEEN met JSON in dit formaat, zonder uitleg of markdown:',
  '{"regressions": ["..."], "progressions": ["..."], "alternatives": [{"reason": "klacht", "exercise": "wat dan"}]}',
  'Maximaal 3 regressies, 3 progressies en 3 alternatieven.',
].join('\n');

const clean = (v, max = 160) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

export function buildExerciseAdvicePrompt(exerciseName, complaint) {
  const name = clean(exerciseName, 120);
  const c = clean(complaint, 120);
  return c
    ? `Oefening: ${name}\nKlacht van de sporter: ${c}\nGeef regressies, progressies en in ieder geval een alternatief voor deze klacht (reason = "${c}").`
    : `Oefening: ${name}\nGeef regressies, progressies en alternatieven voor de meest voorkomende klachten (bijv. rug, knie, schouder, zwanger) als die bij deze oefening passen.`;
}

/** Wat het model teruggeeft, veilig in vorm gebracht. */
export function normalizeExerciseAdvice(parsed) {
  const list = (v) =>
    (Array.isArray(v) ? v : [])
      .map((x) => clean(x))
      .filter(Boolean)
      .slice(0, 3);
  const alts = (Array.isArray(parsed?.alternatives) ? parsed.alternatives : [])
    .map((a) => ({ reason: clean(a?.reason, 60), exercise: clean(a?.exercise) }))
    .filter((a) => a.exercise)
    .slice(0, 3);
  return { regressions: list(parsed?.regressions), progressions: list(parsed?.progressions), alternatives: alts };
}
