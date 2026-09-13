/**
 * Bodyscan: de uitslag van een lichaamsanalyse-weegschaal (BodyAnalyse/VA, InBody, …).
 *
 * De app slaat de waarden op zoals het apparaat ze toont, inclusief de normaalwaardes die het
 * apparaat per persoon (geslacht, leeftijd, lengte) berekent. Zo kan het rapport in de app dezelfde
 * "laag / normaal / hoog"-balken laten zien als de uitdraai, zonder zelf normen te hoeven bepalen.
 *
 * Dit bestand is pure logica (geen React, geen Firestore): types, veldlijst, parser en de
 * indeling van een waarde ten opzichte van zijn normaalwaarde.
 * De server (api/_lib/bodyScan.mjs) kent dezelfde sleutels; een test bewaakt dat ze gelijk blijven.
 */

export type BodyScanSource = 'bodyanalyse' | 'inbody' | 'anders';

export const BODY_SCAN_SOURCES: { key: BodyScanSource; label: string }[] = [
  { key: 'bodyanalyse', label: 'BodyAnalyse (weegschaal Van As)' },
  { key: 'inbody', label: 'InBody' },
  { key: 'anders', label: 'Anders' },
];

export type BodyScanGroup = 'samenstelling' | 'obesitas' | 'regulatie' | 'overig';

/** Alle waarden die een bodyscan kan bevatten. Volgorde = volgorde in het rapport. */
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
] as const;

export type BodyScanValueKey = (typeof BODY_SCAN_KEYS)[number];

export interface BodyScanFieldDef {
  key: BodyScanValueKey;
  label: string;
  /** Eenheid achter de waarde ('' = geen). */
  unit: string;
  group: BodyScanGroup;
  /** Aantal decimalen bij weergave. */
  decimals: number;
  /** Plausibele grenzen; alles daarbuiten is een leesfout van de foto en wordt weggegooid. */
  min: number;
  max: number;
  /** Korte uitleg voor de sporter. */
  hint?: string;
}

export const BODY_SCAN_FIELDS: readonly BodyScanFieldDef[] = [
  { key: 'weightKg', label: 'Gewicht', unit: 'kg', group: 'samenstelling', decimals: 1, min: 20, max: 400 },
  { key: 'skeletalMuscleKg', label: 'Skeletspiermassa', unit: 'kg', group: 'samenstelling', decimals: 1, min: 5, max: 120, hint: 'Spieren die je zelf aanstuurt. Meer is beter.' },
  { key: 'fatMassKg', label: 'Vetmassa', unit: 'kg', group: 'samenstelling', decimals: 1, min: 0.5, max: 250, hint: 'Totaal lichaamsvet in kilo’s.' },
  { key: 'fatFreeMassKg', label: 'Vetvrije massa', unit: 'kg', group: 'samenstelling', decimals: 1, min: 10, max: 200, hint: 'Alles wat geen vet is: spieren, bot, water, organen.' },
  { key: 'bodyWaterKg', label: 'Lichaamswater', unit: 'kg', group: 'samenstelling', decimals: 1, min: 5, max: 150 },
  { key: 'proteinKg', label: 'Eiwit', unit: 'kg', group: 'samenstelling', decimals: 1, min: 1, max: 40, hint: 'Bouwstof van spieren.' },
  { key: 'mineralKg', label: 'Mineralen', unit: 'kg', group: 'samenstelling', decimals: 2, min: 0.5, max: 15, hint: 'Vooral botmassa.' },
  { key: 'bmi', label: 'BMI', unit: '', group: 'obesitas', decimals: 1, min: 8, max: 80, hint: 'Gewicht ten opzichte van lengte. Bij gespierde mensen te hoog.' },
  { key: 'bodyFatPct', label: 'Vetpercentage', unit: '%', group: 'obesitas', decimals: 1, min: 1, max: 70 },
  { key: 'waistHipRatio', label: 'Taille-heupratio', unit: '', group: 'obesitas', decimals: 2, min: 0.5, max: 1.5, hint: 'Buikomvang gedeeld door heupomvang.' },
  { key: 'visceralFatLevel', label: 'Visceraal vet', unit: '', group: 'obesitas', decimals: 0, min: 1, max: 60, hint: 'Vet rond de organen. Niveau 1 tot 9 is gezond.' },
  { key: 'subcutaneousFat', label: 'Onderhuids vet', unit: '', group: 'obesitas', decimals: 1, min: 0.5, max: 80 },
  { key: 'targetWeightKg', label: 'Streefgewicht', unit: 'kg', group: 'regulatie', decimals: 1, min: 20, max: 300 },
  { key: 'weightControlKg', label: 'Gewichtsregulatie', unit: 'kg', group: 'regulatie', decimals: 1, min: -200, max: 200, hint: 'Hoeveel kilo erbij of eraf tot het streefgewicht.' },
  { key: 'fatControlKg', label: 'Vetregulatie', unit: 'kg', group: 'regulatie', decimals: 1, min: -200, max: 200 },
  { key: 'muscleControlKg', label: 'Spierregulatie', unit: 'kg', group: 'regulatie', decimals: 1, min: -100, max: 100 },
  { key: 'basalMetabolismKcal', label: 'Basaal metabolisme', unit: 'kcal', group: 'overig', decimals: 0, min: 500, max: 6000, hint: 'Wat je lichaam in rust per dag verbruikt.' },
  { key: 'healthScore', label: 'Score', unit: '/100', group: 'overig', decimals: 0, min: 0, max: 100 },
  { key: 'bodyAge', label: 'Lichaamsleeftijd', unit: 'jaar', group: 'overig', decimals: 0, min: 5, max: 120 },
];

