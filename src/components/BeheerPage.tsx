/**
 * Beheer: alle accounts en sporters op één plek. Aanvragen, sporters koppelen, accounts aanmaken,
 * profielen inzien en bijwerken (trainers en beheerders). Het lesrooster importeer je bij Workouts.
 * Zoeken, filteren op rol/volledigheid, per profiel alle velden bewerken in één dialoog,
 * en nieuwe accounts aanmaken (zonder e-mailverificatie) om voor sporters bij te houden.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  MenuItem,
  Alert,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  InputAdornment,
  Tabs,
  Tab,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import PersonAddRoundedIcon from '@mui/icons-material/PersonAddRounded';
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import { useProfile } from '../context/ProfileContext';
import { useI18n } from '../context/I18nContext';
import { useAuth } from '../context/AuthContext';
import { assignTrainerToSporter, getAllProfiles, getProfileByEmail, updateProfile } from '../services/profileService';
import { deleteAccountAsAdmin } from '../services/adminAccountService';
import type { LeaderboardVisibility, Membership, Plan, Profile, ProfileRole, Limitation } from '../types';
import { PageLayout, ContentCard, HeaderActions } from './layout';
import { BrandingSettings } from './beheer/BrandingSettings';
import { UserAvatar } from './UserAvatar';
import { ageOnDate } from '../utils/bodyFat';
import { heartRateZones } from '../utils/heartRate';
import { HeartRateZonesTable } from './HeartRateZonesTable';
import { LimitationsEditor } from './LimitationsEditor';
import { todayIso } from '../utils/format';
import { RequestsBanner } from './beheer/RequestsBanner';
import { MembersList } from './beheer/MembersList';
import { StandingBookingsCard } from './StandingBookingsCard';
import { MembersToolbar } from './beheer/MembersToolbar';
import {
  DEFAULT_MEMBER_FILTER,
  DEFAULT_MEMBER_SORT,
  filterMembers,
  planOptions,
  sortMembers,
  type MemberFilter,
  type MemberSort,
} from '../utils/memberTable';
import { ClassTypesPanel } from './beheer/ClassTypesPanel';
import { SubscriptionsPanel } from './beheer/SubscriptionsPanel';
import { BillingPanel } from './beheer/BillingPanel';
import { NotificationsPanel } from './beheer/NotificationsPanel';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import { assignPlan, getActiveMembershipsForOrg, getPlans, renewDue, unassignPlan } from '../services/planService';
import { getCreditBalancesForOrg, grantCredits } from '../services/classService';
import { NumberField } from './NumberField';
import { designTokens } from '../theme/designTokens';
import { EMAIL_RE, generatePassword } from '../utils/account';
import { MemberImportDialog } from './beheer/MemberImportDialog';
import { LEADERBOARD_ENABLED } from '../config/features';

type Section = 'leden' | 'lessoorten' | 'abonnementen' | 'huisstijl' | 'facturatie' | 'meldingen';
/** Beheer gebruikt de hele breedte van het hoofdvlak, zoals in het ontwerp; de andere pagina's blijven op 800. */
const ADMIN_MAX_WIDTH = 'none';

interface EditState {
  displayName: string;
  role: ProfileRole;
  trainerId: string;
  heightCm: string;
  birthDate: string;
  gender: 'man' | 'vrouw' | 'anders' | '';
  restingHr: string;
  weightGoalKg: string;
  leaderboardVisibility: LeaderboardVisibility;
  limitations: Limitation[];
  /** Nee gezegd tegen gezondheidsgegevens: geen rusthartslag en blessures invullen. */
  healthRefused: boolean;
  /** Actief abonnement (planId), '' = geen. */
  planId: string;
}

function toEditState(p: Profile, planId = ''): EditState {
  return {
    displayName: p.displayName ?? '',
    role: p.role,
    trainerId: p.trainerId ?? '',
    heightCm: p.heightCm != null ? String(p.heightCm) : '',
    birthDate: p.birthDate ?? '',
    gender: p.gender ?? '',
    restingHr: p.restingHrBpm != null ? String(p.restingHrBpm) : '',
    weightGoalKg: p.weightGoalKg != null ? String(p.weightGoalKg) : '',
    leaderboardVisibility: p.leaderboardVisibility ?? 'named',
    limitations: p.limitations ?? [],
    healthRefused: p.healthConsent?.given === false,
    planId,
  };
}

