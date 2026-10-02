/**
 * Aanwezigheid en gegeven lessen. De trainer meldt na de les wie er was (en dat de les is gegeven);
 * de eigenaar ziet het terug in Beheer → Gegeven lessen. Server: api/booking.mjs.
 */
import { callBooking } from './classService';

export type Attendance = 'present' | 'absent';

/** Aanwezigheid opslaan (per boeking) en de les als gegeven melden. */
export function setAttendance(classId: string, marks: Record<string, Attendance | null>): Promise<{ given: boolean; present: number; absent: number }> {
  return callBooking({ action: 'setAttendance', classId, marks });
}

export interface LessonReportRow {
  classId: string;
  date: string;
  startTime: string;
  endTime: string | null;
  title: string;
  trainerId: string | null;
  trainerName: string | null;
  given: boolean;
  givenByName: string | null;
  people: { bookingId: string; userId: string; name: string; attendance: Attendance | null }[];
}

/** Lessen in een periode (t/m vandaag): wie gaf ze, gegeven gemeld, wie was er. Trainer: alleen eigen lessen. */
export function getLessonReport(input: { from: string; until: string; trainerId?: string }): Promise<{ from: string; until: string; rows: LessonReportRow[] }> {
  return callBooking({ action: 'lessonReport', ...input });
}
