/**
 * LiftLog-oefencatalogus (zelfde bron als src/data/mega_exercise_db.json).
 * AI-workouts mogen alleen deze namen gebruiken zodat loggen en metadata kloppen.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import process from 'node:process';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** NL/EN-varianten → exacte catalogusnaam (canonical uit JSON). */
const EXERCISE_ALIASES_RAW = {
  bankdrukken: 'Barbell Bench Press',
  'halter bankdrukken': 'Barbell Bench Press',
  benchpress: 'Barbell Bench Press',
  'bench press': 'Barbell Bench Press',
  squat: 'Barbell Back Squat',
  kniebuiging: 'Barbell Back Squat',
  'back squat': 'Barbell Back Squat',
  'barbell squat': 'Barbell Back Squat',
  'front squat': 'Barbell Front Squat',
  deadlift: 'Barbell Deadlift',
  'romanian deadlift': 'Barbell Romanian Deadlift',
  rdl: 'Barbell Romanian Deadlift',
  stiff: 'Barbell Romanian Deadlift',
  'good morning': 'Barbell Good Morning',
  'barbell row': 'Barbell Bent-Over Row',
  'bent over row': 'Barbell Bent-Over Row',
  'bent-over row': 'Barbell Bent-Over Row',
  'pendlay row': 'Pendlay Row',
  'pull up': 'Pull-Up',
  'pull-up': 'Pull-Up',
  'pull ups': 'Pull-Up',
  pullups: 'Pull-Up',
  'chin up': 'Chin-Up',
  'chin-up': 'Chin-Up',
  'overhead press': 'Barbell Overhead Press (OHP)',
  ohp: 'Barbell Overhead Press (OHP)',
  'military press': 'Barbell Overhead Press (OHP)',
  'shoulder press': 'Dumbbell Shoulder Press',
  schouderdrukken: 'Barbell Overhead Press (OHP)',
  'lat pulldown': 'Lat Pulldown',
  'leg press': 'Leg Press Machine',
  'leg extension': 'Leg Extension Machine',
  'leg curl': 'Seated Leg Curl Machine',
  'romanian deadlift dumbbell': 'Dumbbell Romanian Deadlift',
  'dumbbell press': 'Dumbbell Chest Press',
  'goblet squat': 'Goblet Squat',
  opdrukken: 'Push-Up',
  pushup: 'Push-Up',
  pushups: 'Push-Up',
  'push up': 'Push-Up',
  dips: 'Dip (tricep / borst)',
  dip: 'Dip (tricep / borst)',
  plank: 'Plank',
  crunches: 'Crunch',
  'hip thrust': 'Barbell Hip Thrust',
  lunges: 'Dumbbell Lunge',
  lunge: 'Dumbbell Lunge',
  'walking lunge': 'Dumbbell Walking Lunge',
  'calf raise': 'Bodyweight Calf Raise',
  'face pull': 'Cable Face Pull',
  'tricep pushdown': 'Cable Tricep Pushdown (Stang)',
  'bicep curl': 'Dumbbell Bicep Curl',
  'barbell curl': 'Barbell Bicep Curl',
  'cable row': 'Cable Seated Row',
  'seated row': 'Seated Row Machine',
  'chest press': 'Chest Press Machine',
  flyes: 'Dumbbell Flye',
  fly: 'Dumbbell Flye',
  'incline bench': 'Incline Barbell Bench Press',
  'decline bench': 'Decline Barbell Bench Press',
};

