/**
 * Beheer: alle accounts en sporters op één plek. Aanvragen, sporters koppelen, accounts aanmaken,
 * profielen inzien en bijwerken (trainers en beheerders). Het lesrooster importeer je bij Workouts.
 * Zoeken, filteren op rol/volledigheid, per lid alle gegevens zien en bewerken op een eigen scherm,
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
  FormControlLabel,
  Switch,
  Chip,
} from '@mui/material';
import PersonAddRoundedIcon from '@mui/icons-material/PersonAddRounded';
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import PhoneRoundedIcon from '@mui/icons-material/PhoneRounded';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import { useShowBackButton } from '../context/TopBarBackContext';
import type { ReactNode } from 'react';
import { useProfile } from '../context/ProfileContext';
import { getOrg } from '../services/orgService';
import { RescheduleRequestsCard } from './beheer/RescheduleRequestsCard';
import { SubstitutesCard } from './beheer/SubstitutesCard';
import { useI18n } from '../context/I18nContext';
import { useAuth } from '../context/AuthContext';
import { assignTrainerToSporter, getAllProfiles, getProfileByEmail, updateProfile } from '../services/profileService';
import { deleteAccountAsAdmin, inviteMember, setMemberRole, updateMemberCredentials } from '../services/adminAccountService';
import type { LeaderboardVisibility, Membership, OrgBilling, Plan, Profile, ProfileRole, Limitation } from '../types';
import { PageLayout, ContentCard, HeaderActions } from './layout';
import { BrandingSettings } from './beheer/BrandingSettings';
import { StudioSettings } from './beheer/StudioSettings';
import { BusinessSettings } from './beheer/BusinessSettings';
import { UserAvatar } from './UserAvatar';
import { ageOnDate } from '../utils/bodyFat';
import { heartRateZones } from '../utils/heartRate';
import { HeartRateZonesTable } from './HeartRateZonesTable';
import { LimitationsEditor } from './LimitationsEditor';
import { todayIso } from '../utils/format';
import { firstPeriod } from '../utils/billingCycle';

/** "2 november" (zonder jaar); leeg bij een ongeldige datum. */
const longDay = (date: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T12:00:00`).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' }) : '';
import { RequestsBanner } from './beheer/RequestsBanner';
import { ProcessorAgreementCard } from './beheer/ProcessorAgreementCard';
import { InactiveChip, MembersList, RoleChip } from './beheer/MembersList';
import { isSupportEmail } from '../utils/support';
import { coverageLabel } from '../utils/planCoverage';
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
import { GroupsPanel } from './beheer/GroupsPanel';
import { BillingPanel } from './beheer/BillingPanel';
import { NotificationsPanel } from './beheer/NotificationsPanel';
import { WaitlistsPanel } from './beheer/WaitlistsPanel';
import { ClassPlanningPanel } from './beheer/ClassPlanningPanel';
import { ExerciseLibraryPanel } from './beheer/ExerciseLibraryPanel';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import { assignPlan, cancelScheduledPlan, getActiveMembershipsForOrg, getPlans, getScheduledMembershipsForOrg, renewDue, unassignPlan } from '../services/planService';
import { getCreditBalancesForOrg, grantCredits, setMemberActive, setTrainsAsMember } from '../services/classService';
import { paysAsMember } from '../utils/orgRoles';
import { NumberField } from './NumberField';
import { designTokens } from '../theme/designTokens';
import { EMAIL_RE, generatePassword } from '../utils/account';
import { MemberImportDialog } from './beheer/MemberImportDialog';
import { LEADERBOARD_ENABLED } from '../config/features';
import { tabsOverflowHintSx } from '../theme/tabs';

type Section = 'leden' | 'groepen' | 'lessoorten' | 'lesplanning' | 'oefeningen' | 'wachtlijsten' | 'abonnementen' | 'huisstijl' | 'instellingen' | 'facturatie' | 'meldingen';
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
  phone: string;
  /** E-mailadres (inloggen); staf wijzigt het hier direct. */
  email: string;
  street: string;
  zip: string;
  city: string;
  leaderboardVisibility: LeaderboardVisibility;
  limitations: Limitation[];
  /** Nee gezegd tegen gezondheidsgegevens: geen rusthartslag en blessures invullen. */
  healthRefused: boolean;
  /** Actief abonnement (planId), '' = geen. */
  planId: string;
  /** Trainer/beheerder traint ook mee als lid bij deze studio (credits, abonnement, facturen). */
  trainsAsMember: boolean;
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
    phone: p.phone ?? '',
    email: p.email ?? '',
    street: p.address?.street ?? '',
    zip: p.address?.zip ?? '',
    city: p.address?.city ?? '',
    leaderboardVisibility: p.leaderboardVisibility ?? 'named',
    limitations: p.limitations ?? [],
    healthRefused: p.healthConsent?.given === false,
    planId,
    trainsAsMember: !!p.trainsAsMember,
  };
}

function num(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Nederlands mobiel nummer naar het formaat van wa.me (alleen cijfers, met landcode). */
function whatsAppNumber(phone: string): string | null {
  const t = phone.trim();
  if (!t) return null;
  const digits = t.replace(/\D/g, '');
  if (!digits) return null;
  if (t.startsWith('+')) return digits;
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('0')) return `31${digits.slice(1)}`;
  return digits;
}

/** Kaart op het ledenscherm, zelfde stijl als de kaarten op Profiel. */
function DetailCard({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <Box sx={{ bgcolor: designTokens.cardBackground, borderRadius: `${designTokens.cardRadius}px`, px: { xs: 2, sm: 3 }, py: 2.5 }}>
      {title && (
        <Typography component="h2" sx={{ fontSize: 14, fontWeight: 500, lineHeight: '20px', mb: 1.5 }}>
          {title}
        </Typography>
      )}
      {children}
    </Box>
  );
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
  // Een trainer ziet alleen Leden, Lesplanning, Oefeningen, Wachtlijsten en Meldingen; een onthouden tab van de beheerder valt terug op Leden.
  const sections = isAdmin ? SECTIONS : STAFF_SECTIONS;
  const section: Section = sections.includes(storedSection) ? storedSection : 'leden';
  // Kop-knop op Lessoorten: elke klik telt op, het paneel opent dan een lege lessoort.
  const [newTypeSignal, setNewTypeSignal] = useState(0);

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [credits, setCredits] = useState<Record<string, number>>({});
  const [memberships, setMemberships] = useState<Record<string, Membership>>({});
  /** Abonnementen met een ingangsdatum later (nog geen factuur, nog geen credits). */
  const [scheduledPlans, setScheduledPlans] = useState<Record<string, Membership>>({});
  /** Ingangsdatum van een nieuw gekozen abonnement; vandaag = meteen. */
  const [planStart, setPlanStart] = useState(todayIso());
  const [plans, setPlans] = useState<Plan[]>([]);
  const [newPlanSignal, setNewPlanSignal] = useState(0);
  const [newGroupSignal, setNewGroupSignal] = useState(0);
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
  // Eigenaar van de studio, voor het label "Eigenaar" in de ledenlijst.
  const [ownerId, setOwnerId] = useState<string | null>(null);
  /** Factuurritme van de studio: de eerste factuur bij een nieuw abonnement is dan op maat. */
  const [billing, setBilling] = useState<OrgBilling | null>(null);
  const activeOrgId = profileCtx?.activeOrgId ?? null;
  useEffect(() => {
    if (!activeOrgId) return;
    let cancelled = false;
    getOrg(activeOrgId).then(
      (org) => {
        if (cancelled) return;
        setOwnerId(org?.ownerId ?? null);
        setBilling(org?.billing ?? null);
      },
      () => undefined
    );
    return () => {
      cancelled = true;
    };
  }, [activeOrgId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Eerst openstaande verlengingen laten verwerken (idempotent), dan pas saldo's en lidmaatschappen lezen.
      await renewDue().catch(() => null);
      const [list, balances, active, planList, scheduled] = await Promise.all([
        getAllProfiles(),
        getCreditBalancesForOrg().catch(() => ({})),
        getActiveMembershipsForOrg().catch(() => ({})),
        getPlans().catch(() => []),
        getScheduledMembershipsForOrg().catch(() => ({})),
      ]);
      list.sort((a, b) =>
        (a.displayName || a.email || a.userId).localeCompare(b.displayName || b.email || b.userId, undefined, { sensitivity: 'base' })
      );
      setProfiles(list);
      setCredits(balances);
      setMemberships(active);
      setScheduledPlans(scheduled);
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
      // Heeft dit e-mailadres een account bij een andere studio? Dan een uitnodiging: het lid
      // beslist zelf of het er bij deze studio bij komt. Eén account, meerdere studio's.
      if (auth.user) {
        const invite = await inviteMember(auth.user, mail, newAccount.role);
        if (invite.status !== 'no-account') {
          setMessage({
            type: 'success',
            text:
              invite.status === 'already-member'
                ? `${mail} hoort al bij deze studio.`
                : `${mail} heeft al een VORM-account. Er is een uitnodiging verstuurd; zodra die is geaccepteerd, staat deze persoon in je ledenlijst.`,
          });
          setNewAccount(null);
          await load();
          return;
        }
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

  // Een lid openen is een eigen scherm: terug (pijl in de bovenbalk, veeggebaar, Android-terugknop,
  // of "Leden") brengt je naar de ledenlijst.
  const openEditor = (p: Profile) => {
    setTarget(p);
    setEdit(toEditState(p, memberships[p.userId]?.planId ?? ''));
    setPlanStart(todayIso());
    setMessage(null);
    setCreditValue(String(credits[p.userId] ?? 0));
    setCreditError(null);
    window.history.pushState({ liftlogMember: p.userId }, '');
    window.scrollTo({ top: 0 });
  };

  const closeEditor = () => {
    if ((window.history.state as { liftlogMember?: string } | null)?.liftlogMember) {
      window.history.back();
      return;
    }
    setTarget(null);
    setEdit(null);
  };

  const memberOpen = !!target;
  useShowBackButton(memberOpen);
  useEffect(() => {
    if (!memberOpen) return;
    const onPop = () => {
      setTarget(null);
      setEdit(null);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [memberOpen]);

  // Na opslaan of (de)activeren de nieuwste gegevens van dit lid tonen, zonder het formulier te wissen.
  useEffect(() => {
    if (!target) return;
    const fresh = profiles.find((p) => p.userId === target.userId);
    if (fresh && fresh !== target) setTarget(fresh);
  }, [profiles, target]);

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
      // E-mailadres (inloggen) loopt via de server: account en profiel samen.
      const newEmail = edit.email.trim().toLowerCase();
      if (newEmail && newEmail !== (target.email ?? '').toLowerCase()) {
        if (!auth?.user) throw new Error('Je bent niet ingelogd.');
        await updateMemberCredentials(auth.user, target.userId, { email: newEmail });
      }
      const roleChanged = edit.role !== target.role;
      // De rol geldt per studio en loopt via de server.
      if (roleChanged) {
        if (!auth?.user) throw new Error('Je bent niet ingelogd.');
        await setMemberRole(auth.user, target.userId, edit.role);
      }
      // Hoort dit lid (ook) bij een andere thuisstudio, dan beheert die studio (of het lid zelf) de
      // profielgegevens; hier alleen rol en abonnement.
      if (target.orgId === profileCtx?.activeOrgId) await updateProfile(target.userId, {
        displayName: edit.displayName.trim() || null,
        trainerId: paysAsMember(edit) ? edit.trainerId || null : null,
        heightCm: num(edit.heightCm),
        birthDate: edit.birthDate || null,
        gender: edit.gender || null,
        restingHrBpm: num(edit.restingHr),
        limitations: edit.limitations,
        weightGoalKg: num(edit.weightGoalKg),
        phone: edit.phone.trim() || null,
        address:
          edit.street.trim() || edit.zip.trim() || edit.city.trim()
            ? { street: edit.street.trim() || null, zip: edit.zip.trim().toUpperCase() || null, city: edit.city.trim() || null }
            : null,
        leaderboardVisibility: edit.leaderboardVisibility,
      });
      // Abonnement gewijzigd? Dat loopt via de server (saldo en grootboek in één keer).
      const hadPlan = memberships[target.userId]?.planId ?? '';
      if (edit.planId !== hadPlan) {
        if (edit.planId) await assignPlan(target.userId, edit.planId, planStart > todayIso() ? planStart : undefined);
        else await unassignPlan(target.userId);
        setPlanStart(todayIso());
      }
      // Meetrainen als lid (staf): na het abonnement, want uitzetten kan pas zonder abonnement.
      if (edit.role !== 'sporter' && edit.trainsAsMember !== !!target.trainsAsMember) {
        await setTrainsAsMember(target.userId, edit.trainsAsMember);
      }
      await load();
      await profileCtx?.refreshProfile();
      setMessage({ type: 'success', text: `Profiel van ${edit.displayName.trim() || target.email || 'gebruiker'} bijgewerkt.` });
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Opslaan mislukt.' });
    } finally {
      setSaving(false);
    }
  };

  /** Een gepland abonnement (nog niet ingegaan) annuleren; het huidige blijft. */
  const handleCancelScheduled = async () => {
    if (!target) return;
    setSaving(true);
    try {
      await cancelScheduledPlan(target.userId);
      await load();
      setMessage({ type: 'success', text: 'Geplande start geannuleerd.' });
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Annuleren mislukt.' });
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

  /** Lid (de)activeren: eerst bevestigen, want deactiveren meldt komende lessen af en stopt het abonnement. */
  const [statusTarget, setStatusTarget] = useState<Profile | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const handleConfirmStatus = async () => {
    if (!statusTarget) return;
    const activate = !!statusTarget.inactive;
    setStatusBusy(true);
    setStatusError(null);
    try {
      const r = await setMemberActive(statusTarget.userId, activate);
      const who = statusTarget.displayName?.trim() || statusTarget.email || 'lid';
      setStatusTarget(null);
      closeEditor();
      await load();
      setMessage({
        type: 'success',
        text: activate
          ? `${who} is weer actief${r.standingRestored ? `; ${r.standingRestored} vaste les${r.standingRestored === 1 ? '' : 'sen'} staan weer aan` : ''}. Ken zo nodig opnieuw een abonnement toe.`
          : `${who} staat op inactief${r.bookingsCancelled ? `; ${r.bookingsCancelled} komende les${r.bookingsCancelled === 1 ? '' : 'sen'} afgemeld` : ''}${r.membershipStopped ? ', abonnement gestopt' : ''}.`,
      });
    } catch (e) {
      setStatusError(e instanceof Error ? e.message : 'Wijzigen mislukt.');
    } finally {
      setStatusBusy(false);
    }
  };

  // Afgeleide waarden in de editor, live uit de formulierwaarden.
  const editAge = edit ? ageOnDate(edit.birthDate || null, todayIso()) : null;
  const editZones = edit ? heartRateZones(editAge, num(edit.restingHr)) : null;

  const editDirty =
    !!target && !!edit && JSON.stringify(edit) !== JSON.stringify(toEditState(target, memberships[target.userId]?.planId ?? ''));

  // Het scherm van één lid: alles zien en bijwerken. Bovenaan naam en contact (bellen, WhatsApp,
  // mail met één tik), daaronder de kaarten zoals op Profiel.
  const memberDetail =
    target && edit ? (
      <Box>
        {message && (
          <Alert severity={message.type} sx={{ mb: 2 }} onClose={() => setMessage(null)}>
            {message.text}
          </Alert>
        )}

        {/* Kop en opslaan op één regel; terug naar de ledenlijst met de pijl in de bovenbalk. */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3, flexWrap: 'wrap' }}>
          <UserAvatar name={edit.displayName || target.displayName} photoURL={target.photoURL} size={72} />
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="h5" sx={{ fontWeight: 500, overflowWrap: 'anywhere' }}>
              {target.displayName?.trim() || target.email || target.userId}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
              <RoleChip role={target.role} owner={target.userId === ownerId} support={isSupportEmail(target.email)} />
              {target.inactive && <InactiveChip />}
              <Typography variant="body2" color="text.secondary">
                {[
                  target.memberSince
                    ? `Lid sinds ${new Date(`${target.memberSince}T12:00:00`).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}`
                    : null,
                  editAge != null ? `${editAge} jaar` : null,
                  paysAsMember(target) ? t('admin.creditsLeft', { count: credits[target.userId] ?? 0 }) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Typography>
            </Box>
            <Box sx={{ display: target.phone ? 'flex' : 'none', gap: 1, flexWrap: 'wrap', mt: 1.5 }}>
              {target.phone && (
                <Chip icon={<PhoneRoundedIcon />} label={target.phone} component="a" href={`tel:${target.phone.replace(/\s/g, '')}`} clickable variant="outlined" />
              )}
              {target.phone && whatsAppNumber(target.phone) && (
                <Chip
                  icon={<WhatsAppIcon />}
                  label="WhatsApp"
                  component="a"
                  href={`https://wa.me/${whatsAppNumber(target.phone)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  clickable
                  variant="outlined"
                />
              )}
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, ml: 'auto', alignSelf: { xs: 'stretch', sm: 'center' }, justifyContent: 'flex-end' }}>
            <Button onClick={() => setEdit(toEditState(target, memberships[target.userId]?.planId ?? ''))} disabled={!editDirty || saving}>
              Wijzigingen ongedaan
            </Button>
            <Button variant="contained" disableElevation onClick={handleSave} disabled={saving || !editDirty}>
              {saving ? 'Bezig…' : 'Opslaan'}
            </Button>
          </Box>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 2, alignItems: 'start' }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <DetailCard title="Contactgegevens">
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                <TextField label="Naam" size="small" fullWidth value={edit.displayName} onChange={(e) => setEdit({ ...edit, displayName: e.target.value })} sx={{ gridColumn: { sm: '1 / -1' } }} />
                <TextField label="Telefoon" size="small" fullWidth value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} inputProps={{ inputMode: 'tel' }} />
                <TextField
                  label="E-mail"
                  size="small"
                  fullWidth
                  type="email"
                  value={edit.email}
                  onChange={(e) => setEdit({ ...edit, email: e.target.value })}
                  helperText={edit.email.trim().toLowerCase() !== (target.email ?? '').toLowerCase() ? 'Hiermee logt het lid voortaan in.' : ' '}
                />
                <TextField label="Adres" size="small" fullWidth value={edit.street} onChange={(e) => setEdit({ ...edit, street: e.target.value })} sx={{ gridColumn: { sm: '1 / -1' } }} />
                <TextField label="Postcode" size="small" fullWidth value={edit.zip} onChange={(e) => setEdit({ ...edit, zip: e.target.value })} />
                <TextField label="Plaats" size="small" fullWidth value={edit.city} onChange={(e) => setEdit({ ...edit, city: e.target.value })} />
              </Box>
            </DetailCard>

            <DetailCard title="Persoonlijke gegevens">
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                <TextField label="Geboortedatum" type="date" size="small" fullWidth value={edit.birthDate} onChange={(e) => setEdit({ ...edit, birthDate: e.target.value })} InputLabelProps={{ shrink: true }} />
                <TextField select label="Geslacht" size="small" fullWidth value={edit.gender || 'none'} onChange={(e) => setEdit({ ...edit, gender: e.target.value === 'none' ? '' : (e.target.value as EditState['gender']) })}>
                  <MenuItem value="none">Niet opgegeven</MenuItem>
                  <MenuItem value="man">Man</MenuItem>
                  <MenuItem value="vrouw">Vrouw</MenuItem>
                  <MenuItem value="anders">Anders</MenuItem>
                </TextField>
                <NumberField label="Lengte (cm)" size="small" fullWidth value={edit.heightCm} onChange={(v) => setEdit({ ...edit, heightCm: v })} />
                <NumberField label="Doelgewicht (kg)" decimal size="small" fullWidth value={edit.weightGoalKg} onChange={(v) => setEdit({ ...edit, weightGoalKg: v })} />
                {!edit.healthRefused && (
                  <NumberField label="Rusthartslag (bpm)" size="small" fullWidth value={edit.restingHr} onChange={(v) => setEdit({ ...edit, restingHr: v })} />
                )}
                {LEADERBOARD_ENABLED && (
                  <TextField select label="Ranglijst" size="small" fullWidth value={edit.leaderboardVisibility} onChange={(e) => setEdit({ ...edit, leaderboardVisibility: e.target.value as LeaderboardVisibility })}>
                    <MenuItem value="named">Met naam</MenuItem>
                    <MenuItem value="anonymous">Anoniem</MenuItem>
                    <MenuItem value="hidden">Niet op de ranglijst</MenuItem>
                  </TextField>
                )}
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
                Geboortedatum en geslacht zijn nodig voor het vetpercentage uit huidplooien; lengte voor BMI; rusthartslag voor hartslagzones op maat.
              </Typography>
            </DetailCard>

            <DetailCard>
              <HeartRateZonesTable
                bare
                zones={editZones}
                emptyText="Vul de geboortedatum in om de hartslagzones van deze sporter te zien. Met rusthartslag worden ze op maat berekend."
              />
            </DetailCard>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <DetailCard title="Rol en trainer">
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
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
                  value={paysAsMember(edit) ? edit.trainerId || 'none' : 'none'}
                  onChange={(e) => setEdit({ ...edit, trainerId: e.target.value === 'none' ? '' : e.target.value })}
                  disabled={!paysAsMember(edit)}
                  helperText={!paysAsMember(edit) ? 'Alleen voor wie als lid traint.' : ' '}
                >
                  <MenuItem value="none">Geen trainer</MenuItem>
                  {trainers.map((tr) => (
                    <MenuItem key={tr.userId} value={tr.userId}>
                      {tr.displayName?.trim() || tr.email || tr.userId}
                    </MenuItem>
                  ))}
                </TextField>
              </Box>
              {/* Staf die zelf ook lessen volgt: betaalt dan credits en krijgt abonnement en facturen. */}
              {edit.role !== 'sporter' && (isAdmin || edit.trainsAsMember) && (
                <Box>
                  <FormControlLabel
                    control={<Switch checked={edit.trainsAsMember} disabled={!isAdmin} onChange={(e) => setEdit({ ...edit, trainsAsMember: e.target.checked })} />}
                    label="Traint ook mee als lid"
                  />
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {edit.trainsAsMember
                      ? 'Boeken kost credits, en abonnement en facturen werken zoals bij een sporter.'
                      : 'Uit: boekt gratis mee als trainer, zonder abonnement of facturen.'}
                  </Typography>
                </Box>
              )}
            </DetailCard>

            <DetailCard title="Abonnement en credits">
              <TextField
                select
                label={t('plans.membership')}
                size="small"
                fullWidth
                value={edit.planId}
                onChange={(e) => setEdit({ ...edit, planId: e.target.value })}
                // Een lopend abonnement kun je altijd nog stoppen (nodig voordat meetrainen uit kan).
                disabled={!paysAsMember(edit) && !edit.planId}
                helperText={!paysAsMember(edit) ? (edit.planId ? 'Zet op geen abonnement om meetrainen uit te zetten.' : 'Alleen voor wie als lid traint.') : ' '}
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
              {scheduledPlans[target.userId] && (
                <Alert
                  severity="info"
                  sx={{ mb: 1 }}
                  action={
                    <Button color="inherit" size="small" disabled={saving} onClick={() => void handleCancelScheduled()}>
                      Annuleren
                    </Button>
                  }
                >
                  Gepland: {scheduledPlans[target.userId].planName} gaat in op {longDay(scheduledPlans[target.userId].startsOn ?? '')}. Dan pas de eerste
                  factuur en de credits.
                </Alert>
              )}
              {(() => {
                // Zeg vooraf wat Opslaan doet: credits van de eerste periode erbij en de eerste factuur.
                const chosen = edit.planId && edit.planId !== (memberships[target.userId]?.planId ?? '') ? plans.find((pl) => pl.id === edit.planId) : null;
                if (!chosen) return null;
                const later = planStart > todayIso();
                // Factureert de studio op een vast ritme, dan is de eerste periode op maat (tot de factuurdatum).
                const first = firstPeriod(chosen, billing, later ? planStart : todayIso());
                const credits = first ? first.credits : chosen.credits;
                const amount = first ? first.amount : chosen.price;
                const parts = [
                  credits == null ? 'onbeperkt boeken' : `+${credits} credits`,
                  amount > 0 ? `eerste factuur € ${amount.toLocaleString('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}` : null,
                ].filter(Boolean);
                const until = first && !first.full ? new Date(`${first.until}T12:00:00`).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' }) : null;
                return (
                  <>
                    {/* Ingangsdatum: vandaag = meteen; later = tot dan geen factuur en geen credits uit dit abonnement. */}
                    <TextField
                      size="small"
                      type="date"
                      label="Gaat in op"
                      value={planStart}
                      onChange={(e) => setPlanStart(e.target.value || todayIso())}
                      InputLabelProps={{ shrink: true }}
                      inputProps={{ min: todayIso() }}
                      sx={{ mb: 1.5, maxWidth: 220 }}
                    />
                    <Alert severity="info" sx={{ mb: 1 }}>
                      {later ? `Op ${longDay(planStart)}` : 'Na Opslaan'}: {parts.join(' en ')}
                      {first && until ? ` (${first.days} van de ${first.totalDays} dagen, tot de factuurdatum ${until})` : ''}. {coverageLabel(chosen)}.
                      {later
                        ? ` Tot dan geen factuur en geen credits uit dit abonnement${memberships[target.userId] ? '; het huidige abonnement loopt door' : ''}. Wil je nu al inplannen, geef dan zelf credits.`
                        : ''}
                    </Alert>
                  </>
                );
              })()}
              {paysAsMember(edit) && (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5, mt: 1 }}>
                  <NumberField label="Credits" size="small" value={creditValue} onChange={setCreditValue} sx={{ width: 120 }} />
                  <Button size="small" variant="outlined" disabled={creditBusy || Number(creditValue) === (credits[target.userId] ?? 0)} onClick={() => void handleCreditAdjust()}>
                    Credits opslaan
                  </Button>
                  {creditError && (
                    <Typography variant="caption" color="error.main" sx={{ width: '100%' }}>
                      {creditError}
                    </Typography>
                  )}
                </Box>
              )}
            </DetailCard>

            {/* Vaste lessen van dit lid: de trainer zet een klant vast in (bijv. elke zaterdag HIIT). */}
            {paysAsMember(edit) && paysAsMember(target) && (
              <Box sx={{ bgcolor: designTokens.cardBackground, borderRadius: `${designTokens.cardRadius}px`, px: { xs: 2, sm: 3 }, py: 2.5 }}>
                <StandingBookingsCard userId={target.userId} asStaff embedded trainers={trainerOptions} defaultTrainerId={edit.trainerId || null} />
              </Box>
            )}

            {/* De editor heeft zijn eigen kop "Bijzonderheden". */}
            <DetailCard title={edit.healthRefused ? 'Bijzonderheden' : undefined}>
              {edit.healthRefused ? (
                <Typography variant="body2" color="text.secondary">
                  Dit lid heeft geen toestemming gegeven voor gezondheidsgegevens: rusthartslag en blessures worden niet bijgehouden.
                </Typography>
              ) : (
                <LimitationsEditor value={edit.limitations} onChange={(limitations) => setEdit({ ...edit, limitations })} disabled={saving} />
              )}
            </DetailCard>

            {canDeleteTarget && (
              <DetailCard title="Account">
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                  {target.inactive
                    ? 'Dit lid staat op inactief: kan niet boeken. Activeren zet de vaste lessen weer aan.'
                    : 'Deactiveren meldt komende lessen af en stopt het abonnement; de geschiedenis blijft. Verwijderen wist het account definitief.'}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Button
                    variant="outlined"
                    onClick={() => {
                      setStatusError(null);
                      setStatusTarget(target);
                    }}
                    disabled={saving}
                  >
                    {target.inactive ? 'Activeren' : 'Deactiveren'}
                  </Button>
                  <Button color="error" startIcon={<DeleteOutlineRoundedIcon />} onClick={openDelete} disabled={saving}>
                    Verwijderen
                  </Button>
                </Box>
              </DetailCard>
            )}
          </Box>
        </Box>

        {/* Telefoon: opslaan ook onderaan, na het scrollen door alle kaarten. */}
        <Box sx={{ display: { xs: 'flex', lg: 'none' }, justifyContent: 'flex-end', gap: 1, mt: 2 }}>
          <Button variant="contained" disableElevation onClick={handleSave} disabled={saving || !editDirty}>
            {saving ? 'Bezig…' : 'Opslaan'}
          </Button>
        </Box>
      </Box>
    ) : null;

  if (!isTrainer) {
    return (
      <PageLayout maxWidth={ADMIN_MAX_WIDTH}>
        <ContentCard>
          <Typography color="text.secondary">{t('admin.onlyStaff')}</Typography>
        </ContentCard>
      </PageLayout>
    );
  }

  // Kop naar het ontwerp: de acties van de tab rechts in de kop (desktop), de tabs eronder.
  const actions =
    section === 'lessoorten' ? (
      <Button variant="contained" disableElevation startIcon={<AddRoundedIcon />} onClick={() => setNewTypeSignal((n) => n + 1)} sx={{ flexShrink: 0 }}>
        {t('classTypes.newType')}
      </Button>
    ) : section === 'groepen' ? (
      <Button variant="contained" disableElevation startIcon={<AddRoundedIcon />} onClick={() => setNewGroupSignal((n) => n + 1)} sx={{ flexShrink: 0 }}>
        Groep toevoegen
      </Button>
    ) : section === 'abonnementen' ? (
      <Button variant="contained" disableElevation startIcon={<AddRoundedIcon />} onClick={() => setNewPlanSignal((n) => n + 1)} sx={{ flexShrink: 0 }}>
        {t('plans.newPlan')}
      </Button>
    ) : section === 'facturatie' ? (
      <Button variant="contained" disableElevation startIcon={<DownloadRoundedIcon />} onClick={() => setExportSignal((n) => n + 1)} sx={{ flexShrink: 0 }}>
        {t('billing.export')}
      </Button>
    ) : section === 'leden' ? (
      <>
        <Button variant="contained" disableElevation startIcon={<PersonAddRoundedIcon />} onClick={openCreate} disabled={!auth} sx={{ flexShrink: 0 }}>
          {t('admin.addAccount')}
        </Button>
        <Button variant="outlined" startIcon={<UploadFileRoundedIcon />} onClick={() => setImportOpen(true)} disabled={!auth} sx={{ flexShrink: 0 }}>
          Leden importeren
        </Button>
      </>
    ) : null; // Meldingen, Huisstijl en Instellingen: de acties staan in de kaarten zelf.
  const header = (
    <>
      {/* Telefoon: eerst de tabs, dan pas de knoppen. Zo staan de tabs op elke tab op dezelfde plek
          (sommige tabs hebben geen knoppen) in plaats van op en neer te springen. Desktop: de knoppen
          staan rechts in de kop van de schil (Figma). */}
      <SectionTabs sections={sections} value={section} onChange={setSection} />
      {actions && (
        <HeaderActions>
          {/* flexWrap: op een smalle telefoon komt "Leden importeren" onder "Account toevoegen" in plaats van buiten beeld. */}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-start', gap: { xs: 1, md: 2 }, mb: { xs: 2, md: 0 } }}>
            {actions}
          </Box>
        </HeaderActions>
      )}
    </>
  );

  if (section !== 'leden') {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
        <PageLayout maxWidth={ADMIN_MAX_WIDTH}>
          {header}
          {section === 'huisstijl' ? (
            <BrandingSettings />
          ) : section === 'instellingen' ? (
            <StudioSettings />
          ) : section === 'lessoorten' ? (
            <ClassTypesPanel staff={trainers} profiles={profiles} profilesLoading={loading} createSignal={newTypeSignal} />
          ) : section === 'lesplanning' ? (
            <ClassPlanningPanel profiles={profiles} selfId={selfId} />
          ) : section === 'oefeningen' ? (
            <ExerciseLibraryPanel />
          ) : section === 'wachtlijsten' ? (
            <WaitlistsPanel profiles={profiles} credits={credits} memberships={memberships} plans={plans} onChanged={load} />
          ) : section === 'groepen' ? (
            <GroupsPanel profiles={profiles} plans={plans} memberships={memberships} credits={credits} createSignal={newGroupSignal} onChanged={load} />
          ) : section === 'abonnementen' ? (
            <SubscriptionsPanel memberships={memberships} credits={credits} createSignal={newPlanSignal} onChanged={load} />
          ) : section === 'meldingen' ? (
            <NotificationsPanel canEditSettings={isAdmin} />
          ) : section === 'facturatie' ? (
            <>
              <BillingPanel profiles={profiles} memberships={memberships} plans={plans} selfId={selfId} exportSignal={exportSignal} />
              {/* Wat er op de factuur staat en hoe er betaald wordt, onder de posten zelf. */}
              <Typography variant="h6" sx={{ fontWeight: 600, mt: 4, mb: 1.5 }}>
                Factuurgegevens en betalen
              </Typography>
              <BusinessSettings />
            </>
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
      {memberDetail ?? (
        <>
          {header}

          <RequestsBanner profiles={profiles} onChanged={load} />
          <RescheduleRequestsCard />
          <SubstitutesCard />
          {isAdmin && <ProcessorAgreementCard variant="banner" />}

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
            ownerId={ownerId}
          />
        </>
      )}


      <Dialog open={!!statusTarget} onClose={() => !statusBusy && setStatusTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{statusTarget?.inactive ? 'Lid activeren' : 'Lid deactiveren'}</DialogTitle>
        <DialogContent>
          {statusError && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setStatusError(null)}>
              {statusError}
            </Alert>
          )}
          {statusTarget?.inactive ? (
            <Typography variant="body2">
              <strong>{statusTarget.displayName?.trim() || statusTarget.email}</strong> kan weer lessen boeken. Vaste lessen die bij het
              deactiveren uit gingen, staan weer aan. Een abonnement ken je daarna zelf opnieuw toe.
            </Typography>
          ) : (
            <Typography variant="body2" component="div">
              <strong>{statusTarget?.displayName?.trim() || statusTarget?.email}</strong> wordt inactief bij deze studio:
              <ul style={{ margin: '8px 0', paddingLeft: 20 }}>
                <li>kan niet meer boeken of een abonnement kopen;</li>
                <li>komende lessen en wachtlijstplekken worden afgemeld;</li>
                <li>vaste lessen gaan uit en het abonnement stopt (geen facturen meer);</li>
                <li>krijgt geen berichten meer van de studio.</li>
              </ul>
              Het account, de trainingen, metingen en facturen blijven bewaard. Je kunt het lid altijd weer activeren.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStatusTarget(null)} disabled={statusBusy}>
            Annuleren
          </Button>
          <Button variant="contained" onClick={() => void handleConfirmStatus()} disabled={statusBusy}>
            {statusBusy ? 'Bezig…' : statusTarget?.inactive ? 'Activeren' : 'Deactiveren'}
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
        existingMembers={profiles}
        plans={plans}
        trainers={trainerOptions}
        defaultTrainerId={selfId}
        onImported={() => {
          void load();
          // Ook "Bekijk als" en de sporterslijsten elders kennen de nieuwe leden meteen.
          void profileCtx?.refreshProfile();
        }}
      />
    </PageLayout>
    </Box>
  );
}

const SECTIONS: Section[] = ['leden', 'groepen', 'lessoorten', 'lesplanning', 'oefeningen', 'wachtlijsten', 'abonnementen', 'meldingen', 'facturatie', 'huisstijl', 'instellingen'];
/** Wat een trainer ziet: de leden, de lesplanning, de oefeningen, de wachtlijsten en berichten sturen. De rest is aan de eigenaar. */
const STAFF_SECTIONS: Section[] = ['leden', 'lesplanning', 'oefeningen', 'wachtlijsten', 'meldingen'];
const SECTION_STORAGE_KEY = 'vorm.beheer.section';
const SECTION_KEY: Record<
  Section,
  'members' | 'groups' | 'classTypes' | 'classPlanning' | 'exercises' | 'waitlists' | 'subscriptions' | 'branding' | 'settings' | 'billing' | 'notifications'
> = {
  leden: 'members',
  groepen: 'groups',
  lessoorten: 'classTypes',
  lesplanning: 'classPlanning',
  oefeningen: 'exercises',
  wachtlijsten: 'waitlists',
  abonnementen: 'subscriptions',
  huisstijl: 'branding',
  instellingen: 'settings',
  facturatie: 'billing',
  meldingen: 'notifications',
};

/** De tabs uit het ontwerp. De eigenaar ziet ze allemaal; een trainer alleen Leden, Lesplanning, Oefeningen, Wachtlijsten en Meldingen. */
function SectionTabs({ sections, value, onChange }: { sections: Section[]; value: Section; onChange: (v: Section) => void }) {
  const { t } = useI18n();
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up('md'));
  return (
    <Tabs
      value={value}
      onChange={(_, v: Section) => onChange(v)}
      aria-label={t('admin.title')}
      // Past alles naast elkaar, dan over de hele breedte; met meer tabs (eigenaar) schuifbaar, anders
      // worden lange namen als "Abonnementen" afgekapt.
      variant={wide && sections.length <= 10 ? 'fullWidth' : 'scrollable'}
      scrollButtons={false}
      allowScrollButtonsMobile
      sx={{
          ...(!wide || sections.length > 10 ? tabsOverflowHintSx : {}), minHeight: 44, mb: 2, borderBottom: '1px solid', borderColor: 'divider', '& .MuiTab-root': { minHeight: 44, textTransform: 'none', fontWeight: 600, px: 2 } }}
    >
      {sections.map((sec) => (
        <Tab key={sec} value={sec} label={t(`admin.tabs.${SECTION_KEY[sec]}`)} />
      ))}
    </Tabs>
  );
}
