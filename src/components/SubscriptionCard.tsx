/**
 * Abonnement op Profiel, naar het ontwerp: naam, hoeveel credits er nog over zijn als balk, en
 * wanneer het verlengt of tot wanneer de kaart geldig is. Alleen als er een lidmaatschap is.
 * Daaronder een lijst met betaalde plannen om zelf te kopen (via Mollie), en de eigen facturen,
 * elk als PDF te downloaden.
 */
import { useEffect, useState } from 'react';
import { Box, Button, IconButton, Typography } from '@mui/material';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import IosShareRoundedIcon from '@mui/icons-material/IosShareRounded';
import { useI18n } from '../context/I18nContext';
import { useNotify } from '../context/NotifyContext';
import { getMyMembership, getPlans, purchasePlan } from '../services/planService';
import { getCreditBalance } from '../services/classService';
import { canShareFiles, downloadInvoicePdf, getMyCharges, shareInvoicePdf } from '../services/chargeService';
import { useBranding } from '../context/BrandingContext';
import { designTokens } from '../theme/designTokens';
import type { Charge, Membership, Plan } from '../types';

const euro = (n: number) => `€ ${new Intl.NumberFormat('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n)}`;

/**
 * Alleen de creditsaldo-kaart (naam, balk, verlengdatum), zonder de facturenlijst — voor gebruik
 * op Profiel én bovenaan Lessen (Figma toont 'm daar ook, boven het rooster).
 */
export function CreditBalanceCard({ userId }: { userId: string }) {
  const { t, lang } = useI18n();
  const [data, setData] = useState<{
    membership: Membership;
    plan: Plan | null;
    balance: number;
  } | null>(null);

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
    return () => {
      alive = false;
    };
  }, [userId]);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(lang === 'en' ? 'en-GB' : 'nl-NL', {
      day: 'numeric',
      month: 'long',
    });

  if (!data) return null;
  const { membership, plan, balance } = data;
  const total = plan?.credits ?? null;
  const fraction = total ? Math.max(0, Math.min(1, balance / total)) : 1;
  const periodLabel = plan?.period === 'week' ? t('plans.perWeek') : plan?.period === 'fourWeeks' ? t('plans.per4Weeks') : t('plans.perMonth');
  const footer = membership.nextRenewalAt
    ? t('plans.renews', { date: fmt(membership.nextRenewalAt), period: periodLabel })
    : membership.expiresAt
      ? t('plans.validUntil', { date: fmt(membership.expiresAt) })
      : '';
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
}

/** Plannen die een sporter zelf kan kopen: betaald, actief, en niet alleen-op-uitnodiging. */
function PurchasePlansSection({ userId }: { userId: string }) {
  const { t } = useI18n();
  const notify = useNotify();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [buying, setBuying] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void getPlans()
      .then((list) => {
        if (alive) setPlans(list.filter((p) => p.status === 'active' && p.availableTo !== 'invite' && p.price > 0));
      })
      .catch(() => {
        if (alive) setPlans([]);
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  const periodLabel = (period: Plan['period']) =>
    period === 'week' ? t('plans.perWeek') : period === 'fourWeeks' ? t('plans.per4Weeks') : period === 'month' ? t('plans.perMonth') : '';

  const buy = async (plan: Plan) => {
    if (!window.confirm(`Je koopt "${plan.name}" voor ${euro(plan.price)}. Je gaat naar Mollie om te betalen.`)) return;
    setBuying(plan.id);
    try {
      const { checkoutUrl } = await purchasePlan(plan.id);
      window.location.href = checkoutUrl;
    } catch (e) {
      notify.error('Kopen lukte niet.', e);
      setBuying(null);
    }
  };

  if (!plans || plans.length === 0) return null;

  return (
    <Box sx={{ p: 2, mb: 3, borderRadius: `${designTokens.cardRadius}px`, bgcolor: designTokens.cardBackground }}>
      <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
        Abonnement of credits kopen
      </Typography>
      {plans.map((plan) => (
        <Box
          key={plan.id}
          sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 0.75, borderTop: `1px solid ${designTokens.cardBackgroundHigh}` }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" noWrap>
              {plan.name}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
              {plan.credits == null ? 'Onbeperkt' : `${plan.credits} credits`}
              {plan.period !== 'once' ? ` · ${periodLabel(plan.period)}` : ''}
            </Typography>
          </Box>
          <Typography variant="body2" fontWeight={600} sx={{ flexShrink: 0 }}>
            {euro(plan.price)}
          </Typography>
          <Button size="small" variant="outlined" disabled={buying === plan.id} onClick={() => void buy(plan)} sx={{ flexShrink: 0 }}>
            {buying === plan.id ? 'Bezig…' : 'Kopen'}
          </Button>
        </Box>
      ))}
    </Box>
  );
}

export function SubscriptionCard({ userId }: { userId: string }) {
  const { t, lang } = useI18n();
  const notify = useNotify();
  const branding = useBranding();
  const shareable = canShareFiles();
  const [charges, setCharges] = useState<Charge[]>([]);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [refreshSignal, setRefreshSignal] = useState(0);

  // Terug van Mollie na een zelf-aankoop: de webhook verwerkt de betaling op de achtergrond, dus
  // hier alleen een geruststellende melding en na een paar seconden de kaarten verversen.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('aankoop')) return;
    notify.info('Bedankt! We verwerken je betaling — dit kan een paar seconden duren.');
    params.delete('aankoop');
    const rest = params.toString();
    window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash);
    const timer = setTimeout(() => setRefreshSignal((n) => n + 1), 3000);
    return () => clearTimeout(timer);
    // Alleen bij het eerste renderen na de redirect controleren.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let alive = true;
    void getMyCharges(userId)
      .then((list) => {
        if (alive) setCharges(list.filter((c) => c.status !== 'void'));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [userId, refreshSignal]);

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

  return (
    <>
      <CreditBalanceCard key={refreshSignal} userId={userId} />
      <PurchasePlansSection userId={userId} />
      {invoices}
    </>
  );
}
