/**
 * Waar een abonnement voor geldt en hoe vaak per week (zie api/_lib/planCoverage.mjs; dezelfde
 * regels, hier voor de app).
 */
import type { Plan, SessionKind } from '../types';

export type PlanCovers = 'pt' | 'group' | 'all';
export const PLAN_COVERS: PlanCovers[] = ['pt', 'group', 'all'];

export const COVERS_LABEL: Record<PlanCovers, string> = {
  pt: 'Personal training',
  group: 'Groepslessen',
  all: 'Alle lessen',
};

export const isPtKind = (kind: SessionKind | string | null | undefined) => kind === '1on1' || kind === 'duo';

export function guessCovers(name: string | null | undefined): PlanCovers {
  const n = String(name ?? '').toLowerCase();
  if (/personal|\bpt\b|duo/.test(n)) return 'pt';
  if (/group|groep|sgt/.test(n)) return 'group';
  return 'all';
}

type PlanLike = Pick<Plan, 'name' | 'credits' | 'period'> & { covers?: PlanCovers | null; perWeek?: number | null };

export function guessPerWeek(plan: PlanLike): number | null {
  const m = /(\d+)\s*x\s*(per\s*)?we/i.exec(String(plan.name ?? ''));
  if (m) return Number(m[1]) || null;
  const credits = plan.credits;
  if (credits == null || !(credits > 0)) return null;
  if (plan.period === 'week') return credits;
  if (plan.period === 'fourWeeks') return Math.max(1, Math.round(credits / 4));
  if (plan.period === 'month') return Math.max(1, Math.round((credits * 12) / 52));
  return null;
}

export function coversOf(plan: PlanLike): PlanCovers {
  return plan.covers && PLAN_COVERS.includes(plan.covers) ? plan.covers : guessCovers(plan.name);
}

export function perWeekOf(plan: PlanLike): number | null {
  if ('perWeek' in plan && plan.perWeek !== undefined) {
    return plan.perWeek == null || !(plan.perWeek > 0) ? null : Math.round(plan.perWeek);
  }
  return guessPerWeek(plan);
}

export function planCoversKind(plan: PlanLike, kind: SessionKind | string | null | undefined): boolean {
  const covers = coversOf(plan);
  if (covers === 'all') return true;
  return covers === 'pt' ? isPtKind(kind) : !isPtKind(kind);
}

/** "Personal training · 3x per week" of "Alle lessen · geen limiet". */
export function coverageLabel(plan: PlanLike): string {
  const n = perWeekOf(plan);
  return `${COVERS_LABEL[coversOf(plan)]} · ${n == null ? 'geen limiet' : `${n}x per week`}`;
}
