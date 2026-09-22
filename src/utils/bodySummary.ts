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
    const add = (label: string, now: number | null, before: number | null | undefined, unit: string, max: number, decimals = 1) => {
      if (now == null) return;
      rows.push({
        label,
        value: unit === 'niveau' ? `Niveau ${nl(now, 0)}` : `${nl(now, decimals)} ${unit}`,
        delta: deltaText(now, before, decimals),
        fill: clamp01(now / max),
      });
    };
    add('Skeletspiermassa', v.skeletalMuscleKg, prev?.skeletalMuscleKg, 'kg', 60);
    add('Vetpercentage', v.bodyFatPct, prev?.bodyFatPct, '%', 50);
    add('Lichaamswater', v.bodyWaterKg, prev?.bodyWaterKg, 'kg', 70);
    add('Eiwit', v.proteinKg, prev?.proteinKg, 'kg', 20);
    add('Visceraal vet', v.visceralFatLevel, prev?.visceralFatLevel, 'niveau', 20, 0);
    return rows;
  }

  const rows: CompositionRow[] = [];
  const withFat = items.filter((m) => m.bodyFatPct != null);
  const fat = withFat[withFat.length - 1];
  if (fat) {
    const before = withFat[withFat.length - 2]?.bodyFatPct;
    rows.push({ label: 'Vetpercentage', value: `${nl(fat.bodyFatPct as number)} %`, delta: deltaText(fat.bodyFatPct as number, before, 1), fill: clamp01((fat.bodyFatPct as number) / 50) });
  }
  const withBoth = items.filter((m) => m.weightKg != null && m.bodyFatPct != null);
  const ffmOf = (m: Measurement) => fatFreeMassKg(m.weightKg as number, m.bodyFatPct as number);
  const both = withBoth[withBoth.length - 1];
  const ffmNow = both ? ffmOf(both) : null;
  if (ffmNow != null) {
    const prevBoth = withBoth[withBoth.length - 2];
    rows.push({ label: 'Vetvrije massa', value: `${nl(ffmNow)} kg`, delta: deltaText(ffmNow, prevBoth ? ffmOf(prevBoth) : null, 1), fill: clamp01(ffmNow / 100) });
  }
  const w = latestWeight(items);
  const b = w ? bmi(w.weightKg, heightCm) : null;
  if (b != null) rows.push({ label: 'BMI', value: nl(b), delta: null, fill: clamp01(b / 40) });
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
