/**
 * Filteren en sorteren van de workoutlijst (tabs per categorie, chips per reeks).
 * Pure functies, los van de UI, zodat het gedrag te testen is.
 */
import type { Schema } from '../types';

export interface WorkoutFilter {
  /** '' = gewone workouts (zonder categorie), anders de categorie ("Groepslessen"). */
  category: string;
  /** Reeks binnen de categorie ("Groepsles 3"), of null voor alle. */
  series: string | null;
  /** Alleen workouts waarvan de periode vandaag bevat. */
  onlyCurrentWeek: boolean;
}

const norm = (v: string | null | undefined): string => (v ?? '').trim();

/** Periode van de workout bevat `today` (YYYY-MM-DD). */
export function isCurrentPeriod(schema: Schema, today: string): boolean {
  return Boolean(schema.startDate && schema.endDate && schema.startDate <= today && today <= schema.endDate);
}

/** Alle categorieën die in de lijst voorkomen, alfabetisch. */
export function getCategories(schemas: Schema[]): string[] {
  return Array.from(new Set(schemas.map((s) => norm(s.category)).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, 'nl')
  );
}

/** Alle reeksen binnen één categorie, natuurlijk gesorteerd ("Groepsles 2" vóór "Groepsles 10"). */
export function getSeriesOptions(schemas: Schema[], category: string): string[] {
  if (!category) return [];
  return Array.from(
    new Set(schemas.filter((s) => norm(s.category) === category).map((s) => norm(s.series)).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, 'nl', { numeric: true }));
}

/**
 * De zichtbare workouts voor het huidige filter.
 * Binnen een categorie: per reeks, daarna op startdatum (Week 1 → Week 26), daarna op naam.
 */
export function filterWorkouts(schemas: Schema[], filter: WorkoutFilter, today: string): Schema[] {
  const list = schemas.filter(
    (s) =>
      norm(s.category) === filter.category &&
      (!filter.series || norm(s.series) === filter.series) &&
      (!filter.onlyCurrentWeek || isCurrentPeriod(s, today))
  );
  if (!filter.category) return list;
  return [...list].sort((a, b) => {
    const sa = norm(a.series);
    const sb = norm(b.series);
    if (sa !== sb) return sa.localeCompare(sb, 'nl', { numeric: true });
    const da = a.startDate ?? '';
    const db = b.startDate ?? '';
    if (da !== db) return da.localeCompare(db);
    return a.name.localeCompare(b.name, 'nl', { numeric: true });
  });
}