function num(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Formulier voor een nieuw account (aangemaakt door trainer/beheerder). */
const ROLE_LABEL: Record<NewAccountState['role'], string> = { sporter: 'sporter', trainer: 'trainer', admin: 'beheerder' };

interface NewAccountState {
  displayName: string;
  email: string;
  password: string;
  role: 'sporter' | 'trainer' | 'admin';
  trainerId: string;
}

export function BeheerPage() {
  const profileCtx = useProfile();
  const auth = useAuth();
  const isTrainer = profileCtx?.isTrainer ?? false;
  const isAdmin = profileCtx?.role === 'admin';
  const selfId = profileCtx?.profile?.userId ?? '';
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const { t } = useI18n();
  // Beheer heeft tabs naar het ontwerp; Lessoorten en Abonnementen komen er in latere stappen bij.
  const [storedSection, setSectionState] = useState<Section>(() => {
    try {
      const v = localStorage.getItem(SECTION_STORAGE_KEY);
      return v && (SECTIONS as string[]).includes(v) ? (v as Section) : 'leden';
    } catch {
      return 'leden';
    }
  });
  // Het tabblad onthouden, zodat een refresh je op Lessoorten of Huisstijl laat staan.
  const setSection = useCallback((next: Section) => {
    setSectionState(next);
    try {
      localStorage.setItem(SECTION_STORAGE_KEY, next);
    } catch {
      /* privémodus */
    }
  }, []);
  // Een trainer ziet alleen Leden en Meldingen; een onthouden tab van de beheerder valt terug op Leden.
  const sections = isAdmin ? SECTIONS : STAFF_SECTIONS;
  const section: Section = sections.includes(storedSection) ? storedSection : 'leden';
  // Kop-knop op Lessoorten: elke klik telt op, het paneel opent dan een lege lessoort.
  const [newTypeSignal, setNewTypeSignal] = useState(0);

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [credits, setCredits] = useState<Record<string, number>>({});
  const [memberships, setMemberships] = useState<Record<string, Membership>>({});
  const [plans, setPlans] = useState<Plan[]>([]);
  const [newPlanSignal, setNewPlanSignal] = useState(0);
  const [exportSignal, setExportSignal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [memberFilter, setMemberFilter] = useState<MemberFilter>(DEFAULT_MEMBER_FILTER);
  const [memberSort, setMemberSort] = useState<MemberSort>(DEFAULT_MEMBER_SORT);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [target, setTarget] = useState<Profile | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);

  const [creditValue, setCreditValue] = useState('0');
  const [creditBusy, setCreditBusy] = useState(false);
  const [creditError, setCreditError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [newAccount, setNewAccount] = useState<NewAccountState | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [importOpen, setImportOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Eerst openstaande verlengingen laten verwerken (idempotent), dan pas saldo's en lidmaatschappen lezen.
      await renewDue().catch(() => null);
      const [list, balances, active, planList] = await Promise.all([
        getAllProfiles(),
        getCreditBalancesForOrg().catch(() => ({})),
        getActiveMembershipsForOrg().catch(() => ({})),
        getPlans().catch(() => []),
      ]);
      list.sort((a, b) =>
        (a.displayName || a.email || a.userId).localeCompare(b.displayName || b.email || b.userId, undefined, { sensitivity: 'base' })
      );
      setProfiles(list);
      setCredits(balances);
      setMemberships(active);
      setPlans(planList);
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Profielen laden mislukt.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isTrainer) load();
  }, [isTrainer, load]);

  const trainers = useMemo(() => profiles.filter((p) => p.role === 'trainer' || p.role === 'admin'), [profiles]);
  const trainerOptions = useMemo(
    () => trainers.map((tr) => ({ userId: tr.userId, email: tr.email, name: tr.displayName?.trim() || tr.email || tr.userId })),
    [trainers]
  );
  const nameOf = useCallback(
    (userId: string | null | undefined) => {
      if (!userId) return null;
      const p = profiles.find((x) => x.userId === userId);
      return p ? p.displayName?.trim() || p.email || p.userId : null;
    },
    [profiles]
  );

  const visible = useMemo(() => {
    const ctx = { credits, memberships, nameOf };
    return sortMembers(filterMembers(profiles, memberFilter, ctx), memberSort, ctx);
  }, [profiles, memberFilter, memberSort, credits, memberships, nameOf]);
  const memberPlans = useMemo(() => planOptions(memberships), [memberships]);
  const existingEmails = useMemo(
    () => new Set(profiles.map((p) => p.email?.trim().toLowerCase()).filter((e): e is string => !!e)),
    [profiles]
  );

  const openCreate = () => {
    setCreateError(null);
    setMessage(null);
    // Nieuwe sporter standaard aan mezelf koppelen, zodat ik direct voor hem/haar kan bijhouden.
    setNewAccount({ displayName: '', email: '', password: generatePassword(), role: 'sporter', trainerId: selfId });
  };

  const closeCreate = () => {
    if (creating) return;
    setNewAccount(null);
    setCreateError(null);
  };

  const handleCreate = async () => {
    if (!newAccount || !auth) return;
    const mail = newAccount.email.trim();
    if (!EMAIL_RE.test(mail)) {
      setCreateError('Vul een geldig e-mailadres in.');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      // Heeft dit e-mailadres al een account (iemand die zich zelf heeft aangemeld)? Dan koppelen we
      // die sporter in plaats van een tweede account te proberen; een wachtwoord is dan niet nodig.
      const existing = await getProfileByEmail(mail).catch(() => null);
      if (existing) {
        if (existing.role !== 'sporter' || newAccount.role !== 'sporter') {
          setCreateError('Er bestaat al een account met dit e-mailadres.');
          return;
        }
        const trainerId = newAccount.trainerId || selfId;
        const who = existing.displayName?.trim() || existing.email || mail;
        if (existing.trainerId !== trainerId) {
          await assignTrainerToSporter(existing.userId, trainerId);
          await profileCtx?.refreshProfile();
        }
        setMessage({ type: 'success', text: `${who} had al een account en is gekoppeld.` });
        setNewAccount(null);
        await load();
        return;
      }
      if (newAccount.password.length < 6) {
        setCreateError('Het tijdelijke wachtwoord moet minstens 6 tekens zijn.');
        return;
      }
      await auth.adminCreateAccount(mail, newAccount.password, newAccount.role, newAccount.displayName.trim() || null, {
        trainerId: newAccount.role === 'sporter' ? newAccount.trainerId || null : null,
      });
      const who = newAccount.displayName.trim() || mail;
      setMessage({
        type: 'success',
        text: `Account aangemaakt voor ${who} (${ROLE_LABEL[newAccount.role]}). Tijdelijk wachtwoord: ${newAccount.password} — geef dit door; e-mailverificatie is niet nodig en het wachtwoord kan later gewijzigd worden.`,
      });
      setNewAccount(null);
      await load();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Account aanmaken mislukt.');
    } finally {
      setCreating(false);
    }
  };

  const openEditor = (p: Profile) => {
    setTarget(p);
    setEdit(toEditState(p, memberships[p.userId]?.planId ?? ''));
    setMessage(null);
    setCreditValue(String(credits[p.userId] ?? 0));
    setCreditError(null);
  };

  const closeEditor = () => {
    setTarget(null);
    setEdit(null);
  };

  const handleCreditAdjust = async () => {
    if (!target) return;
    setCreditBusy(true);
    setCreditError(null);
    try {
      const nieuw = Number(creditValue);
      if (!Number.isInteger(nieuw) || nieuw < 0) throw new Error('Vul een geldig aantal credits in.');
      const delta = nieuw - (credits[target.userId] ?? 0);
      if (delta === 0) return;
      const result = await grantCredits(target.userId, delta);
      setCredits((prev) => ({ ...prev, [target.userId]: result.balance }));
      setCreditValue(String(result.balance));
    } catch (e) {
      setCreditError(e instanceof Error ? e.message : 'Credits aanpassen mislukt.');
    } finally {
      setCreditBusy(false);
    }
  };

  const handleSave = async () => {
    if (!target || !edit) return;
    setSaving(true);
    try {
      const roleChanged = edit.role !== target.role;
      await updateProfile(target.userId, {
        displayName: edit.displayName.trim() || null,
        ...(roleChanged ? { role: edit.role } : {}),
        trainerId: edit.role === 'sporter' ? edit.trainerId || null : null,
        heightCm: num(edit.heightCm),
        birthDate: edit.birthDate || null,
        gender: edit.gender || null,
        restingHrBpm: num(edit.restingHr),
        limitations: edit.limitations,
        weightGoalKg: num(edit.weightGoalKg),
        leaderboardVisibility: edit.leaderboardVisibility,
      });
      // Abonnement gewijzigd? Dat loopt via de server (saldo en grootboek in één keer).
      const hadPlan = memberships[target.userId]?.planId ?? '';
      if (edit.planId !== hadPlan) {
        if (edit.planId) await assignPlan(target.userId, edit.planId);
        else await unassignPlan(target.userId);
      }
      await load();
      await profileCtx?.refreshProfile();
      setMessage({ type: 'success', text: `Profiel van ${edit.displayName.trim() || target.email || 'gebruiker'} bijgewerkt.` });
      closeEditor();
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Opslaan mislukt.' });
    } finally {
      setSaving(false);
    }
  };

  const openDelete = () => {
    if (!target) return;
    setDeleteError(null);
    setDeleteTarget(target);
  };

  const closeDelete = () => {
    if (deleting) return;
    setDeleteTarget(null);
    setDeleteError(null);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || !auth?.user) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAccountAsAdmin(auth.user, deleteTarget.userId);
      const who = deleteTarget.displayName?.trim() || deleteTarget.email || 'gebruiker';
      setDeleteTarget(null);
      closeEditor();
      await load();
      setMessage({ type: 'success', text: `Account van ${who} definitief verwijderd.` });
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Verwijderen mislukt.');
    } finally {
      setDeleting(false);
    }
  };

  const canDeleteTarget = isAdmin && !!target && target.userId !== selfId;

  // Afgeleide waarden in de editor, live uit de formulierwaarden.
  const editAge = edit ? ageOnDate(edit.birthDate || null, todayIso()) : null;
  const editZones = edit ? heartRateZones(editAge, num(edit.restingHr)) : null;

  if (!isTrainer) {
    return (
      <PageLayout maxWidth={ADMIN_MAX_WIDTH}>
        <ContentCard>
          <Typography color="text.secondary">{t('admin.onlyStaff')}</Typography>
        </ContentCard>
      </PageLayout>
    );
  }

  // Kop naar het ontwerp: "Account toevoegen" rechts, daaronder de tabs.
  const header = (
    <>
      {/* De titel staat in de kop van de schil. Knoppen: op desktop rechts in die kop (Figma), op een
          telefoon boven de tabs. */}
      <HeaderActions>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 2, mb: { xs: 1.5, md: 0 } }}>
        {section === 'lessoorten' ? (
          <Button variant="contained" disableElevation startIcon={<AddRoundedIcon />} onClick={() => setNewTypeSignal((n) => n + 1)} sx={{ flexShrink: 0 }}>
            {t('classTypes.newType')}
          </Button>
        ) : section === 'abonnementen' ? (
          <Button variant="contained" disableElevation startIcon={<AddRoundedIcon />} onClick={() => setNewPlanSignal((n) => n + 1)} sx={{ flexShrink: 0 }}>
            {t('plans.newPlan')}
          </Button>
        ) : section === 'facturatie' ? (
          <Button variant="contained" disableElevation startIcon={<DownloadRoundedIcon />} onClick={() => setExportSignal((n) => n + 1)} sx={{ flexShrink: 0 }}>
            {t('billing.export')}
          </Button>
        ) : section === 'meldingen' ? null : section === 'leden' ? (
          <>
            <Button variant="contained" disableElevation startIcon={<PersonAddRoundedIcon />} onClick={openCreate} disabled={!auth} sx={{ flexShrink: 0 }}>
              {t('admin.addAccount')}
            </Button>
            <Button variant="outlined" startIcon={<UploadFileRoundedIcon />} onClick={() => setImportOpen(true)} disabled={!auth} sx={{ flexShrink: 0 }}>
              Leden importeren
            </Button>
          </>
        ) : (
          <Button variant="contained" disableElevation startIcon={<PersonAddRoundedIcon />} onClick={openCreate} disabled={!auth} sx={{ flexShrink: 0 }}>
            {t('admin.addAccount')}
          </Button>
        )}
      </Box>
      </HeaderActions>
      <SectionTabs sections={sections} value={section} onChange={setSection} />
    </>
  );

  if (section !== 'leden') {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
        <PageLayout maxWidth={ADMIN_MAX_WIDTH}>
          {header}
          {section === 'huisstijl' ? (
            <BrandingSettings />
          ) : section === 'lessoorten' ? (
            <ClassTypesPanel staff={trainers} createSignal={newTypeSignal} />
          ) : section === 'abonnementen' ? (
            <SubscriptionsPanel memberships={memberships} credits={credits} createSignal={newPlanSignal} onChanged={load} />
          ) : section === 'meldingen' ? (
            <NotificationsPanel canEditSettings={isAdmin} />
          ) : section === 'facturatie' ? (
            <BillingPanel profiles={profiles} memberships={memberships} plans={plans} selfId={selfId} exportSignal={exportSignal} />
          ) : (
            // Lessoorten, Abonnementen en Facturatie staan in het ontwerp en komen elk in hun eigen stap.
            <ContentCard>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
                {t(`admin.tabs.${SECTION_KEY[section]}`)}
              </Typography>
              <Typography color="text.secondary">{t('admin.comingSoon')}</Typography>
            </ContentCard>
          )}
        </PageLayout>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
    <PageLayout maxWidth={ADMIN_MAX_WIDTH}>
      {header}

      <RequestsBanner profiles={profiles} onChanged={load} />

      {/* Met veel leden: zoeken, filteren op rol en abonnement, sorteren (kolomkoppen of, op de telefoon, de keuzelijst). */}
      <MembersToolbar
        filter={memberFilter}
        onFilter={setMemberFilter}
        sort={memberSort}
        onSort={setMemberSort}
        plans={memberPlans}
        shown={visible.length}
        total={profiles.length}
      />
      {message && (
        <Alert severity={message.type} sx={{ mb: 2 }} onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

      <MembersList
        profiles={visible}
        credits={credits}
        memberships={memberships}
        selfId={selfId}
        loading={loading}
        hasAny={profiles.length > 0}
        onOpen={openEditor}
        sort={memberSort}
        onSort={setMemberSort}
      />

      <Dialog open={!!target && !!edit} onClose={closeEditor} maxWidth="sm" fullWidth fullScreen={fullScreen}>
        <DialogTitle>Profiel bewerken</DialogTitle>
        {edit && target && (
          <DialogContent>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
              <UserAvatar name={edit.displayName || target.displayName} photoURL={target.photoURL} size={48} />
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                  {target.email || target.userId}
                </Typography>
                {editAge != null && editZones && (
                  <Typography variant="caption" color="text.secondary">
                    {editAge} jaar · max {editZones.maxHr} bpm · Z2 {editZones.zones[1].lowBpm}–{editZones.zones[1].highBpm}
                    {editZones.method === 'percent-max' ? ' (zonder rusthartslag)' : ''}
                  </Typography>
                )}
              </Box>
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, pt: 0.5 }}>
              <TextField label="Naam" size="small" fullWidth autoFocus value={edit.displayName} onChange={(e) => setEdit({ ...edit, displayName: e.target.value })} sx={{ gridColumn: { sm: '1 / -1' } }} />
              <TextField
                select
                label="Rol"
                size="small"
                fullWidth
                value={edit.role}
                onChange={(e) => setEdit({ ...edit, role: e.target.value as ProfileRole })}
                disabled={target.userId === selfId}
                helperText={target.userId === selfId ? 'Je eigen rol wijzig je niet hier.' : ' '}
              >
                <MenuItem value="sporter">Sporter</MenuItem>
                <MenuItem value="trainer">Trainer</MenuItem>
                {(isAdmin || edit.role === 'admin') && <MenuItem value="admin">Beheerder</MenuItem>}
              </TextField>
              <TextField
                select
                label="Trainer"
                size="small"
                fullWidth
                value={edit.role === 'sporter' ? edit.trainerId || 'none' : 'none'}
                onChange={(e) => setEdit({ ...edit, trainerId: e.target.value === 'none' ? '' : e.target.value })}
                disabled={edit.role !== 'sporter'}
                helperText={edit.role !== 'sporter' ? 'Alleen voor sporters.' : ' '}
              >
                <MenuItem value="none">Geen trainer</MenuItem>
                {trainers.map((tr) => (
                  <MenuItem key={tr.userId} value={tr.userId}>
                    {tr.displayName?.trim() || tr.email || tr.userId}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                label={t('plans.membership')}
                size="small"
                fullWidth
                value={edit.planId}
                onChange={(e) => setEdit({ ...edit, planId: e.target.value })}
                disabled={edit.role !== 'sporter'}
                helperText={edit.role !== 'sporter' ? 'Alleen voor sporters.' : ' '}
                sx={{ gridColumn: { sm: '1 / -1' } }}
              >
                <MenuItem value="">{t('plans.none')}</MenuItem>
                {plans
                  .filter((pl) => pl.status === 'active' || pl.id === edit.planId)
                  .map((pl) => (
                    <MenuItem key={pl.id} value={pl.id}>
                      {pl.name}
                    </MenuItem>
                  ))}
              </TextField>
              {edit.role === 'sporter' && (
                <Box
                  sx={{
                    gridColumn: { sm: '1 / -1' },
                    p: 1.5,
                    borderRadius: `${designTokens.cardRadius}px`,
                    bgcolor: designTokens.cardBackgroundHigh,
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: 1.5,
                  }}
                >
                  <NumberField label="Credits" size="small" value={creditValue} onChange={setCreditValue} sx={{ width: 100 }} />
                  <Button size="small" variant="outlined" disabled={creditBusy || Number(creditValue) === (credits[target.userId] ?? 0)} onClick={() => void handleCreditAdjust()}>
                    Opslaan
                  </Button>
                  {creditError && (
                    <Typography variant="caption" color="error.main" sx={{ width: '100%' }}>
                      {creditError}
                    </Typography>
                  )}
                </Box>
              )}
              {/* Vaste lessen van dit lid: de trainer zet een klant vast in (bijv. elke zaterdag HIIT). */}
              {edit.role === 'sporter' && target.role === 'sporter' && (
                <Box sx={{ gridColumn: { sm: '1 / -1' }, p: 2, borderRadius: `${designTokens.cardRadius}px`, bgcolor: designTokens.cardBackgroundHigh }}>
                  <StandingBookingsCard
                    userId={target.userId}
                    asStaff
                    embedded
                    trainers={trainerOptions}
                    defaultTrainerId={edit.trainerId || null}
                  />
                </Box>
              )}
              <TextField label="Geboortedatum" type="date" size="small" fullWidth value={edit.birthDate} onChange={(e) => setEdit({ ...edit, birthDate: e.target.value })} InputLabelProps={{ shrink: true }} />
              <TextField select label="Geslacht" size="small" fullWidth value={edit.gender || 'none'} onChange={(e) => setEdit({ ...edit, gender: e.target.value === 'none' ? '' : (e.target.value as EditState['gender']) })}>
                <MenuItem value="none">Niet opgegeven</MenuItem>
                <MenuItem value="man">Man</MenuItem>
                <MenuItem value="vrouw">Vrouw</MenuItem>
                <MenuItem value="anders">Anders</MenuItem>
              </TextField>
              <NumberField label="Lengte (cm)" size="small" fullWidth value={edit.heightCm} onChange={(v) => setEdit({ ...edit, heightCm: v })} />
              {!edit.healthRefused && (
                <NumberField label="Rusthartslag (bpm)" size="small" fullWidth value={edit.restingHr} onChange={(v) => setEdit({ ...edit, restingHr: v })} />
              )}
              <NumberField label="Doelgewicht (kg)" decimal size="small" fullWidth value={edit.weightGoalKg} onChange={(v) => setEdit({ ...edit, weightGoalKg: v })} />
              {LEADERBOARD_ENABLED && (
                <TextField select label="Ranglijst" size="small" fullWidth value={edit.leaderboardVisibility} onChange={(e) => setEdit({ ...edit, leaderboardVisibility: e.target.value as LeaderboardVisibility })}>
                  <MenuItem value="named">Met naam</MenuItem>
                  <MenuItem value="anonymous">Anoniem</MenuItem>
                  <MenuItem value="hidden">Niet op de ranglijst</MenuItem>
                </TextField>
              )}
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
              Geboortedatum en geslacht zijn nodig voor het vetpercentage uit huidplooien; lengte voor BMI; rusthartslag voor hartslagzones op maat.
            </Typography>
            <Box sx={{ mt: 2 }}>
              {edit.healthRefused ? (
                <Typography variant="caption" color="text.secondary">
                  Dit lid heeft geen toestemming gegeven voor gezondheidsgegevens: rusthartslag en blessures worden niet bijgehouden.
                </Typography>
              ) : (
                <LimitationsEditor
                  value={edit.limitations}
                  onChange={(limitations) => setEdit({ ...edit, limitations })}
                  disabled={saving}
                />
              )}
            </Box>

            <HeartRateZonesTable
              zones={editZones}
              emptyText="Vul de geboortedatum in om de hartslagzones van deze sporter te zien. Met rusthartslag worden ze op maat berekend."
            />
          </DialogContent>
        )}
        <DialogActions sx={{ flexWrap: 'wrap', gap: 0.5 }}>
          {canDeleteTarget && (
            <Button color="error" startIcon={<DeleteOutlineRoundedIcon />} onClick={openDelete} disabled={saving} sx={{ mr: 'auto' }}>
              Verwijderen
            </Button>
          )}
          <Button onClick={closeEditor}>Annuleren</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {saving ? 'Bezig…' : 'Opslaan'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!deleteTarget} onClose={closeDelete} maxWidth="xs" fullWidth>
        <DialogTitle>Account verwijderen</DialogTitle>
        <DialogContent>
          {deleteError && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setDeleteError(null)}>
              {deleteError}
            </Alert>
          )}
          <Typography variant="body2">
            Weet je zeker dat je <strong>{deleteTarget?.displayName?.trim() || deleteTarget?.email || deleteTarget?.userId}</strong> definitief wilt
            verwijderen? Dit verwijdert zowel het login-account als het profiel en kan niet ongedaan worden gemaakt.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDelete} disabled={deleting}>
            Annuleren
          </Button>
          <Button variant="contained" color="error" onClick={handleConfirmDelete} disabled={deleting}>
            {deleting ? 'Bezig…' : 'Definitief verwijderen'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!newAccount} onClose={closeCreate} maxWidth="sm" fullWidth fullScreen={fullScreen}>
        <DialogTitle>Nieuw account</DialogTitle>
        {newAccount && (
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Maak direct een account aan met een tijdelijk wachtwoord. E-mailverificatie is niet nodig: de gebruiker kan meteen inloggen en
              jij kunt direct gegevens voor dit profiel bijhouden. Heeft deze sporter al een account? Dan wordt dat account gekoppeld.
            </Typography>
            {createError && (
              <Alert severity="error" sx={{ mb: 2 }} onClose={() => setCreateError(null)}>
                {createError}
              </Alert>
            )}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, pt: 0.5 }}>
              <TextField
                label="Naam"
                size="small"
                fullWidth
                autoFocus
                placeholder="Bijv. Jan Jansen"
                value={newAccount.displayName}
                onChange={(e) => setNewAccount({ ...newAccount, displayName: e.target.value })}
                sx={{ gridColumn: { sm: '1 / -1' } }}
              />
              <TextField
                label="E-mail"
                type="email"
                size="small"
                fullWidth
                placeholder="sporter@voorbeeld.nl"
                value={newAccount.email}
                onChange={(e) => setNewAccount({ ...newAccount, email: e.target.value })}
                inputProps={{ inputMode: 'email', autoCapitalize: 'none', autoCorrect: 'off' }}
                sx={{ gridColumn: { sm: '1 / -1' } }}
              />
              <TextField
                label="Tijdelijk wachtwoord"
                size="small"
                fullWidth
                value={newAccount.password}
                onChange={(e) => setNewAccount({ ...newAccount, password: e.target.value })}
                helperText="Min. 6 tekens. Geef dit door; de gebruiker kan het later wijzigen."
                inputProps={{ autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false }}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <Button size="small" onClick={() => setNewAccount({ ...newAccount, password: generatePassword() })} sx={{ minWidth: 0 }}>
                        Nieuw
                      </Button>
                    </InputAdornment>
                  ),
                }}
                sx={{ gridColumn: { sm: '1 / -1' } }}
              />
              <TextField
                select
                label="Rol"
                size="small"
                fullWidth
                value={newAccount.role}
                onChange={(e) => setNewAccount({ ...newAccount, role: e.target.value as NewAccountState['role'] })}
              >
                <MenuItem value="sporter">Sporter</MenuItem>
                <MenuItem value="trainer">Trainer</MenuItem>
                {isAdmin && <MenuItem value="admin">Beheerder</MenuItem>}
              </TextField>
              <TextField
                select
                label="Trainer"
                size="small"
                fullWidth
                value={newAccount.role === 'sporter' ? newAccount.trainerId || 'none' : 'none'}
                onChange={(e) => setNewAccount({ ...newAccount, trainerId: e.target.value === 'none' ? '' : e.target.value })}
                disabled={newAccount.role !== 'sporter'}
                helperText={newAccount.role !== 'sporter' ? 'Alleen voor sporters.' : ' '}
              >
                <MenuItem value="none">Geen trainer</MenuItem>
                {trainers.map((t) => (
                  <MenuItem key={t.userId} value={t.userId}>
                    {t.displayName?.trim() || t.email || t.userId}
                    {t.userId === selfId ? ' (ik)' : ''}
                  </MenuItem>
                ))}
              </TextField>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
              Geboortedatum, geslacht, lengte en rusthartslag vul je daarna in door op het profiel te tikken.
            </Typography>
          </DialogContent>
        )}
        <DialogActions>
          <Button onClick={closeCreate} disabled={creating}>
            Annuleren
          </Button>
          <Button variant="contained" startIcon={<PersonAddRoundedIcon />} onClick={handleCreate} disabled={creating}>
            {creating ? 'Bezig…' : 'Account aanmaken'}
          </Button>
        </DialogActions>
      </Dialog>

      <MemberImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        existingEmails={existingEmails}
        trainers={trainerOptions}
        defaultTrainerId={selfId}
        onImported={load}
      />
    </PageLayout>
    </Box>
  );
}

