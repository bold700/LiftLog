/**
 * Rol per studio (zie api/_lib/orgRoles.mjs voor het hoe en waarom; dezelfde regel staat als
 * roleIn() in firestore.rules). `orgRoles[studio]` gaat voor; profielen van vóór de rol per studio
 * hebben alleen `role`, en die geldt dan voor elke studio zonder eigen regel.
 */
import type { ProfileRole } from '../types';

const ROLES: ProfileRole[] = ['sporter', 'trainer', 'admin'];

export function cleanRole(raw: unknown): ProfileRole | null {
  const v = String(raw ?? '').toLowerCase().trim();
  return (ROLES as string[]).includes(v) ? (v as ProfileRole) : null;
}

/** `orgRoles` uit een Firestore-document: alleen geldige rollen. */
export function parseOrgRoles(raw: unknown): Record<string, ProfileRole> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, ProfileRole> = {};
  for (const [org, r] of Object.entries(raw as Record<string, unknown>)) {
    const role = cleanRole(r);
    if (org && role) out[org] = role;
  }
  return out;
}

/** De rol in deze studio: eigen regel in `orgRoles`, anders de rol van het account. */
export function roleInOrg(
  p: { accountRole?: ProfileRole | null; role?: ProfileRole | null; orgRoles?: Record<string, ProfileRole> | null },
  orgId: string | null | undefined
): ProfileRole {
  const own = orgId ? p.orgRoles?.[orgId] : undefined;
  return own ?? p.accountRole ?? p.role ?? 'sporter';
}

/** Staat dit lid op inactief bij deze studio? Zie `isInactiveIn` in api/_lib/orgRoles.mjs. */
export function isInactiveInOrg(p: { inactiveOrgs?: string[] | null }, orgId: string | null | undefined): boolean {
  return !!orgId && Array.isArray(p.inactiveOrgs) && p.inactiveOrgs.includes(orgId);
}
