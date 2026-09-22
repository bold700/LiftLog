/**
 * Inzichten → Logs (Figma "Logs"): alle gelogde oefeningen, te filteren op periode, oefening en
 * workout, gegroepeerd per dag. Puur, zodat het testbaar is zonder opslag.
 */
import type { Exercise } from '../types';
import { formatLogDetails } from './insightsOverview';

/** Filter op workout: een schema-id, of `NO_SCHEMA` voor los gelogde oefeningen. */
export const NO_SCHEMA = '__los__';

export interface LogFilter {
  /** Alleen de laatste zoveel dagen (vandaag telt mee); null = alles. */
  periodDays: number | null;
  /** Alleen deze oefening (naam, hoofdletterongevoelig); null = alle. */
  exerciseName: string | null;
  /** Alleen dit schema, of `NO_SCHEMA`; null = alle. */
  schemaId: string | null;
}

export const DEFAULT_LOG_FILTER: LogFilter = { periodDays: 30, exerciseName: null, schemaId: null };

/** "YYYY-MM-DD" van een log, zoals de trainingen op de Logs-pagina ook groeperen. */
export const logDay = (ex: Pick<Exercise, 'date'>) => (typeof ex.date === 'string' ? ex.date.slice(0, 10) : '');

const localDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Eerste dag die nog binnen de periode valt. */
function firstDayOf(periodDays: number, now: Date): string {
  const d = new Date(now);
  d.setDate(d.getDate() - (periodDays - 1));
  return localDay(d);
}

/** Alleen echte oefeningen (met naam); een lege regel zonder naam telt niet als log. */
const isLog = (ex: Exercise) => !!ex.name?.trim() && !!logDay(ex);

export function filterLogs(exercises: Exercise[], filter: LogFilter, now: Date): Exercise[] {
  const from = filter.periodDays != null ? firstDayOf(filter.periodDays, now) : null;
  const name = filter.exerciseName?.trim().toLowerCase() ?? null;
  return exercises.filter((ex) => {
    if (!isLog(ex)) return false;
    if (from && logDay(ex) < from) return false;
    if (name && ex.name!.trim().toLowerCase() !== name) return false;
    if (filter.schemaId === NO_SCHEMA && ex.schemaId) return false;
    if (filter.schemaId && filter.schemaId !== NO_SCHEMA && ex.schemaId !== filter.schemaId) return false;
    return true;
  });
}

/** Unieke oefeningnamen, alfabetisch, voor het filter "Alle oefeningen". */
export function exerciseNames(exercises: Exercise[]): string[] {
  const byKey = new Map<string, string>();
  for (const ex of exercises) {
    if (!isLog(ex)) continue;
    const n = ex.name!.trim();
    if (!byKey.has(n.toLowerCase())) byKey.set(n.toLowerCase(), n);
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, 'nl'));
}

/** Schema-id's die in de logs voorkomen, en of er ook los gelogd is, voor het filter "Alle workouts". */
export function workoutOptions(exercises: Exercise[]): { schemaIds: string[]; hasLoose: boolean } {
  const ids = new Set<string>();
  let hasLoose = false;
  for (const ex of exercises) {
    if (!isLog(ex)) continue;
    if (ex.schemaId) ids.add(ex.schemaId);
    else hasLoose = true;
  }
  return { schemaIds: [...ids], hasLoose };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Dagkop: "Vandaag · dinsdag 16 september", "Gisteren · …", anders "Zaterdag 13 september" (met jaar als het niet dit jaar is). */
export function logDayLabel(day: string, now: Date): string {
  const [y, m, d] = day.split('-').map(Number);
  if (!y || !m || !d) return day;
  const date = new Date(y, m - 1, d);
  const long = date.toLocaleDateString('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(y !== now.getFullYear() && { year: 'numeric' }),
  });
  const today = localDay(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (day === today) return `Vandaag · ${long}`;
  if (day === localDay(yesterday)) return `Gisteren · ${long}`;
  return cap(long);
}

export interface LogDay {
  day: string;
  label: string;
  logs: Exercise[];
}

/** Per dag, nieuwste dag eerst; binnen een dag de laatst gelogde bovenaan. */
export function groupLogsByDay(exercises: Exercise[], now: Date): LogDay[] {
  const byDay = new Map<string, Exercise[]>();
  for (const ex of exercises) {
    const day = logDay(ex);
    if (!day) continue;
    const list = byDay.get(day) ?? [];
    list.push(ex);
    byDay.set(day, list);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([day, logs]) => ({
      day,
      label: logDayLabel(day, now),
      logs: [...logs].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    }));
}

/** Rechts op de rij: "92,5 kg · 4 × 6", of "Eigen gewicht · 3 × 10" als er zonder gewicht is gelogd. */
export function logRowDetails(ex: Pick<Exercise, 'weight' | 'sets' | 'reps'>): string {
  const details = formatLogDetails(ex);
  const noWeight = !(ex.weight != null && ex.weight > 0);
  const hasVolume = (ex.sets ?? 0) > 0 || (ex.reps ?? 0) > 0;
  return noWeight && hasVolume ? `Eigen gewicht · ${details}` : details;
}
