/**
 * Cijfers voor Inzichten → Metingen (Figma "Body"): laatste gewicht met verschil, lichaamssamenstelling
 * met balken, en de bron van een meting. Puur, zodat het testbaar is zonder Firestore.
 */
import type { Measurement } from '../services/measurementService';
import { fatFreeMassKg, bmi } from './bodyFat';

const nl = (n: number, decimals = 1) => (Math.round(n * 10 ** decimals) / 10 ** decimals).toString().replace('.', ',');
const round1 = (n: number) => Math.round(n * 10) / 10;

export interface LatestWeight {
  weightKg: number;
  /** Verschil met de meting met gewicht daarvoor; null bij de eerste. */
  deltaKg: number | null;
  measurement: Measurement;
}

/** Laatste gewicht en het verschil met de vorige weging. `items` oud → nieuw. */
export function latestWeight(items: Measurement[]): LatestWeight | null {
  const withWeight = items.filter((m) => m.weightKg != null);
  const last = withWeight[withWeight.length - 1];
  if (!last) return null;
  const prev = withWeight[withWeight.length - 2];
  return {
    weightKg: last.weightKg as number,
    deltaKg: prev ? round1((last.weightKg as number) - (prev.weightKg as number)) : null,
    measurement: last,
  };
}

export type MeasurementSource = 'scan' | 'plooien' | 'handmatig';

export function measurementSource(m: Measurement): MeasurementSource {
  if (m.bodyScan) return 'scan';
  if (m.bodyFatMethod === 'durnin-womersley') return 'plooien';
  return 'handmatig';
}

export interface CompositionRow {
  label: string;
  value: string;
  /** Verschil met de vorige vergelijkbare meting, al opgemaakt ("+0,4", "−1"); null als er niets te vergelijken is. */
  delta: string | null;
  /** Vulling van de balk, 0–1. */
  fill: number;
  /** Is het verschil goed nieuws, slecht nieuws of geen van beide? Bepaalt de kleur. */
  tone: DeltaTone;
}

export type DeltaTone = 'good' | 'bad' | 'neutral';

/**
 * Of een verandering goed of slecht is, hangt af van de waarde: meer spier is goed, meer vet niet.
 * `better` is de goede richting; zonder (water, BMI) is een verandering neutraal.
 */
export function deltaTone(now: number, before: number | null | undefined, better: 'up' | 'down' | null): DeltaTone {
  if (before == null || better == null || now === before) return 'neutral';
  return (now > before) === (better === 'up') ? 'good' : 'bad';
}

/** Gewicht: goed als je dichter bij je doel komt, slecht als je er verder vanaf raakt; zonder doel neutraal. */
export function weightTone(now: number, before: number | null | undefined, goal: number | null | undefined): DeltaTone {
  if (before == null || goal == null || now === before) return 'neutral';
  const nowGap = Math.abs(now - goal);
  const beforeGap = Math.abs(before - goal);
  if (nowGap === beforeGap) return 'neutral';
  return nowGap < beforeGap ? 'good' : 'bad';
}

