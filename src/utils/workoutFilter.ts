/**
 * Filteren en sorteren van de workoutlijst (tabs per categorie, chips per reeks).
 * Pure functies, los van de UI, zodat het gedrag te testen is.
 */
import type { Schema } from '../types';

export interface WorkoutFilter {
  /** '' = gewone workouts (zonder categorie), anders de categorie ("Groepslessen"). */
  category: string;
  /** Reeks binnen de categorie ("Woensdag ochtend"), of null voor alle. */
  series: string | null;
  /** Alleen workouts die deze week aan de beurt zijn. */
  onlyCurrentWeek: boolean;
}

const norm = (v: string | null | undefined): string => (v ?? '').trim();
const orderOf = (s: Schema): number =>
  typeof s.seriesOrder === 'number' ? s.seriesOrder : Number.MAX_SAFE_INTEGER;

// --- Halfjaarschema op weeknummer ------------------------------------------
// De groepslessen hangen niet aan een startdatum maar aan het weeknummer van de kalender:
// week 1 t/m 26 zijn de eerste helft van het jaar, en vanaf ISO-week 27 begint het schema
// opnieuw bij week 1. Zo klopt "deze week" elk jaar, zonder de lessen opnieuw te importeren.

/** Aantal weken in één schemablok (een half jaar). */
export const SCHEDULE_WEEKS = 26;

/** ISO 8601-weeknummer (1–53): de week waarin de donderdag valt. */
export function getIsoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayIndex = (d.getUTCDay() + 6) % 7; // maandag = 0
  d.setUTCDate(d.getUTCDate() - dayIndex + 3); // donderdag van deze week
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDayIndex = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayIndex + 3);
  return 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000));
}

/**
 * Welke week van het halfjaarschema nu loopt (1–26).
 * In een jaar met 53 ISO-weken telt die laatste week als schemaweek 1.
 */
export function getCurrentScheduleWeek(date: Date = new Date()): number {
  return ((getIsoWeek(date) - 1) % SCHEDULE_WEEKS) + 1;
}

/** Periode van de workout bevat `today` (YYYY-MM-DD). Voor workouts zonder weeknummer. */
export function isCurrentPeriod(schema: Schema, today: string): boolean {
  return Boolean(schema.startDate && schema.endDate && schema.startDate <= today && today <= schema.endDate);
}

/** Is deze workout deze week aan de beurt? Op weeknummer als het schema dat heeft, anders op periode. */
export function isCurrentWeek(schema: Schema, today: string, now: Date = new Date()): boolean {
  if (typeof schema.scheduleWeek === 'number') return schema.scheduleWeek === getCurrentScheduleWeek(now);
  return isCurrentPeriod(schema, today);
}

// --- Tabs en chips ---------------------------------------------------------

/** Alle categorieën die in de lijst voorkomen, alfabetisch. */
export function getCategories(schemas: Schema[]): string[] {
  return Array.from(new Set(schemas.map((s) => norm(s.category)).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, 'nl')
  );
}

/**
 * Alle reeksen binnen één categorie, op `seriesOrder` (maandag → zondag) en anders op naam.
 * Alfabetisch zou de lesmomenten door elkaar gooien (Dinsdag vóór Maandag).
 */
export function getSeriesOptions(schemas: Schema[], category: string): string[] {
  if (!category) return [];
  const order = new Map<string, number>();
  for (const s of schemas) {
    if (norm(s.category) !== category) continue;
    const name = norm(s.series);
    if (!name) continue;
    const pos = orderOf(s);
    const known = order.get(name);
    if (known === undefined || pos < known) order.set(name, pos);
  }
  return Array.from(order.keys()).sort((a, b) => {
    const oa = order.get(a) as number;
    const ob = order.get(b) as number;
    if (oa !== ob) return oa - ob;
    return a.localeCompare(b, 'nl', { numeric: true });
  });
}

/**
 * De zichtbare workouts voor het huidige filter.
 * Binnen een categorie: per lesmoment (maandag → zondag), daarna op weeknummer.
 */
export function filterWorkouts(
  schemas: Schema[],
  filter: WorkoutFilter,
  today: string,
  now: Date = new Date()
): Schema[] {
  const list = schemas.filter(
    (s) =>
      norm(s.category) === filter.category &&
      (!filter.series || norm(s.series) === filter.series) &&
      (!filter.onlyCurrentWeek || isCurrentWeek(s, today, now))
  );
  if (!filter.category) return list;
  return [...list].sort((a, b) => {
    const oa = orderOf(a);
    const ob = orderOf(b);
    if (oa !== ob) return oa - ob;
    const sa = norm(a.series);
    const sb = norm(b.series);
    if (sa !== sb) return sa.localeCompare(sb, 'nl', { numeric: true });
    const wa = a.scheduleWeek ?? Number.MAX_SAFE_INTEGER;
    const wb = b.scheduleWeek ?? Number.MAX_SAFE_INTEGER;
    if (wa !== wb) return wa - wb;
    const da = a.startDate ?? '';
    const db = b.startDate ?? '';
    if (da !== db) return da.localeCompare(db);
    return a.name.localeCompare(b.name, 'nl', { numeric: true });
  });
}
