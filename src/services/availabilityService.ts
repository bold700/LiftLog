/**
 * Trainer beschikbaarheid: per weekdag de uren waarop een trainer kan. De server bewaart en
 * controleert (api/booking.mjs, api/_lib/availability.mjs); de app biedt alleen momenten aan
 * binnen die uren.
 */
import { callBooking } from './classService';

export interface AvailabilityWindow {
  from: string;
  to: string;
}

/** Per weekdag ('0' = zondag .. '6' = zaterdag) de blokken; een lege lijst = die dag vrij. */
export type AvailabilityDays = Record<string, AvailabilityWindow[]>;

/** `days` is null als de trainer nog niets heeft ingevuld (dan geldt de standaard van de studio). */
export function getAvailability(userId: string): Promise<{ userId: string; days: AvailabilityDays | null }> {
  return callBooking({ action: 'getAvailability', userId });
}

export function saveAvailability(userId: string, days: AvailabilityDays): Promise<{ userId: string; days: AvailabilityDays }> {
  return callBooking({ action: 'saveAvailability', userId, days });
}
