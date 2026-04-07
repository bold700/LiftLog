/**
 * Zoekt ExerciseDB-oefening op naam (RapidAPI) en geeft id + optionele video-URL terug.
 * GIF wordt via /api/exercise-gif geserveerd (proxy met API-key).
 * Probeert meerdere namen (catalogus/aliassen) voor NL of vrije oefentitels uit AI-schema's.
 */
import { candidatesForExerciseDbLookup } from './exerciseCatalog.mjs';

const RAPID_HOST = 'exercisedb.p.rapidapi.com';
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
  const id = item.exerciseId ?? item.id;
  if (typeof id === 'string' && id.trim()) return id.trim();
  if (typeof id === 'number' && Number.isFinite(id)) return String(id);
  return '';
}

function normalizeVideoUrl(v) {
  if (typeof v !== 'string' || !v.trim()) return null;
  const t = v.trim();
  if (t.startsWith('https://') || t.startsWith('http://')) return t;
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const key = process.env.EXERCISEDB_RAPIDAPI_KEY;
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

  const tryNames = candidatesForExerciseDbLookup(name);
  if (!tryNames.length) {
    return json(res, 200, { configured: true, found: false, tried: [] });
  }

  const headers = {
    'X-RapidAPI-Key': key,
    'X-RapidAPI-Host': RAPID_HOST,
  };

  let lastDetails = '';

  try {
    for (const candidate of tryNames) {
      const pathSeg = encodeURIComponent(candidate);
      const url = `${RAPID_BASE}/exercises/name/${pathSeg}`;

      const upstream = await fetch(url, {
        method: 'GET',
        headers,
      });

      if (!upstream.ok) {
        lastDetails = await upstream.text().catch(() => '');
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

      const data = await upstream.json();
      const list = Array.isArray(data) ? data : data ? [data] : [];
      const first = list[0];
      const exerciseId = pickExerciseId(first);

      if (!exerciseId) continue;

      const displayName = typeof first.name === 'string' ? first.name : candidate;
      const videoUrl =
        normalizeVideoUrl(first.videoUrl) ||
        normalizeVideoUrl(first.video) ||
        normalizeVideoUrl(first.videoURL);

      return json(res, 200, {
        configured: true,
        found: true,
        exerciseId,
        displayName,
        videoUrl,
        matchedQuery: candidate,
        tried: tryNames,
      });
    }

    return json(res, 200, {
      configured: true,
      found: false,
      tried: tryNames,
      details: lastDetails.slice(0, 200),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json(res, 502, { error: 'ExerciseDB-request mislukt.', details: msg.slice(0, 400), tried: tryNames });
  }
}
