/**
 * Workout inspreken: de trainer zegt de oefeningen en gewichten ("goblet squat, drie keer tien,
 * twaalf kilo; deadlift twaalf en een half of vijftien kilo …") en de app maakt er een workout van,
 * die hij daarna zelf aanpast. Eerst wordt de opname tekst (transcriptie), dan haalt het model
 * de oefeningen eruit, net als bij een foto (zie workoutPhoto.mjs: zelfde JSON en zelfde opschoning).
 */

/** Opname als data-URL; Vercel neemt tot ~4,5 MB per verzoek aan. */
export const MAX_AUDIO_CHARS = 4 * 1024 * 1024;
/** Uitgeschreven of gedicteerde tekst. */
export const MAX_VOICE_TEXT = 4000;

const AUDIO_RE = /^data:audio\/(webm|mp4|m4a|x-m4a|mpeg|mp3|ogg|wav|x-wav|aac)(;[^,;]*)*;base64,/i;
const EXT = { webm: 'webm', mp4: 'mp4', m4a: 'm4a', 'x-m4a': 'm4a', mpeg: 'mp3', mp3: 'mp3', ogg: 'ogg', wav: 'wav', 'x-wav': 'wav', aac: 'm4a' };

/** Is dit een opname die we aannemen? Geeft het type (voor de bestandsnaam) of null. */
export function audioKind(dataUrl) {
  const m = typeof dataUrl === 'string' ? AUDIO_RE.exec(dataUrl) : null;
  return m ? EXT[m[1].toLowerCase()] : null;
}

/** Woorden uit de sportschool, zodat de transcriptie "goblet squat" niet als "goblet scott" schrijft. */
const TRANSCRIBE_HINT =
  'Trainingsschema in het Nederlands met Engelse oefennamen: goblet squat, deadlift, Romanian deadlift, hip thrust, ' +
  'lunges, bench press, dumbbell row, lat pulldown, kettlebell swing, plank, side steps, elastiek, sets, herhalingen, kilo.';

/** Opname naar tekst (OpenAI transcriptie). `fetchImpl` voor tests. */
export async function transcribeAudio(dataUrl, { apiKey, model, fetchImpl = fetch }) {
  const ext = audioKind(dataUrl);
  if (!ext) throw new Error('Geen geldige opname.');
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const bytes = Buffer.from(base64, 'base64');
  const form = new FormData();
  form.append('file', new Blob([bytes]), `opname.${ext}`);
  form.append('model', model);
  form.append('language', 'nl');
  form.append('prompt', TRANSCRIBE_HINT);
  form.append('response_format', 'json');
  const response = await fetchImpl('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI HTTP ${response.status}: ${text.slice(0, 400)}`);
  }
  const payload = await response.json();
  return String(payload?.text ?? '').trim();
}

/** Instructie om uit gesproken tekst een workout te halen; zelfde JSON als bij een foto. */
export function buildVoiceSystem(catalogAppend) {
  return (
    'Je krijgt de uitgeschreven tekst van een trainer die een trainingsschema inspreekt. Het is spreektaal: ' +
    'getallen kunnen voluit staan ("drie keer tien", "twaalf en een half kilo"), er kunnen herhalingen, ' +
    'verbeteringen ("nee, vijftien kilo") en stopwoorden in zitten. Neem ALLEEN over wat de trainer noemt; verzin ' +
    'geen oefeningen, sets of gewichten. Bij een verbetering geldt het laatste wat gezegd is. Behoud de volgorde. ' +
    'Noemt de trainer meerdere dagen of blokken (dag 1, dag A, maandag …), maak dan per dag/blok een dag; anders één dag. ' +
    'Geef ALLEEN geldige JSON zonder markdown: ' +
    '{"name":string,"days":[{"dayLabel":string,"exercises":[{"nameOnPhoto":string,"catalogName":string|null,' +
    '"sets":number|null,"reps":number|null,"weightKg":number|null,"weightText":string,"notes":string}]}]}. ' +
    'name = de naam die de trainer noemt (bijv. van de sporter of de workout), anders een korte beschrijving. ' +
    'nameOnPhoto = de oefening zoals genoemd. catalogName = de best passende naam uit de catalogus hieronder, alleen als ' +
    'het echt dezelfde oefening is, anders null. Bij "A of B" kies je de eerste voor catalogName en zet je de keuze in notes. ' +
    'sets/reps alleen als ze genoemd worden ("drie keer tien" → 3 en 10), anders null. ' +
    'weightKg alleen bij precies één gewicht in kg ("twaalf kilo" → 12; "twaalf en een half" → 12.5), anders null. ' +
    'weightText = gewicht/materiaal zoals genoemd, in cijfers (bijv. "12,5 of 15 kg", "20 kg + blauw elastiek"), anders "". ' +
    'notes = uitvoering of opmerking die de trainer noemt, kort, anders "". Schrijf in het Nederlands.' +
    catalogAppend
  );
}
