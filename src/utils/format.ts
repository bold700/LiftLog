/**
 * Gedeelde datum- en oefening-formattering voor consistente weergave.
 */
import type {
  Exercise,
  Formule7Warmup,
  Formule7Cardio,
  Formule7Cooldown,
  Formule7Stretch,
} from '../types';

const LOCALE = 'nl-NL';

/** Lange datum: "ma 7 mrt 2026" */
export function formatExerciseDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(LOCALE, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Korte datum voor vandaag: "Vandaag, 7 mrt" of lange datum */
export function formatExerciseDateShort(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const today = new Date();
  const isToday =
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear();
  if (isToday) {
    return `Vandaag, ${d.toLocaleDateString(LOCALE, { month: 'short', day: 'numeric' })}`;
  }
  return formatExerciseDate(date);
}

/** Voeg weken toe aan een datum (YYYY-MM-DD). Retourneert YYYY-MM-DD. */
export function addWeeks(dateStr: string, weeks: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

/** Aantal weken tussen twee datums (YYYY-MM-DD), afgerond. Voor init uit bestaand schema. */
export function getWeeksBetween(startStr: string, endStr: string): number {
  const start = new Date(startStr + 'T12:00:00');
  const end = new Date(endStr + 'T12:00:00');
  const days = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return Math.round(days / 7);
}

/** Gewicht, sets en reps als één regel tekst (bijv. "80 kg · 3 sets · 10 reps") */
export function formatExerciseDetails(exercise: Pick<Exercise, 'weight' | 'sets' | 'reps'>): string {
  const parts: string[] = [];
  if (exercise.weight != null && exercise.weight > 0) {
    parts.push(`${exercise.weight} kg`);
  }
  if (exercise.sets != null && exercise.sets > 0) {
    parts.push(`${exercise.sets} ${exercise.sets === 1 ? 'set' : 'sets'}`);
  }
  if (exercise.reps != null && exercise.reps > 0) {
    parts.push(`${exercise.reps} ${exercise.reps === 1 ? 'rep' : 'reps'}`);
  }
  return parts.join(' · ');
}

/** Korte samenvatting warming-up voor weergave in dag/sessie (of null als leeg). */
export function formatWarmupSummary(warmup: Formule7Warmup | null | undefined): string | null {
  if (!warmup?.organisation) return null;
  const parts: string[] = [warmup.organisation];
  if (warmup.durationMinutes != null && warmup.durationMinutes > 0) {
    parts.push(`${warmup.durationMinutes} min`);
  }
  return parts.join(', ');
}

/** Korte samenvatting cardio (zones) voor weergave. */
export function formatCardioSummary(cardio: Formule7Cardio | null | undefined): string | null {
  if (!cardio?.zones?.length) return null;
  const filled = cardio.zones.filter(
    (z) => z.organisation || (z.durationMinutes != null && z.durationMinutes > 0)
  );
  if (filled.length === 0) return null;
  const parts = filled.map((z) => {
    const p = [`Zone ${z.zone}`];
    if (z.organisation) p.push(z.organisation);
    if (z.durationMinutes != null && z.durationMinutes > 0) p.push(`${z.durationMinutes} min`);
    return p.join(' ');
  });
  return parts.join(' · ');
}

/** Korte samenvatting cooling-down. */
export function formatCooldownSummary(cooldown: Formule7Cooldown | null | undefined): string | null {
  if (!cooldown?.organisation) return null;
  const parts: string[] = [cooldown.organisation];
  if (cooldown.durationMinutes != null && cooldown.durationMinutes > 0) {
    parts.push(`${cooldown.durationMinutes} min`);
  }
  return parts.join(', ');
}

/** Korte samenvatting stretching (spiergroepen). */
export function formatStretchingSummary(stretching: Formule7Stretch[] | null | undefined): string | null {
  if (!stretching?.length) return null;
  const filled = stretching.filter((s) => s.muscleGroup?.trim());
  if (filled.length === 0) return null;
  return filled
    .map((s) => {
      const p = [s.muscleGroup];
      if (s.stretchDurationSeconds != null && s.stretchDurationSeconds > 0) p.push(`${s.stretchDurationSeconds}s`);
      if (s.repetitions != null && s.repetitions > 0) p.push(`${s.repetitions}×`);
      return p.join(' ');
    })
    .join(', ');
}
