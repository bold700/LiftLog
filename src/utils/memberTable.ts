/**
 * Beheer → Leden: zoeken, filteren en sorteren, zodat de lijst ook met honderden leden werkbaar
 * blijft. Puur, zodat het testbaar is zonder opslag.
 */
import type { Membership, Profile } from '../types';

/** Rolfilter: iedereen, alleen sporters, of staf (trainers en beheerders). */
export type RoleFilter = 'all' | 'sporter' | 'staff';
/** Abonnementfilter: iedereen, zonder abonnement, of een plan-id. */
export const NO_PLAN = '__geen__';

export interface MemberFilter {
  query: string;
  role: RoleFilter;
  /** '' = alle; `NO_PLAN` = sporters zonder abonnement; anders een plan-id. */
  plan: string;
}

export const DEFAULT_MEMBER_FILTER: MemberFilter = { query: '', role: 'all', plan: '' };

export type MemberSortKey = 'name' | 'email' | 'role' | 'subscription' | 'credits';
export interface MemberSort {
  key: MemberSortKey;
  dir: 'asc' | 'desc';
}
export const DEFAULT_MEMBER_SORT: MemberSort = { key: 'name', dir: 'asc' };

export interface MemberContext {
  credits: Record<string, number>;
  memberships: Record<string, Membership>;
  /** Naam van de trainer bij een userId, zodat je ook op trainer kunt zoeken. */
  nameOf?: (userId: string | null | undefined) => string | null;
}

export const displayNameOf = (p: Profile) => p.displayName?.trim() || p.email || p.userId;

const ROLE_ORDER: Record<string, number> = { admin: 0, trainer: 1, sporter: 2 };

export function filterMembers(profiles: Profile[], filter: MemberFilter, ctx: MemberContext): Profile[] {
  const q = filter.query.trim().toLowerCase();
  return profiles.filter((p) => {
    if (filter.role === 'sporter' && p.role !== 'sporter') return false;
    if (filter.role === 'staff' && p.role === 'sporter') return false;
    if (filter.plan) {
      const planId = ctx.memberships[p.userId]?.planId ?? null;
      if (filter.plan === NO_PLAN ? p.role !== 'sporter' || !!planId : planId !== filter.plan) return false;
    }
    if (q) {
      const hay = [p.displayName, p.email, ctx.nameOf?.(p.trainerId), ctx.memberships[p.userId]?.planName];
      if (!hay.some((s) => s?.toLowerCase().includes(q))) return false;
    }
    return true;
  });
}

/**
 * Sorteren op een kolom. Lege waarden (geen abonnement, geen credits) staan altijd onderaan,
 * ook bij aflopend sorteren; gelijke waarden vallen terug op naam.
 */
export function sortMembers(profiles: Profile[], sort: MemberSort, ctx: MemberContext): Profile[] {
  const sign = sort.dir === 'asc' ? 1 : -1;
  const byName = (a: Profile, b: Profile) => displayNameOf(a).localeCompare(displayNameOf(b), 'nl', { sensitivity: 'base' });
  const valueOf = (p: Profile): string | number | null => {
    switch (sort.key) {
      case 'name':
        return displayNameOf(p);
      case 'email':
        return p.email || null;
      case 'role':
        return ROLE_ORDER[p.role] ?? 3;
      case 'subscription':
        return ctx.memberships[p.userId]?.planName || null;
      case 'credits':
        return p.role === 'sporter' ? (ctx.credits[p.userId] ?? null) : null;
    }
  };
  return [...profiles].sort((a, b) => {
    const va = valueOf(a);
    const vb = valueOf(b);
    if (va == null && vb == null) return byName(a, b);
    if (va == null) return 1;
    if (vb == null) return -1;
    const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'nl', { sensitivity: 'base' });
    return cmp !== 0 ? cmp * sign : byName(a, b);
  });
}

/** Unieke abonnementen die leden nu hebben, alfabetisch, voor het filter. */
export function planOptions(memberships: Record<string, Membership>): { id: string; name: string }[] {
  const byId = new Map<string, string>();
  for (const m of Object.values(memberships)) if (m?.planId) byId.set(m.planId, m.planName || m.planId);
  return [...byId.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'nl'));
}
