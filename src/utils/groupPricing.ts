/**
 * Groepsprijs, gelijk aan api/_lib/groups.mjs: een groepsles kost een basisprijs voor de eerste
 * persoon plus een bedrag per extra persoon (Van As: €85 + €25), naar hoeveel er echt komen.
 * Het groepstegoed is daarom in euro's.
 */
import type { OrgGroupPricing } from '../types';

export const DEFAULT_GROUP_PRICING: OrgGroupPricing = { base: 85, perExtra: 25 };

/** Bedrag op hele centen. */
export const euros = (v: unknown): number => Math.round((Number(v) || 0) * 100) / 100;

/** Prijsinstelling uit het studiodocument, met de standaard als die ontbreekt of niet klopt. */
export function groupPricingOf(raw: unknown): OrgGroupPricing {
  const p = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const num = (v: unknown, d: number) => (v != null && Number.isFinite(Number(v)) && Number(v) >= 0 ? euros(v) : d);
  return { base: num(p.base, DEFAULT_GROUP_PRICING.base), perExtra: num(p.perExtra, DEFAULT_GROUP_PRICING.perExtra) };
}

/** Prijs van één groepsles voor `size` aanwezigen; niemand: niets. */
export function groupSessionPrice(pricing: OrgGroupPricing, size: number): number {
  const n = Math.max(0, Math.trunc(Number(size) || 0));
  return n === 0 ? 0 : euros(pricing.base + pricing.perExtra * (n - 1));
}

/** "€ 85,00" */
export function formatEuro(v: number): string {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(euros(v));
}

/** Het "lid" waar tegoed en abonnement van een groep op staan (creditAccounts, memberships). */
export const groupHolderId = (groupId: string) => `grp_${groupId}`;
export const isGroupHolder = (id: string) => id.startsWith('grp_');
