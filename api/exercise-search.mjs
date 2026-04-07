const RAPID_HOST =
  (typeof process.env.EXERCISEDB_RAPIDAPI_HOST === 'string' && process.env.EXERCISEDB_RAPIDAPI_HOST.trim()) ||
  'edb-with-videos-and-images-by-ascendapi.p.rapidapi.com';
const RAPID_BASE = `https://${RAPID_HOST}`;
const API_KIND = (typeof process.env.EXERCISEDB_API_KIND === 'string' ? process.env.EXERCISEDB_API_KIND : 'v2')
  .trim()
  .toLowerCase();

const SEARCH_CACHE = new Map();
const SEARCH_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
let EXERCISE_INDEX = null;
let INDEX_LOADED_AT = 0;
const INDEX_TTL_MS = 6 * 60 * 60 * 1000;

function json(res, status, body) {
  const payload = JSON.stringify(body);
  const ct = { 'Content-Type': 'application/json; charset=utf-8' };
  if (typeof res.writeHead === 'function' && typeof res.status !== 'function') {
    res.writeHead(status, ct);
    res.end(payload);
    return;
  }
  if (typeof res.status === 'function') {
    res.status(status).setHeader('Content-Type', ct['Content-Type']);
    res.end(payload);
    return;
  }
  res.statusCode = status;
  res.setHeader('Content-Type', ct['Content-Type']);
  res.end(payload);
}

function fromCache(key) {
  const entry = SEARCH_CACHE.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > SEARCH_CACHE_TTL_MS) {
    SEARCH_CACHE.delete(key);
    return null;
  }
  return entry.value;
}

function toCache(key, value) {
  SEARCH_CACHE.set(key, { at: Date.now(), value });
}

function normalizeName(s) {
  return String(s || '').trim();
}

function normalizeKey(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}\s/-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferEquipmentBucket(equipments) {
  const list = Array.isArray(equipments) ? equipments.map((x) => normalizeKey(x)) : [];
  if (list.some((e) => e.includes('cable') || e.includes('pulley'))) return 'cable';
  if (list.some((e) => e.includes('machine') || e.includes('lever'))) return 'machine';
  if (list.some((e) => e.includes('body weight') || e === 'bodyweight')) return 'bodyweight';
  if (list.some((e) => e.includes('dumbbell') || e.includes('barbell') || e.includes('kettlebell'))) return 'free_weight';
  return 'other';
}

const MUSCLE_GROUP_TO_TOKENS = {
  Borst: ['chest', 'pectoralis'],
  Biceps: ['biceps', 'brachii'],
  Triceps: ['triceps'],
  Schouders: ['shoulder', 'deltoid'],
  Traps: ['traps', 'trapezius'],
  Lats: ['lat', 'latissimus'],
  'Upper Back': ['upper back', 'rhomboid', 'trapezius'],
  'Lower Back': ['lower back', 'erector', 'lumbar'],
  Buikspieren: ['abs', 'abdom'],
  Obliques: ['oblique'],
  Quadriceps: ['quad', 'quadriceps'],
  Kuiten: ['calf', 'calves'],
  Hamstrings: ['hamstring'],
  Gluteals: ['glute'],
  Underarms: ['forearm'],
};

const SEARCH_SYNONYMS = {
  'chest press': ['bench press', 'chest dip'],
};

function withSearchSynonyms(term) {
  const key = normalizeKey(term);
  const extras = SEARCH_SYNONYMS[key] || [];
  return [term, ...extras];
}