export const BODY_SCAN_SEGMENTS = [
  { key: 'armLeft', label: 'Arm links' },
  { key: 'armRight', label: 'Arm rechts' },
  { key: 'trunk', label: 'Romp' },
  { key: 'legLeft', label: 'Been links' },
  { key: 'legRight', label: 'Been rechts' },
] as const;

export type BodyScanSegmentKey = (typeof BODY_SCAN_SEGMENTS)[number]['key'];

export const BODY_SCAN_SEGMENT_KEYS: readonly BodyScanSegmentKey[] = BODY_SCAN_SEGMENTS.map((s) => s.key);

export interface BodyScanRange {
  min: number;
  max: number;
}

export interface BodyScanSegment {
  muscleKg: number | null;
  fatKg: number | null;
}

export interface BodyScan {
  source: BodyScanSource;
  /** Tijdstip zoals het apparaat het toont, 'YYYY-MM-DD HH:MM' of 'YYYY-MM-DD', of null. */
  measuredAt: string | null;
  /** Wat het apparaat over de persoon wist bij de meting (bepaalt de normaalwaardes). */
  ageYears: number | null;
  heightCm: number | null;
  values: Record<BodyScanValueKey, number | null>;
  /** Normaalwaardes zoals het apparaat ze toonde, alleen voor velden waar ze bij stonden. */
  ranges: Partial<Record<BodyScanValueKey, BodyScanRange>>;
  segments: Record<BodyScanSegmentKey, BodyScanSegment>;
}

export type RangeStatus = 'laag' | 'normaal' | 'hoog';

export const RANGE_STATUS_LABEL: Record<RangeStatus, string> = { laag: 'Laag', normaal: 'Normaal', hoog: 'Hoog' };

export function fieldDef(key: BodyScanValueKey): BodyScanFieldDef {
  return BODY_SCAN_FIELDS.find((f) => f.key === key) as BodyScanFieldDef;
}

