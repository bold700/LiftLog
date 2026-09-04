/**
 * Vetpercentage uit huidplooien.
 *
 * Methode: Durnin & Womersley (1974), som van vier plooien (biceps, triceps,
 * subscapulair, suprailiacaal) → lichaamsdichtheid per geslacht/leeftijdsgroep,
 * daarna Siri (1961): vet% = 495 / dichtheid − 450.
 *
 * Foutmarge van de methode is ±3 à 4 procentpunt. De trend over tijd is
 * betrouwbaarder dan het absolute getal, mits zelfde caliper, zelfde kant en
 * zelfde meter.
 */

export type SkinfoldSex = 'man' | 'vrouw';

export interface DurninWomersleyInput {
  bicepsMm: number;
  tricepsMm: number;
  subscapularMm: number;
  suprailiacMm: number;
  sex: SkinfoldSex;
  ageYears: number;
}

export interface BodyFatResult {
  /** Vetpercentage, afgerond op 1 decimaal. */
  pct: number;
  /** Lichaamsdichtheid in g/cm³. */
  density: number;
  /** Som van de vier plooien in mm. */
  sumMm: number;
  method: 'durnin-womersley';
}

/** Coëfficiënten: dichtheid = c − m · log10(som). Leeftijdsgrens is inclusief. */
const DW_TABLE: Record<SkinfoldSex, { maxAge: number; c: number; m: number }[]> = {
  man: [
    { maxAge: 19, c: 1.162, m: 0.063 },
    { maxAge: 29, c: 1.1631, m: 0.0632 },
    { maxAge: 39, c: 1.1422, m: 0.0544 },
    { maxAge: 49, c: 1.162, m: 0.07 },
    { maxAge: Infinity, c: 1.1715, m: 0.0779 },
  ],
  vrouw: [
    { maxAge: 19, c: 1.1549, m: 0.0678 },
    { maxAge: 29, c: 1.1599, m: 0.0717 },
    { maxAge: 39, c: 1.1423, m: 0.0632 },
    { maxAge: 49, c: 1.1333, m: 0.0612 },
    { maxAge: Infinity, c: 1.1339, m: 0.0645 },
  ],
};

/** Ondergrens van de validatie van Durnin & Womersley. */
export const DW_MIN_AGE = 16;

/** Leeftijd in hele jaren op een datum (YYYY-MM-DD), of null bij ontbrekende/ongeldige data. */
export function ageOnDate(birthDate: string | null | undefined, onDate: string): number | null {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  const d = new Date(onDate);
  if (Number.isNaN(b.getTime()) || Number.isNaN(d.getTime())) return null;
  let age = d.getFullYear() - b.getFullYear();
  const beforeBirthday = d.getMonth() < b.getMonth() || (d.getMonth() === b.getMonth() && d.getDate() < b.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

/** Profiel-geslacht naar formule-geslacht. 'anders' en null geven null: de formule kent alleen twee tabellen. */
export function toSkinfoldSex(gender: 'man' | 'vrouw' | 'anders' | null | undefined): SkinfoldSex | null {
  return gender === 'man' || gender === 'vrouw' ? gender : null;
}

export function bodyDensityDurninWomersley(sumMm: number, sex: SkinfoldSex, ageYears: number): number {
  const row = DW_TABLE[sex].find((r) => ageYears <= r.maxAge) ?? DW_TABLE[sex][DW_TABLE[sex].length - 1];
  return row.c - row.m * Math.log10(sumMm);
}

export function siriFatPct(density: number): number {
  return 495 / density - 450;
}

function isPositive(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

/**
 * Berekent het vetpercentage. Geeft null als een plooi ontbreekt, de leeftijd
 * onder de validatiegrens ligt of het geslacht niet in de formule past.
 */
export function bodyFatDurninWomersley(input: DurninWomersleyInput): BodyFatResult | null {
  const { bicepsMm, tricepsMm, subscapularMm, suprailiacMm, sex, ageYears } = input;
  if (![bicepsMm, tricepsMm, subscapularMm, suprailiacMm].every(isPositive)) return null;
  if (!Number.isFinite(ageYears) || ageYears < DW_MIN_AGE) return null;
  const sumMm = bicepsMm + tricepsMm + subscapularMm + suprailiacMm;
  const density = bodyDensityDurninWomersley(sumMm, sex, ageYears);
  const pct = siriFatPct(density);
  if (!Number.isFinite(pct) || pct <= 0 || pct >= 70) return null;
  return { pct: Math.round(pct * 10) / 10, density, sumMm, method: 'durnin-womersley' };
}
