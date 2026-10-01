/**
 * Moment inplannen vanuit het abonnement: waarvoor het abonnement geldt, hoe vaak per week en
 * hoeveel vaste momenten er al staan; vrije weekmomenten bij de trainer; en een vast PT-moment
 * aanvragen (sporter; de trainer keurt goed). Server: api/booking.mjs.
 */
import { callBooking } from './classService';
import type { PlanCovers } from '../utils/planCoverage';

export interface PlanStatus {
  plan: { id: string; name: string; covers: PlanCovers; perWeek: number | null } | null;
  /** Actieve vaste momenten (groepslessen en PT samen). */
  used: number;
  /** Aangevraagde vaste PT-momenten die nog op de trainer wachten. */
  pending: number;
  trainerId: string | null;
}

export interface WeeklySlot {
  weekday: number;
  startTime: string;
  endTime: string;
  adjacent: boolean;
}

export function getPlanStatus(userId?: string): Promise<PlanStatus> {
  return callBooking({ action: 'planStatus', ...(userId ? { userId } : {}) });
}

export function getWeeklyPtOptions(input: { userId?: string; trainerId?: string; duration: number; ignoreClassTypeId?: string }): Promise<{
  trainerId: string;
  duration: number;
  days: { weekday: number; times: WeeklySlot[] }[];
}> {
  return callBooking({ action: 'weeklyPtOptions', ...input });
}

export function requestStandingPt(input: { weekday: number; startTime: string; endTime: string; startDate: string }): Promise<{ requestId: string; status: 'pending' }> {
  return callBooking({ action: 'requestStandingPt', ...input });
}

export interface DayTime {
  date: string;
  startTime: string;
  endTime: string;
  adjacent: boolean;
}

/** Vrije momenten voor één losse PT-afspraak (de komende vier weken), per dag. */
export function getSinglePtOptions(input: { userId?: string; trainerId?: string; duration: number }): Promise<{
  trainerId: string;
  duration: number;
  days: { date: string; times: DayTime[] }[];
}> {
  return callBooking({ action: 'singlePtOptions', ...input });
}

/** Losse PT-afspraak: staf plant meteen in ('approved'), een sporter vraagt aan ('pending'). */
export function bookSinglePt(input: {
  userId?: string;
  trainerId?: string;
  duration: number;
  date: string;
  startTime: string;
}): Promise<{ requestId: string; status: 'pending' | 'approved'; classId?: string }> {
  return callBooking({ action: 'bookSinglePt', ...input });
}
