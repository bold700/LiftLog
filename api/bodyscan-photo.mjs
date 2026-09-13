import { applyCors } from './_lib/cors.mjs';
import { requireUser, enforceRateLimit } from './_lib/requireUser.mjs';
import { sanitizeBodyScan, BODY_SCAN_KEYS, BODY_SCAN_SEGMENT_KEYS } from './_lib/bodyScan.mjs';
/**
 * Leest de uitslag van een lichaamsanalyse-weegschaal (BodyAnalyse/VA, InBody, …) van foto's
 * van het scherm of de uitdraai, met een vision-model (OpenAI). Geeft de waarden, de normaal-
 * waardes en de segmentale spier/vet-verdeling als JSON terug; de app laat de gebruiker alles
 * controleren voordat het bij de sporter wordt opgeslagen.
 *
 * Zelfde opzet als food-photo: alleen ingelogd, daglimiet, foto's als data-URL.
 */
const OPENAI_API_URL = 'https://api.openai.com/v1/responses';
// Kleine cijfers op een schuin gefotografeerd scherm: het mini-model verwisselt segmentwaarden; het volle model niet.
// Volume is laag (enkele scans per dag), dus de hogere prijs per foto weegt niet op tegen een verkeerde uitslag.
const MODEL = (process.env.OPENAI_BODYSCAN_MODEL || 'gpt-4.1').trim().split(/\s+/)[0];

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
  'Je leest de uitslag van een lichaamsanalyse-weegschaal (bio-impedantie) van foto\'s: het scherm van het apparaat ' +
  'of een uitdraai, soms schuin gefotografeerd, soms verdeeld over meerdere foto\'s. Lees ALLEEN wat er staat; verzin ' +
  'niets en rond niet af. Een waarde die je niet ziet laat je weg (null). ' +
  'Bekende apparaten: (1) "BodyAnalyse" (Engelstalig scherm) met secties: 1 Human Body Composition Analysis (Body ' +
  'Moisture=bodyWaterKg, Protein=proteinKg, Inorganic Salt=mineralKg, Body Fat=fatMassKg, Fat-free Weight=fatFreeMassKg, ' +
  'Weight=weightKg; elke regel heeft een Measured Value en een Normal Range "a~b"); 2 Muscle Fat Analysis (Weight, ' +
  'Skeletal Muscle=skeletalMuscleKg, Body Fat=fatMassKg, met Normal Range); 3 Overweight Analysis (Body Mass Parameters=bmi, ' +
  'Body fat percentage=bodyFatPct, Waist to hip ratio=waistHipRatio, Subcutaneous fat=subcutaneousFat, met Normal Range); ' +
  '4 Segmental Muscles: per lichaamsdeel twee getallen boven elkaar, boven=Segmental Muscles (muscleKg), onder=Segmental ' +
  'Fat (fatKg). Indeling: linkerkolom van boven naar beneden Left upper limb=armLeft en Left leg=legLeft; rechterkolom Right ' +
  'upper limb=armRight en Right leg=legRight; het paar in het midden (bij de romp van het figuurtje) is trunk. Lees elk paar als ' +
  'eigen eenheid en verwissel links en rechts niet; de rompwaarden zijn veel groter dan die van de ledematen; ' +
  'daarnaast Visceral Fat Index=visceralFatLevel met bereik "1.0~9.0"; 7 Weight Control (Target weight=targetWeightKg, ' +
  'Weight control=weightControlKg, Fat control=fatControlKg, Muscle control=muscleControlKg, Basic metabolism=basalMetabolismKcal, ' +
  'Healthy assessment=healthScore, Body age=bodyAge). Bovenin staan Gender, Age (ageYears), Height (heightCm) en datum/tijd. ' +
  'Een uitdraai van dit apparaat kan alle tekstlabels missen en alleen getallen tonen, in dezelfde volgorde als het scherm. ' +
  '(2) "InBody" (Nederlands): Totaal Lichaamswater=bodyWaterKg, Eiwitten=proteinKg, Mineralen=mineralKg, Vetmassa=fatMassKg, ' +
  'Gewicht=weightKg, SSM/Skeletspiermassa=skeletalMuscleKg, BMI=bmi, Vetpercentage=bodyFatPct, Middel-Heup Ratio=waistHipRatio, ' +
  'Visceraal Vetniveau=visceralFatLevel, Streefgewicht=targetWeightKg, Gewichtsregulatie=weightControlKg, ' +
  'Vetregulatie=fatControlKg, Spierregulatie=muscleControlKg, Vetvrije Massa=fatFreeMassKg, Basaal Metabolisme=basalMetabolismKcal, ' +
  'InBody Score=healthScore; segmentale spier- en vetanalyse in kg per lichaamsdeel. Normaalwaardes staan tussen haakjes "( a ~ b )". ' +
  'Getallen kunnen een punt of komma als decimaalteken hebben; geef altijd een JSON-getal. ' +
  'Antwoord ALLEEN met JSON van deze vorm: {"source":"bodyanalyse"|"inbody"|"anders","measuredAt":"YYYY-MM-DD HH:MM"|null,' +
  '"ageYears":number|null,"heightCm":number|null,"values":{' +
  BODY_SCAN_KEYS.map((k) => `"${k}":number|null`).join(',') +
  '},"ranges":{"<zelfde sleutel>":[min,max]},"segments":{' +
  BODY_SCAN_SEGMENT_KEYS.map((k) => `"${k}":{"muscleKg":number|null,"fatKg":number|null}`).join(',') +
  '}}';

