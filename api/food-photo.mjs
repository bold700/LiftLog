/**
 * Herkent voeding op een foto met een vision-model (OpenAI) en geeft per item een
 * naam + geschatte portie (gram) + geschatte voedingswaarde per 100 g terug.
 * De app matcht daarna op de eigen database of gebruikt deze schatting.
 */
const OPENAI_API_URL = 'https://api.openai.com/v1/responses';
const MODEL = (process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || 'gpt-4.1-mini').trim().split(/\s+/)[0];

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

function extractText(payload) {
  if (!payload || typeof payload !== 'object') return '';
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) return payload.output_text;
  const out = Array.isArray(payload.output) ? payload.output : [];
  for (const item of out) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const c of content) {
      if (typeof c?.text === 'string' && c.text.trim()) return c.text;
    }
  }
  return '';
}

function parseJsonLenient(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    const a = raw.indexOf('{');
    const b = raw.lastIndexOf('}');
    if (a >= 0 && b > a) return JSON.parse(raw.slice(a, b + 1));
    throw new Error('Geen geldige JSON');
  }
}

const SYSTEM =
  'Je bent een voedingsherkenner. Je krijgt een foto van eten of een voedingsproduct. ' +
  'Identificeer de zichtbare voeding. Geef Nederlandse namen waar mogelijk. Schat per item de portie in gram ' +
  'en de voedingswaarde per 100 gram (kcal, eiwit, koolhydraten, vet). Wees realistisch; verzin geen items. ' +
  'Antwoord ALLEEN met JSON: {"items":[{"name":string,"grams":number,"per100g":{"kcal":number,"protein":number,"carbs":number,"fat":number}}]}. Maximaal 4 items.';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  if (!process.env.OPENAI_API_KEY) return json(res, 500, { error: 'OPENAI_API_KEY ontbreekt op de server.' });

  const image = req.body?.image;
  if (typeof image !== 'string' || !image.startsWith('data:image')) {
    return json(res, 400, { error: 'Geen geldige afbeelding.' });
  }

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        max_output_tokens: 600,
        input: [
          { role: 'system', content: [{ type: 'input_text', text: SYSTEM }] },
          {
            role: 'user',
            content: [
              { type: 'input_text', text: 'Welke voeding staat op deze foto? Geef naam, portie in gram en waarden per 100 g.' },
              { type: 'input_image', image_url: image },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return json(res, 502, { error: 'Vision-model gaf een fout.', details: text.slice(0, 300) });
    }
    const payload = await response.json();
    const raw = extractText(payload);
    if (!raw) return json(res, 502, { error: 'Lege AI-respons.' });
    const parsed = parseJsonLenient(raw);
    const itemsRaw = Array.isArray(parsed?.items) ? parsed.items : [];
    const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);
    const items = itemsRaw
      .map((it) => ({
        name: String(it?.name ?? '').trim(),
        grams: Math.max(1, Math.round(num(it?.grams) || 100)),
        per100g: {
          kcal: Math.round(num(it?.per100g?.kcal)),
          protein: Math.round(num(it?.per100g?.protein) * 10) / 10,
          carbs: Math.round(num(it?.per100g?.carbs) * 10) / 10,
          fat: Math.round(num(it?.per100g?.fat) * 10) / 10,
        },
      }))
      .filter((it) => it.name)
      .slice(0, 4);
    return json(res, 200, { items });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json(res, 502, { error: 'Fotoherkenning mislukt.', details: msg.slice(0, 300) });
  }
}
