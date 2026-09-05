/**
 * Vetpercentage uit huidplooien, server-side.
 * Zelfde methode en coëfficiënten als src/utils/bodyFat.ts: Durnin & Womersley (1974)
 * over vier plooien (biceps, triceps, subscapulair, suprailiacaal) → dichtheid,
 * daarna Siri (1961): vet% = 495 / dichtheid − 450.
 */

const DW_TABLE = {
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

/** Leeftijd in hele jaren op een datum (YYYY-MM-DD), of null. */
export function ageOnDate(birthDate, onDate) {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  const d = new Date(onDate);
  if (Number.isNaN(b.getTime()) || Number.isNaN(d.getTime())) return null;
  let age = d.getFullYear() - b.getFullYear();
  const beforeBirthday = d.getMonth() < b.getMonth() || (d.getMonth() === b.getMonth() && d.getDate() < b.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

/** 'anders' en null geven null: de formule kent alleen twee tabellen. */
export function toSkinfoldSex(gender) {
  return gender === 'man' || gender === 'vrouw' ? gender : null;
}

function isPositive(n) {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

/** Geeft { pct, sumMm } of null als een plooi ontbreekt, de leeftijd te laag is of het geslacht niet past. */
export function bodyFatDurninWomersley({ bicepsMm, tricepsMm, subscapularMm, suprailiacMm, sex, ageYears }) {
  if (![bicepsMm, tricepsMm, subscapularMm, suprailiacMm].every(isPositive)) return null;
  if (!Number.isFinite(ageYears) || ageYears < DW_MIN_AGE) return null;
  const sumMm = bicepsMm + tricepsMm + subscapularMm + suprailiacMm;
  const row = DW_TABLE[sex].find((r) => ageYears <= r.maxAge) ?? DW_TABLE[sex][DW_TABLE[sex].length - 1];
  const density = row.c - row.m * Math.log10(sumMm);
  const pct = 495 / density - 450;
  if (!Number.isFinite(pct) || pct <= 0 || pct >= 70) return null;
  return { pct: Math.round(pct * 10) / 10, sumMm };
}
