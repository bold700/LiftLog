/**
 * Voorstellen voor één oefening, samengevoegd uit wat de studio vastlegde en de standaard van het
 * systeem, plus het alternatief bij een beperking van een sporter. Gebruikt door het ⇅-venster en
 * het lesscherm.
 */
import type { Limitation } from '../types';
import type { ExerciseNote } from '../services/exerciseNoteService';
import {
  COMPLAINT_LABELS,
  complaintKeyOf,
  complaintOfLimitationArea,
  standardAdvice,
  standardAlternative,
  type ExerciseRef,
} from '../data/exerciseProgressions';
import { exerciseKey } from './exerciseKey';

/**
 * Welk alternatief bij een beperking van een sporter?
 * 1. Wat de sporter (of trainer) zelf bij die beperking noteerde;
 * 2. wat de studio in de oefeningenbibliotheek bij die klacht vastlegde;
 * 3. de standaard van het systeem voor dit soort oefening en die klacht.
 */
export function alternativeForLimitation(
  exerciseName: string,
  limitation: Pick<Limitation, 'area' | 'alternative' | 'note'>,
  note: ExerciseNote | null
): ExerciseRef | null {
  const own = limitation.alternative?.trim();
  if (own) return { exercise: '', note: own };
  const key = complaintOfLimitationArea(limitation.area) ?? complaintKeyOf(limitation.note ?? '');
  if (!key) return null;
  const fromStudio = note?.alternatives.find((a) => complaintKeyOf(a.reason) === key);
  if (fromStudio) return { exercise: fromStudio.exercise, note: fromStudio.note };
  return standardAlternative(exerciseName, COMPLAINT_LABELS[key]);
}

/** Makkelijker/zwaarder voor deze oefening: van de studio als die iets vastlegde, anders de standaard. */
export function adviceFor(exerciseName: string, note: ExerciseNote | null) {
  if (note && (note.regressions.length || note.progressions.length)) {
    return { regressions: note.regressions, progressions: note.progressions };
  }
  const std = standardAdvice(exerciseName);
  return { regressions: std?.regressions ?? [], progressions: std?.progressions ?? [] };
}

export interface SubstituteOptions {
  /** Alternatief bij een klacht van deze sporter, met de klacht erbij. */
  complaint: (ExerciseRef & { reason: string })[];
  easier: ExerciseRef[];
  harder: ExerciseRef[];
}

/**
 * Welke oefeningen kan een sporter in de les in plaats van de geplande doen? Alleen voorstellen
 * met een echte oefening (een losse aanwijzing kun je niet loggen), zonder de oefening zelf en
 * zonder dubbelingen. Klachten gaan voor, daarna makkelijker en zwaarder.
 */
export function substituteOptions(
  exerciseName: string,
  hits: Pick<Limitation, 'area' | 'alternative' | 'note'>[],
  note: ExerciseNote | null
): SubstituteOptions {
  const seen = new Set([exerciseKey(exerciseName)]);
  const take = <T extends ExerciseRef>(r: T | null): r is T => {
    if (!r || !r.exercise.trim()) return false;
    const k = exerciseKey(r.exercise);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  };
  const complaint = hits
    .map((h) => {
      const alt = alternativeForLimitation(exerciseName, h, note);
      const key = complaintOfLimitationArea(h.area) ?? complaintKeyOf(h.note ?? '');
      return alt ? { ...alt, reason: key ? COMPLAINT_LABELS[key] : h.area } : null;
    })
    .filter(take);
  const { regressions, progressions } = adviceFor(exerciseName, note);
  return { complaint, easier: regressions.filter(take), harder: progressions.filter(take) };
}

/** Onder welke geplande oefening hoort een log uit de les? Bij een alternatief is dat de oorspronkelijke. */
export const plannedNameOfLog = (log: { exerciseName: string; substituteFor?: string | null }) =>
  log.substituteFor?.trim() || log.exerciseName;
