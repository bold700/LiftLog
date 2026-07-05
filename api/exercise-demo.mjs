/**
 * Zoekt een oefening op naam in de eigen dataset en geeft id + GIF-URL terug.
 * De GIF komt uit Firebase Storage (exercises/720/{id}.gif). Geen externe API.
 */
import { resolveExercise, gifUrlForId } from './exerciseGifIndex.mjs';

function json(res, status, body) {
  const payload = JSON.stringify(body);
  const ct = 'application/json; charset=utf-8';
  if (typeof res.writeHead === 'function' && typeof res.status !== 'function') {
    res.writeHead(status, { 'Content-Type': ct });
    res.end(payload);
    return;
  }
  if (typeof res.status === 'function') {
    res.status(status).setHeader('Content-Type', ct);
    res.end(payload);
    return;
  }
  res.statusCode = status;
  res.setHeader('Content-Type', ct);
  res.end(payload);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const q = req.query && typeof req.query === 'object' ? req.query : {};
  const name = typeof q.name === 'string' ? q.name.trim() : '';
  if (!name || name.length > 200) {
    return json(res, 400, { error: 'Parameter name is verplicht (max 200 tekens).' });
  }

  const match = resolveExercise(name);
  if (!match) {
    return json(res, 200, { configured: true, found: false });
  }

  return json(res, 200, {
    configured: true,
    found: true,
    exerciseId: match.id,
    displayName: match.name,
    gifUrl: gifUrlForId(match.id),
    videoUrl: null,
    matchedQuery: name,
  });
}
