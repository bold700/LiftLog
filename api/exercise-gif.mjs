/**
 * Proxy voor ExerciseDB animated GIF (RapidAPI). Houdt de API-key server-side.
 * Zie: https://edb-docs.up.railway.app/docs/image-service/image
 */
const RAPID_HOST = 'exercisedb.p.rapidapi.com';
const RAPID_BASE = `https://${RAPID_HOST}`;
const ALLOWED_RES = new Set(['180', '360', '720', '1080']);

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

function sendGif(res, buffer) {
  const headers = {
    'Content-Type': 'image/gif',
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
  return typeof id === 'string' && /^[a-zA-Z0-9_-]{4,64}$/.test(id);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const key = process.env.EXERCISEDB_RAPIDAPI_KEY;
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

  const imgUrl = `${RAPID_BASE}/image?exerciseId=${encodeURIComponent(exerciseId)}&resolution=${resolution}`;

  try {
    const upstream = await fetch(imgUrl, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': key,
        'X-RapidAPI-Host': RAPID_HOST,
      },
    });

    if (!upstream.ok) {
      return json(res, upstream.status === 422 ? 422 : 502, {
        error: 'GIF kon niet worden opgehaald.',
      });
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    sendGif(res, buf);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json(res, 502, { error: 'Proxyfout.', details: msg.slice(0, 200) });
  }
}
