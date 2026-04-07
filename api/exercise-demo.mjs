/**
 * Zoekt ExerciseDB-oefening op naam (RapidAPI) en geeft id + optionele video-URL terug.
 * GIF wordt via /api/exercise-gif geserveerd (proxy met API-key).
 * Probeert meerdere namen (catalogus/aliassen) voor NL of vrije oefentitels uit AI-schema's.
 */
import { candidatesForExerciseDbLookup, normalizeExerciseKey } from './exerciseCatalog.mjs';
import { resolveExerciseOverride } from './exerciseDbOverrides.mjs';

const RAPID_HOST =
  (typeof process.env.EXERCISEDB_RAPIDAPI_HOST === 'string' && process.env.EXERCISEDB_RAPIDAPI_HOST.trim()) ||
  'edb-with-videos-and-images-by-ascendapi.p.rapidapi.com';
const API_KIND =
  (typeof process.env.EXERCISEDB_API_KIND === 'string' && process.env.EXERCISEDB_API_KIND.trim().toLowerCase()) ||
  (RAPID_HOST.includes('ascendapi') ? 'v2' : 'v1');

/** In-memory: herhaalde pagina-loads / meerdere clients op dezelfde machine = minder RapidAPI-calls. */
const DEMO_SUCCESS_CACHE = new Map();
const DEMO_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEMO_CACHE_MAX = 1500;
/** Max. zoekpogingen per request (Basic-quota). */
const MAX_NAME_LOOKUPS = 8;

function demoCacheGet(rawName) {
  const k = normalizeExerciseKey(rawName);
  const e = DEMO_SUCCESS_CACHE.get(k);
  if (!e) return null;
  if (Date.now() - e.at > DEMO_CACHE_TTL_MS) {
    DEMO_SUCCESS_CACHE.delete(k);
    return null;
  }
  return e.payload;
}

function demoCacheSetSuccess(rawName, payload) {
  const k = normalizeExerciseKey(rawName);
  if (DEMO_SUCCESS_CACHE.size >= DEMO_CACHE_MAX) {
    const first = DEMO_SUCCESS_CACHE.keys().next().value;
    DEMO_SUCCESS_CACHE.delete(first);
  }
  DEMO_SUCCESS_CACHE.set(k, { at: Date.now(), payload });
}
const RAPID_BASE = `https://${RAPID_HOST}`;

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

function pickExerciseId(item) {
  if (!item || typeof item !== 'object') return '';
  const id = item.exerciseId ?? item.exercise_id ?? item.id ?? item._id;
  if (typeof id === 'string' && id.trim()) return id.trim();
  if (typeof id === 'number' && Number.isFinite(id)) return String(id);
  return '';
}

/** RapidAPI / v2 kan { data: [...] }, { results: [...] } of één object teruggeven. */
function toExerciseArray(parsed) {
  if (parsed == null) return [];
  if (Array.isArray(parsed)) return parsed;
  if (typeof parsed !== 'object') return [];
  if (Array.isArray(parsed.data)) return parsed.data;
  if (Array.isArray(parsed.results)) return parsed.results;
  if (Array.isArray(parsed.exercises)) return parsed.exercises;
  if (parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data)) {
    const d = parsed.data;
    if (pickExerciseId(d) || typeof d?.name === 'string') return [d];
  }
  if (pickExerciseId(parsed) || typeof parsed.name === 'string') return [parsed];
  return [];
}

function normalizeVideoUrl(v) {
  if (typeof v !== 'string' || !v.trim()) return null;
  const t = v.trim();
  if (t.startsWith('https://') || t.startsWith('http://')) return t;
  return null;
}

