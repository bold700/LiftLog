/**
 * Welk alternatief laat het lesscherm zien bij een beperking van een sporter?
 * 1. Wat de sporter (of trainer) zelf bij die beperking noteerde;
 * 2. wat de studio in de oefeningenbibliotheek bij die klacht vastlegde;
 * 3. de standaard van het systeem voor dit soort oefening en die klacht.
 */
import type { Limitation } from '../types';
import type { ExerciseNote } from '../services/exerciseNoteService';
import { COMPLAINT_LABELS, complaintKeyOf, complaintOfLimitationArea, standardAlternative } from '../data/exerciseProgressions';

export function alternativeForLimitation(
  exerciseName: string,
  limitation: Pick<Limitation, 'area' | 'alternative' | 'note'>,
  note: ExerciseNote | null
): string | null {
  const own = limitation.alternative?.trim();
  if (own) return own;
  const key = complaintOfLimitationArea(limitation.area) ?? complaintKeyOf(limitation.note ?? '');
  if (!key) return null;
  const fromStudio = note?.alternatives.find((a) => complaintKeyOf(a.reason) === key)?.exercise;
  if (fromStudio) return fromStudio;
  return standardAlternative(exerciseName, COMPLAINT_LABELS[key]);
}
