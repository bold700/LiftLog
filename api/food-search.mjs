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
 *
 * Er wordt in het Nederlands gezocht (`langs=nl`). Zonder die parameter zoekt Open Food Facts in de
 * Engelse productnaam, en daar staat "kwark" zelden in: 64 treffers tegenover 1580 mét. Dat scheelde
 * de hele Nederlandse supermarkt. Levert het Nederlands weinig op — bij een Engelse term als
 * "protein bar" — dan zoeken we er alsnog zonder taal bij.
 */
const SEARCH_URL = 'https://search.openfoodfacts.org/search';
const USER_AGENT = 'LiftLog/1.0 (https://lift-log-phi.vercel.app)';
const FIELDS = 'code,product_name,brands,nutriments,serving_size,quantity,image_small_url,image_url,nutriscore_grade,countries_tags';
const PAGE_SIZE = 50;
/** Onder dit aantal Nederlandse treffers zoeken we er ook nog zonder taal bij. */
const MIN_RESULTS_BEFORE_FALLBACK = 8;
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

/** Suiker, vezels, verzadigd vet en zout per 100 g, of null als het etiket ze niet noemt. */
export function nutritionDetails(n) {
  const opt = (k) => (n?.[k] != null && n[k] !== '' && Number.isFinite(Number(n[k])) ? Math.round(Number(n[k]) * 10) / 10 : null);
  const d = { sugars: opt('sugars_100g'), fiber: opt('fiber_100g'), saturatedFat: opt('saturated-fat_100g'), salt: opt('salt_100g') };
  return Object.values(d).some((v) => v != null) ? d : null;
}

/** Verkocht in Nederland? Zo'n product hoort in de lijst boven een Duits of Frans equivalent. */
function soldInNl(countriesTags) {
  return Array.isArray(countriesTags) && countriesTags.includes('en:netherlands');
}

/**
 * Zet zoekresultaten van Open Food Facts om naar de vorm die de app gebruikt.
 * Producten zonder naam of zonder enige voedingswaarde vallen af: die zijn niet te loggen.
 */
export function mapOffHits(hits) {
  const out = [];
  for (const p of Array.isArray(hits) ? hits : []) {
    const name = String(p?.product_name ?? '').trim();
    // Geen naam, of alleen een barcode als naam: daar kan niemand iets mee in een lijst.
    if (!name || /^[\d\s-]+$/.test(name)) continue;
    const n = p?.nutriments ?? {};
    if (!NUTRIMENT_KEYS.some((k) => n[k] != null)) continue;
    let kcal = num(n['energy-kcal_100g']);
    if (!kcal && n['energy_100g']) kcal = num(n['energy_100g']) / 4.184;
    const grade = typeof p?.nutriscore_grade === 'string' ? p.nutriscore_grade.toLowerCase() : '';
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
      // "450 g" op de verpakking: dan is "hele bak" een portie die je kunt aantikken.
      packageGrams: parseServingGrams(p?.quantity),
      imageLargeUrl: typeof p?.image_url === 'string' ? p.image_url : null,
      nutriscore: /^[a-e]$/.test(grade) ? grade : null,
      details: nutritionDetails(n),
      nl: soldInNl(p?.countries_tags),
    });
  }
  return out;
}

/**
 * Nederlandse treffers eerst, daarna de rest; een product dat in beide lijsten zit telt één keer.
 */
export function mergeProducts(primary, secondary) {
  const seen = new Set();
  const out = [];
  for (const p of [...primary, ...secondary]) {
    const key = p.code || `${p.name}|${p.brand}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

async function searchOff(term, { langs, signal }) {
  const params = { q: term, page_size: String(PAGE_SIZE), fields: FIELDS };
  if (langs) params.langs = langs;
  const upstream = await fetch(`${SEARCH_URL}?${new URLSearchParams(params)}`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal,
  });
  if (!upstream.ok) throw new Error(`Open Food Facts antwoordde ${upstream.status}`);
  const data = await upstream.json();
  return mapOffHits(data?.hits);
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });

  const query = req.query && typeof req.query === 'object' ? req.query : {};
  const term = (typeof query.q === 'string' ? query.q : '').trim().slice(0, 64);
  if (!term) return json(res, 400, { ok: false, products: [], error: 'Geef een zoekterm op.' });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const signal = controller.signal;
    let products = await searchOff(term, { langs: 'nl', signal });
    if (products.length < MIN_RESULTS_BEFORE_FALLBACK) {
      // Een Engelse of merkterm: de wereldwijde zoekopdracht erbij, Nederlandse treffers blijven voorop.
      const world = await searchOff(term, { signal }).catch(() => []);
      products = mergeProducts(products, world);
    }
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400');
    return json(res, 200, { ok: true, products });
  } catch (e) {
    console.error('[food-search] Open Food Facts niet bereikbaar:', e);
    return json(res, 502, { ok: false, products: [], error: 'De productendatabase is even niet bereikbaar.' });
  } finally {
    clearTimeout(timer);
  }
}
