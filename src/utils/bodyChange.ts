/**
 * Waar zitten de kilo's? Tussen twee metingen splitsen we de gewichtsverandering op in vet, spier en
 * de rest (water, bot, organen): gewicht = vetmassa + vetvrije massa, en de vetvrije massa bestaat uit
 * skeletspieren plus de rest. Zo zie je of +2 kg spier is of vet.
 *
 * Werkt met een bodyscan (vetmassa en skeletspiermassa van het apparaat) en ook met een meting met
 * alleen gewicht en vetpercentage (bijv. huidplooien): dan splitsen we in vet en vetvrij.
 */
import type { Measurement } from '../services/measurementService';

export interface BodyParts {
  weightKg: number;
  fatKg: number;
  /** Skeletspiermassa; alleen bij een bodyscan die dat meet. */
  muscleKg: number | null;
}

export interface BodyChange {
  from: Measurement;
  to: Measurement;
  days: number;
  weightKg: number;
  fatKg: number;
  /** null als niet beide metingen spiermassa hebben: dan is `otherKg` de hele vetvrije massa. */
  muscleKg: number | null;
  /** Rest: water, bot, organen (of de hele vetvrije massa zonder spiermeting). */
  otherKg: number;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Gewicht, vet en spier van één meting, of null als het gewicht of het vet ontbreekt. */
export function bodyParts(m: Measurement): BodyParts | null {
  const v = m.bodyScan?.values;
  const weight = v?.weightKg ?? m.weightKg;
  if (weight == null || !(weight > 0)) return null;
  const pct = v?.bodyFatPct ?? m.bodyFatPct;
  const fat = v?.fatMassKg ?? (pct != null ? (weight * pct) / 100 : null);
  if (fat == null) return null;
  return { weightKg: weight, fatKg: fat, muscleKg: v?.skeletalMuscleKg ?? null };
}

/** Metingen waarmee je kunt vergelijken (gewicht én vet bekend), oud naar nieuw. */
export function comparableMeasurements(items: Measurement[]): Measurement[] {
  return items.filter((m) => bodyParts(m) != null).sort((a, b) => a.date.localeCompare(b.date));
}

export function bodyChange(from: Measurement, to: Measurement): BodyChange | null {
  const a = bodyParts(from);
  const b = bodyParts(to);
  if (!a || !b) return null;
  const weightKg = r1(b.weightKg - a.weightKg);
  const fatKg = r1(b.fatKg - a.fatKg);
  const muscleKg = a.muscleKg != null && b.muscleKg != null ? r1(b.muscleKg - a.muscleKg) : null;
  const otherKg = r1(weightKg - fatKg - (muscleKg ?? 0));
  const days = Math.round((Date.parse(to.date) - Date.parse(from.date)) / 86_400_000);
  return { from, to, days, weightKg, fatKg, muscleKg, otherKg };
}

const kg = (n: number) => `${Math.abs(n).toFixed(1).replace('.', ',')} kg`;

/** Eén zin in gewone taal: "Je bent 2,0 kg zwaarder: 1,4 kg vet en 0,4 kg spier erbij." */
export function bodyChangeSentence(c: BodyChange): string {
  const parts: string[] = [];
  const say = (n: number, what: string) => {
    if (Math.abs(n) < 0.05) return;
    parts.push(`${kg(n)} ${what} ${n > 0 ? 'erbij' : 'eraf'}`);
  };
  say(c.fatKg, 'vet');
  if (c.muscleKg != null) say(c.muscleKg, 'spier');
  say(c.otherKg, c.muscleKg != null ? 'water en overig' : 'vetvrije massa (spier, water, bot)');
  const head =
    Math.abs(c.weightKg) < 0.05 ? 'Even zwaar' : c.weightKg > 0 ? `${kg(c.weightKg)} zwaarder` : `${kg(c.weightKg)} lichter`;
  if (parts.length === 0) return `${head}; vet en spier zijn gelijk gebleven.`;
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} en ${parts[parts.length - 1]}` : parts[0];
  return `${head}: ${list}.`;
}
