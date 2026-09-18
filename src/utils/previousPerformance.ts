/**
 * "Vorige keer" per oefening: wat deze persoon de laatste keer deed, zodat een trainer tijdens de
 * begeleiding niet eerst naar Inzichten hoeft om te weten of er gewicht bij kan.
 *
 * Werkt voor beide bronnen: je eigen logs staan lokaal op het toestel, die van een sporter komen
 * uit Firestore. Beide worden eerst tot dezelfde vorm teruggebracht.
 */
import type { Exercise, ExerciseLog } from '../types';

export interface PreviousPerformance {
  exerciseName: string;
  weight: number | null;
  sets: number | null;
  reps: number | null;
  date: string;
  notes: string | null;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function key(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Bouwt per oefening de meest recente prestatie. `entries` moet nieuwste eerst staan; zo leveren
 * zowel `getAllExercises` als `getLogsForUser` hun lijst al aan.
 */
export function buildPreviousPerformance(entries: PreviousPerformance[]): Map<string, PreviousPerformance> {
  const out = new Map<string, PreviousPerformance>();
  for (const entry of entries) {
    if (!entry.exerciseName?.trim()) continue;
    const k = key(entry.exerciseName);
    if (!out.has(k)) out.set(k, entry);
  }
  return out;
}

/**
 * Eigen logs (lokale opslag) naar één vorm. `excludeIds` is wat er in de lopende training al is
 * gelogd: dat is geen "vorige keer".
 */
export function fromLocalExercises(exercises: Exercise[], excludeIds: Set<string>): Map<string, PreviousPerformance> {
  const usable = exercises.filter((ex) => ex.name && !excludeIds.has(ex.id));
  return buildPreviousPerformance(
    usable.map((ex) => ({
      exerciseName: ex.name ?? '',
      weight: num(ex.weight),
      sets: num(ex.sets),
      reps: num(ex.reps),
      date: ex.date,
      notes: ex.notes ?? null,
    }))
  );
}

/** Logs van een sporter (Firestore) naar dezelfde vorm. */
export function fromSporterLogs(logs: ExerciseLog[], excludeIds: Set<string>): Map<string, PreviousPerformance> {
  const usable = logs.filter((l) => l.exerciseName && !excludeIds.has(l.id));
  return buildPreviousPerformance(
    usable.map((l) => ({
      exerciseName: l.exerciseName,
      weight: num(l.weight),
      sets: num(l.sets),
      reps: num(l.reps),
      date: l.date,
      notes: l.notes ?? null,
    }))
  );
}

/** Korte samenvatting voor in de lijst: "25 kg × 10" of "3 × 12" als er geen gewicht is. */
export function describePrevious(p: PreviousPerformance): string {
  const parts: string[] = [];
  if (p.weight != null) parts.push(`${p.weight} kg`);
  if (p.reps != null) parts.push(p.weight != null ? `× ${p.reps}` : `${p.sets ?? '?'} × ${p.reps}`);
  else if (p.sets != null) parts.push(`${p.sets} sets`);
  return parts.join(' ');
}

/** "12 sep" – kort, want het staat achter de prestatie. */
export function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}
