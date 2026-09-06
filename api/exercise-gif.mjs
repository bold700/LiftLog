import { applyCors } from './cors.mjs';
/**
 * Stilstaand beeld (eerste frame) van een oefening-GIF, als PNG.
 * Voor de PDF-export: Firebase Storage stuurt geen CORS-headers, dus de browser kan de GIF niet
 * zelf in een canvas tekenen. Deze functie haalt de GIF (~1 MB) op, decodeert het eerste frame en
 * geeft een kleine PNG terug die jsPDF direct kan inbedden.
 *
 *   GET /api/exercise-gif?id=0585[&size=320]
 */
import { gifUrlForId } from './exerciseGifIndex.mjs';
import { gifFirstFrameToPng } from './_lib/gifFrame.mjs';

const ID_RE = /^[A-Za-z0-9_-]{1,32}$/;
const MIN_SIZE = 64;
const MAX_SIZE = 720;
const DEFAULT_SIZE = 320;
const FETCH_TIMEOUT_MS = 12000;

function send(res, status, body, headers) {
  res.statusCode = status;
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(body);
}

function sendJson(res, status, obj) {
  send(res, status, JSON.stringify(obj), {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });

  const q = req.query && typeof req.query === 'object' ? req.query : {};
  const id = typeof q.id === 'string' ? q.id.trim() : '';
  if (!ID_RE.test(id)) return sendJson(res, 400, { error: 'Parameter id is verplicht.' });
  const sizeRaw = Number.parseInt(typeof q.size === 'string' ? q.size : '', 10);
  const size = Number.isFinite(sizeRaw) ? Math.min(MAX_SIZE, Math.max(MIN_SIZE, sizeRaw)) : DEFAULT_SIZE;

  let gif;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const upstream = await fetch(gifUrlForId(id), { signal: ctrl.signal });
      if (upstream.status === 404) return sendJson(res, 404, { error: 'Geen GIF voor deze oefening.' });
      if (!upstream.ok) return sendJson(res, 502, { error: `Storage antwoordde ${upstream.status}.` });
      gif = new Uint8Array(await upstream.arrayBuffer());
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return sendJson(res, 502, { error: `GIF ophalen mislukt: ${msg}` });
  }

  let png;
  try {
    png = gifFirstFrameToPng(gif, { maxSize: size });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return sendJson(res, 422, { error: `GIF decoderen mislukt: ${msg}` });
  }

  // De GIF's veranderen niet; lang cachen in de browser en aan de edge.
  send(res, 200, png, {
    'Content-Type': 'image/png',
    'Content-Length': String(png.length),
    'Cache-Control': 'public, max-age=604800, s-maxage=31536000, immutable',
  });
}
