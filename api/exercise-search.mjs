/**
 * Autocomplete over de eigen ExerciseDB-dataset (geen externe API).
 * Query: ?q=&equipment=&muscleGroup=&limit=  →  { ok, options: string[] }
 */
import { searchExercises } from './exerciseGifIndex.mjs';

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
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });

  const q = req.query && typeof req.query === 'object' ? req.query : {};
  const term = typeof q.q === 'string' ? q.q.trim().slice(0, 120) : '';
  const equipment = typeof q.equipment === 'string' ? q.equipment.trim().slice(0, 40) : 'all';
  const muscleGroup = typeof q.muscleGroup === 'string' ? q.muscleGroup.trim().slice(0, 40) : '';
  const limitRaw = typeof q.limit === 'string' ? Number.parseInt(q.limit, 10) : 5000;
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(20000, limitRaw)) : 5000;

  try {
    const options = searchExercises({ term, equipment, muscleGroup, limit });
    return json(res, 200, { ok: true, options });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json(res, 500, { ok: false, options: [], error: msg.slice(0, 300) });
  }
}