function deltaText(now: number, before: number | null | undefined, decimals: number): string | null {
  if (before == null) return null;
  const d = Math.round((now - before) * 10 ** decimals) / 10 ** decimals;
  if (d === 0) return '0';
  return `${d > 0 ? '+' : '−'}${nl(Math.abs(d), decimals)}`;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * Samenstelling uit de laatste bodyscan (spier, vet, water, eiwit, visceraal) met het verschil t.o.v. de
 * scan ervoor. Zonder scan: vetpercentage, vetvrije massa en BMI uit de gewone metingen. De balken hebben
 * een vaste schaal per waarde, zodat ze tussen metingen vergelijkbaar blijven.
 */
export function bodyComposition(items: Measurement[], heightCm: number | null | undefined): CompositionRow[] {
  const scans = items.filter((m) => m.bodyScan);
  const scan = scans[scans.length - 1]?.bodyScan;
  if (scan) {
    const prev = scans[scans.length - 2]?.bodyScan?.values;
    const v = scan.values;
    const rows: CompositionRow[] = [];
    const add = (
      label: string,
      now: number | null,
      before: number | null | undefined,
      unit: string,
      max: number,
      better: 'up' | 'down' | null,
      decimals = 1
    ) => {
      if (now == null) return;
      rows.push({
        label,
        value: unit === 'niveau' ? `Niveau ${nl(now, 0)}` : `${nl(now, decimals)} ${unit}`,
        delta: deltaText(now, before, decimals),
        fill: clamp01(now / max),
        tone: deltaTone(now, before, better),
      });
    };
    add('Skeletspiermassa', v.skeletalMuscleKg, prev?.skeletalMuscleKg, 'kg', 60, 'up');
    add('Vetpercentage', v.bodyFatPct, prev?.bodyFatPct, '%', 50, 'down');
    add('Lichaamswater', v.bodyWaterKg, prev?.bodyWaterKg, 'kg', 70, null);
    add('Eiwit', v.proteinKg, prev?.proteinKg, 'kg', 20, 'up');
    add('Visceraal vet', v.visceralFatLevel, prev?.visceralFatLevel, 'niveau', 20, 'down', 0);
    return rows;
  }

  const rows: CompositionRow[] = [];
  const withFat = items.filter((m) => m.bodyFatPct != null);
  const fat = withFat[withFat.length - 1];
  if (fat) {
    const before = withFat[withFat.length - 2]?.bodyFatPct;
    rows.push({
      label: 'Vetpercentage',
      value: `${nl(fat.bodyFatPct as number)} %`,
      delta: deltaText(fat.bodyFatPct as number, before, 1),
      fill: clamp01((fat.bodyFatPct as number) / 50),
      tone: deltaTone(fat.bodyFatPct as number, before, 'down'),
    });
  }
  const withBoth = items.filter((m) => m.weightKg != null && m.bodyFatPct != null);
  const ffmOf = (m: Measurement) => fatFreeMassKg(m.weightKg as number, m.bodyFatPct as number);
  const both = withBoth[withBoth.length - 1];
  const ffmNow = both ? ffmOf(both) : null;
  if (ffmNow != null) {
    const prevBoth = withBoth[withBoth.length - 2];
    const ffmBefore = prevBoth ? ffmOf(prevBoth) : null;
    rows.push({
      label: 'Vetvrije massa',
      value: `${nl(ffmNow)} kg`,
      delta: deltaText(ffmNow, ffmBefore, 1),
      fill: clamp01(ffmNow / 100),
      tone: deltaTone(ffmNow, ffmBefore, 'up'),
    });
  }
  const w = latestWeight(items);
  const b = w ? bmi(w.weightKg, heightCm) : null;
  if (b != null) rows.push({ label: 'BMI', value: nl(b), delta: null, fill: clamp01(b / 40), tone: 'neutral' });
  return rows;
}

const MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const WEEKDAYS = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];

/**
 * Datum van een meting, met tijd als de scan die heeft: "16 aug 07:04", of met weekdag voor de kop:
 * "di 16 aug 07:04". Jaar erbij als het niet dit jaar is.
 */
export function measurementWhen(m: Measurement, opts: { weekday?: boolean; time?: boolean } = {}, now = new Date()): string {
  const [y, mo, d] = m.date.split('-').map(Number);
  if (!y || !mo || !d) return m.date;
  const date = new Date(y, mo - 1, d);
  const time = opts.time !== false ? m.bodyScan?.measuredAt?.match(/\d{2}:\d{2}/)?.[0] : undefined;
  const parts = [
    opts.weekday ? WEEKDAYS[date.getDay()] : null,
    `${d} ${MONTHS[mo - 1]}`,
    y !== now.getFullYear() ? String(y) : null,
    time ?? null,
  ];
  return parts.filter(Boolean).join(' ');
}
