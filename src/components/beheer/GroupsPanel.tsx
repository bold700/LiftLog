/**
 * Beheer → Groepen: bedrijven, gezinnen en vriendengroepen die samen trainen (duo-PT, Pouw, een
 * kantoor). Iedereen heeft een eigen account; de groep bundelt ze, met één hoofdprofiel dat de
 * facturen krijgt. Tegoed en abonnement staan op de groep, in euro's: een groepsles kost een
 * basisprijs plus een bedrag per extra persoon (Beheer → Instellingen), naar wie er echt komt.
 * De app rekent een richtprijs voor; de trainer kiest zelf het abonnement.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  MenuItem,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { ContentCard } from '../layout';
import { PersonalSlotDialog } from '../StandingBookingsCard';
import { useI18n } from '../../context/I18nContext';
import { addPersonalSlot, removeGroupSlot } from '../../services/classService';
import { getClassTypes } from '../../services/classTypeService';
import { FullScreenDialogTitle } from './FullScreenDialogTitle';
import { useNotify } from '../../context/NotifyContext';
import { useProfile } from '../../context/ProfileContext';
import { adjustGroupBalance, assignGroupPlan, deleteGroup, getGroupsForOrg, saveGroup, unassignGroupPlan } from '../../services/groupService';
import { getOrg } from '../../services/orgService';
import { designTokens } from '../../theme/designTokens';
import { DEFAULT_GROUP_PRICING, formatEuro, groupHolderId, groupPricingOf, groupSessionPrice } from '../../utils/groupPricing';
import type { ClassType, Group, GroupKind, Membership, OrgGroupPricing, Plan, Profile } from '../../types';

const KIND_LABEL: Record<GroupKind, string> = { bedrijf: 'Bedrijf', gezin: 'Gezin', vrienden: 'Vrienden' };

interface GroupsPanelProps {
  profiles: Profile[];
  plans: Plan[];
  /** Actieve lidmaatschappen per userId; een groep staat onder `grp_{id}`. */
  memberships: Record<string, Membership>;
  /** Saldo per userId; bij een groep (`grp_{id}`) in euro's. */
  credits: Record<string, number>;
  /** Telt op bij elke klik op "Groep toevoegen" in de kop. */
  createSignal: number;
  onChanged?: () => void | Promise<void>;
}

interface Draft {
  groupId?: string;
  name: string;
  kind: GroupKind;
  memberIds: string[];
  payerId: string;
  planId: string;
  /** Eigen tarief, als tekst uit de velden; allebei leeg = het tarief van de studio. */
  base: string;
  perExtra: string;
}

const rateText = (v: number | undefined) => (v == null ? '' : String(v).replace('.', ','));
const rateNum = (v: string) => Number(v.trim().replace(',', '.'));

