/**
 * Berichten van de studio aan leden (Beheer → Meldingen). Alles loopt via de server
 * (api/booking.mjs): die bepaalt wie het bericht krijgt en verstuurt het, meteen of in de
 * avondronde van de gekozen dag. De collectie `broadcasts` is voor de client dicht.
 */
import { callBooking } from './classService';
import { requireOrgId } from './orgContext';
import type { Broadcast, BroadcastAudience } from '../types';

export const BROADCAST_TITLE_MAX = 60;
export const BROADCAST_BODY_MAX = 240;

export interface BroadcastInput {
  title: string;
  body: string;
  audience: BroadcastAudience;
  /** YYYY-MM-DD vanaf morgen, of null om meteen te versturen. */
  scheduledFor: string | null;
}

export async function sendBroadcast(input: BroadcastInput): Promise<Broadcast> {
  const { broadcast } = await callBooking<{ broadcast: Broadcast }>({ action: 'sendBroadcast', orgId: requireOrgId(), ...input });
  return broadcast;
}

export async function listBroadcasts(): Promise<Broadcast[]> {
  const { broadcasts } = await callBooking<{ broadcasts: Broadcast[] }>({ action: 'listBroadcasts', orgId: requireOrgId() });
  return broadcasts ?? [];
}

export async function cancelBroadcast(broadcastId: string): Promise<void> {
  await callBooking({ action: 'cancelBroadcast', broadcastId });
}
