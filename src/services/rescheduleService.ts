/**
 * Verzetten na afmelden: een PT-moment op tijd afgemeld (credit terug), dan kies je meteen een
 * ander moment bij dezelfde trainer. De server rekent de vrije momenten uit (api/_lib/reschedule.mjs)
 * en bewaart de verzoeken; een sporter vraagt aan en de trainer keurt goed, staf plant meteen in.
 */
import { callBooking } from './classService';

export interface RescheduleTime {
  date: string;
  startTime: string;
  endTime: string;
  /** Sluit direct aan op een andere les van de trainer die dag. */
  adjacent: boolean;
}

export interface RescheduleOptions {
  classId: string;
  title: string;
  trainerId: string;
  /** Aansluitende momenten, vroegste eerst (hooguit 6). */
  adjacent: RescheduleTime[];
  /** Per dag alle vrije tijden (alleen dagen met minstens één moment). */
  days: { date: string; times: RescheduleTime[] }[];
}

export type RescheduleStatus = 'pending' | 'approved' | 'declined';

export interface RescheduleRequest {
  id: string;
  userId: string;
  userName: string | null;
  trainerId: string;
  trainerName: string | null;
  title: string;
  fromClassId: string;
  fromDate: string;
  fromStartTime: string;
  date: string;
  startTime: string;
  endTime: string;
  status: RescheduleStatus;
  classId: string | null;
}

export function getRescheduleOptions(classId: string): Promise<RescheduleOptions> {
  return callBooking({ action: 'rescheduleOptions', classId });
}

/** Sporter: status 'pending' (de trainer keurt goed). Staf: meteen 'approved'. */
export function requestReschedule(
  classId: string,
  date: string,
  startTime: string
): Promise<{ requestId: string; status: RescheduleStatus; classId?: string }> {
  return callBooking({ action: 'requestReschedule', classId, date, startTime });
}

/** Staf: openstaande verzoeken van de studio. Sporter: je eigen verzoeken voor komende momenten. */
export async function getRescheduleRequests(): Promise<RescheduleRequest[]> {
  const r = await callBooking<{ requests: RescheduleRequest[] }>({ action: 'rescheduleRequests' });
  return r.requests ?? [];
}

export function answerReschedule(requestId: string, approve: boolean): Promise<{ status: RescheduleStatus; classId?: string }> {
  return callBooking({ action: 'answerReschedule', requestId, approve });
}

/** "2026-10-08" → "do 8 okt". */
export function rescheduleDayLabel(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
}