const nameOf = (p: Profile | undefined) => p?.displayName?.trim() || p?.email || 'Onbekend lid';
const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export function GroupsPanel({ profiles, plans, memberships, credits, createSignal, onChanged }: GroupsPanelProps) {
  const notify = useNotify();
  const { t } = useI18n();
  const profileCtx = useProfile();
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up('md'));
  const orgId = profileCtx?.activeOrgId ?? null;

  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [pricing, setPricing] = useState<OrgGroupPricing>(DEFAULT_GROUP_PRICING);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adjust, setAdjust] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [types, setTypes] = useState<ClassType[]>([]);
  const [slotOpen, setSlotOpen] = useState(false);
  const [stopSlot, setStopSlot] = useState<ClassType | null>(null);
  const [confirmStopPlan, setConfirmStopPlan] = useState(false);

  const byId = useMemo(() => new Map(profiles.map((p) => [p.userId, p])), [profiles]);
  // Kiesbaar als lid: wie actief is bij deze studio (een inactief lid kan niet trainen).
  const selectable = useMemo(() => profiles.filter((p) => !p.inactive), [profiles]);
  const trainers = useMemo(() => profiles.filter((p) => p.role !== 'sporter').map((p) => ({ userId: p.userId, name: nameOf(p) })), [profiles]);
  const publicTypes = useMemo(() => types.filter((c) => !c.privateFor && !c.privateForGroup), [types]);
  const slotsOf = (groupId: string) => types.filter((c) => c.privateForGroup === groupId);
  const weekdayLabel = (wd: number) => t(`classTypes.schedule.weekdayLabels.${WEEKDAY_KEYS[wd]}`);
  const slotText = (c: ClassType) => {
    const s = c.schedule[0];
    const trainer = c.defaultTrainerId ? byId.get(c.defaultTrainerId) : undefined;
    return [s ? `${weekdayLabel(s.weekday)} ${s.startTime}–${s.endTime}` : c.name, c.name, trainer ? nameOf(trainer) : null].filter(Boolean).join(' · ');
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, ct] = await Promise.all([getGroupsForOrg(), getClassTypes()]);
      setGroups(list);
      setTypes(ct);
    } catch (e) {
      notify.error('Groepen laden mislukt.', e);
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!orgId) return;
    void getOrg(orgId).then((org) => org && setPricing(groupPricingOf(org.groupPricing)));
  }, [orgId]);

  useEffect(() => {
    if (createSignal > 0) {
      setError(null);
      setAdjust('');
      setDraft({ name: '', kind: 'bedrijf', memberIds: [], payerId: '', planId: '', base: '', perExtra: '' });
    }
  }, [createSignal]);

  const open = (g: Group) => {
    setError(null);
    setAdjust('');
    setDraft({
      groupId: g.id,
      name: g.name,
      kind: g.kind,
      memberIds: g.memberIds,
      payerId: g.payerId,
      planId: memberships[groupHolderId(g.id)]?.planId ?? '',
      base: rateText(g.pricing?.base),
      perExtra: rateText(g.pricing?.perExtra),
    });
  };
  const close = () => {
    if (saving) return;
    setDraft(null);
    setConfirmDelete(false);
  };

  const refresh = async () => {
    await load();
    await onChanged?.();
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const payerId = draft.memberIds.includes(draft.payerId) ? draft.payerId : draft.memberIds[0] ?? '';
      const group = await saveGroup({ groupId: draft.groupId, name: draft.name, kind: draft.kind, memberIds: draft.memberIds, payerId, pricing: ownPricing });
      // Mislukt het abonnement hierna, dan maakt nog eens Opslaan geen tweede groep aan.
      setDraft((d) => (d ? { ...d, groupId: group.id } : d));
      // Abonnement gewijzigd? De prijs komt als tegoed op de groep; de post gaat naar het hoofdprofiel.
      const had = draft.groupId ? memberships[groupHolderId(draft.groupId)]?.planId ?? '' : '';
      if (draft.planId !== had) {
        if (draft.planId) await assignGroupPlan(group.id, draft.planId);
        else await unassignGroupPlan(group.id);
      }
      notify.success(`Groep ${group.name} opgeslagen.`);
      setDraft(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Opslaan mislukt.');
    } finally {
      setSaving(false);
    }
  };

  const doAdjust = async () => {
    if (!draft?.groupId) return;
    const amount = Number(adjust.replace(',', '.'));
    setSaving(true);
    setError(null);
    try {
      const r = await adjustGroupBalance(draft.groupId, amount, 'Handmatig bijgesteld');
      notify.success(`Groepstegoed is nu ${formatEuro(r.balance)}.`);
      setAdjust('');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Tegoed bijstellen mislukt.');
    } finally {
      setSaving(false);
    }
  };

  /** Abonnement van de groep meteen stoppen (zonder eerst Opslaan); het tegoed blijft staan. */
  const doStopPlan = async () => {
    if (!draft?.groupId) return;
    setSaving(true);
    setError(null);
    try {
      await unassignGroupPlan(draft.groupId);
      notify.success('Abonnement van de groep gestopt.');
      setConfirmStopPlan(false);
      setDraft((d) => (d ? { ...d, planId: '' } : d));
      await refresh();
    } catch (e) {
      setConfirmStopPlan(false);
      setError(e instanceof Error ? e.message : 'Abonnement stoppen mislukt.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!draft?.groupId) return;
    setSaving(true);
    setError(null);
    try {
      await deleteGroup(draft.groupId);
      notify.success(`Groep ${draft.name} verwijderd.`);
      setDraft(null);
      setConfirmDelete(false);
      await refresh();
    } catch (e) {
      setConfirmDelete(false);
      setError(e instanceof Error ? e.message : 'Verwijderen mislukt.');
    } finally {
      setSaving(false);
    }
  };

  const addSlot = async (input: { baseClassTypeId: string; weekday: number; startTime: string; endTime: string; trainerId: string | null; startDate: string }) => {
    if (!draft?.groupId) return;
    setSlotOpen(false);
    setSaving(true);
    setError(null);
    try {
      const r = await addPersonalSlot({ ...input, groupId: draft.groupId });
      const booked = r.booked ?? 0;
      notify.success(booked > 0 ? `Vaste groepsles ingepland; ${booked} ${booked === 1 ? 'plek' : 'plekken'} geboekt.` : 'Vaste groepsles ingepland.');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Inplannen mislukt.');
    } finally {
      setSaving(false);
    }
  };

  const doStopSlot = async () => {
    if (!stopSlot) return;
    setSaving(true);
    setError(null);
    try {
      await removeGroupSlot(stopSlot.id);
      notify.success('Vaste groepsles gestopt; komende lessen zijn afgelast en terug op het groepstegoed.');
      setStopSlot(null);
      await refresh();
    } catch (e) {
      setStopSlot(null);
      setError(e instanceof Error ? e.message : 'Stoppen mislukt.');
    } finally {
      setSaving(false);
    }
  };

  // Eigen tarief van de groep: allebei ingevuld (en geldig), of allebei leeg (= tarief van de studio).
  const rateEmpty = !draft || (draft.base.trim() === '' && draft.perExtra.trim() === '');
  const rateValid = (v: string) => v.trim() !== '' && Number.isFinite(rateNum(v)) && rateNum(v) >= 0 && rateNum(v) <= 10000;
  const rateOk = rateEmpty || (!!draft && rateValid(draft.base) && rateValid(draft.perExtra));
  const ownPricing: OrgGroupPricing | null = !rateEmpty && rateOk && draft ? { base: rateNum(draft.base), perExtra: rateNum(draft.perExtra) } : null;
  const draftPricing = ownPricing ?? pricing;
  const pricingFor = (g: Group) => g.pricing ?? pricing;
  const size = draft?.memberIds.length ?? 0;
  const lessonPrice = groupSessionPrice(draftPricing, size);
  const currentPlan = draft?.groupId ? memberships[groupHolderId(draft.groupId)] : undefined;
  const balanceOf = (groupId: string) => credits[groupHolderId(groupId)] ?? 0;
  const adjustNum = Number(adjust.replace(',', '.'));
  const adjustValid = adjust.trim() !== '' && Number.isFinite(adjustNum) && adjustNum !== 0;

  return (
    <>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Een bedrijf, gezin of vriendengroep die samen traint. Iedereen heeft een eigen account; het hoofdprofiel krijgt de
        facturen. Een groepsles kost {formatEuro(pricing.base)} plus {formatEuro(pricing.perExtra)} per extra persoon, naar
        wie er komt: meldt iemand zich op tijd af, dan blijft het verschil op het groepstegoed staan. Dat tarief stel je in
        bij Instellingen; per groep kun je een eigen tarief zetten.
      </Typography>

      {loading && groups.length === 0 ? (
        <Typography color="text.secondary">Groepen laden…</Typography>
      ) : groups.length === 0 ? (
        <ContentCard>
          <Typography color="text.secondary">Nog geen groepen. Maak er een met "Groep toevoegen".</Typography>
        </ContentCard>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
          {groups.map((g) => {
            const plan = memberships[groupHolderId(g.id)];
            return (
              <Box
                key={g.id}
                component="button"
                type="button"
                onClick={() => open(g)}
                sx={{
                  all: 'unset',
                  cursor: 'pointer',
                  p: 2,
                  borderRadius: `${designTokens.cardRadius}px`,
                  bgcolor: designTokens.cardBackgroundHigh,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 0.75,
                  minWidth: 0,
                  '&:hover': { outline: '1px solid', outlineColor: 'divider' },
                  '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' },
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 600, minWidth: 0 }} noWrap>
                    {g.name}
                  </Typography>
                  <Chip size="small" label={KIND_LABEL[g.kind]} sx={{ height: 22, fontSize: 12 }} />
                  <Typography variant="body2" sx={{ ml: 'auto', fontWeight: 600, flexShrink: 0, color: balanceOf(g.id) < 0 ? 'error.main' : undefined }}>
                    {formatEuro(balanceOf(g.id))}
                  </Typography>
                </Box>
                <Typography variant="body2" color="text.secondary">
                  {g.memberIds.map((id) => nameOf(byId.get(id)) + (id === g.payerId ? ' (betaalt)' : '')).join(', ')}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {plan ? plan.planName : 'Geen abonnement'} · groepsles {formatEuro(groupSessionPrice(pricingFor(g), g.memberIds.length))}
                  {g.pricing ? ' (eigen tarief)' : ''}
                  {slotsOf(g.id).length > 0 ? ` · ${slotsOf(g.id).length} vaste ${slotsOf(g.id).length === 1 ? 'les' : 'lessen'}` : ''}
                </Typography>
              </Box>
            );
          })}
        </Box>
      )}

      <Dialog open={!!draft} onClose={close} fullScreen={!wide} maxWidth="sm" fullWidth>
        {wide ? (
          <DialogTitle>{draft?.groupId ? 'Groep bewerken' : 'Groep toevoegen'}</DialogTitle>
        ) : (
          <FullScreenDialogTitle title={draft?.groupId ? 'Groep bewerken' : 'Groep toevoegen'} onClose={close} />
        )}
        {draft && (
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '12px !important' }}>
            {error && <Alert severity="error">{error}</Alert>}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '2fr 1fr' }, gap: 2 }}>
              <TextField label="Naam" size="small" autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              <TextField select label="Soort" size="small" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as GroupKind })}>
                {(Object.keys(KIND_LABEL) as GroupKind[]).map((k) => (
                  <MenuItem key={k} value={k}>
                    {KIND_LABEL[k]}
                  </MenuItem>
                ))}
              </TextField>
            </Box>
            <Autocomplete
              multiple
              size="small"
              options={selectable}
              value={draft.memberIds.map((id) => byId.get(id)).filter((p): p is Profile => !!p)}
              getOptionLabel={(p) => nameOf(p)}
              isOptionEqualToValue={(a, b) => a.userId === b.userId}
              onChange={(_, value) => {
                const memberIds = value.map((p) => p.userId);
                setDraft({ ...draft, memberIds, payerId: memberIds.includes(draft.payerId) ? draft.payerId : memberIds[0] ?? '' });
              }}
              renderInput={(params) => <TextField {...params} label="Leden" placeholder="Zoek een lid" />}
            />
            <TextField
              select
              label="Hoofdprofiel (krijgt de facturen)"
              size="small"
              value={draft.memberIds.includes(draft.payerId) ? draft.payerId : ''}
              onChange={(e) => setDraft({ ...draft, payerId: e.target.value })}
              disabled={draft.memberIds.length === 0}
              helperText={draft.memberIds.length === 0 ? 'Kies eerst de leden.' : ' '}
            >
              {draft.memberIds.map((id) => (
                <MenuItem key={id} value={id}>
                  {nameOf(byId.get(id))}
                </MenuItem>
              ))}
            </TextField>

            <Box sx={{ p: 1.5, borderRadius: `${designTokens.cardRadius}px`, bgcolor: designTokens.cardBackgroundHigh, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Tarief per groepsles
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
                <TextField
                  label="Basistarief (1e persoon)"
                  size="small"
                  value={draft.base}
                  onChange={(e) => setDraft({ ...draft, base: e.target.value })}
                  placeholder={rateText(pricing.base)}
                  error={!rateOk && !rateValid(draft.base)}
                  InputProps={{ startAdornment: <InputAdornment position="start">€</InputAdornment> }}
                  inputProps={{ inputMode: 'decimal' }}
                />
                <TextField
                  label="Per extra persoon"
                  size="small"
                  value={draft.perExtra}
                  onChange={(e) => setDraft({ ...draft, perExtra: e.target.value })}
                  placeholder={rateText(pricing.perExtra)}
                  error={!rateOk && !rateValid(draft.perExtra)}
                  InputProps={{ startAdornment: <InputAdornment position="start">€</InputAdornment> }}
                  inputProps={{ inputMode: 'decimal' }}
                />
              </Box>
              <Typography variant="caption" color={rateOk ? 'text.secondary' : 'error'}>
                {rateOk
                  ? rateEmpty
                    ? `Leeg = het tarief van de studio (${formatEuro(pricing.base)} + ${formatEuro(pricing.perExtra)} per extra persoon, Beheer → Instellingen).`
                    : 'Eigen tarief voor deze groep. Geldt voor lessen die vanaf nu worden geboekt of afgemeld.'
                  : 'Vul allebei in (of laat allebei leeg voor het tarief van de studio).'}
              </Typography>
              {size > 0 && (
                <Box>
                  <Typography variant="body2">
                    Groepsles met {size} {size === 1 ? 'persoon' : 'personen'}:{' '}
                    {size > 1 ? `${formatEuro(draftPricing.base)} + ${size - 1} × ${formatEuro(draftPricing.perExtra)} = ` : ''}
                    <strong>{formatEuro(lessonPrice)}</strong>
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    Richtprijs per 4 weken bij 1× per week: {formatEuro(lessonPrice * 4)}, bij 2× per week: {formatEuro(lessonPrice * 8)}.
                    Maak daarvoor een abonnement (op uitnodiging) aan bij Abonnementen.
                  </Typography>
                </Box>
              )}
            </Box>

            <TextField
              select
              label="Abonnement van de groep"
              size="small"
              value={draft.planId}
              onChange={(e) => setDraft({ ...draft, planId: e.target.value })}
              helperText="De prijs komt als tegoed op de groep; de factuur gaat naar het hoofdprofiel."
            >
              <MenuItem value="">Geen abonnement</MenuItem>
              {plans
                .filter((pl) => pl.status === 'active' || pl.id === draft.planId)
                .map((pl) => (
                  <MenuItem key={pl.id} value={pl.id}>
                    {pl.name} · {formatEuro(pl.price)}
                  </MenuItem>
                ))}
            </TextField>
            {currentPlan && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: -1 }}>
                <Typography variant="body2" color="text.secondary" sx={{ minWidth: 0 }}>
                  Loopt nu: {currentPlan.planName}
                </Typography>
                <Button size="small" color="error" sx={{ ml: 'auto', flexShrink: 0 }} disabled={saving} onClick={() => setConfirmStopPlan(true)}>
                  Abonnement stoppen
                </Button>
              </Box>
            )}

            {draft.groupId && (
              <Box sx={{ p: 1.5, borderRadius: `${designTokens.cardRadius}px`, bgcolor: designTokens.cardBackgroundHigh, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5 }}>
                <Typography variant="body2" sx={{ width: '100%' }}>
                  Groepstegoed: <strong>{formatEuro(balanceOf(draft.groupId))}</strong>
                </Typography>
                <TextField
                  label="Bijstellen (€, min voor aftrek)"
                  size="small"
                  value={adjust}
                  onChange={(e) => setAdjust(e.target.value)}
                  inputProps={{ inputMode: 'decimal' }}
                  sx={{ width: 220 }}
                />
                <Button size="small" variant="outlined" disabled={saving || !adjustValid} onClick={() => void doAdjust()}>
                  Bijstellen
                </Button>
              </Box>
            )}

            {draft.groupId && (
              <Box sx={{ p: 1.5, borderRadius: `${designTokens.cardRadius}px`, bgcolor: designTokens.cardBackgroundHigh }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    Vaste groepslessen
                  </Typography>
                  <Button size="small" sx={{ ml: 'auto' }} disabled={saving} onClick={() => setSlotOpen(true)}>
                    Inplannen
                  </Button>
                </Box>
                {slotsOf(draft.groupId).length === 0 ? (
                  <Typography variant="caption" color="text.secondary">
                    Nog geen. Plan een vast moment: alle leden worden elke week geboekt en de les gaat van het groepstegoed af.
                  </Typography>
                ) : (
                  slotsOf(draft.groupId).map((c) => (
                    <Box key={c.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.25 }}>
                      <Typography variant="body2" sx={{ minWidth: 0 }}>
                        {slotText(c)}
                      </Typography>
                      <Button size="small" color="error" sx={{ ml: 'auto', flexShrink: 0 }} disabled={saving} onClick={() => setStopSlot(c)}>
                        Stoppen
                      </Button>
                    </Box>
                  ))
                )}
              </Box>
            )}
          </DialogContent>
        )}
        <DialogActions sx={{ px: 3, pb: 2 }}>
          {draft?.groupId && (
            <Button color="error" onClick={() => setConfirmDelete(true)} disabled={saving} sx={{ mr: 'auto' }}>
              Verwijderen
            </Button>
          )}
          {wide && (
            <Button onClick={close} disabled={saving}>
              Annuleren
            </Button>
          )}
          <Button variant="contained" disableElevation onClick={() => void save()} disabled={saving || !rateOk || !draft?.name.trim() || !draft?.memberIds.length}>
            {saving ? 'Bezig…' : 'Opslaan'}
          </Button>
        </DialogActions>
      </Dialog>

      <PersonalSlotDialog
        open={slotOpen}
        types={publicTypes}
        trainers={trainers}
        defaultTrainerId={null}
        weekdayLabel={weekdayLabel}
        onClose={() => setSlotOpen(false)}
        onAdd={(input) => void addSlot(input)}
        title="Vaste groepsles"
        intro={`Elke week op dezelfde dag en tijd voor ${draft?.name || 'deze groep'}. Alle leden worden geboekt; de les kost ${formatEuro(lessonPrice)} bij ${size} ${size === 1 ? 'persoon' : 'personen'} en gaat van het groepstegoed af. Meldt iemand zich op tijd af, dan wordt het goedkoper.`}
      />

      <Dialog open={!!stopSlot} onClose={() => !saving && setStopSlot(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Vaste groepsles stoppen</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {stopSlot ? slotText(stopSlot) : ''}: de komende lessen worden afgelast en wat de groep ervoor betaalde, komt terug op het
            groepstegoed. Wat al geweest is, blijft staan.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setStopSlot(null)} disabled={saving}>
            Annuleren
          </Button>
          <Button color="error" variant="contained" disableElevation onClick={() => void doStopSlot()} disabled={saving}>
            Stoppen
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmStopPlan} onClose={() => !saving && setConfirmStopPlan(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Abonnement stoppen</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {currentPlan?.planName ?? 'Het abonnement'} van {draft?.name} stopt nu: er komen geen nieuwe facturen en geen nieuw tegoed meer bij.
            Het tegoed dat er nu op staat ({draft?.groupId ? formatEuro(balanceOf(draft.groupId)) : ''}) blijft; daar is al voor betaald.
            Wil je dat ook weghalen, stel het dan bij naar € 0.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setConfirmStopPlan(false)} disabled={saving}>
            Annuleren
          </Button>
          <Button color="error" variant="contained" disableElevation onClick={() => void doStopPlan()} disabled={saving}>
            Stoppen
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmDelete} onClose={() => !saving && setConfirmDelete(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Groep verwijderen</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            De groep {draft?.name} verdwijnt; de leden en hun accounts blijven. Loopt er nog een abonnement of staat er nog tegoed
            op, stop of zet dat dan eerst op nul.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setConfirmDelete(false)} disabled={saving}>
            Annuleren
          </Button>
          <Button color="error" variant="contained" disableElevation onClick={() => void remove()} disabled={saving}>
            Verwijderen
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
