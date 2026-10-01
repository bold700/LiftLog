/**
 * Waar een abonnement voor geldt en hoe vaak per week. Bepaalt wat een lid vast mag inplannen:
 * met "Personal Training 3x per week" drie vaste PT-momenten, met "Small Group 2x per week" twee
 * vaste groepslessen naar keuze.
 *
 * Per abonnement in te stellen (Beheer → Abonnementen): `covers` ('pt' | 'group' | 'all') en
 * `perWeek` (aantal, of null = geen limiet). Staat het er nog niet op, dan leidt de app het af uit
 * de naam en de credits. Zelfde regels in src/utils/planCoverage.ts.
 */

export const PLAN_COVERS = ['pt', 'group', 'all'];

/** Personal training (1-op-1, duo) of groepsles (groep, concept)? */
export const isPtKind = (sessionKind) => sessionKind === '1on1' || sessionKind === 'duo';

/** Gok uit de naam: "Personal Training …" → pt, "Small Group …" → group, anders alles. */
export function guessCovers(name) {
  const n = String(name ?? '').toLowerCase();
  if (/personal|\bpt\b|duo/.test(n)) return 'pt';
  if (/group|groep|sgt/.test(n)) return 'group';
  return 'all';
}

/** Gok: "3x per week" in de naam, anders uit credits en periode (12 per 4 weken = 3). */
export function guessPerWeek(plan) {
  const m = /(\d+)\s*x\s*(per\s*)?we/i.exec(String(plan?.name ?? ''));
  if (m) return Number(m[1]) || null;
  const credits = plan?.credits;
  if (credits == null || !(Number(credits) > 0)) return null;
  switch (plan?.period) {
    case 'week':
      return Number(credits);
    case 'fourWeeks':
      return Math.max(1, Math.round(Number(credits) / 4));
    case 'month':
      return Math.max(1, Math.round((Number(credits) * 12) / 52));
    default:
      return null;
  }
}

export function coversOf(plan) {
  return PLAN_COVERS.includes(plan?.covers) ? plan.covers : guessCovers(plan?.name);
}

/** Keer per week; null = geen limiet. Expliciet null in het abonnement betekent ook geen limiet. */
export function perWeekOf(plan) {
  if (plan && Object.prototype.hasOwnProperty.call(plan, 'perWeek')) {
    const n = Number(plan.perWeek);
    return plan.perWeek == null || !(n > 0) ? null : Math.round(n);
  }
  return guessPerWeek(plan);
}

/** Valt een les van deze soort onder dit abonnement? */
export function planCoversKind(plan, sessionKind) {
  const covers = coversOf(plan);
  if (covers === 'all') return true;
  return covers === 'pt' ? isPtKind(sessionKind) : !isPtKind(sessionKind);
}
