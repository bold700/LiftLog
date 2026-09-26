/**
 * Beheer → Abonnementen, naar het ontwerp "Subscriptions": bovenaan vier tegels (actieve leden,
 * maandelijks terugkerend, uitstaande credits, verloopt deze week), links de plannen met aantal
 * leden en prijs, rechts het bewerkpaneel. Op de telefoon drie tegels, de lijst, en een dialoog.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { useI18n } from '../../context/I18nContext';
import { FullScreenDialogTitle } from './FullScreenDialogTitle';
import { useNotify } from '../../context/NotifyContext';
import { deletePlan, getPlans, newPlanId, savePlan } from '../../services/planService';
import { NumberField } from '../NumberField';
import { designTokens } from '../../theme/designTokens';
import { DEFAULT_VAT_RATE, VAT_RATES, type Membership, type Plan, type VatRate } from '../../types';

interface SubscriptionsPanelProps {
  /** Actieve lidmaatschappen per userId (uit BeheerPage, zodat Leden en dit tabblad één bron delen). */
  memberships: Record<string, Membership>;
  /** Creditsaldo per userId. */
  credits: Record<string, number>;
  /** Telt op bij elke klik op "Nieuw abonnement" in de kop. */
  createSignal: number;
  /** Na opslaan of verwijderen: BeheerPage laadt lidmaatschappen opnieuw. */
  onChanged?: () => void | Promise<void>;
}

interface Draft {
  id: string;
  name: string;
  price: string;
  period: Plan['period'];
  unlimited: boolean;
  credits: string;
  validityMonths: string;
  rollover: Plan['rollover'];
  availableTo: Plan['availableTo'];
  status: Plan['status'];
  vatRate: VatRate;
  createdAt?: string;
}

const emptyDraft = (): Draft => ({ id: newPlanId(), name: '', price: '', period: 'month', unlimited: false, credits: '8', validityMonths: '', rollover: 'expire', availableTo: 'all', status: 'active', vatRate: DEFAULT_VAT_RATE });
const toDraft = (p: Plan): Draft => ({
  id: p.id,
  name: p.name,
  price: String(p.price),
  period: p.period,
  unlimited: p.credits == null,
  credits: p.credits == null ? '' : String(p.credits),
  validityMonths: p.validityMonths == null ? '' : String(p.validityMonths),
  rollover: p.rollover,
  availableTo: p.availableTo,
  status: p.status,
  vatRate: p.vatRate,
  createdAt: p.createdAt || undefined,
});

const euro = (n: number) => `€ ${new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 2 }).format(n)}`;

