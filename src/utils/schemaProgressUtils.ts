import { Exercise } from '../types';
import { Schema } from '../types';
import { getAllExercises } from './storage';

/** Datum in YYYY-MM-DD voor vergelijking. */
function toDateStr(isoOrDate: string): string {
  return isoOrDate.split('T')[0];
}

/**
 * Logs van dit schema binnen de gegeven periode (inclusief start en end).
 */
export function getSchemaLogsInPeriod(
  schemaId: string,
  startDate: string,
  endDate: string
): Exercise[] {
  const all = getAllExercises();
  return all.filter((ex) => {
    if (ex.schemaId !== schemaId || !ex.date) return false;
    const d = toDateStr(ex.date);
    return d >= startDate && d <= endDate;
  });
}

/**
 * Aantal voltooide "sessies" in de periode: per datum + dagindex telt als 1 als alle
 * oefeningen van die dag die dag gelogd zijn. We tellen unieke (date, dayIndex) waar de dag compleet is.
 */
export function getCompletedSessionsInPeriod(
  schema: Schema,
  startDate: string,
  endDate: string
): number {
  const logs = getSchemaLogsInPeriod(schema.id, startDate, endDate);
  const byDateAndDay = new Map<string, Exercise[]>();
  for (const ex of logs) {
    if (ex.schemaDayIndex == null) continue;
    const d = toDateStr(ex.date);
    const key = `${d}_${ex.schemaDayIndex}`;
    if (!byDateAndDay.has(key)) byDateAndDay.set(key, []);
    byDateAndDay.get(key)!.push(ex);
  }
  let completed = 0;
  byDateAndDay.forEach((exercises, key) => {
    const [, dayIndexStr] = key.split('_');
    const dayIndex = parseInt(dayIndexStr, 10);
    const day = schema.days[dayIndex];
    if (!day || day.exercises.length === 0) return;
    const names = new Set(exercises.map((e) => e.name?.toLowerCase()).filter(Boolean));
    const allLogged = day.exercises.every((ex) =>
      names.has(ex.exerciseName.toLowerCase())
    );
    if (allLogged) completed += 1;
  });
  return completed;
}

/**
 * Eerste en laatste gewicht voor een oefening in dit schema binnen de periode.
 * targetWeight haal je uit het schema (eerste SchemaExercise met deze naam).
 */
export function getExerciseProgressInPeriod(
  schema: Schema,
  exerciseName: string,
  startDate: string,
  endDate: string
): { firstWeight: number | null; lastWeight: number | null; targetWeight: number | null } {
  const logs = getSchemaLogsInPeriod(schema.id, startDate, endDate).filter(
    (ex) => ex.name?.toLowerCase() === exerciseName.toLowerCase() && ex.weight != null
  );
  if (logs.length === 0) {
    const target = getTargetWeightForExercise(schema, exerciseName);
    return { firstWeight: null, lastWeight: null, targetWeight: target };
  }
  const sorted = [...logs].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const first = sorted[0].weight!;
  const last = sorted[sorted.length - 1].weight!;
  const target = getTargetWeightForExercise(schema, exerciseName);
  return { firstWeight: first, lastWeight: last, targetWeight: target };
}

function getTargetWeightForExercise(schema: Schema, exerciseName: string): number | null {
  const nameLower = exerciseName.toLowerCase();
  for (const day of schema.days) {
    for (const ex of day.exercises) {
      if (ex.exerciseName?.toLowerCase() === nameLower && ex.targetWeight != null)
        return ex.targetWeight;
    }
  }
  return null;
}

/** Unieke oefeningnamen uit het schema (voor progressie-overzicht). */
export function getUniqueExerciseNames(schema: Schema): string[] {
  const set = new Set<string>();
  for (const day of schema.days) {
    for (const ex of day.exercises) {
      if (ex.exerciseName?.trim()) set.add(ex.exerciseName.trim());
    }
  }
  return [...set].sort();
}

/**
 * Aantal dagen tussen vandaag en endDate (alleen als endDate in de toekomst).
 * Retourneert null als geen endDate of als endDate in het verleden.
 */
export function getDaysRemaining(endDate: string | null | undefined): number | null {
  if (!endDate) return null;
  const today = toDateStr(new Date().toISOString());
  if (endDate < today) return null;
  const end = new Date(endDate);
  const start = new Date(today);
  const diff = Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  return Math.max(0, diff);
}

/**
 * Totaal aantal dagen in de periode (voor inzicht "X van Y dagen").
 */
export function getTotalDaysInPeriod(
  startDate: string | null | undefined,
  endDate: string | null | undefined
): number | null {
  if (!startDate || !endDate) return null;
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diff = Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  return Math.max(0, diff + 1);
}
