/**
 * Cijfers voor Inzichten → Overzicht. Puur (alles gaat erin als argument, ook "nu"), zodat het
 * testbaar is zonder localStorage of klok.
 */
import type { Exercise, Schema } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;

interface ParsedLog {
  ex: Exercise;
  at: Date;
  /** Datum zonder tijd (`YYYY-MM-DD`) heeft geen tijdstip om te tonen. */
  hasTime: boolean;
  ymd: string;
}

/** Logs hebben soms `YYYY-MM-DD` (lokale kalenderdag), soms een volledige ISO-tijd. */
function parseLogDate(raw: string): { at: Date; hasTime: boolean } | null {
  const s = raw.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return { at: new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])), hasTime: false };
  const ms = Date.parse(s);
  return Number.isNaN(ms) ? null : { at: new Date(ms), hasTime: true };
}

function ymdOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Maandag 00:00 van de week waarin `d` valt. */
function startOfWeek(d: Date): Date {
  const day = startOfDay(d);
  const offset = (day.getDay() + 6) % 7;
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() - offset);
}

/** Alleen echte oefeningen (met naam); losse notities tellen niet als training. */
function parseLogs(exercises: Exercise[]): ParsedLog[] {
  const out: ParsedLog[] = [];
  for (const ex of exercises) {
    if (!ex.name?.trim() || !ex.date) continue;
    const p = parseLogDate(ex.date);
    if (!p) continue;
    out.push({ ex, at: p.at, hasTime: p.hasTime, ymd: ymdOf(p.at) });
  }
  return out;
}

/** Of de log op een van de laatste `days` kalenderdagen valt (vandaag meegeteld). */
export function isWithinLastDays(date: string, days: number, now: Date): boolean {
  const p = parseLogDate(date);
  if (!p) return false;
  const from = startOfDay(now).getTime() - (days - 1) * DAY_MS;
  const to = startOfDay(now).getTime() + DAY_MS;
  return p.at.getTime() >= from && p.at.getTime() < to;
}

export interface OverviewStats {
  /** Trainingsdagen in de laatste 30 dagen. */
  sessions: number;
  /** Gewicht × sets × reps opgeteld over de laatste 30 dagen, in kg. */
  volumeKg: number;
  /** Aantal weken op rij met minstens één training. */
  streakWeeks: number;
}

export const OVERVIEW_PERIOD_DAYS = 30;

export function computeOverviewStats(exercises: Exercise[], now: Date): OverviewStats {
  const logs = parseLogs(exercises);
  const recent = logs.filter((l) => isWithinLastDays(l.ex.date, OVERVIEW_PERIOD_DAYS, now));

  const sessions = new Set(recent.map((l) => l.ymd)).size;

  let volumeKg = 0;
  for (const { ex } of recent) {
    if (ex.weight == null || !(ex.weight > 0)) continue;
    const sets = ex.sets && ex.sets > 0 ? ex.sets : 1;
    const reps = ex.reps && ex.reps > 0 ? ex.reps : 1;
    volumeKg += ex.weight * sets * reps;
  }

  const trainedWeeks = new Set(logs.map((l) => startOfWeek(l.at).getTime()));
  // Een week zonder training telt pas als breuk als hij voorbij is: maandagochtend staat je reeks nog.
  let week = startOfWeek(now);
  if (!trainedWeeks.has(week.getTime())) week = new Date(week.getFullYear(), week.getMonth(), week.getDate() - 7);
  let streakWeeks = 0;
  while (trainedWeeks.has(week.getTime())) {
    streakWeeks += 1;
    week = new Date(week.getFullYear(), week.getMonth(), week.getDate() - 7);
  }

  return { sessions, volumeKg: Math.round(volumeKg), streakWeeks };
}

/**
 * Hoeveel van je schema je deze week gedaan hebt. Het schema is het laatst gebruikte (laatste log
 * vanuit een schema in de periode); elke dag van dat schema is één training per week. Een dag telt als
 * gedaan zodra er deze week iets van gelogd is, of als hij als voltooid is aangevinkt.
 * `null` als er geen schema in gebruik is.
 */
