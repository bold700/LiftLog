/**
 * Abonnement op Profiel, naar het ontwerp: naam, hoeveel credits er nog over zijn als balk, en
 * wanneer het verlengt of tot wanneer de kaart geldig is. Alleen als er een lidmaatschap is.
 */
import { useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { useI18n } from '../context/I18nContext';
import { getMyMembership, getPlans } from '../services/planService';
import { getCreditBalance } from '../services/classService';
import { designTokens } from '../theme/designTokens';
import type { Membership, Plan } from '../types';

export function SubscriptionCard({ userId }: { userId: string }) {
  const { t, lang } = useI18n();
  const [data, setData] = useState<{ membership: Membership; plan: Plan | null; balance: number } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const membership = await getMyMembership(userId);
        if (!membership) return;
        const [plans, balance] = await Promise.all([getPlans().catch(() => []), getCreditBalance(userId).catch(() => 0)]);
        if (alive) setData({ membership, plan: plans.find((p) => p.id === membership.planId) ?? null, balance });
      } catch {
        /* geen abonnement of geen rechten: kaart blijft weg */
      }
    })();
    return () => {
      alive = false;
    };
  }, [userId]);

  if (!data) return null;
  const { membership, plan, balance } = data;
  const total = plan?.credits ?? null;
  const fraction = total ? Math.max(0, Math.min(1, balance / total)) : 1;
  const fmt = (iso: string) => new Date(iso).toLocaleDateString(lang === 'en' ? 'en-GB' : 'nl-NL', { day: 'numeric', month: 'long' });
  const footer = membership.nextRenewalAt
    ? t('plans.renews', { date: fmt(membership.nextRenewalAt) })
    : membership.expiresAt
      ? t('plans.validUntil', { date: fmt(membership.expiresAt) })
      : '';

  return (
    <Box sx={{ p: 2, mb: 3, borderRadius: `${designTokens.cardRadius}px`, bgcolor: designTokens.cardBackground }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 2 }}>
        <Typography variant="subtitle2" fontWeight={600}>
          {membership.planName}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {total == null ? t('plans.unlimitedLeft') : t('plans.leftOf', { left: balance, total })}
        </Typography>
      </Box>
      <Box sx={{ mt: 1.25, height: 7, borderRadius: 4, bgcolor: designTokens.cardBackgroundHigh, overflow: 'hidden' }}>
        <Box sx={{ width: `${fraction * 100}%`, height: '100%', bgcolor: designTokens.primary }} />
      </Box>
      {footer && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          {footer}
        </Typography>
      )}
    </Box>
  );
}
