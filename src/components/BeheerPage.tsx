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
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import PersonAddRoundedIcon from '@mui/icons-material/PersonAddRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import { useProfile } from '../context/ProfileContext';
import { useI18n } from '../context/I18nContext';
import { useAuth } from '../context/AuthContext';
import { getAllProfiles, updateProfile } from '../services/profileService';
import { deleteAccountAsAdmin } from '../services/adminAccountService';
import type { LeaderboardVisibility, Profile, ProfileRole, Limitation } from '../types';
import { PageLayout, ContentCard } from './layout';
import { BrandingSettings } from './beheer/BrandingSettings';
import { UserAvatar } from './UserAvatar';
import { ageOnDate } from '../utils/bodyFat';
import { heartRateZones } from '../utils/heartRate';
import { HeartRateZonesTable } from './HeartRateZonesTable';
import { LimitationsEditor } from './LimitationsEditor';
import { todayIso } from '../utils/format';
import { RequestsBanner } from './beheer/RequestsBanner';
import { MembersList } from './beheer/MembersList';
import { ClassTypesPanel } from './beheer/ClassTypesPanel';
import { getCreditBalancesForOrg } from '../services/classService';
import { AddSporterByEmailCard } from './beheer/AddSporterByEmailCard';
import { NumberField } from './NumberField';
import { designTokens } from '../theme/designTokens';

type Section = 'leden' | 'lessoorten' | 'abonnementen' | 'huisstijl' | 'facturatie';
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
}

function toEditState(p: Profile): EditState {
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
  };
}