const SECTIONS: Section[] = ['leden', 'lessoorten', 'abonnementen', 'meldingen', 'huisstijl', 'facturatie'];
/** Wat een trainer ziet: de leden, en berichten sturen. De rest is aan de eigenaar. */
const STAFF_SECTIONS: Section[] = ['leden', 'meldingen'];
const SECTION_STORAGE_KEY = 'vorm.beheer.section';
const SECTION_KEY: Record<Section, 'members' | 'classTypes' | 'subscriptions' | 'branding' | 'billing' | 'notifications'> = {
  leden: 'members',
  lessoorten: 'classTypes',
  abonnementen: 'subscriptions',
  huisstijl: 'branding',
  facturatie: 'billing',
  meldingen: 'notifications',
};

/** De tabs uit het ontwerp. De eigenaar ziet ze allemaal; een trainer alleen Leden en Meldingen. */
function SectionTabs({ sections, value, onChange }: { sections: Section[]; value: Section; onChange: (v: Section) => void }) {
  const { t } = useI18n();
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up('md'));
  return (
    <Tabs
      value={value}
      onChange={(_, v: Section) => onChange(v)}
      aria-label={t('admin.title')}
      variant={wide ? 'fullWidth' : 'scrollable'}
      scrollButtons={false}
      allowScrollButtonsMobile
      sx={{ minHeight: 44, mb: 2, borderBottom: '1px solid', borderColor: 'divider', '& .MuiTab-root': { minHeight: 44, textTransform: 'none', fontWeight: 600, px: 2 } }}
    >
      {sections.map((sec) => (
        <Tab key={sec} value={sec} label={t(`admin.tabs.${SECTION_KEY[sec]}`)} />
      ))}
    </Tabs>
  );
}