function toNum(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function roundTo(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

function parseRange(v: unknown): BodyScanRange | null {
  let min: number | null = null;
  let max: number | null = null;
  if (Array.isArray(v)) {
    min = toNum(v[0]);
    max = toNum(v[1]);
  } else if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    min = toNum(o.min);
    max = toNum(o.max);
  } else if (typeof v === 'string') {
    const m = v.match(/(-?\d+(?:[.,]\d+)?)\s*[~\-–]\s*(-?\d+(?:[.,]\d+)?)/);
    if (m) {
      min = toNum(m[1]);
      max = toNum(m[2]);
    }
  }
  if (min == null || max == null || min >= max) return null;
  return { min, max };
}

function emptyValues(): Record<BodyScanValueKey, number | null> {
  return Object.fromEntries(BODY_SCAN_KEYS.map((k) => [k, null])) as Record<BodyScanValueKey, number | null>;
}

function emptySegments(): Record<BodyScanSegmentKey, BodyScanSegment> {
  return Object.fromEntries(BODY_SCAN_SEGMENT_KEYS.map((k) => [k, { muscleKg: null, fatKg: null }])) as Record<
    BodyScanSegmentKey,
    BodyScanSegment
  >;
}

export function parseSource(v: unknown): BodyScanSource {
  return v === 'inbody' || v === 'anders' ? v : 'bodyanalyse';
}

/** 'YYYY-MM-DD' of 'YYYY-MM-DD HH:MM' uit wat het apparaat toont (ook '10:14 2025-06-07' of '2025/06/07 10:15:31'). */
export function parseMeasuredAt(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const date = v.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (!date) return null;
  const [, y, mo, d] = date;
  const iso = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  if (Number.isNaN(Date.parse(iso))) return null;
  const time = v.match(/(?:^|\D)(\d{1,2}):(\d{2})(?::\d{2})?/);
  return time ? `${iso} ${time[1].padStart(2, '0')}:${time[2]}` : iso;
}

/** Alleen de datum (YYYY-MM-DD) uit `measuredAt`, of null. */
export function measuredDate(scan: Pick<BodyScan, 'measuredAt'>): string | null {
  return scan.measuredAt ? scan.measuredAt.slice(0, 10) : null;
}

/**
 * Maakt van ruwe data (AI-antwoord, Firestore-document, formulier) een geldige BodyScan.
 * Waarden buiten de plausibele grenzen vervallen. Geeft null als er geen enkele waarde in zit.
 */
export function parseBodyScan(raw: unknown): BodyScan | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const rawValues = (r.values && typeof r.values === 'object' ? r.values : {}) as Record<string, unknown>;
  const rawRanges = (r.ranges && typeof r.ranges === 'object' ? r.ranges : {}) as Record<string, unknown>;
  const rawSegments = (r.segments && typeof r.segments === 'object' ? r.segments : {}) as Record<string, unknown>;

  const values = emptyValues();
  const ranges: Partial<Record<BodyScanValueKey, BodyScanRange>> = {};
  let any = false;
  for (const f of BODY_SCAN_FIELDS) {
    const n = toNum(rawValues[f.key]);
    if (n != null && n >= f.min && n <= f.max) {
      values[f.key] = roundTo(n, f.decimals);
      any = true;
    }
    const range = parseRange(rawRanges[f.key]);
    if (range) ranges[f.key] = { min: roundTo(range.min, f.decimals), max: roundTo(range.max, f.decimals) };
  }

  const segments = emptySegments();
  for (const s of BODY_SCAN_SEGMENTS) {
    const seg = rawSegments[s.key];
    if (!seg || typeof seg !== 'object') continue;
    const o = seg as Record<string, unknown>;
    const muscle = toNum(o.muscleKg);
    const fat = toNum(o.fatKg);
    if (muscle != null && muscle > 0 && muscle < 100) {
      segments[s.key].muscleKg = roundTo(muscle, 1);
      any = true;
    }
    if (fat != null && fat >= 0 && fat < 100) {
      segments[s.key].fatKg = roundTo(fat, 1);
      any = true;
    }
  }
  if (!any) return null;

  const age = toNum(r.ageYears);
  const height = toNum(r.heightCm);
  return {
    source: parseSource(r.source),
    measuredAt: parseMeasuredAt(r.measuredAt),
    ageYears: age != null && age >= 5 && age < 130 ? Math.round(age) : null,
    heightCm: height != null && height >= 100 && height <= 250 ? roundTo(height, 1) : null,
    values,
    ranges,
    segments,
  };
}

/** Laag / normaal / hoog ten opzichte van de normaalwaarde; null zonder waarde of norm. */
export function rangeStatus(value: number | null | undefined, range: BodyScanRange | null | undefined): RangeStatus | null {
  if (value == null || !range) return null;
  if (value < range.min) return 'laag';
  if (value > range.max) return 'hoog';
  return 'normaal';
}

/**
 * Positie van een waarde op een balk met drie zones (laag | normaal | hoog), als fractie 0..1.
 * De normaalzone loopt van 1/4 tot 1/2 van de balk; daarboven is twee keer zoveel ruimte als
 * daaronder, omdat waarden vaker (ver) boven de norm liggen dan eronder. Buiten de balk wordt geknipt.
 */
export const RANGE_BAR_NORMAL = { start: 0.25, end: 0.5 } as const;

export function rangeBarPosition(value: number, range: BodyScanRange): number {
  const span = range.max - range.min;
  if (span <= 0) return 0.5;
  const normalWidth = RANGE_BAR_NORMAL.end - RANGE_BAR_NORMAL.start;
  const pos = RANGE_BAR_NORMAL.start + ((value - range.min) / span) * normalWidth;
  return Math.max(0.02, Math.min(0.98, pos));
}

/** Getal met Nederlandse komma en het juiste aantal decimalen. */
export function formatScanValue(key: BodyScanValueKey, value: number | null | undefined): string {
  if (value == null) return '—';
  const f = fieldDef(key);
  return value.toFixed(f.decimals).replace('.', ',');
}

