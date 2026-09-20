/**
 * Abonnement op Profiel, naar het ontwerp: naam, hoeveel credits er nog over zijn als balk, en
 * wanneer het verlengt of tot wanneer de kaart geldig is. Alleen als er een lidmaatschap is.
 * Daaronder de eigen facturen, elk als PDF te downloaden.
 */
import { useEffect, useState } from 'react';
import { Box, IconButton, Typography } from '@mui/material';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import IosShareRoundedIcon from '@mui/icons-material/IosShareRounded';
import { useI18n } from '../context/I18nContext';
import { useNotify } from '../context/NotifyContext';
import { getMyMembership, getPlans } from '../services/planService';
import { getCreditBalance } from '../services/classService';
import { canShareFiles, downloadInvoicePdf, getMyCharges, shareInvoicePdf } from '../services/chargeService';
import { useBranding } from '../context/BrandingContext';
import { designTokens } from '../theme/designTokens';
import type { Charge, Membership, Plan } from '../types';

const euro = (n: number) => `€ ${new Intl.NumberFormat('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n)}`;

export function SubscriptionCard({ userId }: { userId: string }) {
  const { t, lang } = useI18n();
  const notify = useNotify();
  const branding = useBranding();
  const shareable = canShareFiles();
  const [data, setData] = useState<{
    membership: Membership;
    plan: Plan | null;
    balance: number;
  } | null>(null);
  const [charges, setCharges] = useState<Charge[]>([]);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const membership = await getMyMembership(userId);
        if (!membership) return;
        const [plans, balance] = await Promise.all([getPlans().catch(() => []), getCreditBalance(userId).catch(() => 0)]);
        if (alive)
          setData({
            membership,
            plan: plans.find((p) => p.id === membership.planId) ?? null,
            balance,
          });
      } catch {
        /* geen abonnement of geen rechten: kaart blijft weg */
      }
    })();
    void getMyCharges(userId)
      .then((list) => {
        if (alive) setCharges(list.filter((c) => c.status !== 'void'));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [userId]);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(lang === 'en' ? 'en-GB' : 'nl-NL', {
      day: 'numeric',
      month: 'long',
    });

  const download = async (c: Charge, viaShare = false) => {
    setDownloading(c.id);
    try {
      const text = t('billing.shareText', { number: c.invoiceNumber ?? '', studio: branding?.name ?? 'VORM', amount: euro(c.amount) });
      const r = viaShare ? await shareInvoicePdf(c.id, text) : await downloadInvoicePdf(c.id);
      if (!c.invoiceNumber) setCharges((prev) => prev.map((x) => (x.id === c.id ? { ...x, invoiceNumber: r.invoiceNumber } : x)));
    } catch (e) {
      notify.error(t('billing.failed'), e);
    } finally {
      setDownloading(null);
    }
  };

  const subscription =
    data &&
    (() => {
      const { membership, plan, balance } = data;
      const total = plan?.credits ?? null;
      const fraction = total ? Math.max(0, Math.min(1, balance / total)) : 1;
      const footer = membership.nextRenewalAt ? t('plans.renews', { date: fmt(membership.nextRenewalAt) }) : membership.expiresAt ? t('plans.validUntil', { date: fmt(membership.expiresAt) }) : '';
      return (
        <Box
          sx={{
            p: 2,
            mb: 3,
            borderRadius: `${designTokens.cardRadius}px`,
            bgcolor: designTokens.cardBackground,
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: 2,
            }}
          >
            <Typography variant="subtitle2" fontWeight={600}>
              {membership.planName}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {total == null ? t('plans.unlimitedLeft') : t('plans.leftOf', { left: balance, total })}
            </Typography>
          </Box>
          <Box
            sx={{
              mt: 1.25,
              height: 7,
              borderRadius: 4,
              bgcolor: designTokens.cardBackgroundHigh,
              overflow: 'hidden',
            }}
          >
            <Box
              sx={{
                width: `${fraction * 100}%`,
                height: '100%',
                bgcolor: designTokens.primary,
              }}
            />
          </Box>
          {footer && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              {footer}
            </Typography>
          )}
        </Box>
      );
    })();

  const invoices = charges.length > 0 && (
    <Box
      sx={{
        p: 2,
        mb: 3,
        borderRadius: `${designTokens.cardRadius}px`,
        bgcolor: designTokens.cardBackground,
      }}
    >
      <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
        {t('billing.myInvoices')}
      </Typography>
      {charges.map((c) => (
        <Box
          key={c.id}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            py: 0.75,
            borderTop: `1px solid ${designTokens.cardBackgroundHigh}`,
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" noWrap>
              {c.description}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
              {c.invoiceNumber ? `${c.invoiceNumber} · ` : ''}
              {c.status === 'paid' && c.paidAt ? t('billing.paidOn', { date: fmt(c.paidAt) }) : t('billing.dueOn', { date: fmt(c.dueAt) })}
            </Typography>
          </Box>
          <Typography variant="body2" fontWeight={600} sx={{ flexShrink: 0 }}>
            {euro(c.amount)}
          </Typography>
          {shareable && (
            <IconButton size="small" aria-label={t('billing.share')} disabled={downloading === c.id} onClick={() => void download(c, true)}>
              <IosShareRoundedIcon fontSize="small" />
            </IconButton>
          )}
          <IconButton size="small" aria-label={t('billing.downloadPdf')} disabled={downloading === c.id} onClick={() => void download(c)}>
            <DownloadRoundedIcon fontSize="small" />
          </IconButton>
        </Box>
      ))}
    </Box>
  );

  if (!subscription && !invoices) return null;
  return (
    <>
      {subscription}
      {invoices}
    </>
  );
}