function num(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Formulier voor een nieuw account (aangemaakt door trainer/beheerder). */
interface NewAccountState {
  displayName: string;
  email: string;
  password: string;
  role: 'sporter' | 'trainer';
  trainerId: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Willekeurig, makkelijk over te typen tijdelijk wachtwoord (zonder verwarrende tekens). */
function generatePassword(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint32Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
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
  const [section, setSection] = useState<Section>('leden');
  // Kop-knop op Lessoorten: elke klik telt op, het paneel opent dan een lege lessoort.
  const [newTypeSignal, setNewTypeSignal] = useState(0);

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [credits, setCredits] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [target, setTarget] = useState<Profile | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [newAccount, setNewAccount] = useState<NewAccountState | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, balances] = await Promise.all([getAllProfiles(), getCreditBalancesForOrg().catch(() => ({}))]);
      list.sort((a, b) =>
        (a.displayName || a.email || a.userId).localeCompare(b.displayName || b.email || b.userId, undefined, { sensitivity: 'base' })
      );
      setProfiles(list);
      setCredits(balances);
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
  const nameOf = useCallback(
    (userId: string | null | undefined) => {
      if (!userId) return null;
      const p = profiles.find((x) => x.userId === userId);
      return p ? p.displayName?.trim() || p.email || p.userId : null;
    },
    [profiles]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter((p) => [p.displayName, p.email, nameOf(p.trainerId)].some((s) => s?.toLowerCase().includes(q)));
  }, [profiles, query, nameOf]);

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
    if (newAccount.password.length < 6) {
      setCreateError('Het tijdelijke wachtwoord moet minstens 6 tekens zijn.');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      await auth.adminCreateAccount(mail, newAccount.password, newAccount.role, newAccount.displayName.trim() || null, {
        trainerId: newAccount.role === 'sporter' ? newAccount.trainerId || null : null,
      });
      const who = newAccount.displayName.trim() || mail;
      setMessage({
        type: 'success',
        text: `Account aangemaakt voor ${who} (${newAccount.role === 'trainer' ? 'trainer' : 'sporter'}). Tijdelijk wachtwoord: ${newAccount.password} — geef dit door; e-mailverificatie is niet nodig en het wachtwoord kan later gewijzigd worden.`,
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
    setEdit(toEditState(p));
    setMessage(null);
  };

  const closeEditor = () => {
    setTarget(null);
    setEdit(null);
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

  // Kop naar het ontwerp: titel links, "Account toevoegen" rechts, daaronder de tabs.
  const header = (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 1.5 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          {t('admin.title')}
        </Typography>
        {section === 'lessoorten' ? (
          <Button variant="contained" disableElevation startIcon={<AddRoundedIcon />} onClick={() => setNewTypeSignal((n) => n + 1)} sx={{ flexShrink: 0 }}>
            {t('classTypes.newType')}
          </Button>
        ) : (
          <Button variant="contained" disableElevation startIcon={<PersonAddRoundedIcon />} onClick={openCreate} disabled={!auth} sx={{ flexShrink: 0 }}>
            {t('admin.addAccount')}
          </Button>
        )}
      </Box>
      {isAdmin && <SectionTabs value={section} onChange={setSection} />}
    </>
  );

  if (isAdmin && section !== 'leden') {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
        <PageLayout maxWidth={ADMIN_MAX_WIDTH}>
          {header}
          {section === 'huisstijl' ? (
            <BrandingSettings />
          ) : section === 'lessoorten' ? (
            <ClassTypesPanel staff={trainers} createSignal={newTypeSignal} />
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

      {/* Zoeken staat in het ontwerp alleen op de telefoon; op een groot scherm is de tabel zelf overzichtelijk. */}
      <TextField
        size="small"
        fullWidth
        placeholder={t('admin.search')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        sx={{ mb: 2, display: { xs: 'flex', md: 'none' }, '& .MuiOutlinedInput-root': { borderRadius: 999, bgcolor: designTokens.cardBackgroundHigh } }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchRoundedIcon fontSize="small" />
            </InputAdornment>
          ),
        }}
        inputProps={{ 'aria-label': t('admin.searchMembers') }}
      />
      {message && (
        <Alert severity={message.type} sx={{ mb: 2 }} onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

      <MembersList profiles={visible} credits={credits} selfId={selfId} loading={loading} hasAny={profiles.length > 0} onOpen={openEditor} />

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
                {trainers.map((t) => (
                  <MenuItem key={t.userId} value={t.userId}>
                    {t.displayName?.trim() || t.email || t.userId}
                  </MenuItem>
                ))}
              </TextField>
              <TextField label="Geboortedatum" type="date" size="small" fullWidth value={edit.birthDate} onChange={(e) => setEdit({ ...edit, birthDate: e.target.value })} InputLabelProps={{ shrink: true }} />
              <TextField select label="Geslacht" size="small" fullWidth value={edit.gender || 'none'} onChange={(e) => setEdit({ ...edit, gender: e.target.value === 'none' ? '' : (e.target.value as EditState['gender']) })}>
                <MenuItem value="none">Niet opgegeven</MenuItem>
                <MenuItem value="man">Man</MenuItem>
                <MenuItem value="vrouw">Vrouw</MenuItem>
                <MenuItem value="anders">Anders</MenuItem>
              </TextField>
              <NumberField label="Lengte (cm)" size="small" fullWidth value={edit.heightCm} onChange={(v) => setEdit({ ...edit, heightCm: v })} />
              <NumberField label="Rusthartslag (bpm)" size="small" fullWidth value={edit.restingHr} onChange={(v) => setEdit({ ...edit, restingHr: v })} />
              <NumberField label="Doelgewicht (kg)" decimal size="small" fullWidth value={edit.weightGoalKg} onChange={(v) => setEdit({ ...edit, weightGoalKg: v })} />
              <TextField select label="Ranglijst" size="small" fullWidth value={edit.leaderboardVisibility} onChange={(e) => setEdit({ ...edit, leaderboardVisibility: e.target.value as LeaderboardVisibility })}>
                <MenuItem value="named">Met naam</MenuItem>
                <MenuItem value="anonymous">Anoniem</MenuItem>
                <MenuItem value="hidden">Niet op de ranglijst</MenuItem>
              </TextField>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
              Geboortedatum en geslacht zijn nodig voor het vetpercentage uit huidplooien; lengte voor BMI; rusthartslag voor hartslagzones op maat.
            </Typography>
            <Box sx={{ mt: 2 }}>
              <LimitationsEditor
                value={edit.limitations}
                onChange={(limitations) => setEdit({ ...edit, limitations })}
                disabled={saving}
              />
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
              jij kunt direct gegevens voor dit profiel bijhouden.
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
            {/* Tweede weg in dezelfde dialoog: iemand die al een account heeft aan jezelf koppelen. */}
            <AddSporterByEmailCard
              onAdded={async () => {
                await load();
                setNewAccount(null);
              }}
              onMessage={setMessage}
            />
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
    </PageLayout>
    </Box>
  );
}

const SECTIONS: Section[] = ['leden', 'lessoorten', 'abonnementen', 'huisstijl', 'facturatie'];
const SECTION_KEY: Record<Section, 'members' | 'classTypes' | 'subscriptions' | 'branding' | 'billing'> = {
  leden: 'members',
  lessoorten: 'classTypes',
  abonnementen: 'subscriptions',
  huisstijl: 'branding',
  facturatie: 'billing',
};

/** De vijf tabs uit het ontwerp — alleen zichtbaar voor de eigenaar; een trainer ziet direct de leden. */
function SectionTabs({ value, onChange }: { value: Section; onChange: (v: Section) => void }) {
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
      {SECTIONS.map((sec) => (
        <Tab key={sec} value={sec} label={t(`admin.tabs.${SECTION_KEY[sec]}`)} />
      ))}
    </Tabs>
  );
}
