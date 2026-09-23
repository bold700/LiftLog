/**
 * De QR-code van de BodyAnalyse-weegschaal ("Show qrcode" op het apparaat) wijst naar een
 * rapportpagina van de fabrikant: http://119.23.70.228/tcy/index.html?lang=en&key=<32 hex>.
 * Die pagina haalt de meting op via http://119.23.70.228:8080/tcy/qrcode?key=<key> en tekent
 * hem op een canvas. Het antwoord is { data: { codeValue: "<JSON-tekst>" } }, waarin codeValue
 * een lijst van ~56 waarden is, in de volgorde waarin de pagina ze op het rapport zet
 * (afgeleid uit het tekenscript van de pagina, hello.js).
 *
 * Puur (geen netwerk), zodat de vertaling los te testen is; api/bodyscan-photo.mjs doet het ophalen
 * (in dezelfde functie als de fotoherkenning, i.p.v. een los endpoint — zie de uitleg daar).
 */

export const BODYANALYSE_HOST = '119.23.70.228';
export const BODYANALYSE_DATA_URL = `http://${BODYANALYSE_HOST}:8080/tcy/qrcode?key=`;

/** De sleutel uit een QR-link (of een losse sleutel), of null als het geen BodyAnalyse-link is. */
export function bodyAnalyseKeyFromInput(input) {
  const text = String(input ?? '').trim();
  if (/^[0-9a-f]{32}$/i.test(text)) return text.toLowerCase();
  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.hostname !== BODYANALYSE_HOST) return null;
  const key = url.searchParams.get('key') ?? '';
  return /^[0-9a-f]{32}$/i.test(key) ? key.toLowerCase() : null;
}

/** Positie van elke waarde in codeValue (zie hello.js: createReport). */
const AT = {
  age: 3,
  height: 4,
  dateTime: 5,
  bodyWaterKg: 6, // + normaal 7..8
  proteinKg: 9, // 10..11
  mineralKg: 12, // 13..14
  fatMassKg: 15, // 16..17
  weightKg: 18, // 19..20
  skeletalMuscleKg: 21, // 22..23
  fatFreeMassKg: 24,
  bmi: 25, // 26..27
  bodyFatPct: 28, // 29..30
  waistHipRatio: 31, // 32..33
  subcutaneousFat: 34, // 35..36
  visceralFatLevel: 37,
  armLeft: 38, // spier, vet 39
  armRight: 40, // 41
  legLeft: 42, // 43
  legRight: 44, // 45
  trunk: 46, // 47
  targetWeightKg: 48,
  weightControlKg: 49,
  fatControlKg: 50,
  muscleControlKg: 51,
  basalMetabolismKcal: 52,
  healthScore: 53,
  bodyAge: 54,
  bodyType: 55,
};

/** Waarden waar het rapport een normaalwaarde ("a~b") bij toont: direct na de waarde in de lijst. */
const WITH_RANGE = ['bodyWaterKg', 'proteinKg', 'mineralKg', 'fatMassKg', 'weightKg', 'skeletalMuscleKg', 'bmi', 'bodyFatPct', 'waistHipRatio', 'subcutaneousFat'];

/** Lichaamstype (vak 5 op het rapport) per index in codeValue[55]; volgorde uit hello.js. */
export const BODYANALYSE_BODY_TYPES = {
  1: 'Lean type',
  2: 'Lean muscle type',
  3: 'Muscular type',
  4: 'Obese type',
  5: 'Fat muscle type',
  6: 'Muscular obesity',
  7: 'Lack of sports',
  8: 'Standard type',
  9: 'Standard muscle type',
};

function num(v) {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** De lijst uit het antwoord van de fabrikant, of null als de vorm niet klopt. */
export function codeValueList(payload) {
  const raw = payload?.data?.codeValue ?? payload?.codeValue;
  let list = raw;
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return Array.isArray(list) && list.length > AT.bodyAge ? list : null;
}

/**
 * Van de lijst naar de vorm die de app kent (zie sanitizeBodyScan / parseBodyScan): waarden,
 * normaalwaardes en de segmentale spier/vet-verdeling. Geeft null als er geen meting in zit.
 */
export function bodyScanFromCodeValue(list) {
  if (!Array.isArray(list) || list.length <= AT.bodyAge) return null;
  const at = (i) => num(list[i]);
  const values = {};
  const ranges = {};
  for (const [key, i] of Object.entries(AT)) {
    if (['age', 'height', 'dateTime', 'bodyType', 'armLeft', 'armRight', 'legLeft', 'legRight', 'trunk'].includes(key)) continue;
    const v = at(i);
    if (v != null) values[key] = v;
    if (WITH_RANGE.includes(key)) {
      const min = at(i + 1);
      const max = at(i + 2);
      if (min != null && max != null && min < max) ranges[key] = [min, max];
    }
  }
  // Het apparaat toont voor visceraal vet altijd het vaste bereik 1,0~9,0.
  if (values.visceralFatLevel != null) ranges.visceralFatLevel = [1, 9];

  const segments = {};
  for (const key of ['armLeft', 'armRight', 'trunk', 'legLeft', 'legRight']) {
    const muscleKg = at(AT[key]);
    const fatKg = at(AT[key] + 1);
    if (muscleKg != null || fatKg != null) segments[key] = { muscleKg, fatKg };
  }
  if (Object.keys(values).length === 0 && Object.keys(segments).length === 0) return null;

  const bodyTypeIndex = at(AT.bodyType);
  return {
    source: 'bodyanalyse',
    measuredAt: list[AT.dateTime] == null ? null : String(list[AT.dateTime]),
    ageYears: at(AT.age),
    heightCm: at(AT.height),
    values,
    ranges,
    segments,
    bodyType: bodyTypeIndex != null ? (BODYANALYSE_BODY_TYPES[bodyTypeIndex] ?? null) : null,
  };
}