export function computePlanCompletion(
  exercises: Exercise[],
  schemas: Schema[],
  completions: { schemaId: string; schemaDayIndex: number; completedAt: string }[],
  now: Date
): number | null {
  const fromSchema = parseLogs(exercises)
    .filter((l) => l.ex.schemaId && isWithinLastDays(l.ex.date, OVERVIEW_PERIOD_DAYS, now))
    .sort((a, b) => b.at.getTime() - a.at.getTime());
  const schema = fromSchema.map((l) => schemas.find((s) => s.id === l.ex.schemaId)).find(Boolean);
  if (!schema) return null;

  const plannedDays = schema.days.map((d, i) => (d.exercises.length > 0 ? i : -1)).filter((i) => i >= 0);
  if (plannedDays.length === 0) return null;

  const weekStart = startOfWeek(now).getTime();
  const done = new Set<number>();
  for (const l of fromSchema) {
    if (l.ex.schemaId === schema.id && l.ex.schemaDayIndex != null && l.at.getTime() >= weekStart) {
      done.add(l.ex.schemaDayIndex);
    }
  }
  for (const c of completions) {
    if (c.schemaId === schema.id && new Date(c.completedAt).getTime() >= weekStart) done.add(c.schemaDayIndex);
  }
  const doneCount = plannedDays.filter((i) => done.has(i)).length;
  return Math.round((doneCount / plannedDays.length) * 100);
}

export interface RecentLog {
  id: string;
  name: string;
  details: string;
  when: string;
}

const WEEKDAYS = ['Zo', 'Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za'];
const MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

/** "Vandaag 07:12", "Gisteren 18:04", "Ma 18:04" (deze week), anders "12 sep" (met jaar als dat anders is). */
export function formatRecentWhen(at: Date, hasTime: boolean, now: Date): string {
  const time = hasTime
    ? ` ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
    : '';
  const daysAgo = Math.round((startOfDay(now).getTime() - startOfDay(at).getTime()) / DAY_MS);
  if (daysAgo === 0) return `Vandaag${time}`;
  if (daysAgo === 1) return `Gisteren${time}`;
  if (daysAgo > 1 && daysAgo < 7) return `${WEEKDAYS[at.getDay()]}${time}`;
  const year = at.getFullYear() === now.getFullYear() ? '' : ` ${at.getFullYear()}`;
  return `${at.getDate()} ${MONTHS[at.getMonth()]}${year}`;
}

/** "80 kg · 4 × 8"; delen die ontbreken vallen weg. */
export function formatLogDetails(ex: Pick<Exercise, 'weight' | 'sets' | 'reps'>): string {
  const parts: string[] = [];
  if (ex.weight != null && ex.weight > 0) parts.push(`${String(ex.weight).replace('.', ',')} kg`);
  const sets = ex.sets && ex.sets > 0 ? ex.sets : null;
  const reps = ex.reps && ex.reps > 0 ? ex.reps : null;
  if (sets && reps) parts.push(`${sets} × ${reps}`);
  else if (sets) parts.push(`${sets} ${sets === 1 ? 'set' : 'sets'}`);
  else if (reps) parts.push(`${reps} reps`);
  return parts.join(' · ');
}

export function getRecentLogs(exercises: Exercise[], limit: number, now: Date): RecentLog[] {
  return parseLogs(exercises)
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, limit)
    .map((l) => ({
      id: l.ex.id,
      name: l.ex.name!.trim(),
      details: formatLogDetails(l.ex),
      when: formatRecentWhen(l.at, l.hasTime, now),
    }));
}

/** "48t" vanaf een ton (één decimaal onder de 10 t), anders "850 kg". */
export function formatVolume(kg: number): string {
  if (kg < 1000) return `${kg} kg`;
  const t = kg / 1000;
  return t < 10 ? `${t.toFixed(1).replace('.', ',')}t` : `${Math.round(t)}t`;
}
