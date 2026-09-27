/**
 * Voorstel voor de lesplanning: welke workouts passen bij deze les? De groepslessen volgen een
 * halfjaarschema (schemaweek 1–26, zie workoutFilter.ts) en een lesmoment per weekdag (seriesOrder,
 * 0 = maandag). De workout die aan de lessoort hangt, telt het zwaarst.
 */
import type { Schema } from '../types';
import { getCurrentScheduleWeek } from './workoutFilter';

/** Weekdag van een datum met maandag = 0, zoals seriesOrder bij de groepslessen. */
export function weekdayMonFirst(date: string): number {
  return (new Date(`${date}T12:00:00`).getDay() + 6) % 7;
}

export function scheduleWeekOf(date: string): number {
  return getCurrentScheduleWeek(new Date(`${date}T12:00:00`));
}

/** Hoe goed past een workout bij een les? 0 = geen voorstel. */
export function suggestionScore(
  schema: Schema,
  cls: { date: string; schemaId?: string | null; privateFor?: string | null }
): number {
  let score = 0;
  if (cls.schemaId && schema.id === cls.schemaId) score += 3;
  // PT-moment: de persoonlijke workout van dat lid, extra als er een dag op deze weekdag staat.
  if (cls.privateFor && schema.clientId === cls.privateFor && (schema.audience ?? 'single') === 'single') {
    score += 3;
    if (schema.days.some((d) => d.weekday === weekdayMonFirst(cls.date))) score += 1;
  }
  if (typeof schema.scheduleWeek === 'number' && schema.scheduleWeek === scheduleWeekOf(cls.date)) {
    score += 2;
    if (typeof schema.seriesOrder === 'number' && schema.seriesOrder === weekdayMonFirst(cls.date)) score += 1;
  }
  return score;
}

/** Workouts op volgorde voor het keuzemenu: eerst de voorstellen (beste eerst), dan de rest op naam. */
export function orderForClass(
  schemas: Schema[],
  cls: { date: string; schemaId?: string | null; privateFor?: string | null }
): { schema: Schema; suggested: boolean }[] {
  return schemas
    .map((schema) => ({ schema, score: suggestionScore(schema, cls) }))
    .sort((a, b) => b.score - a.score || a.schema.name.localeCompare(b.schema.name, 'nl'))
    .map(({ schema, score }) => ({ schema, suggested: score >= 2 }));
}

/** Welke dag van de workout hoort bij deze les: de dag op die weekdag (weekplanning), anders de eerste. */
export function dayIndexForClass(schema: Schema, date: string): number {
  const i = schema.days.findIndex((d) => d.weekday === weekdayMonFirst(date));
  return i >= 0 ? i : 0;
}

/** Voorstel voor een PT-moment zonder planning: de persoonlijke workout van het lid, als die er precies één is. */
export function autoPlanForClass(
  schemas: Schema[],
  cls: { date: string; privateFor?: string | null }
): { schema: Schema; dayIndex: number } | null {
  if (!cls.privateFor) return null;
  const own = schemas.filter((s) => s.clientId === cls.privateFor && (s.audience ?? 'single') === 'single');
  const planned = own.filter((s) => s.days.some((d) => d.weekday === weekdayMonFirst(cls.date)));
  const pick = planned.length === 1 ? planned[0] : own.length === 1 ? own[0] : null;
  return pick ? { schema: pick, dayIndex: dayIndexForClass(pick, cls.date) } : null;
}
