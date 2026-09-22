import { Exercise } from '../types';
import type { ExerciseLog } from '../types';
import { Schema } from '../types';
import { getAllExercises } from './storage';
import { getLatestMarkedCompleteTimeEver } from './dayCompletionStorage';

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
/** Laatste datum (YYYY-MM-DD) waarop deze schema-dag is getraind, of null. */
export function getLastSessionDateForDay(schemaId: string, schemaDayIndex: number): string | null {
  const all = getAllExercises();
  let last: string | null = null;
  for (const ex of all) {
    if (ex.schemaId === schemaId && ex.schemaDayIndex === schemaDayIndex && ex.date && ex.name) {
      const d = ex.date.slice(0, 10);
      if (!last || d > last) last = d;
    }
  }
  return last;
}

/**
 * Hetzelfde als hierboven, maar dan voor logs uit de cloud: die gebruikt de trainer als hij een
 * training voor een sporter draait. De logs staan dan onder het account van de sporter en niet
 * op dit toestel, dus ze komen uit Firestore in plaats van uit de lokale opslag.
 */
export function loggedExercisesFromSporterLogs(
  logs: ExerciseLog[],
  schemaId: string,
  schemaDayIndex: number
): Exercise[] {
  return logs
    .filter(
      (l) =>
        l.schemaId === schemaId &&
        l.schemaDayIndex === schemaDayIndex &&
        Boolean(l.exerciseName) &&
        isWithinLast12Hours(l.date)
    )
    .map((l) => ({
      id: l.id,
      name: l.exerciseName,
      weight: l.weight ?? undefined,
      sets: l.sets ?? undefined,
      reps: l.reps ?? undefined,
      notes: l.notes ?? undefined,
      // Hoort erbij: de overdracht na de training leunt juist op "was te zwaar".
      effort: l.effort ?? undefined,
      date: l.date,
      schemaId: l.schemaId ?? undefined,
      schemaDayIndex: l.schemaDayIndex ?? undefined,
    })) as Exercise[];
}

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
 * Meest recente keer dat deze schema-dag is getraind: logs of "Ja, was goed", ongeacht hoe lang
 * geleden. Bepaalt zowel de "Laatst getraind"-tekst als de volgorde van de dagen — een training
 * van vorige week moet een dag nog steeds laten zakken, niet alleen een van vandaag.
 */
export function getLastTrainedTimestamp(schemaId: string, dayIndex: number): number {
  const lastLogDate = getLastSessionDateForDay(schemaId, dayIndex);
  const fromLogs = lastLogDate ? new Date(`${lastLogDate}T00:00:00`).getTime() : 0;
  const fromMarked = getLatestMarkedCompleteTimeEver(schemaId, dayIndex);
  return Math.max(fromLogs, fromMarked);
}

/**
 * "Laatst getraind"-tekst: relatief (Vandaag/Gisteren/X dagen geleden) als het minder dan een
 * week geleden is — dat leest sneller dan een datum uitrekenen — anders de datum zelf.
 */
export function formatLastTrained(dateStr: string, now: Date = new Date()): string {
  const last = new Date(`${dateStr}T00:00:00`);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((today.getTime() - last.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays <= 0) return 'Vandaag';
  if (diffDays === 1) return 'Gisteren';
  if (diffDays < 7) return `${diffDays} dagen geleden`;
  return last.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Index van de dag die bij "deze week" hoort, voor schema's met een startdatum en één dag per week
 * (groepslessen: Week 1 … Week 26). `null` als er geen startdatum is of vandaag buiten de periode valt.
 */
export function getCurrentWeekDayIndex(schema: Schema, today: Date = new Date()): number | null {
  if (!schema.startDate || schema.days.length === 0) return null;
  const start = new Date(schema.startDate + 'T00:00:00');
  if (Number.isNaN(start.getTime())) return null;
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.floor((todayMidnight.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return null;
  const weekIndex = Math.floor(diffDays / 7);
  return weekIndex < schema.days.length ? weekIndex : null;
}

/** Groepsles op weekbasis: dagen heten "Week n" en er is een startdatum. */
export function isWeeklyGroupSchema(schema: Schema): boolean {
  return (
    schema.audience === 'group' &&
    Boolean(schema.startDate) &&
    schema.days.length > 0 &&
    schema.days.every((d) => /^week\s*\d+/i.test(d.dayLabel.trim()))
  );
}

/**
 * Dag-indices gesorteerd: de volgende te doen training staat altijd bovenaan.
 * - Groepsles per week (met startdatum): de huidige week eerst, daarna de volgende weken, dan de weken ervoor.
 * - Anders: nooit-getrainde dagen eerst (in schemavolgorde), dan de langst-niet-getrainde dag, tot
 *   de dag die het laatst is gedaan helemaal onderaan — die is per definitie het minst "aan de beurt".
 */
export function getSortedDayIndices(schema: Schema): number[] {
  const n = schema.days.length;
  if (isWeeklyGroupSchema(schema)) {
    const current = getCurrentWeekDayIndex(schema);
    if (current != null) return [...Array(n)].map((_, i) => (current + i) % n);
    return [...Array(n)].map((_, i) => i);
  }

  return schema.days
    .map((_, i) => i)
    .sort((a, b) => {
      const ta = getLastTrainedTimestamp(schema.id, a);
      const tb = getLastTrainedTimestamp(schema.id, b);
      if (ta !== tb) return ta - tb;
      return a - b;
    });
}
