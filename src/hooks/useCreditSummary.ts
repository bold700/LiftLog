/**
 * Het creditsaldo van jezelf in het kort (plan, saldo, totaal), voor de regel onder je naam in de
 * zijbalk en in het avatarmenu. Laadt opnieuw na een boeking/afmelding (CREDITS_CHANGED_EVENT) en
 * als je terugkomt in de app, zodat het getal niet achterloopt.
 */
import { useEffect, useState } from 'react';
import { CREDITS_CHANGED_EVENT, getCreditBalance } from '../services/classService';
import { getMyMembership, getPlans } from '../services/planService';

export interface CreditSummary {
  planName: string;
  balance: number;
  /** Credits per periode; null = onbeperkt. */
  total: number | null;
}

export function useCreditSummary(userId: string | null | undefined): CreditSummary | null {
  const [summary, setSummary] = useState<CreditSummary | null>(null);

  useEffect(() => {
    if (!userId) {
      setSummary(null);
      return;
    }
    let alive = true;
    const load = async () => {
      try {
        const membership = await getMyMembership(userId);
        if (!membership) {
          if (alive) setSummary(null);
          return;
        }
        const [plans, balance] = await Promise.all([getPlans().catch(() => []), getCreditBalance(userId).catch(() => 0)]);
        const plan = plans.find((p) => p.id === membership.planId) ?? null;
        if (alive) setSummary({ planName: membership.planName, balance, total: plan ? plan.credits : null });
      } catch {
        /* geen abonnement of geen rechten: geen regel */
      }
    };
    void load();
    const reload = () => void load();
    const onVisible = () => {
      if (document.visibilityState === 'visible') reload();
    };
    window.addEventListener(CREDITS_CHANGED_EVENT, reload);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      window.removeEventListener(CREDITS_CHANGED_EVENT, reload);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId]);

  return summary;
}