async function loadFullIndex(headers) {
  const now = Date.now();
  if (EXERCISE_INDEX && now - INDEX_LOADED_AT < INDEX_TTL_MS) return EXERCISE_INDEX;

  const rows = [];
  const seen = new Set();
  let after = '';
  let offset = 0;
  const pageSize = 100;
  let guard = 0;
  while (guard < 900) {
    guard += 1;
    const p = new URLSearchParams({ limit: String(pageSize) });
    if (API_KIND === 'v1') {
      p.set('offset', String(offset));
    } else if (after) {
      p.set('after', after);
    }
    const url = API_KIND === 'v1' ? `${RAPID_BASE}/exercises?${p.toString()}` : `${RAPID_BASE}/api/v1/exercises?${p.toString()}`;
    const r = await fetch(url, { method: 'GET', headers });
    if (!r.ok) break;
    const j = await r.json().catch(() => null);
    const arr = API_KIND === 'v1' ? (Array.isArray(j) ? j : []) : Array.isArray(j?.data) ? j.data : [];
    for (const item of arr) {
      const name = normalizeName(item?.name);
      if (!name) continue;
      const key = normalizeKey(name);
      if (seen.has(key)) continue;
      seen.add(key);
      const target = API_KIND === 'v1'
        ? [item?.target].filter((x) => typeof x === 'string' && x.trim())
        : Array.isArray(item?.targetMuscles)
          ? item.targetMuscles
          : [];
      const secondary = Array.isArray(item?.secondaryMuscles) ? item.secondaryMuscles : [];
      const bodyParts = API_KIND === 'v1'
        ? [item?.bodyPart].filter((x) => typeof x === 'string' && x.trim())
        : Array.isArray(item?.bodyParts)
          ? item.bodyParts
          : [];
      const equipments = API_KIND === 'v1'
        ? [item?.equipment].filter((x) => typeof x === 'string' && x.trim())
        : item?.equipments;
      rows.push({
        name,
        searchText: normalizeKey([name, ...target, ...secondary, ...bodyParts].join(' ')),
        equipmentBucket: inferEquipmentBucket(equipments),
      });
    }
    if (API_KIND === 'v1') {
      if (arr.length === 0) break;
      offset += arr.length;
      continue;
    }
    const next = typeof j?.meta?.nextCursor === 'string' ? j.meta.nextCursor : '';
    if (!next || next === after || arr.length === 0) break;
    after = next;
  }

  EXERCISE_INDEX = rows.sort((a, b) => a.name.localeCompare(b.name));
  INDEX_LOADED_AT = Date.now();
  return EXERCISE_INDEX;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });

  const key = typeof process.env.EXERCISEDB_RAPIDAPI_KEY === 'string' ? process.env.EXERCISEDB_RAPIDAPI_KEY.trim() : '';
  if (!key) return json(res, 503, { error: 'EXERCISEDB_RAPIDAPI_KEY ontbreekt.' });

  const q = req.query && typeof req.query === 'object' ? req.query : {};
  const term = typeof q.q === 'string' ? q.q.trim().slice(0, 120) : '';
  const equipment = typeof q.equipment === 'string' ? q.equipment.trim().slice(0, 40) : 'all';
  const muscleGroup = typeof q.muscleGroup === 'string' ? q.muscleGroup.trim().slice(0, 40) : '';
  const limitRaw = typeof q.limit === 'string' ? Number.parseInt(q.limit, 10) : 5000;
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(20000, limitRaw)) : 5000;

  const cacheKey = `${term.toLowerCase()}::${equipment.toLowerCase()}::${muscleGroup.toLowerCase()}::${limit}`;
  const cached = fromCache(cacheKey);
  if (cached) return json(res, 200, cached);

  const headers = { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': RAPID_HOST };

  try {
    const allRows = await loadFullIndex(headers);
    let filtered = allRows;
    if (equipment && equipment !== 'all') {
      filtered = filtered.filter((r) => r.equipmentBucket === equipment);
    }
    if (muscleGroup && MUSCLE_GROUP_TO_TOKENS[muscleGroup]) {
      const tokens = MUSCLE_GROUP_TO_TOKENS[muscleGroup].map(normalizeKey);
      filtered = filtered.filter((r) => tokens.some((t) => r.searchText.includes(t)));
    }
    if (term) {
      const queries = withSearchSynonyms(term).map(normalizeKey).filter(Boolean);
      filtered = filtered.filter((r) => queries.some((q) => normalizeKey(r.name).includes(q)));
    }
    const names = filtered.map((r) => r.name).slice(0, limit);
    const body = { ok: true, options: names };
    toCache(cacheKey, body);
    return json(res, 200, body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json(res, 502, { ok: false, options: [], error: msg.slice(0, 300) });
  }
}

