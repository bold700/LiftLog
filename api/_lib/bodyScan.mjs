/**
 * Server-kant van de bodyscan: welke sleutels het AI-antwoord mag bevatten en een opschoning
 * van dat antwoord voordat het naar de app gaat. De app (src/utils/bodyScan.ts) kent dezelfde
 * sleutels en doet daarna de definitieve controle op plausibele waarden; een unit-test bewaakt
 * dat beide lijsten gelijk blijven.
 */

export const BODY_SCAN_KEYS = [
  'weightKg',
  'skeletalMuscleKg',
  'fatMassKg',
  'fatFreeMassKg',
  'bodyWaterKg',
  'proteinKg',
  'mineralKg',
  'bmi',
  'bodyFatPct',
  'waistHipRatio',
  'visceralFatLevel',
  'subcutaneousFat',
  'targetWeightKg',
  'weightControlKg',
  'fatControlKg',
  'muscleControlKg',
  'basalMetabolismKcal',
  'healthScore',
  'bodyAge',
];

export const BODY_SCAN_SEGMENT_KEYS = ['armLeft', 'armRight', 'trunk', 'legLeft', 'legRight'];

function num(v) {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function range(v) {
  let min = null;
  let max = null;
  if (Array.isArray(v)) {
    min = num(v[0]);
    max = num(v[1]);
  } else if (v && typeof v === 'object') {
    min = num(v.min);
    max = num(v.max);
  }
  return min != null && max != null && min < max ? [min, max] : null;
}

/**
 * Houdt alleen bekende sleutels met een getal over. Onbekende sleutels en tekst vervallen.
 * Geeft null als er geen enkele waarde in zit.
 */
export function sanitizeBodyScan(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const rv = raw.values && typeof raw.values === 'object' ? raw.values : raw;
  const rr = raw.ranges && typeof raw.ranges === 'object' ? raw.ranges : {};
  const rs = raw.segments && typeof raw.segments === 'object' ? raw.segments : {};

  const values = {};
  const ranges = {};
  let any = false;
  for (const k of BODY_SCAN_KEYS) {
    const n = num(rv[k]);
    if (n != null) {
      values[k] = n;
      any = true;
    }
    const r = range(rr[k]);
    if (r) ranges[k] = r;
  }
  const segments = {};
  for (const k of BODY_SCAN_SEGMENT_KEYS) {
    const s = rs[k];
    if (!s || typeof s !== 'object') continue;
    const muscleKg = num(s.muscleKg);
    const fatKg = num(s.fatKg);
    if (muscleKg != null || fatKg != null) {
      segments[k] = { muscleKg, fatKg };
      any = true;
    }
  }
  if (!any) return null;

  const source = raw.source === 'inbody' || raw.source === 'anders' ? raw.source : 'bodyanalyse';
  return {
    source,
    measuredAt: typeof raw.measuredAt === 'string' ? raw.measuredAt.slice(0, 40) : null,
    ageYears: num(raw.ageYears),
    heightCm: num(raw.heightCm),
    values,
    ranges,
    segments,
  };
}
