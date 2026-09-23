import { applyCors } from './_lib/cors.mjs';
import { requireUser, enforceRateLimit } from './_lib/requireUser.mjs';
import { sanitizeBodyScan } from './_lib/bodyScan.mjs';
import { BODYANALYSE_DATA_URL, bodyAnalyseKeyFromInput, bodyScanFromCodeValue, codeValueList } from './_lib/bodyAnalyseQr.mjs';
/**
 * Bodyscan via de QR-code van de BodyAnalyse-weegschaal ("Show qrcode" op het apparaat): de app
 * stuurt de link (of sleutel) uit de QR-code, de server haalt de meting bij de fabrikant op en
 * geeft hem terug in de vorm die de app kent. Zo hoeft er geen foto van het scherm meer gemaakt
 * te worden, en zijn de waarden exact.
 *
 * Via de server, niet vanuit de app: de bron is gewone http op een vast IP-adres, en dat mag de
 * app (https, Capacitor) niet zelf ophalen. Alleen ingelogd, met een daglimiet.
 */

function json(res, status, body) {
  const payload = JSON.stringify(body);
  const ct = 'application/json; charset=utf-8';
  if (typeof res.status === 'function') {
    res.status(status).setHeader('Content-Type', ct);
    res.end(payload);
    return;
  }
  res.writeHead(status, { 'Content-Type': ct });
  res.end(payload);
}

const RATE_LIMIT_PER_DAY = 60;
const DAY_MS = 24 * 60 * 60 * 1000;
const UPSTREAM_TIMEOUT_MS = 12_000;

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const user = await requireUser(req, res);
  if (!user) return;

  const key = bodyAnalyseKeyFromInput(req.body?.url ?? req.body?.key);
  if (!key) return json(res, 400, { error: 'Dit is geen QR-code van de BodyAnalyse-weegschaal.' });
  if (!(await enforceRateLimit(user.db, res, user.uid, 'bodyscan-qr', RATE_LIMIT_PER_DAY, DAY_MS))) return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  let payload;
  try {
    const upstream = await fetch(BODYANALYSE_DATA_URL + key, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!upstream.ok) {
      console.error('[bodyscan-qr] fabrikant antwoordde', upstream.status);
      return json(res, 502, { error: 'De weegschaal-server gaf geen meting terug. Probeer het zo nog eens, of maak een foto.' });
    }
    payload = await upstream.json();
  } catch (e) {
    console.error('[bodyscan-qr] ophalen mislukt:', e?.name === 'AbortError' ? 'timeout' : e);
    return json(res, 504, { error: 'De weegschaal-server reageert niet. Probeer het zo nog eens, of maak een foto.' });
  } finally {
    clearTimeout(timer);
  }

  const list = codeValueList(payload);
  if (!list) {
    console.error('[bodyscan-qr] onverwachte vorm:', JSON.stringify(payload).slice(0, 300));
    return json(res, 502, { error: 'De meting achter deze QR-code is niet leesbaar. Maak een foto van het scherm.' });
  }
  const scan = sanitizeBodyScan(bodyScanFromCodeValue(list));
  if (!scan) return json(res, 422, { error: 'Geen meetwaarden gevonden achter deze QR-code.' });
  return json(res, 200, { scan });
}