function normalizeName(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[""'`´]/g, '')
    .replace(/[^\p{L}\p{N}\s/-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickBestExercise(parsed, candidateName) {
  const arr = toExerciseArray(parsed);
  if (!arr.length) return { item: null, score: -1, overlapRatio: 0 };
  if (arr.length === 1) return { item: arr[0], score: 0, overlapRatio: 0 };
  const cand = normalizeName(candidateName);
  const candTokens = cand.split(' ').filter((t) => t.length >= 3);
  const candTokenSet = new Set(candTokens);
  let best = arr[0];
  let bestScore = -1;
  let bestOverlapRatio = 0;
  for (const item of arr) {
    const n = normalizeName(item?.name || '');
    if (!n) continue;
    let score = 0;
    if (n === cand) score += 100;
    if (cand && n.includes(cand)) score += 25;
    if (cand && cand.includes(n)) score += 20;
    const nTokens = new Set(n.split(' ').filter((t) => t.length >= 3));
    let overlap = 0;
    for (const t of candTokens) {
      if (nTokens.has(t)) {
        score += 3;
        overlap += 1;
      }
    }
    const overlapRatio = candTokenSet.size ? overlap / candTokenSet.size : 0;
    if (score > bestScore) {
      bestScore = score;
      bestOverlapRatio = overlapRatio;
      best = item;
    }
  }
  return { item: best, score: bestScore, overlapRatio: bestOverlapRatio };
}

function pickFirstExercise(parsed) {
  const arr = toExerciseArray(parsed);
  return arr[0] || null;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const key = typeof process.env.EXERCISEDB_RAPIDAPI_KEY === 'string'
    ? process.env.EXERCISEDB_RAPIDAPI_KEY.trim()
    : '';
  if (!key) {
    return json(res, 503, {
      configured: false,
      error: 'ExerciseDB is niet geconfigureerd (EXERCISEDB_RAPIDAPI_KEY).',
    });
  }

  const q = req.query && typeof req.query === 'object' ? req.query : {};
  const name = typeof q.name === 'string' ? q.name.trim() : '';
  if (!name || name.length > 200) {
    return json(res, 400, { error: 'Parameter name is verplicht (max 200 tekens).' });
  }

  const cached = demoCacheGet(name);
  if (cached) {
    return json(res, 200, cached);
  }

  const fullTryNames = candidatesForExerciseDbLookup(name);
  const tryNames = fullTryNames.slice(0, MAX_NAME_LOOKUPS);
  if (!tryNames.length) {
    return json(res, 200, { configured: true, found: false, tried: [] });
  }

  const headers = {
    'X-RapidAPI-Key': key,
    'X-RapidAPI-Host': RAPID_HOST,
  };

  if (API_KIND === 'v2') {
    const override = resolveExerciseOverride(name);
    if (override?.exerciseId) {
      try {
        const detail = await fetch(`${RAPID_BASE}/api/v1/exercises/${encodeURIComponent(override.exerciseId)}`, {
          method: 'GET',
          headers,
        });
        if (detail.ok) {
          const parsed = await detail.json().catch(() => null);
          const first = pickFirstExercise(parsed);
          if (first && typeof first === 'object') {
            const body = {
              configured: true,
              found: true,
              exerciseId: pickExerciseId(first) || override.exerciseId,
              displayName:
                typeof first.name === 'string' && first.name.trim()
                  ? first.name
                  : override.displayName || name,
              videoUrl:
                normalizeVideoUrl(first.videoUrl) ||
                normalizeVideoUrl(first.video) ||
                normalizeVideoUrl(first.videoURL) ||
                null,
              ...(normalizeVideoUrl(first.imageUrl) && { gifUrl: normalizeVideoUrl(first.imageUrl) }),
              matchedQuery: name,
              tried: [name],
              source: 'override',
            };
            demoCacheSetSuccess(name, body);
            return json(res, 200, body);
          }
        }
      } catch {
        // Als override lookup faalt, val door naar normale zoekflow.
      }
    }
  }

  let lastDetails = '';
  let lastUpstreamStatus = 0;

  try {
    for (const candidate of tryNames) {
      const url =
        API_KIND === 'v2'
          ? `${RAPID_BASE}/api/v1/exercises/search?search=${encodeURIComponent(candidate)}`
          : `${RAPID_BASE}/exercises/name/${encodeURIComponent(candidate)}`;

      const upstream = await fetch(url, {
        method: 'GET',
        headers,
      });

      lastUpstreamStatus = upstream.status;
      lastDetails = await upstream.text().catch(() => '');

      if (!upstream.ok) {
        if (upstream.status === 401 || upstream.status === 403) {
          return json(res, 200, {
            configured: true,
            found: false,
            authIssue: true,
            rapidApiStatus: upstream.status,
            rapidApiMessage: lastDetails.slice(0, 500),
            tried: tryNames,
          });
        }
        if (upstream.status === 429) {
          return json(res, 200, {
            configured: true,
            found: false,
            rateLimited: true,
            rapidApiStatus: 429,
            rapidApiMessage: lastDetails.slice(0, 400),
            tried: tryNames,
          });
        }
        if (upstream.status >= 500) {
          return json(res, 502, {
            found: false,
            error: 'ExerciseDB gaf een serverfout.',
            details: lastDetails.slice(0, 200),
            tried: tryNames,
          });
        }
        continue;
      }

      let parsed;
      try {
        parsed = JSON.parse(lastDetails);
      } catch {
        continue;
      }
      const best = pickBestExercise(parsed, candidate);
      let first = best.item || pickFirstExercise(parsed);
      const isUnsafeFuzzy =
        API_KIND === 'v2' &&
        best.item &&
        best.score < 12 &&
        best.overlapRatio < 0.5 &&
        normalizeName(best.item?.name || '') !== normalizeName(candidate);
      if (isUnsafeFuzzy) {
        continue;
      }
      const exerciseId = pickExerciseId(first);

      if (!exerciseId) continue;

      if (API_KIND === 'v2') {
        const missingMedia =
          !normalizeVideoUrl(first?.videoUrl) &&
          !normalizeVideoUrl(first?.video) &&
          !normalizeVideoUrl(first?.videoURL);
        if (missingMedia) {
          try {
            const detail = await fetch(`${RAPID_BASE}/api/v1/exercises/${encodeURIComponent(exerciseId)}`, {
              method: 'GET',
              headers,
            });
            if (detail.ok) {
              const detailParsed = await detail.json().catch(() => null);
              const detailedFirst = pickFirstExercise(detailParsed);
              if (detailedFirst && typeof detailedFirst === 'object') {
                first = { ...(first || {}), ...detailedFirst };
              }
            }
          } catch {
            // detail-call is best-effort
          }
        }
      }

      const displayName = typeof first.name === 'string' ? first.name : candidate;
      const videoUrl =
        normalizeVideoUrl(first.videoUrl) ||
        normalizeVideoUrl(first.video) ||
        normalizeVideoUrl(first.videoURL);
      const gifUrl =
        normalizeVideoUrl(first.gifUrl) ||
        normalizeVideoUrl(first.gif) ||
        normalizeVideoUrl(first.imageUrl) ||
        normalizeVideoUrl(first.image);

      const body = {
        configured: true,
        found: true,
        exerciseId,
        displayName,
        videoUrl,
        ...(gifUrl && { gifUrl }),
        matchedQuery: candidate,
        tried: tryNames,
      };
      demoCacheSetSuccess(name, body);
      return json(res, 200, body);
    }

    const authHint =
      /not subscribed|not authorized|invalid api key|forbidden|wrong.*api/i.test(lastDetails) ||
      lastUpstreamStatus === 401 ||
      lastUpstreamStatus === 403;

    const rateHint = lastUpstreamStatus === 429 || /too many requests|rate limit|quota/i.test(lastDetails);

    return json(res, 200, {
      configured: true,
      found: false,
      tried: tryNames,
      details: lastDetails.slice(0, 200),
      rapidApiStatus: lastUpstreamStatus || undefined,
      ...(rateHint && {
        rateLimited: true,
        rapidApiMessage: lastDetails.slice(0, 400),
      }),
      ...(authHint &&
        !rateHint && {
          authIssue: true,
          rapidApiMessage: lastDetails.slice(0, 500),
        }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json(res, 502, { error: 'ExerciseDB-request mislukt.', details: msg.slice(0, 400), tried: tryNames });
  }
}
