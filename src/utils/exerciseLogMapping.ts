/**
 * Een log uit Firestore (`logs`) omzetten naar de vorm die de schermen gebruiken.
 *
 * Staat apart omdat er twee wegen naar hetzelfde scherm lopen: je eigen oefeningen komen uit de
 * lokale opslag (die op de achtergrond met de cloud wordt gelijkgehouden), en die van een
 * sporter bij wie je meekijkt komen rechtstreeks uit Firestore. Twee kopieën van deze omzetting
 * zouden vroeg of laat uit elkaar lopen en dan zie je per weg net iets anders.
 */
import type { Exercise, ExerciseEffort } from '../types';

export interface LoggedExerciseSource {
  id: string;
  exerciseName: string;
  weight: number | null;
  sets: number | null;
  reps: number | null;
  notes?: string | null;
  effort?: ExerciseEffort | null;
  date: string;
  schemaId?: string | null;
  schemaDayIndex?: number | null;
}

export function logToExercise(log: LoggedExerciseSource): Exercise {
  return {
    id: log.id,
    name: log.exerciseName || undefined,
    weight: log.weight ?? undefined,
    date: log.date,
    sets: log.sets ?? undefined,
    reps: log.reps ?? undefined,
    notes: log.notes ?? undefined,
    effort: log.effort ?? undefined,
    schemaId: log.schemaId ?? null,
    schemaDayIndex: log.schemaDayIndex ?? null,
  };
}
