/**
 * Groepen (Beheer → Groepen). Lezen gaat rechtstreeks uit Firestore (staf van de studio, of een lid
 * van de groep); aanmaken, wijzigen, abonnement en tegoed lopen via de server (api/booking.mjs).
 */
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../firebase/config';
import { requireOrgId } from './orgContext';
import { callBooking } from './classService';
import type { Group, GroupKind } from '../types';

const GROUPS = 'groups';
const KINDS: GroupKind[] = ['bedrijf', 'gezin', 'vrienden'];

function toGroup(data: Record<string, unknown>, id: string): Group {
  const memberIds = Array.isArray(data.memberIds) ? data.memberIds.map(String) : [];
  return {
    id,
    orgId: String(data.orgId ?? ''),
    name: String(data.name ?? ''),
    kind: KINDS.includes(data.kind as GroupKind) ? (data.kind as GroupKind) : 'vrienden',
    memberIds,
    payerId: typeof data.payerId === 'string' ? data.payerId : memberIds[0] ?? '',
    createdAt: String(data.createdAt ?? ''),
    updatedAt: String(data.updatedAt ?? ''),
  };
}

/** Alle groepen van de actieve studio, op naam. */
export async function getGroupsForOrg(): Promise<Group[]> {
  if (!isFirebaseConfigured() || !db) return [];
  const snap = await getDocs(query(collection(db, GROUPS), where('orgId', '==', requireOrgId())));
  return snap.docs.map((d) => toGroup(d.data(), d.id)).sort((a, b) => a.name.localeCompare(b.name, 'nl', { sensitivity: 'base' }));
}

export interface GroupInput {
  groupId?: string;
  name: string;
  kind: GroupKind;
  memberIds: string[];
  payerId: string;
}

export async function saveGroup(input: GroupInput): Promise<Group> {
  const r = await callBooking<{ group: Record<string, unknown> }>({ action: 'saveGroup', ...input });
  return toGroup(r.group, String(r.group.id));
}

export function deleteGroup(groupId: string): Promise<{ deleted: boolean }> {
  return callBooking({ action: 'deleteGroup', groupId });
}

/** Groepsabonnement starten; de prijs komt als tegoed op de groep, de post naar het hoofdprofiel. */
export function assignGroupPlan(groupId: string, planId: string): Promise<{ membershipId: string; balance: number }> {
  return callBooking({ action: 'assign', groupId, planId });
}

export function unassignGroupPlan(groupId: string): Promise<{ stopped: boolean }> {
  return callBooking({ action: 'unassign', groupId });
}

/** Groepstegoed bijstellen, in euro's (positief of negatief). */
export function adjustGroupBalance(groupId: string, amount: number, note = ''): Promise<{ balance: number }> {
  return callBooking({ action: 'grant', groupId, amount, note });
}
