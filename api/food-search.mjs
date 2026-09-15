import { applyCors } from './_lib/cors.mjs';
/**
 * Productzoeken via Open Food Facts.
 *
 * Waarom via de server en niet rechtstreeks uit de app:
 *  - de zoek-API (search.openfoodfacts.org) stuurt geen CORS-header, dus de browser blokkeert
 *    een directe aanroep;
 *  - Open Food Facts vraagt om een herkenbare User-Agent, die een browser niet mag zetten;
 *  - antwoorden kunnen hier gecachet worden, wat het zoeken sneller maakt en het aantal
 *    aanroepen naar Open Food Facts beperkt.
 *
 * Query: ?q=kwark  →  { ok, products: FoodProduct[] }
 */
const SEARCH_URL = 'https://search.openfoodfacts.org/search';
const USER_AGENT = 'LiftLog/1.0 (https://lift-log-phi.vercel.app)';
const FIELDS = 'code,product_name,brands,nutriments,serving_size,image_small_url';
const PAGE_SIZE = 24;
const TIMEOUT_MS = 8000;

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

function num(v) {
  const n = typeof v === 'number' ? v : v != null && v !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
}

/** "30 g", "1 portie (150g)" → 30 / 150. Null als er geen gram in staat. */
export function parseServingGrams(s) {
  if (typeof s !== 'string') return null;
  // g moet een eenheid zijn, geen begin van een ander woord: "1 glas" is geen 1 gram.
  const m = s.match(/([\d.,]+)\s*g(?:ram)?(?![a-z])/i);
  if (!m) return null;
  const g = Number(m[1].replace(',', '.'));
  return Number.isFinite(g) && g > 0 ? g : null;
}

/** Merk: de zoek-API geeft een lijst, de oude API een komma-string. */
function firstBrand(brands) {
  if (Array.isArray(brands)) return String(brands[0] ?? '').trim();
  return String(brands ?? '').split(',')[0].trim();
}

const NUTRIMENT_KEYS = ['energy-kcal_100g', 'energy_100g', 'proteins_100g', 'carbohydrates_100g', 'fat_100g'];

/**
 * Zet zoekresultaten van Open Food Facts om naar de vorm die de app gebruikt.
 * Producten zonder naam of zonder enige voedingswaarde vallen af: die zijn niet te loggen.
 */
export function mapOffHits(hits) {
  const out = [];
  for (const p of Array.isArray(hits) ? hits : []) {
    const name = String(p?.product_name ?? '').trim();
    if (!name) continue;
    const n = p?.nutriments ?? {};
    if (!NUTRIMENT_KEYS.some((k) => n[k] != null)) continue;
    let kcal = num(n['energy-kcal_100g']);
    if (!kcal && n['energy_100g']) kcal = num(n['energy_100g']) / 4.184;
    out.push({
      code: String(p?.code ?? ''),
      name,
      brand: firstBrand(p?.brands),
      imageUrl: typeof p?.image_small_url === 'string' ? p.image_small_url : null,
      per100g: {
        kcal: Math.round(kcal),
        protein: Math.round(num(n['proteins_100g']) * 10) / 10,
        carbs: Math.round(num(n['carbohydrates_100g']) * 10) / 10,
        fat: Math.round(num(n['fat_100g']) * 10) / 10,
      },
      servingGrams: parseServingGrams(p?.serving_size),
    });
  }
  return out;
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });

  const query = req.query && typeof req.query === 'object' ? req.query : {};
  const term = (typeof query.q === 'string' ? query.q : '').trim().slice(0, 64);
  if (!term) return json(res, 400, { ok: false, products: [], error: 'Geef een zoekterm op.' });

  const url = `${SEARCH_URL}?${new URLSearchParams({ q: term, page_size: String(PAGE_SIZE), fields: FIELDS })}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const upstream = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!upstream.ok) {
      return json(res, 502, { ok: false, products: [], error: 'De productendatabase is even niet bereikbaar.' });
    }
    const data = await upstream.json();
    const products = mapOffHits(data?.hits);
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400');
    return json(res, 200, { ok: true, products });
  } catch (e) {
    console.error('[food-search] Open Food Facts niet bereikbaar:', e);
    return json(res, 502, { ok: false, products: [], error: 'De productendatabase is even niet bereikbaar.' });
  } finally {
    clearTimeout(timer);
  }
}