/** Maximaal aantal bodyscan-herkenningen per gebruiker per dag. */
const RATE_LIMIT_PER_DAY = 40;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Per foto maximaal ~6 MB data-URL; maximaal 3 foto's (scherm bovenkant, onderkant, uitdraai). */
const MAX_IMAGE_CHARS = 6 * 1024 * 1024;
const MAX_IMAGES = 3;

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  if (!process.env.OPENAI_API_KEY) {
    console.error('[bodyscan-photo] OPENAI_API_KEY ontbreekt');
    return json(res, 500, { error: 'Fotoherkenning is niet geconfigureerd op de server.' });
  }

  const user = await requireUser(req, res);
  if (!user) return;

  const raw = req.body?.images ?? (req.body?.image ? [req.body.image] : []);
  const images = Array.isArray(raw) ? raw : [];
  if (images.length === 0 || images.length > MAX_IMAGES) {
    return json(res, 400, { error: `Stuur 1 tot ${MAX_IMAGES} foto's mee.` });
  }
  for (const image of images) {
    if (typeof image !== 'string' || !/^data:image\/(jpeg|png|webp|heic|heif);base64,/i.test(image)) {
      return json(res, 400, { error: 'Geen geldige afbeelding.' });
    }
    if (image.length > MAX_IMAGE_CHARS) {
      return json(res, 413, { error: 'Foto is te groot. Maak een kleinere foto.' });
    }
  }
  if (!(await enforceRateLimit(user.db, res, user.uid, 'bodyscan-photo', RATE_LIMIT_PER_DAY, DAY_MS))) return;

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        max_output_tokens: 1200,
        input: [
          { role: 'system', content: [{ type: 'input_text', text: SYSTEM }] },
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: `Lees alle waarden, normaalwaardes en segmentale getallen van deze ${images.length === 1 ? 'foto' : `${images.length} foto's (samen één meting)`}.`,
              },
              ...images.map((image) => ({ type: 'input_image', image_url: image, detail: 'high' })),
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('[bodyscan-photo] OpenAI HTTP', response.status, text.slice(0, 300));
      return json(res, 502, { error: 'De AI-dienst gaf een fout terug. Probeer het later opnieuw.' });
    }
    const payload = await response.json();
    const text = extractText(payload);
    if (!text) return json(res, 502, { error: 'Lege AI-respons.' });
    const scan = sanitizeBodyScan(parseJsonLenient(text));
    if (!scan) return json(res, 200, { scan: null });
    return json(res, 200, { scan });
  } catch (e) {
    console.error('[bodyscan-photo]', e instanceof Error ? e.message : String(e));
    return json(res, 502, { error: 'Fotoherkenning mislukt. Probeer het opnieuw.' });
  }
}
