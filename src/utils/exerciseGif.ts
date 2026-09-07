/**
 * GIF-URL bij een oefeningnaam, volledig client-side (geen API-call per oefening).
 * Zelfde bron en URL-patroon als api/exerciseGifIndex.mjs: metadata in
 * src/data/exerciseGifIndex.json, GIF's in Firebase Storage onder exercises/720/{id}.gif.
 * Bedoeld voor lijsten met veel rijen (autocomplete), waar per rij een fetch te duur is.
 */
import exerciseGifIndex from '../data/exerciseGifIndex.json';
import exerciseGifOverrides from '../data/exerciseGifOverrides.json';

type IndexEntry = { id: string; name: string };

const GIF_BASE =
  (typeof import.meta.env.VITE_EXERCISE_GIF_BASE === 'string' && import.meta.env.VITE_EXERCISE_GIF_BASE.trim()) ||
  'https://firebasestorage.googleapis.com/v0/b/vanas-d1a25.firebasestorage.app/o/exercises%2F720%2F';

/** Zelfde normalisatie als de server, zodat dezelfde namen dezelfde GIF opleveren. */
function norm(s: string): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** App-catalogusnaam → dataset-id (gedeeld met de server via src/data/exerciseGifOverrides.json). */
const OVERRIDES: Record<string, string> = Object.fromEntries(
  Object.entries(exerciseGifOverrides as Record<string, string>).filter(([k]) => !k.startsWith('_'))
);

const idByNorm = new Map<string, string>();
for (const e of exerciseGifIndex as IndexEntry[]) {
  const k = norm(e.name);
  if (k && !idByNorm.has(k)) idByNorm.set(k, e.id);
}

export function gifUrlForId(id: string): string {
  return `${GIF_BASE}${encodeURIComponent(id)}.gif?alt=media`;
}

/** Dataset-id voor een oefeningnaam (exact, genormaliseerd), of null. */
export function gifIdForExerciseName(name: string): string | null {
  const k = norm(name);
  if (!k) return null;
  return OVERRIDES[k] ?? idByNorm.get(k) ?? null;
}

/**
 * GIF-URL voor een oefeningnaam, of null als de naam niet (exact, genormaliseerd) in de dataset staat.
 * Geen fuzzy matching: in een keuzelijst is een verkeerd plaatje erger dan geen plaatje.
 */
export function gifUrlForExerciseName(name: string): string | null {
  const id = gifIdForExerciseName(name);
  return id ? gifUrlForId(id) : null;
}
