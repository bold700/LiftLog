/**
 * Proxy voor ExerciseDB animated GIF (RapidAPI). Houdt de API-key server-side.
 * Zie: https://edb-docs.up.railway.app/docs/image-service/image
 */
const RAPID_HOST =
  (typeof process.env.EXERCISEDB_RAPIDAPI_HOST === 'string' && process.env.EXERCISEDB_RAPIDAPI_HOST.trim()) ||
  'edb-with-videos-and-images-by-ascendapi.p.rapidapi.com';
const RAPID_BASE = `https://${RAPID_HOST}`;
const API_KIND =
  (typeof process.env.EXERCISEDB_API_KIND === 'string' && process.env.EXERCISEDB_API_KIND.trim().toLowerCase()) ||
  (RAPID_HOST.includes('ascendapi') ? 'v2' : 'v1');
const ALLOWED_RES = new Set(['180', '360', '720', '1080']);

const GIF_BIN_CACHE = new Map();
const GIF_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const GIF_CACHE_MAX = 800;

function gifCacheKey(exerciseId, resolution) {
  return `${exerciseId}:${resolution}`;
}

function gifCacheGet(exerciseId, resolution) {
  const k = gifCacheKey(exerciseId, resolution);
  const e = GIF_BIN_CACHE.get(k);
  if (!e) return null;
  if (Date.now() - e.at > GIF_CACHE_TTL_MS) {
    GIF_BIN_CACHE.delete(k);
    return null;
  }
  return e;
}

function gifCacheSet(exerciseId, resolution, media) {
  const k = gifCacheKey(exerciseId, resolution);
  if (GIF_BIN_CACHE.size >= GIF_CACHE_MAX) {
    const first = GIF_BIN_CACHE.keys().next().value;
    GIF_BIN_CACHE.delete(first);
  }
  GIF_BIN_CACHE.set(k, { at: Date.now(), ...media });
}

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

function sendMedia(res, buffer, contentType = 'image/gif') {
  const headers = {
    'Content-Type': contentType,
    'Cache-Control': 'public, max-age=86400',
  };
  if (typeof res.writeHead === 'function' && typeof res.status !== 'function') {
    res.writeHead(200, headers);
    res.end(buffer);
    return;
  }
  if (typeof res.status === 'function') {
    res.status(200);
    for (const [k, v] of Object.entries(headers)) {
      res.setHeader(k, v);
    }
    res.end(buffer);
    return;
  }
  res.statusCode = 200;
  for (const [k, v] of Object.entries(headers)) {
    res.setHeader(k, v);
  }
  res.end(buffer);
}

function validExerciseId(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]{4,96}$/.test(id);
}

function pickExerciseFromParsed(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  if (Array.isArray(parsed.data)) return parsed.data[0] || null;
  if (parsed.data && typeof parsed.data === 'object') return parsed.data;
  if (Array.isArray(parsed.results)) return parsed.results[0] || null;
  return parsed;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const key =
    typeof process.env.EXERCISEDB_RAPIDAPI_KEY === 'string'
      ? process.env.EXERCISEDB_RAPIDAPI_KEY.trim()
      : '';
  if (!key) {
    return json(res, 503, { error: 'EXERCISEDB_RAPIDAPI_KEY ontbreekt.' });
  }

  const q = req.query && typeof req.query === 'object' ? req.query : {};
  const exerciseId = typeof q.exerciseId === 'string' ? q.exerciseId.trim() : '';
  /** Standaard 180: BASIC-tier RapidAPI ondersteunt vaak alleen 180; PRO+ kan 360/720/1080. */
  const resParam = typeof q.resolution === 'string' ? q.resolution.trim() : '180';
  const resolution = ALLOWED_RES.has(resParam) ? resParam : '180';

  if (!validExerciseId(exerciseId)) {
    return json(res, 400, { error: 'Ongeldige exerciseId.' });
  }

  const cachedBuf = gifCacheGet(exerciseId, resolution);
  if (cachedBuf) {
    sendMedia(res, cachedBuf.buf, cachedBuf.contentType);
    return;
  }

  try {
    const headers = {
      'X-RapidAPI-Key': key,
      'X-RapidAPI-Host': RAPID_HOST,
    };

    let mediaUrl = '';
    if (API_KIND === 'v2') {
      const meta = await fetch(`${RAPID_BASE}/api/v1/exercises/${encodeURIComponent(exerciseId)}`, {
        method: 'GET',
        headers,
      });
      if (!meta.ok) {
        return json(res, meta.status === 404 ? 404 : 502, { error: 'Media kon niet worden opgehaald.' });
      }
      const parsed = await meta.json().catch(() => null);
      const ex = pickExerciseFromParsed(parsed);
      const imageUrls = ex && typeof ex === 'object' ? ex.imageUrls : null;
      const imgFromMap =
        imageUrls && typeof imageUrls === 'object'
          ? imageUrls[resolution === '1080' ? '1080p' : resolution === '720' ? '720p' : '360p']
          : null;
      mediaUrl =
        (typeof imgFromMap === 'string' && imgFromMap) ||
        (typeof ex?.imageUrl === 'string' ? ex.imageUrl : '') ||
        (typeof ex?.image === 'string' ? ex.image : '');
    } else {
      mediaUrl = `${RAPID_BASE}/image?exerciseId=${encodeURIComponent(exerciseId)}&resolution=${resolution}`;
    }

    if (!mediaUrl) {
      return json(res, 404, { error: 'Geen media beschikbaar voor deze oefening.' });
    }

    const upstream = await fetch(mediaUrl, {
      method: 'GET',
      headers: API_KIND === 'v2' ? undefined : headers,
    });

    if (!upstream.ok) {
      return json(res, upstream.status === 422 ? 422 : 502, { error: 'Media kon niet worden opgehaald.' });
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    const contentType = upstream.headers.get('content-type') || 'image/gif';
    gifCacheSet(exerciseId, resolution, { buf, contentType });
    sendMedia(res, buf, contentType);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json(res, 502, { error: 'Proxyfout.', details: msg.slice(0, 200) });
  }
}
