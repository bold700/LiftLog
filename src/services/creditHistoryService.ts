/**
 * Creditgeschiedenis: waar is elke credit gebleven (api/booking.mjs → creditHistory, uitleg in
 * api/_lib/creditHistory.mjs). Een lid ziet zijn eigen geschiedenis; staf die van een lid; de
 * beheerder die van de hele studio over een periode.
 */
import { callBooking } from './classService';

export type CreditKind = 'booking' | 'refund' | 'manual' | 'plan' | 'expiry' | 'merge' | 'other';
/** Hoe liep een geboekte les af. */
export type CreditOutcome = 'present' | 'absent' | 'late_cancel' | 'refunded' | 'upcoming' | 'unmarked' | 'unknown';

export interface CreditHistoryRow {
  id: string;
  userId: string;
  userName: string;
  /** Moment van de wijziging (ISO). */
  at: string;
  delta: number;
  balanceAfter: number;
  kind: CreditKind;
  note: string | null;
  by: 'self' | 'staff' | 'system';
  byName: string | null;
  class: { id: string; title: string; date: string | null; startTime: string | null; cancelled: boolean } | null;
  outcome: CreditOutcome | null;
}

export interface CreditTotals {
  granted: number;
  used: number;
  refunded: number;
  expired: number;
  deducted: number;
  noShows: number;
}

export interface CreditHistory {
  from: string | null;
  until: string;
  /** Huidig saldo (alleen bij één lid). */
  balance: number | null;
  /** Saldo van vóór de eerste regel, bijv. overgenomen uit een vorig systeem (alleen bij één lid). */
  opening: number | null;
  rows: CreditHistoryRow[];
  totals: CreditTotals;
}

/** Geschiedenis van één lid; zonder userId die van jezelf. */
export function getCreditHistory(userId?: string): Promise<CreditHistory> {
  return callBooking({ action: 'creditHistory', ...(userId ? { userId } : {}) });
}

/** Alle creditmutaties van de studio in een periode (beheerder). */
export function getStudioCreditHistory(range: { from: string; until: string }): Promise<CreditHistory> {
  return callBooking({ action: 'creditHistory', scope: 'studio', ...range });
}
