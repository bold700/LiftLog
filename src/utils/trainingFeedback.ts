/**
 * Terugkoppeling van de sporter voor de trainer: per oefening het laatste resultaat met het signaal
 * (te licht / goed / te zwaar) en een voorstel voor de volgende keer, plus de laatste check-in.
 * Pure functies, los van de UI.
 */
import type { ExerciseEffort, ExerciseLog, SessionCheckin } from '../types';

export const EFFORT_LABELS: Record<ExerciseEffort, string> = {
  light: 'Te licht',
  good: 'Goed',
  heavy: 'Te zwaar',
};

export const FEELING_LABELS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: 'Slecht',
  2: 'Matig',
  3: 'Oké',
  4: 'Goed',
  5: 'Top',
};

/** Stap waarmee we gewicht voorstellen te verhogen of verlagen (kg). */
export const WEIGHT_STEP_KG = 2.5;

/**
 * Voorstel voor de volgende keer. Te licht → een stap erbij; te zwaar → zelfde gewicht of een stap
 * eraf; goed of onbekend → zelfde gewicht. Zonder gewicht (bodyweight) alleen een tekst.
 */
export function suggestNextWeight(effort: ExerciseEffort | null | undefined, weightKg: number | null | undefined): string {
  const hasWeight = typeof weightKg === 'number' && weightKg > 0;
  const fmt = (kg: number) => `${Number.isInteger(kg) ? kg : kg.toFixed(1).replace('.', ',')} kg`;
  if (effort === 'light') return hasWeight ? `Probeer ${fmt(weightKg + WEIGHT_STEP_KG)}` : 'Maak het zwaarder';
  if (effort === 'heavy') {
    if (!hasWeight) return 'Maak het lichter of minder herhalingen';
    const lower = Math.max(0, weightKg - WEIGHT_STEP_KG);
    return `Houd ${fmt(weightKg)}, of terug naar ${fmt(lower)}`;
  }
  return hasWeight ? `Houd ${fmt(weightKg)}` : 'Zo houden';
}

export interface ExerciseFeedback {
  exerciseName: string;
  date: string;
  weight: number | null;
  sets: number | null;
  reps: number | null;
  effort: ExerciseEffort | null;
  notes: string | null;
  suggestion: string;
}

export interface SporterFeedback {
  exercises: ExerciseFeedback[];
  checkin: SessionCheckin | null;
  /** Datum van de meest recente log of check-in (ISO), of null als er niets is. */
  lastActivity: string | null;
}

export interface BuildFeedbackOptions {
  /** Alleen logs van deze workout; leeg = alle logs. */
  schemaId?: string | null;
  /** Alleen de laatste N dagen (standaard 60). */
  days?: number;
  now?: Date;
}

/**
 * Per oefening de laatste log (nieuwste eerst), gefilterd op workout en periode, en de laatste check-in.
 * Oefeningen met een signaal of notitie staan bovenaan: dat is wat de trainer moet weten.
 */
export function buildSporterFeedback(
  logs: ExerciseLog[],
  checkins: SessionCheckin[],
  options: BuildFeedbackOptions = {}
): SporterFeedback {
  const now = options.now ?? new Date();
  const since = new Date(now.getTime() - (options.days ?? 60) * 24 * 60 * 60 * 1000).toISOString();
  const relevant = logs.filter(
    (l) => l.exerciseName && l.date >= since && (!options.schemaId || l.schemaId === options.schemaId)
  );
  const latestByName = new Map<string, ExerciseLog>();
  for (const log of relevant) {
    const key = log.exerciseName.trim().toLowerCase();
    const known = latestByName.get(key);
    if (!known || log.date > known.date) latestByName.set(key, log);
  }
  const exercises: ExerciseFeedback[] = Array.from(latestByName.values())
    .map((l) => ({
      exerciseName: l.exerciseName.trim(),
      date: l.date,
      weight: l.weight,
      sets: l.sets,
      reps: l.reps,
      effort: l.effort ?? null,
      notes: l.notes?.trim() || null,
      suggestion: suggestNextWeight(l.effort, l.weight),
    }))
    .sort((a, b) => {
      const sa = a.effort && a.effort !== 'good' ? 0 : a.notes ? 1 : 2;
      const sb = b.effort && b.effort !== 'good' ? 0 : b.notes ? 1 : 2;
      if (sa !== sb) return sa - sb;
      return b.date.localeCompare(a.date);
    });

  const checkin =
    checkins
      .filter((c) => c.date >= since && (!options.schemaId || c.schemaId === options.schemaId))
      .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;

  const dates = [...exercises.map((e) => e.date), ...(checkin ? [checkin.date] : [])];
  const lastActivity = dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : null;
  return { exercises, checkin, lastActivity };
}