function levenshtein(a, b) {
  if (a.length < b.length) return levenshtein(b, a);
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const cur = [i + 1];
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      cur[j + 1] = Math.min(cur[j] + 1, prev[j + 1] + 1, prev[j] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}

export function normalizeExerciseKey(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[""'`´]/g, '')
    .replace(/[^\p{L}\p{N}\s/-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function loadMegaExerciseNamesFromDisk() {
  const cwd = process.cwd();
  const candidates = [
    join(__dirname, '../src/data/mega_exercise_db.json'),
    join(cwd, 'src/data/mega_exercise_db.json'),
    join(__dirname, 'data/mega_exercise_db.json'),
  ];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    try {
      const j = JSON.parse(readFileSync(p, 'utf8'));
      const arr = Array.isArray(j.exercises) ? j.exercises : [];
      return arr.map((e) => e.name).filter((n) => typeof n === 'string' && n.trim());
    } catch {
      // try next
    }
  }
  return [];
}

/**
 * @returns {{ resolve: (raw: string) => string | null, catalogMarkdown: string, names: string[] }}
 */
export function buildExerciseCatalog(namesIn) {
  const names = [...new Set((namesIn || []).filter(Boolean))];
  const setExact = new Set(names);
  const lowerToCanonical = new Map();
  for (const n of names) {
    lowerToCanonical.set(normalizeExerciseKey(n), n);
  }

  const aliasMap = new Map();
  for (const [k, v] of Object.entries(EXERCISE_ALIASES_RAW)) {
    const target = setExact.has(v) ? v : null;
    if (!target) continue;
    aliasMap.set(normalizeExerciseKey(k), target);
  }

  function resolve(raw) {
    const trimmed = typeof raw === 'string' ? raw.trim().slice(0, 200) : '';
    if (!trimmed) return null;
    if (setExact.has(trimmed)) return trimmed;

    const key = normalizeExerciseKey(trimmed);
    const fromAlias = aliasMap.get(key);
    if (fromAlias) return fromAlias;

    const fromLower = lowerToCanonical.get(key);
    if (fromLower) return fromLower;

    let bestContain = null;
    let bestContainLen = 0;
    for (const n of names) {
      const nk = normalizeExerciseKey(n);
      if (key.length >= 5 && nk.includes(key) && nk.length > bestContainLen) {
        bestContainLen = nk.length;
        bestContain = n;
      }
      if (nk.length >= 6 && key.includes(nk) && nk.length > bestContainLen) {
        bestContainLen = nk.length;
        bestContain = n;
      }
    }
    if (bestContain) return bestContain;

    let best = null;
    let bestDist = Infinity;
    for (const n of names) {
      const nk = normalizeExerciseKey(n);
      const d = levenshtein(key, nk);
      if (d < bestDist) {
        bestDist = d;
        best = n;
      }
    }
    const maxLen = Math.max(key.length, normalizeExerciseKey(best || '').length, 1);
    const sim = best ? 1 - bestDist / maxLen : 0;
    if (best && (sim >= 0.82 || bestDist <= 2)) return best;
    return null;
  }

  const catalogMarkdown = names.map((n) => `- ${n}`).join('\n');

  return { resolve, catalogMarkdown, names };
}

let _cached = null;

export function getExerciseCatalog() {
  if (!_cached) {
    const names = loadMegaExerciseNamesFromDisk();
    _cached = buildExerciseCatalog(names.length ? names : []);
  }
  return _cached;
}

/**
 * Opeenvolgende zoektermen voor ExerciseDB (Engels), afgeleid uit vrije / NL schematekst.
 */
export function candidatesForExerciseDbLookup(raw) {
  const cat = getExerciseCatalog();
  const { resolve, names } = cat;
  const nameSet = new Set(names);
  const seen = new Set();
  const out = [];
  const add = (s) => {
    if (typeof s !== 'string' || !s.trim()) return;
    const t = s.trim();
    if (seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };
  /** ExerciseDB /name/{name} is hoofdlettergevoelig; catalogus gebruikt Title Case. */
  const addLowerIfDifferent = (s) => {
    if (typeof s !== 'string' || !s.trim()) return;
    const t = s.trim();
    const lo = t.toLowerCase();
    if (lo !== t) add(lo);
  };

  const trimmed = typeof raw === 'string' ? raw.trim().slice(0, 200) : '';
  if (!trimmed) return [];

  const nk = normalizeExerciseKey(trimmed);

  /**
   * Ascend `/exercises/search` matcht vaak token-gedeeltelijk (bijv. "pulldown" → "Sliding Floor Pulldown on Towel").
   * Betrouwbare demo-zoektermen eerst = juiste video vóór misleidende hits.
   */
  const priorityFirst = [];
  const prioritySeen = new Set();
  const addPriority = (s) => {
    if (typeof s !== 'string' || !s.trim()) return;
    const t = s.trim();
    if (prioritySeen.has(t)) return;
    prioritySeen.add(t);
    priorityFirst.push(t);
    const lo = t.toLowerCase();
    if (lo !== t && !prioritySeen.has(lo)) {
      prioritySeen.add(lo);
      priorityFirst.push(lo);
    }
  };

  if (nk.includes('dumbbell') && nk.includes('bicep') && nk.includes('curl')) {
    addPriority('Hammer Curl');
    addPriority('Cross Body Hammer Curl');
  }
  if (nk.includes('barbell') && nk.includes('bicep') && nk.includes('curl')) {
    addPriority('Hammer Curl');
  }
  if (nk.includes('cable') && nk.includes('bicep') && nk.includes('curl')) {
    addPriority('Hammer Curl');
  }
  if (nk.includes('bicep') && nk.includes('curl') && nk.includes('machine')) {
    addPriority('Hammer Curl');
  }
  if (
    (nk.includes('lat') && nk.includes('pulldown')) ||
    (nk.includes('cable') && nk.includes('lat') && nk.includes('pulldown'))
  ) {
    addPriority('Wide Grip Pull-Up');
    addPriority('Pull-up');
  }

  if (nk.includes('squat') && (nk.includes('lichaam') || nk.includes('bodyweight') || nk.includes('eigen'))) {
    add('Bodyweight Squat');
    add('Goblet Squat');
  }

  /** Eerst catalogus-Engels: minder 404’s en minder RapidAPI-calls dan lange NL-titel eerst. */
  const resolved = resolve(trimmed);
  if (resolved) {
    add(resolved);
    addLowerIfDifferent(resolved);
  }
  add(trimmed);
  addLowerIfDifferent(trimmed);

  for (const [aliasKey, target] of Object.entries(EXERCISE_ALIASES_RAW)) {
    if (!nameSet.has(target)) continue;
    const ak = normalizeExerciseKey(aliasKey);
    if (ak.length >= 3 && nk.includes(ak)) add(target);
  }

  if (nk.includes('glute') && nk.includes('bridge')) {
    add('Glute Bridge');
  }

  if (
    (nk.includes('dumbbell') && nk.includes('row')) ||
    (nk.includes('bent') && nk.includes('row')) ||
    (nk.includes('roeien') && nk.includes('dumbbell'))
  ) {
    add('Dumbbell Bent-Over Row');
    add('Barbell Bent-Over Row');
  }

  for (const tok of nk.split(/\s+/).filter((w) => w.length >= 3)) {
    const target = EXERCISE_ALIASES_RAW[tok];
    if (target && nameSet.has(target)) add(target);
  }

  const merged = [];
  const seenMerged = new Set();
  for (const t of [...priorityFirst, ...out]) {
    if (seenMerged.has(t)) continue;
    seenMerged.add(t);
    merged.push(t);
  }
  return merged;
}
