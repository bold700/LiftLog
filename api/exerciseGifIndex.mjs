/**
 * Eigen ExerciseDB-dataset (gekocht, self-hosted). Vervangt de RapidAPI-koppeling.
 * - Metadata (naam, spiergroep, equipment) staat lokaal in src/data/exerciseGifIndex.json
 * - GIF's staan in Firebase Storage onder exercises/720/{id}.gif
 *
 * Levert:
 *   resolveExercise(name)  → beste match uit de dataset op naam (met aliassen/overrides)
 *   gifUrlForId(id)        → publieke Firebase-URL van de GIF
 *   searchExercises(opts)  → autocomplete-lijst met namen (term/equipment/spiergroep-filter)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { candidatesForExerciseDbLookup } from './exerciseCatalog.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INDEX_PATH = join(__dirname, '..', 'src', 'data', 'exerciseGifIndex.json');

/** [{ id, name, bodyPart, target, equipment, secondaryMuscles }] */
export const EXERCISES = JSON.parse(readFileSync(INDEX_PATH, 'utf8'));

/** Firebase Storage basis-URL voor de 720p-GIF's (publiek leesbaar via Storage-rules). */
const GIF_BASE =
  (typeof process.env.EXERCISE_GIF_BASE === 'string' && process.env.EXERCISE_GIF_BASE.trim()) ||
  'https://firebasestorage.googleapis.com/v0/b/vanas-d1a25.firebasestorage.app/o/exercises%2F720%2F';

export function gifUrlForId(id) {
  return `${GIF_BASE}${encodeURIComponent(id)}.gif?alt=media`;
}

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

const byNorm = new Map();
for (const e of EXERCISES) {
  const k = norm(e.name);
  if (!byNorm.has(k)) byNorm.set(k, e);
}
const byId = new Map(EXERCISES.map((e) => [e.id, e]));

/**
 * Handmatige overrides: app-catalogusnaam → exercisedb-id.
 * Nodig voor machine-/varianten die de dataset anders benoemt (bv. "lever ...").
 */
const OVERRIDES = {
  'leg extension machine': '0585', // lever leg extension
  'seated leg curl machine': '0599', // lever seated leg curl
  'lying leg curl machine': '0586', // lever lying leg curl
  'lateral raise machine': '0178', // cable lateral raise
  'seated row machine': '0180', // cable low seated row
  'hip abductor machine': '0597', // lever seated hip abduction
  'hip adductor machine': '0598', // lever seated hip adduction
  'hyperextension machine back extension': '0489', // hyperextension
  'lower back extension machine': '0489', // hyperextension
  'barbell back squat': '0043', // barbell full squat
  'lat pulldown': '0150', // cable bar lateral pulldown
  'trx row': '0808', // suspended row
  'bulgarian split squat': '0099', // barbell single leg split squat
  'glute kickback machine': '0860', // cable kickback
  'cable glute kickback': '0860', // cable kickback
};

/** Zoek de beste dataset-oefening bij een (mogelijk NL/vrije) naam. Geeft null als niets past. */
export function resolveExercise(name) {
  const nk = norm(name);
  if (OVERRIDES[nk] && byId.has(OVERRIDES[nk])) return byId.get(OVERRIDES[nk]);

  const candidates = candidatesForExerciseDbLookup(name);
  // 1) exacte (genormaliseerde) naam-match op een van de kandidaten
  for (const c of candidates) {
    const hit = byNorm.get(norm(c));
    if (hit) return hit;
  }
  // 2) woord-match: alle woorden van een kandidaat komen voor in een oefeningsnaam
  for (const c of candidates) {
    const words = norm(c).split(' ').filter((w) => w.length >= 3);
    if (!words.length) continue;
    const hit = EXERCISES.find((e) => {
      const en = norm(e.name);
      return words.every((w) => en.includes(w));
    });
    if (hit) return hit;
  }
  return null;
}

// --- Autocomplete/zoeken (vervangt de RapidAPI-index in exercise-search) ---

function inferEquipmentBucket(equipment) {
  const e = norm(equipment);
  if (e.includes('cable') || e.includes('pulley')) return 'cable';
  if (e.includes('machine') || e.includes('lever') || e.includes('smith') || e.includes('sled')) return 'machine';
  if (e.includes('body weight') || e === 'bodyweight' || e.includes('assisted')) return 'bodyweight';
  if (e.includes('dumbbell') || e.includes('barbell') || e.includes('kettlebell') || e.includes('ez barbell') || e.includes('weighted'))
    return 'free_weight';
  return 'other';
}

const MUSCLE_GROUP_TO_TOKENS = {
  Borst: ['chest', 'pectoral'],
  Biceps: ['biceps', 'brachii'],
  Triceps: ['triceps'],
  Schouders: ['shoulder', 'deltoid', 'delts'],
  Traps: ['traps', 'trapezius'],
  Lats: ['lat', 'latissimus'],
  'Upper Back': ['upper back', 'rhomboid', 'trapezius'],
  'Lower Back': ['lower back', 'erector', 'lumbar', 'spine'],
  Buikspieren: ['abs', 'abdom'],
  Obliques: ['oblique'],
  Quadriceps: ['quad', 'quadriceps'],
  Kuiten: ['calf', 'calves'],
  Hamstrings: ['hamstring'],
  Gluteals: ['glute'],
  Underarms: ['forearm'],
};

/** Vooraf berekende zoekindex over de eigen dataset. */
const SEARCH_ROWS = EXERCISES.map((e) => ({
  name: e.name,
  searchText: norm([e.name, e.target, e.bodyPart, ...(e.secondaryMuscles || [])].join(' ')),
  equipmentBucket: inferEquipmentBucket(e.equipment),
})).sort((a, b) => a.name.localeCompare(b.name));

export function searchExercises({ term = '', equipment = 'all', muscleGroup = '', limit = 5000 } = {}) {
  let filtered = SEARCH_ROWS;
  if (equipment && equipment !== 'all') {
    filtered = filtered.filter((r) => r.equipmentBucket === equipment);
  }
  if (muscleGroup && MUSCLE_GROUP_TO_TOKENS[muscleGroup]) {
    const tokens = MUSCLE_GROUP_TO_TOKENS[muscleGroup].map(norm);
    filtered = filtered.filter((r) => tokens.some((t) => r.searchText.includes(t)));
  }
  const t = norm(term);
  if (t) {
    filtered = filtered.filter((r) => norm(r.name).includes(t) || r.searchText.includes(t));
  }
  return filtered.map((r) => r.name).slice(0, limit);
}
