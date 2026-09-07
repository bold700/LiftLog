/**
 * Pure helpers voor het schema-bewerkscherm (SchemaEditView): standaardoefening,
 * NMT-voorschrift presets per dag, dagen afleiden uit trainingsfrequentie, periode-duur
 * uit een bestaand schema en nabewerking van AI-output voor Formule 7.
 */
import type {
  Schema,
  SchemaDay,
  SchemaExercise,
  Formule7Routekaart,
  Formule7StrengthGoal,
} from '../types';
import { NMT_PRESETS_BY_GOAL } from './formule7Defaults';
import { getWeeksBetween } from './format';

export const defaultSchemaExercise = (exerciseName: string): SchemaExercise => ({
  exerciseId: exerciseName,
  exerciseName,
  setsTarget: 3,
  repsTarget: 10,
  restSeconds: 60,
  notes: '',
});

/** Aantal schemadagen op basis van trainingsfrequentie per week (Formule 7). */
export function getDayCountFromSessions(
  sessionsPerWeek: Formule7Routekaart['sessionsPerWeek']
): number | null {
  if (sessionsPerWeek == null) return null;
  return sessionsPerWeek;
}

/** Maakt lege oefeningen met standaard waarden uit het NMT-voorschrift (Tabel 4). */
export function createExercisesFromPreset(
  goal: Formule7StrengthGoal,
  count: number
): SchemaExercise[] {
  const preset = NMT_PRESETS_BY_GOAL[goal];
  return Array.from({ length: count }, () => ({
    exerciseId: '',
    exerciseName: '',
    setsTarget: preset.sets,
    repsTarget: preset.reps,
    restSeconds: preset.restSeconds,
    intensityPercent1RM: preset.percent1RM,
    notes: '',
  }));
}

const F7_EXERCISE_COUNT_ORDER = [4, 6, 7, 8, 9] as const;

/** Na AI: dagen inkorten tot sessionsPerWeek en desiredExerciseCount laten aansluiten op de langste dag (anders snijdt de F7-sync oefeningen weg). */
export function postProcessFormule7Ai(
  formule7: Formule7Routekaart,
  days: SchemaDay[]
): { formule7: Formule7Routekaart; days: SchemaDay[] } {
  const n = formule7.sessionsPerWeek;
  let nextDays = days;
  if (n != null && n > 0 && days.length > n) {
    nextDays = days.slice(0, n);
  }
  const maxEx = Math.max(0, ...nextDays.map((d) => d.exercises.length));
  const desired =
    maxEx > 0
      ? F7_EXERCISE_COUNT_ORDER.find((x) => x >= maxEx) ?? 9
      : formule7.neuromuscular.desiredExerciseCount;
  return {
    formule7: {
      ...formule7,
      neuromuscular: {
        ...formule7.neuromuscular,
        desiredExerciseCount: desired ?? formule7.neuromuscular.desiredExerciseCount,
      },
    },
    days: nextDays,
  };
}

export type DurationWeeks = number;

/** Bestaande periode behouden (bijv. 26 weken groepsles), anders standaard 6 weken. */
export function getDurationWeeksFromSchema(schema: Schema): DurationWeeks {
  if (schema.startDate && schema.endDate) {
    const w = getWeeksBetween(schema.startDate, schema.endDate);
    return Math.max(1, w);
  }
  return 6;
}

/** Genoeg ingevuld om de volledige editor te tonen i.p.v. alleen de AI-wizard. */
export function schemaHasMeaningfulF7Content(s: Schema): boolean {
  const f7 = s.formule7;
  if (s.days.some((d) => d.exercises.some((e) => e.exerciseName.trim().length > 0))) return true;
  if (f7?.moverType != null || f7?.goal != null) return true;
  if ((f7?.clientName?.trim().length ?? 0) > 0) return true;
  return false;
}
