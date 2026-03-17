import { Exercise } from '../types';
import { Schema } from '../types';
import { getAllExercises } from './storage';
import {
  isDayMarkedCompleteInLast12Hours,
  getMarkedCompleteTime,
} from './dayCompletionStorage';

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

/**
 * Log telt alleen als "gelogd" binnen de laatste 12 uur.
 * Ondersteunt zowel volledige ISO-datums (met tijd) als alleen-datum (YYYY-MM-DD).
 */
export function isWithinLast12Hours(dateStr: string): boolean {
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return false;
  const now = Date.now();
  const diff = now - parsed.getTime();
  return diff >= 0 && diff < TWELVE_HOURS_MS;
}

/**
 * Oefeningen die vandaag voor deze schema-dag zijn gelogd én binnen de laatste 12 uur.
 */
export function getLoggedExercisesForSchemaDayInLast12Hours(
  schemaId: string,
  schemaDayIndex: number
): Exercise[] {
  const today = new Date().toISOString().split('T')[0];
  const all = getAllExercises();
  return all.filter(
    (ex) =>
      ex.date.startsWith(today) &&
      ex.schemaId === schemaId &&
      ex.schemaDayIndex === schemaDayIndex &&
      isWithinLast12Hours(ex.date) &&
      ex.name
  );
}

/**
 * Of deze dag voltooid is: alle oefeningen gelogd in de laatste 12 uur,
 * OF de gebruiker heeft in één keer "Ja, was goed" geklikt (binnen 12 uur).
 */
export function isDayCompletedInLast12Hours(schema: Schema, dayIndex: number): boolean {
  if (isDayMarkedCompleteInLast12Hours(schema.id, dayIndex)) return true;
  const day = schema.days[dayIndex];
  if (!day || day.exercises.length === 0) return false;
  const logged = getLoggedExercisesForSchemaDayInLast12Hours(schema.id, dayIndex);
  return day.exercises.every((ex) =>
    logged.some((l) => l.name?.toLowerCase() === ex.exerciseName.toLowerCase())
  );
}

/**
 * Meest recente voltooiing voor deze schema-dag (logs of "ja was goed") binnen 12h.
 */
function getLatestLogTimeForDay(schemaId: string, dayIndex: number): number {
  const logged = getLoggedExercisesForSchemaDayInLast12Hours(schemaId, dayIndex);
  const fromLogs = logged.length === 0 ? 0 : Math.max(...logged.map((ex) => new Date(ex.date).getTime()));
  const fromMarked = getMarkedCompleteTime(schemaId, dayIndex);
  return Math.max(fromLogs, fromMarked);
}

/**
 * Dag-indices gesorteerd: de volgende te doen training staat altijd bovenaan.
 * - Niet alle dagen voltooid (12h): onvoltooide dagen eerst (in volgorde), dan voltooide.
 * - Alle dagen voltooid: dag die het laatst is gedaan bepalen → de volgende in de cyclus komt bovenaan
 *   (net Dag 1 gedaan → Dag 2 boven; net laatste dag gedaan → Dag 1 boven voor nieuwe ronde).
 */
export function getSortedDayIndices(schema: Schema): number[] {
  const n = schema.days.length;
  const allCompleted = schema.days.every((_, i) => isDayCompletedInLast12Hours(schema, i));

  if (allCompleted && n > 0) {
    let lastCompletedIndex = 0;
    let latestTime = 0;
    for (let i = 0; i < n; i++) {
      const t = getLatestLogTimeForDay(schema.id, i);
      if (t > latestTime) {
        latestTime = t;
        lastCompletedIndex = i;
      }
    }
    const nextIndex = (lastCompletedIndex + 1) % n;
    return [...Array(n)].map((_, i) => (nextIndex + i) % n);
  }

  return schema.days
    .map((_, i) => i)
    .sort((a, b) => {
      const aDone = isDayCompletedInLast12Hours(schema, a);
      const bDone = isDayCompletedInLast12Hours(schema, b);
      if (aDone === bDone) return a - b;
      return aDone ? 1 : -1;
    });
}
