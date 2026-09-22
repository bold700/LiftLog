/**
 * Cijfers voor Inzichten → Oefeningen (Figma "Insights · Exercises"): progressie van één oefening
 * en de trainingsbalans over alle logs. Puur, zodat het testbaar is zonder opslag.
 */
import type { Exercise } from '../types';
import { muscleLabel } from './muscleSessions';

function dayKey(date: string): string | null {
  const s = date.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const ms = Date.parse(s);
  if (Number.isNaN(ms)) return null;
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface SessionPoint {
  /** Kalenderdag `YYYY-MM-DD`. */
  day: string;
  /** Zwaarste gewicht van die dag. */
  weight: number;
}

export interface ExerciseProgress {
  /** Eén punt per trainingsdag, oud → nieuw. */
  sessions: SessionPoint[];
  max: number;
  latest: number;
  /** Gewicht van de sessie vóór de laatste; null bij één sessie. */
  previous: number | null;
}

/** Progressie van één oefening; null als er geen log met gewicht is. */
export function computeExerciseProgress(logs: Exercise[]): ExerciseProgress | null {
  const byDay = new Map<string, number>();
  for (const ex of logs) {
    if (ex.weight == null || !(ex.weight > 0) || !ex.date) continue;
    const day = dayKey(ex.date);
    if (!day) continue;
    byDay.set(day, Math.max(byDay.get(day) ?? 0, ex.weight));
  }
  const sessions = [...byDay.entries()]
    .map(([day, weight]) => ({ day, weight }))
    .sort((a, b) => a.day.localeCompare(b.day));
  if (sessions.length === 0) return null;
  return {
    sessions,
    max: Math.max(...sessions.map((s) => s.weight)),
    latest: sessions[sessions.length - 1].weight,
    previous: sessions.length > 1 ? sessions[sessions.length - 2].weight : null,
  };
}

export interface BalancePair {
  a: string;
  b: string;
  /** Aandeel van `a` in procenten (0–100); `b` is de rest. */
  aPct: number;
}

export interface ExerciseTraits {
  /** Bewegingstype uit de oefeningmetadata ('Push', 'Pull', 'Isolatie', …), als die bekend is. */
  movementType?: string;
  /** Primaire spierregio's (zoals het lichaamsfiguur ze gebruikt). */
  primaryRegions: string[];
}

const LOWER = new Set(['Quadriceps', 'Hamstrings', 'Billen', 'Kuiten']);
const UPPER = new Set(['Borst', 'Rug', 'Trapezius', 'Schouders', 'Biceps', 'Triceps', 'Onderarmen']);
const COMPOUND = new Set(['Push', 'Pull', 'Hinge', 'Squat', 'Carry']);

function pair(a: string, b: string, countA: number, countB: number): BalancePair | null {
  const total = countA + countB;
  return total === 0 ? null : { a, b, aPct: Math.round((countA / total) * 100) };
}

/**
 * Verhoudingen over alle logs (elke log met naam telt één keer). Oefeningen zonder bekende
 * eigenschap tellen voor die verhouding niet mee; een verhouding zonder data is null.
 */
export function computeTrainingBalance(
  exercises: Exercise[],
  traits: (exerciseName: string) => ExerciseTraits | null
): { pushPull: BalancePair | null; upperLower: BalancePair | null; compoundIsolation: BalancePair | null } {
  let push = 0, pull = 0, upper = 0, lower = 0, compound = 0, isolation = 0;
  for (const ex of exercises) {
    const name = ex.name?.trim();
    const t = name ? traits(name) : null;
    if (!t) continue;
    if (t.movementType === 'Push') push++;
    if (t.movementType === 'Pull') pull++;
    if (t.movementType === 'Isolatie') isolation++;
    else if (t.movementType && COMPOUND.has(t.movementType)) compound++;
    const labels = t.primaryRegions.map(muscleLabel);
    if (labels.some((l) => l && LOWER.has(l))) lower++;
    else if (labels.some((l) => l && UPPER.has(l))) upper++;
  }
  return {
    pushPull: pair('Push', 'Pull', push, pull),
    upperLower: pair('Bovenlichaam', 'Onderlichaam', upper, lower),
    compoundIsolation: pair('Compound', 'Isolatie', compound, isolation),
  };
}