export function SubscriptionsPanel({ memberships, credits, createSignal, onChanged }: SubscriptionsPanelProps) {
  const { t } = useI18n();
  const notify = useNotify();
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up('md'));

  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  /** Ophalen mislukt: dan géén "nog geen abonnementen", want die zijn er misschien wel. */
  const [loadFailed, setLoadFailed] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPlans(await getPlans());
      setLoadFailed(false);
    } catch (e) {
      setLoadFailed(true);
      notify.error(t('plans.failed'), e);
    } finally {
      setLoading(false);
    }
  }, [notify, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (createSignal > 0) {
      setError(null);
      setDraft(emptyDraft());
    }
  }, [createSignal]);

  // Tegels: uit de lidmaatschappen en saldo's die BeheerPage al heeft.
  const stats = useMemo(() => {
    const active = Object.values(memberships);
    const byPlan = new Map<string, number>();
    for (const m of active) byPlan.set(m.planId, (byPlan.get(m.planId) ?? 0) + 1);
    const planById = new Map(plans.map((p) => [p.id, p]));
    const monthly = active.reduce((sum, m) => {
      const p = planById.get(m.planId);
      return p && p.period === 'month' ? sum + p.price : sum;
    }, 0);
    const outstanding = Object.values(credits).reduce((a, b) => a + b, 0);
    const week = Date.now() + 7 * 24 * 3600 * 1000;
    const expiring = active.filter((m) => m.expiresAt && new Date(m.expiresAt).getTime() <= week).length;
    return { members: active.length, monthly, outstanding, expiring, byPlan };
  }, [memberships, credits, plans]);

  const isNew = useMemo(() => !!draft && !plans.some((p) => p.id === draft.id), [draft, plans]);

  const allowanceLine = (p: Plan) => {
    if (p.credits == null) return t('plans.noLimit');
    if (p.period === 'week') return t('plans.creditsPerWeek', { count: p.credits });
    if (p.period === 'fourWeeks') return t('plans.creditsPer4Weeks', { count: p.credits });
    if (p.period === 'month') return t('plans.creditsPerMonth', { count: p.credits });
    const base = t('plans.creditsOnce', { count: p.credits });
    return p.validityMonths ? `${base} · ${t('plans.validFor', { count: p.validityMonths })}` : `${base} · ${t('plans.oneOff')}`;
  };

  const save = async () => {
    if (!draft) return;
    const name = draft.name.trim();
    const price = Number(draft.price.replace(',', '.'));
    if (!name) return setError(t('plans.nameRequired'));
    if (!Number.isFinite(price) || price < 0) return setError(t('plans.priceInvalid'));
    const creditsN = draft.unlimited ? null : Math.max(0, Math.round(Number(draft.credits) || 0));
    const validity = draft.period === 'once' && draft.validityMonths.trim() ? Math.max(1, Math.round(Number(draft.validityMonths))) : null;
    setSaving(true);
    setError(null);
    try {
      await savePlan({
        id: draft.id,
        name,
        price,
        period: draft.period,
        credits: creditsN,
        validityMonths: validity,
        rollover: draft.rollover,
        availableTo: draft.availableTo,
        status: draft.status,
        vatRate: draft.vatRate,
        createdAt: draft.createdAt,
      });
      notify.success(t('plans.saved'));
      await load();
      await onChanged?.();
      if (!wide) setDraft(null);
    } catch (e) {
      notify.error(t('plans.failed'), e);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await deletePlan(draft.id);
      notify.success(t('plans.deleted'));
      setConfirmDelete(false);
      setDraft(null);
      await load();
      await onChanged?.();
    } catch (e) {
      notify.error(t('plans.failed'), e);
    } finally {
      setSaving(false);
    }
  };

  const tile = (value: string, label: string) => (
    <Box key={label} sx={{ flex: 1, minWidth: 0, p: 2, borderRadius: `${designTokens.cardRadius}px`, bgcolor: designTokens.cardBackground }}>
      <Typography variant="h5" sx={{ fontWeight: 600, lineHeight: 1.2 }} noWrap>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
        {label}
      </Typography>
    </Box>
  );

  const tiles = (
    <Box sx={{ display: 'flex', gap: 1.5, mb: 2.5 }}>
      {tile(String(stats.members), wide ? t('plans.kpi.members') : t('plans.kpi.membersShort'))}
      {tile(euro(stats.monthly), wide ? t('plans.kpi.monthly') : t('plans.kpi.monthlyShort'))}
      {tile(String(stats.outstanding), wide ? t('plans.kpi.credits') : t('plans.kpi.creditsShort'))}
      {wide && tile(String(stats.expiring), t('plans.kpi.expiring'))}
    </Box>
  );

  const list = (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minWidth: 0 }}>
      {!loading && loadFailed && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => void load()}>
              {t('common.retry')}
            </Button>
          }
        >
          {t('plans.loadFailed')}
        </Alert>
      )}
      {!loading && !loadFailed && plans.length === 0 && (
        <Box sx={{ p: 3, borderRadius: `${designTokens.cardRadius}px`, bgcolor: designTokens.cardBackground }}>
          <Typography color="text.secondary">{t('plans.empty')}</Typography>
        </Box>
      )}
      {plans.map((p) => {
        const active = draft?.id === p.id;
        const count = stats.byPlan.get(p.id) ?? 0;
        return (
          <Box
            key={p.id}
            role="button"
            tabIndex={0}
            onClick={() => {
              setError(null);
              setDraft(toDraft(p));
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') setDraft(toDraft(p));
            }}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              p: 2,
              borderRadius: `${designTokens.cardRadius}px`,
              bgcolor: active ? designTokens.cardBackgroundHigh : designTokens.cardBackground,
              cursor: 'pointer',
              '&:hover': { bgcolor: designTokens.cardBackgroundHigh },
            }}
          >
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body1" fontWeight={600} noWrap>
                  {p.name}
                </Typography>
                {p.status === 'paused' && <Chip size="small" label={t('plans.paused')} sx={{ height: 20, fontSize: 11, bgcolor: designTokens.cardBackgroundHigh }} />}
              </Box>
              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                {allowanceLine(p)}
              </Typography>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
              {t('plans.members', { count })}
            </Typography>
            <Box sx={{ textAlign: 'right', flexShrink: 0, minWidth: 64 }}>
              <Typography variant="body1" fontWeight={600}>
                {euro(p.price)}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                {p.period === 'week'
                  ? t('plans.perWeek')
                  : p.period === 'fourWeeks'
                    ? t('plans.per4Weeks')
                    : p.period === 'month'
                      ? t('plans.perMonth')
                      : p.credits == null
                        ? t('plans.oneOff')
                        : t('plans.perCard')}
              </Typography>
            </Box>
          </Box>
        );
      })}
    </Box>
  );

  const editor = draft && (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {error && (
        <Typography variant="body2" color="error">
          {error}
        </Typography>
      )}
      <TextField label={t('plans.name')} size="small" fullWidth autoFocus={isNew} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
        <NumberField label={t('plans.price')} decimal size="small" fullWidth value={draft.price} onChange={(v) => setDraft({ ...draft, price: v })} />
        <TextField select label={t('plans.period')} size="small" fullWidth value={draft.period} onChange={(e) => setDraft({ ...draft, period: e.target.value as Plan['period'] })}>
          <MenuItem value="week">{t('plans.weekly')}</MenuItem>
          <MenuItem value="fourWeeks">{t('plans.fourWeekly')}</MenuItem>
          <MenuItem value="month">{t('plans.monthly')}</MenuItem>
          <MenuItem value="once">{t('plans.once')}</MenuItem>
        </TextField>
      </Box>
      <TextField select label={t('plans.vat')} size="small" fullWidth value={String(draft.vatRate)} helperText={t('plans.vatHelp')} onChange={(e) => setDraft({ ...draft, vatRate: Number(e.target.value) as VatRate })}>
        {VAT_RATES.map((r) => (
          <MenuItem key={r} value={String(r)}>
            {t(`plans.vatOption.r${r}`)}
          </MenuItem>
        ))}
      </TextField>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
        <TextField select label={t('plans.allowance')} size="small" fullWidth value={draft.unlimited ? 'unlimited' : 'credits'} onChange={(e) => setDraft({ ...draft, unlimited: e.target.value === 'unlimited' })}>
          <MenuItem value="credits">{t('plans.credits')}</MenuItem>
          <MenuItem value="unlimited">{t('plans.unlimited')}</MenuItem>
        </TextField>
        {!draft.unlimited && <NumberField label={t('plans.credits')} size="small" fullWidth value={draft.credits} onChange={(v) => setDraft({ ...draft, credits: v })} />}
      </Box>
      {draft.period === 'once' && (
        <NumberField label={t('plans.validity')} size="small" fullWidth value={draft.validityMonths} onChange={(v) => setDraft({ ...draft, validityMonths: v })} helperText={t('plans.validityHelp')} />
      )}
      {draft.period !== 'once' && !draft.unlimited && (
        <TextField select label={t('plans.rollover')} size="small" fullWidth value={draft.rollover} onChange={(e) => setDraft({ ...draft, rollover: e.target.value as Plan['rollover'] })}>
          <MenuItem value="expire">{t('plans.expire')}</MenuItem>
          <MenuItem value="carry">{t('plans.carry')}</MenuItem>
        </TextField>
      )}
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
        <TextField select label={t('plans.availableTo')} size="small" fullWidth value={draft.availableTo} onChange={(e) => setDraft({ ...draft, availableTo: e.target.value as Plan['availableTo'] })}>
          <MenuItem value="all">{t('plans.all')}</MenuItem>
          <MenuItem value="invite">{t('plans.invite')}</MenuItem>
        </TextField>
        <TextField select label={t('plans.status')} size="small" fullWidth value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as Plan['status'] })}>
          <MenuItem value="active">{t('plans.active')}</MenuItem>
          <MenuItem value="paused">{t('plans.paused')}</MenuItem>
        </TextField>
      </Box>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', pt: 0.5 }}>
        <Button variant="contained" disableElevation onClick={() => void save()} disabled={saving}>
          {saving ? t('common.saving') : t('common.save')}
        </Button>
        {!isNew && (
          <Button color="error" onClick={() => setConfirmDelete(true)} disabled={saving}>
            {t('plans.delete')}
          </Button>
        )}
      </Box>
    </Box>
  );

  /** Hoeveel leden dit abonnement nu hebben: dat moet je weten voordat je het verwijdert. */
  const draftMembers = draft?.id ? (stats.byPlan.get(draft.id) ?? 0) : 0;

  const confirm = (
    <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} maxWidth="xs" fullWidth>
      <DialogTitle>{t('plans.delete')}</DialogTitle>
      <DialogContent>
        <Typography variant="body2">{t('plans.deleteConfirm', { name: draft?.name ?? '' })}</Typography>
        {draftMembers > 0 && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            {t('plans.deleteMembers', { count: draftMembers })}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setConfirmDelete(false)} disabled={saving}>
          {t('common.cancel')}
        </Button>
        <Button color="error" variant="contained" onClick={() => void remove()} disabled={saving}>
          {t('plans.delete')}
        </Button>
      </DialogActions>
    </Dialog>
  );

  if (!wide) {
    return (
      <>
        {tiles}
        {list}
        <Dialog open={!!draft} onClose={() => setDraft(null)} fullScreen>
          <FullScreenDialogTitle title={isNew ? t('plans.newPlan') : draft?.name ?? ''} onClose={() => setDraft(null)} />
          <DialogContent>
            <Box sx={{ pt: 1.5 }}>{editor}</Box>
          </DialogContent>
        </Dialog>
        {confirm}
      </>
    );
  }

  return (
    <>
      {tiles}
      <Box sx={{ display: 'flex', gap: 2.5, alignItems: 'flex-start' }}>
        {list}
        {/* Zonder abonnementen geen tweede "leeg"-vak ernaast: de lijst zegt het al. */}
        {(draft || plans.length > 0) && (
          <Box sx={{ width: 400, flexShrink: 0, p: 3, borderRadius: `${designTokens.cardRadius}px`, bgcolor: designTokens.cardBackground, position: 'sticky', top: 24 }}>
            {draft ? (
              <>
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                  {isNew ? t('plans.newPlan') : draft.name || t('plans.membership')}
                </Typography>
                {editor}
              </>
            ) : (
              <Typography color="text.secondary">{t('plans.pickToEdit')}</Typography>
            )}
          </Box>
        )}
        {confirm}
      </Box>
    </>
  );
}
