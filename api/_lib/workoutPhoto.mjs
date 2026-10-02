/**
 * Workout van een foto: een trainer fotografeert een schema (papier, whiteboard, een tabel op een
 * scherm) en de app neemt de oefeningen over als nieuwe workout, die hij daarna zelf aanpast.
 *
 * Het vision-model leest alleen af wat er staat. Hier maken we het netjes: een naam uit de
 * oefencatalogus als die past (anders de naam zoals op de foto, die kan de trainer zelf houden),
 * sets en herhalingen als ze erop staan (anders 3 × 10), en gewicht/materiaal en uitvoering in de
 * notitie. Eén gewicht wordt ook het doelgewicht; bij "12,5 of 15 kg" beslist de trainer.
 */

/** Wat op de foto ontbreekt, staat op dit standaardvoorstel. */
export const PHOTO_DEFAULT_SETS = 3;
export const PHOTO_DEFAULT_REPS = 10;

export function buildPhotoSystem(catalogAppend) {
  return (
    'Je leest een trainingsschema van een foto (papier, whiteboard, notitie of tabel op een scherm). ' +
    'Neem ALLEEN over wat er staat; verzin geen oefeningen, sets of gewichten. Behoud de volgorde. ' +
    'Staan er meerdere dagen of blokken (Dag 1, A/B, maandag …), maak dan per dag/blok een dag; anders één dag. ' +
    'Geef ALLEEN geldige JSON zonder markdown: ' +
    '{"name":string,"days":[{"dayLabel":string,"exercises":[{"nameOnPhoto":string,"catalogName":string|null,' +
    '"sets":number|null,"reps":number|null,"weightKg":number|null,"weightText":string,"notes":string}]}]}. ' +
    'name = titel of naam bovenaan de foto (bijv. de naam van de sporter), anders een korte beschrijving. ' +
    'nameOnPhoto = de oefening precies zoals op de foto. catalogName = de best passende naam uit de catalogus hieronder, ' +
    'alleen als het echt dezelfde oefening is, anders null. Bij "A óf B" kies je de eerste voor catalogName en zet je de keuze in notes. ' +
    'sets/reps alleen als ze op de foto staan (bijv. "3x10" → 3 en 10), anders null. ' +
    'weightKg alleen bij precies één gewicht in kg (bijv. "12 kg" → 12; "2,5 kg" → 2.5), anders null. ' +
    'weightText = gewicht/materiaal zoals op de foto (bijv. "12,5 of 15 kg", "20 kg + blauw elastiek"), anders "". ' +
    'notes = uitvoering/opmerking van de foto, anders "". Schrijf in het Nederlands zoals op de foto.' +
    catalogAppend
  );
}

const clampInt = (v, min, max) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= min ? Math.min(n, max) : null;
};
const clean = (v, max) =>
  String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

/** Notitie: gewicht/materiaal en uitvoering samen, zodat niets van de foto verloren gaat. */
function noteOf(weightText, notes) {
  const w = clean(weightText, 120);
  const n = clean(notes, 200);
  return [w ? `Gewicht/materiaal: ${w}.` : '', n].filter(Boolean).join(' ').slice(0, 240);
}

/**
 * Van modelantwoord naar workoutdagen zoals de editor ze kent. `resolve` zoekt een naam op in de
 * oefencatalogus (null als hij er niet in staat).
 */
export function normalizePhotoWorkout(parsed, resolve, fallbackName = 'Workout van foto') {
  const daysIn = Array.isArray(parsed?.days) ? parsed.days : [];
  const days = daysIn
    .map((day, i) => {
      const exercises = (Array.isArray(day?.exercises) ? day.exercises : [])
        .map((ex) => {
          const onPhoto = clean(ex?.nameOnPhoto ?? ex?.exerciseName, 80);
          const name = resolve(clean(ex?.catalogName, 80)) || resolve(onPhoto) || onPhoto;
          if (!name) return null;
          const weight = Number(ex?.weightKg);
          return {
            exerciseId: name,
            exerciseName: name,
            setsTarget: clampInt(ex?.sets, 1, 10) ?? PHOTO_DEFAULT_SETS,
            repsTarget: clampInt(ex?.reps, 1, 50) ?? PHOTO_DEFAULT_REPS,
            restSeconds: 60,
            notes: noteOf(ex?.weightText, ex?.notes),
            ...(Number.isFinite(weight) && weight > 0 && weight <= 500 ? { targetWeight: Math.round(weight * 10) / 10 } : {}),
          };
        })
        .filter(Boolean)
        .slice(0, 20);
      return exercises.length ? { dayLabel: clean(day?.dayLabel, 60) || `Dag ${i + 1}`, exercises } : null;
    })
    .filter(Boolean)
    .slice(0, 7);
  const name = clean(parsed?.name, 120) || fallbackName;
  return { name, days };
}
