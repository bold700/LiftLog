/**
 * Afwezigheid van een trainer en invallers. De server bewaart en past toe (api/booking.mjs,
 * api/_lib/absence.mjs): met een vaste invaller gaan de lessen naar die invaller als die vrij is;
 * de rest staat in Beheer bij "Lessen zonder trainer", met voorstellen wie vrij is.
 */
import { callBooking } from './classService';

export type AbsenceKind = 'dates' | 'monthly';

export interface TrainerAbsence {
  id: string;
  trainerId: string;
  kind: AbsenceKind;
  /** YYYY-MM-DD */
  from: string;
  /** YYYY-MM-DD; bij 'monthly' null = geen einddatum. */
  until: string | null;
  /** 'monthly': 1–4, of -1 = de laatste van de maand. */
  nth: number | null;
  /** 'monthly': 0 = zondag .. 6 = zaterdag. */
  weekday: number | null;
  substituteId: string | null;
  note: string | null;
  /** "elke 1e donderdag van de maand", "05-10-2026 t/m 09-10-2026" */
  label: string;
}

export interface AbsenceInput {
  id?: string;
  trainerId: string;
  kind: AbsenceKind;
  from: string;
  until?: string | null;
  nth?: number | null;
  weekday?: number | null;
  substituteId?: string | null;
  note?: string | null;
}

export interface SubstituteOption {
  userId: string;
  name: string;
  /** De vaste invaller van de afwezigheid. */
  preferred: boolean;
  /** null = vrij; anders waarom niet ("geeft dan Yoga", "afwezig", "niet beschikbaar"). */
  busy: string | null;
}

interface ClassSummary {
  classId: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string | null;
  trainerId: string | null;
  trainerName: string | null;
  bookedCount: number;
  privateFor: string | null;
}

export interface OpenClass extends ClassSummary {
  absenceLabel: string;
  options: SubstituteOption[];
}

export interface CoveredClass extends ClassSummary {
  originalTrainerId: string;
  originalTrainerName: string | null;
}

export function listAbsences(trainerId?: string): Promise<{ absences: TrainerAbsence[] }> {
  return callBooking({ action: 'listAbsences', ...(trainerId ? { trainerId } : {}) });
}

/** Opslaan; met een vaste invaller gaan de lessen meteen naar die invaller (als die vrij is). */
export function saveAbsence(input: AbsenceInput): Promise<{ absence: TrainerAbsence; assigned: number; open: number }> {
  return callBooking({ action: 'saveAbsence', ...input });
}

/** Weghalen: lessen die via deze afwezigheid naar een invaller gingen, gaan terug. */
export function deleteAbsence(id: string): Promise<{ deleted: boolean; restored: number }> {
  return callBooking({ action: 'deleteAbsence', id });
}

export function getAbsenceOverview(): Promise<{ open: OpenClass[]; covered: CoveredClass[] }> {
  return callBooking({ action: 'absenceOverview' });
}

/** Andere trainer op één les (alleen deze keer), of terug naar de eigen trainer. */
export function setClassTrainer(classId: string, trainerId: string): Promise<{ trainerId: string }> {
  return callBooking({ action: 'setClassTrainer', classId, trainerId });
}
