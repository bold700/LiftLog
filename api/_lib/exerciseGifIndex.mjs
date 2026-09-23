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
import { candidatesForExerciseDbLookup, EXERCISE_ALIASES_RAW } from './exerciseCatalog.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Twee mappen omhoog: dit bestand staat in api/_lib/, de data in src/data/.
// (Het `_lib`-voorvoegsel is nodig omdat Vercel elk ander bestand in api/ als functie telt.)
const DATA_DIR = join(__dirname, '..', '..', 'src', 'data');
const INDEX_PATH = join(DATA_DIR, 'exerciseGifIndex.json');
const OVERRIDES_PATH = join(DATA_DIR, 'exerciseGifOverrides.json');
const MEGA_CATALOG_PATH = join(DATA_DIR, 'mega_exercise_db.json');

/** [{ id, name, bodyPart, target, equipment, secondaryMuscles }] */
export const EXERCISES = JSON.parse(readFileSync(INDEX_PATH, 'utf8'));

/**
 * De eigen VORM-oefencatalogus (src/data/mega_exercise_db.json, ~118 stuks): de namen die
 * workout-editor en AI-workouts gebruiken. Van deze namen zit maar een deel (~27) ook letterlijk
 * in de ExerciseDB-dataset hierboven (die is los ingekocht voor de GIF's) — de rest, waaronder
 * bijvoorbeeld "Bulgarian Split Squat", vond de zoekfunctie daardoor nooit terug, ook niet op de
 * exacte naam. Hieronder aangevuld zodat elke naam die de app zelf kent ook doorzoekbaar is.
 */
let MEGA_CATALOG_EXERCISES = [];
try {
  const raw = JSON.parse(readFileSync(MEGA_CATALOG_PATH, 'utf8'));
  MEGA_CATALOG_EXERCISES = Array.isArray(raw.exercises) ? raw.exercises : [];
} catch {
  MEGA_CATALOG_EXERCISES = [];
}

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
 * Handmatige overrides: app-catalogusnaam → exercisedb-id, gedeeld met de app (src/data/exerciseGifOverrides.json).
 */
const OVERRIDES = Object.fromEntries(
  Object.entries(JSON.parse(readFileSync(OVERRIDES_PATH, 'utf8'))).filter(([k]) => !k.startsWith('_'))
);

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

/** NL-spiernaam (zoals in mega_exercise_db.json) → Engelse zoektokens (zoals MUSCLE_GROUP_TO_TOKENS). */
const DUTCH_MUSCLE_TOKENS = {
  borst: ['chest', 'pectoral'],
  'rug breed': ['lat', 'latissimus'],
  'rug dik': ['upper back', 'rhomboid', 'trapezius'],
  schouders: ['shoulder', 'deltoid', 'delts'],
  biceps: ['biceps', 'brachii'],
  triceps: ['triceps'],
  onderarm: ['forearm'],
  buik: ['abs', 'abdom'],
  onderrug: ['lower back', 'erector', 'lumbar', 'spine'],
  billen: ['glute'],
  quadriceps: ['quad'],
  hamstrings: ['hamstring'],
  kuiten: ['calf', 'calves'],
};

/** Vooraf berekende zoekindex over de eigen ExerciseDB-dataset (GIF's). */
const gifSearchRows = EXERCISES.map((e) => ({
  name: e.name,
  searchText: norm([e.name, e.target, e.bodyPart, ...(e.secondaryMuscles || [])].join(' ')),
  equipmentBucket: inferEquipmentBucket(e.equipment),
}));

/** Namen uit de VORM-catalogus die niet al (genormaliseerd) in de ExerciseDB-dataset zitten. */
const gifNormNames = new Set(gifSearchRows.map((r) => norm(r.name)));
const catalogSearchRows = MEGA_CATALOG_EXERCISES.filter((e) => !gifNormNames.has(norm(e.name))).map((e) => {
  const muscles = [...(e.muscles_primary || []), ...(e.muscles_secondary || [])];
  const extraTokens = muscles.flatMap((m) => DUTCH_MUSCLE_TOKENS[norm(m)] || []);
  return {
    name: e.name,
    searchText: norm([e.name, e.movement_pattern, ...muscles, ...extraTokens].join(' ')),
    equipmentBucket: inferEquipmentBucket(e.equipment),
  };
});

const SEARCH_ROWS = [...gifSearchRows, ...catalogSearchRows].sort((a, b) => a.name.localeCompare(b.name));

/**
 * NL/EN-aliassen (bankdrukken, kniebuiging, opdrukken, ...) meezoekbaar maken: wie de alias typt,
 * moet de bijbehorende oefening ook terugvinden, ongeacht of de canonieke naam Engels is.
 */
for (const row of SEARCH_ROWS) {
  const rowKey = norm(row.name);
  for (const [alias, target] of Object.entries(EXERCISE_ALIASES_RAW)) {
    if (norm(target) === rowKey) row.searchText += ` ${norm(alias)}`;
  }
}

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
