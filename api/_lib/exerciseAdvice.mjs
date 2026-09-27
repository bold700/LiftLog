/**
 * Slim voorstel voor de oefeningenbibliotheek (via api/generate-workout.mjs, mode "exercise_advice").
 * Het model geeft regressies, progressies en, als de trainer een klacht noemt, een alternatief.
 * Elk voorstel is een oefening uit de VORM-catalogus (zodat er een gifje bij hoort) met een korte
 * aanwijzing. Alleen voor staf; het is een voorstel, de trainer neemt het over of past het aan.
 */

export const EXERCISE_ADVICE_SYSTEM = [
  'Je bent een ervaren personal trainer en fysiotherapeutisch geschoold. Je helpt een collega-trainer in een kleine studio.',
  'Geef voor één oefening: makkelijkere varianten (regressies), zwaardere varianten (progressies) en, als er een klacht wordt genoemd, een veilig alternatief voor die klacht.',
  'Kies voor "exercise" bij voorkeur een naam uit de meegegeven catalogus, exact zoals geschreven. Past niets, gebruik dan een gangbare Engelse oefennaam. Noem nooit de oefening zelf.',
  'Zet in "note" een korte aanwijzing in het Nederlands (maximaal 10 woorden), zoals een trainer het in de les zegt. Een aanwijzing zonder andere oefening (bijv. tempo) mag met een lege "exercise".',
  'Geen medische diagnoses. Bij pijn: advies om te overleggen met een fysiotherapeut, maar geef wel een veilig alternatief.',
  'Antwoord ALLEEN met JSON in dit formaat, zonder uitleg of markdown:',
  '{"regressions": [{"exercise": "...", "note": "..."}], "progressions": [{"exercise": "...", "note": "..."}], "alternatives": [{"reason": "klacht", "exercise": "...", "note": "..."}]}',
  'Maximaal 3 regressies, 3 progressies en 3 alternatieven.',
].join('\n');

const clean = (v, max = 160) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

export function buildExerciseAdvicePrompt(exerciseName, complaint, catalogNames = []) {
  const name = clean(exerciseName, 120);
  const c = clean(complaint, 120);
  const catalog = catalogNames.length ? `\nCatalogus: ${catalogNames.join('; ')}` : '';
  const ask = c
    ? `Klacht van de sporter: ${c}\nGeef regressies, progressies en in ieder geval een alternatief voor deze klacht (reason = "${c}").`
    : 'Geef regressies, progressies en alternatieven voor de meest voorkomende klachten (bijv. rug, knie, schouder, zwanger) als die bij deze oefening passen.';
  return `Oefening: ${name}\n${ask}${catalog}`;
}

/** Een voorstel als { exercise, note }; ook losse tekst van het model wordt geaccepteerd. */
function toRef(v) {
  if (typeof v === 'string') return { exercise: clean(v, 120), note: '' };
  return { exercise: clean(v?.exercise, 120), note: clean(v?.note) };
}

/** Wat het model teruggeeft, veilig in vorm gebracht. */
export function normalizeExerciseAdvice(parsed) {
  const list = (v) =>
    (Array.isArray(v) ? v : [])
      .map(toRef)
      .filter((r) => r.exercise || r.note)
      .slice(0, 3);
  const alts = (Array.isArray(parsed?.alternatives) ? parsed.alternatives : [])
    .map((a) => ({ reason: clean(a?.reason, 60), ...toRef(a) }))
    .filter((a) => a.exercise || a.note)
    .slice(0, 3);
  return { regressions: list(parsed?.regressions), progressions: list(parsed?.progressions), alternatives: alts };
}
