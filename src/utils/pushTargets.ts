/**
 * Wie krijgt er een melding? Losgetrokken van de schermen, zodat de regels op één plek staan en
 * getest kunnen worden.
 */
import type { Schema } from '../types';

/** Iedereen die expliciet aan een schema hangt: de vaste klant en de deelnemers. */
function assignees(schema: Pick<Schema, 'clientId' | 'participantIds'> | null | undefined): Set<string> {
  const ids = new Set<string>();
  if (!schema) return ids;
  if (schema.clientId) ids.add(schema.clientId);
  for (const id of schema.participantIds ?? []) if (id) ids.add(id);
  return ids;
}

/**
 * Sporters die met deze opslag nieuw aan het schema zijn gekoppeld. Alleen zij krijgen een
 * melding: een schema bewerken dat iemand al had, mag niet elke keer opnieuw piepen. Een "open"
 * workout voor iedereen telt niet mee, anders krijgt de hele studio een melding.
 */
export function newlyAssignedIds(
  previous: Pick<Schema, 'clientId' | 'participantIds'> | null | undefined,
  next: Pick<Schema, 'clientId' | 'participantIds'>,
  selfId: string | null | undefined
): string[] {
  const before = assignees(previous);
  return [...assignees(next)].filter((id) => !before.has(id) && id !== selfId);
}

/**
 * Naar wie moet een melding over een check-in? Naar de trainer, maar alleen als de sporter hem
 * zelf invulde: logt de trainer hem namens de sporter, dan weet de trainer het al.
 */
export function checkinRecipient(checkin: { userId: string; loggedBy: string; trainerId: string | null }): string | null {
  if (checkin.loggedBy !== checkin.userId) return null;
  if (!checkin.trainerId || checkin.trainerId === checkin.userId) return null;
  return checkin.trainerId;
}