/** Korte samenvatting voor de historielijst, bijv. "Bodyscan · spier 38,7 kg · visceraal 13". */
export function summarizeBodyScan(scan: BodyScan): string {
  const parts = ['Bodyscan'];
  if (scan.values.skeletalMuscleKg != null) parts.push(`spier ${formatScanValue('skeletalMuscleKg', scan.values.skeletalMuscleKg)} kg`);
  if (scan.values.visceralFatLevel != null) parts.push(`visceraal ${formatScanValue('visceralFatLevel', scan.values.visceralFatLevel)}`);
  if (scan.values.bodyAge != null) parts.push(`lichaamsleeftijd ${scan.values.bodyAge}`);
  return parts.join(' · ');
}

/** Heeft de scan een waarde in deze groep? (Om lege secties in het rapport te verbergen.) */
export function groupHasValues(scan: BodyScan, group: BodyScanGroup): boolean {
  return BODY_SCAN_FIELDS.some((f) => f.group === group && scan.values[f.key] != null);
}

/**
 * Aandeel spier in (spier + vet) van een lichaamsdeel → tint 1..5 voor de illustratie (5 = meest gespierd).
 * Grenzen zo gekozen dat een gemiddelde sporter rond 3 zit. Alleen spier bekend: 3.
 */
export function segmentLevel(seg: BodyScanSegment): number | null {
  if (seg.muscleKg == null) return null;
  if (seg.fatKg == null || seg.muscleKg + seg.fatKg <= 0) return 3;
  const share = seg.muscleKg / (seg.muscleKg + seg.fatKg);
  if (share < 0.55) return 1;
  if (share < 0.62) return 2;
  if (share < 0.7) return 3;
  if (share < 0.78) return 4;
  return 5;
}

export function segmentsHaveValues(scan: BodyScan): boolean {
  return BODY_SCAN_SEGMENT_KEYS.some((k) => scan.segments[k].muscleKg != null || scan.segments[k].fatKg != null);
}

/* ---------- Formulier (concept) ---------- */

/** Bodyscan zoals hij in het formulier staat: alle getallen als tekst, zodat je vrij kunt typen. */
export interface BodyScanDraft {
  source: BodyScanSource;
  measuredAt: string;
  ageYears: string;
  heightCm: string;
  values: Record<BodyScanValueKey, string>;
  /** Normaalwaardes zijn niet bewerkbaar; ze komen mee uit de herkenning of de opgeslagen scan. */
  ranges: Partial<Record<BodyScanValueKey, BodyScanRange>>;
  segments: Record<BodyScanSegmentKey, { muscleKg: string; fatKg: string }>;
}

const numText = (v: number | null | undefined): string => (v == null ? '' : String(v));

export function emptyBodyScanDraft(): BodyScanDraft {
  return {
    source: 'bodyanalyse',
    measuredAt: '',
    ageYears: '',
    heightCm: '',
    values: Object.fromEntries(BODY_SCAN_KEYS.map((k) => [k, ''])) as Record<BodyScanValueKey, string>,
    ranges: {},
    segments: Object.fromEntries(BODY_SCAN_SEGMENT_KEYS.map((k) => [k, { muscleKg: '', fatKg: '' }])) as BodyScanDraft['segments'],
  };
}

export function draftFromBodyScan(scan: BodyScan): BodyScanDraft {
  return {
    source: scan.source,
    measuredAt: scan.measuredAt ?? '',
    ageYears: numText(scan.ageYears),
    heightCm: numText(scan.heightCm),
    values: Object.fromEntries(BODY_SCAN_KEYS.map((k) => [k, numText(scan.values[k])])) as Record<BodyScanValueKey, string>,
    ranges: { ...scan.ranges },
    segments: Object.fromEntries(
      BODY_SCAN_SEGMENT_KEYS.map((k) => [k, { muscleKg: numText(scan.segments[k].muscleKg), fatKg: numText(scan.segments[k].fatKg) }])
    ) as BodyScanDraft['segments'],
  };
}

/** Concept → geldige BodyScan (of null als er niets ingevuld is). Lege velden worden null. */
export function bodyScanFromDraft(draft: BodyScanDraft): BodyScan | null {
  return parseBodyScan({
    source: draft.source,
    measuredAt: draft.measuredAt,
    ageYears: draft.ageYears,
    heightCm: draft.heightCm,
    values: draft.values,
    ranges: draft.ranges,
    segments: draft.segments,
  });
}

/** Staat er iets ingevuld in het concept? */
export function draftHasValues(draft: BodyScanDraft): boolean {
  return (
    BODY_SCAN_KEYS.some((k) => draft.values[k].trim() !== '') ||
    BODY_SCAN_SEGMENT_KEYS.some((k) => draft.segments[k].muscleKg.trim() !== '' || draft.segments[k].fatKg.trim() !== '')
  );
}
