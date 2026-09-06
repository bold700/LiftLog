/**
 * Profielen: alle accounts inzien en bijwerken (trainers en beheerders).
 * Zoeken, filteren op rol/volledigheid, per profiel alle velden bewerken in één dialoog,
 * en nieuwe accounts aanmaken (zonder e-mailverificatie) om voor sporters bij te houden.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  MenuItem,
  Chip,
  Alert,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  Tabs,
  Tab,
  Card,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import PersonAddRoundedIcon from '@mui/icons-material/PersonAddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import { useProfile } from '../context/ProfileContext';
import { useAuth } from '../context/AuthContext';
import { getAllProfiles, updateProfile } from '../services/profileService';
import { deleteAccountAsAdmin } from '../services/adminAccountService';
import type { LeaderboardVisibility, Profile, ProfileRole } from '../types';
import { PageLayout, ContentCard } from './layout';
import { UserAvatar } from './UserAvatar';
import { ageOnDate } from '../utils/bodyFat';
import { heartRateZones } from '../utils/heartRate';
import { HeartRateZonesTable } from './HeartRateZonesTable';

type Filter = 'all' | 'sporter' | 'trainer' | 'incomplete';

const FILTER_LABEL: Record<Filter, string> = { all: 'Alle', sporter: 'Sporters', trainer: 'Trainers', incomplete: 'Onvolledig' };
const FILTERS: Filter[] = ['all', 'sporter', 'trainer', 'incomplete'];

const ROLE_LABEL: Record<ProfileRole, string> = { sporter: 'Sporter', trainer: 'Trainer', admin: 'Beheerder' };

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Welke basisgegevens ontbreken; leeg = compleet. */
function missingFields(p: Profile): string[] {
  const m: string[] = [];
  if (!p.displayName?.trim()) m.push('naam');
  if (!p.birthDate) m.push('geboortedatum');
  if (!p.gender) m.push('geslacht');
  if (p.heightCm == null) m.push('lengte');
  if (p.restingHrBpm == null) m.push('rusthartslag');
  return m;
}

function summaryLine(p: Profile): string {
  const parts: string[] = [];
  const age = ageOnDate(p.birthDate, todayIso());
  if (age != null) parts.push(`${age} jaar`);
  if (p.gender) parts.push(p.gender);
  if (p.heightCm != null) parts.push(`${p.heightCm} cm`);
  if (p.restingHrBpm != null) parts.push(`rust ${p.restingHrBpm} bpm`);
  if (p.weightGoalKg != null) parts.push(`doel ${p.weightGoalKg} kg`);
  return parts.join(' · ');
}

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

export function ProfielenPage() {
  const profileCtx = useProfile();
  const auth = useAuth();
  const isTrainer = profileCtx?.isTrainer ?? false;
  const isAdmin = profileCtx?.role === 'admin';
  const selfId = profileCtx?.profile?.userId ?? '';
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
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
      const list = await getAllProfiles();
      list.sort((a, b) =>
        (a.displayName || a.email || a.userId).localeCompare(b.displayName || b.email || b.userId, undefined, { sensitivity: 'base' })
      );
      setProfiles(list);
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
    return profiles.filter((p) => {
      if (filter === 'sporter' && p.role !== 'sporter') return false;
      if (filter === 'trainer' && p.role === 'sporter') return false;
      if (filter === 'incomplete' && missingFields(p).length === 0) return false;
      if (!q) return true;
      return [p.displayName, p.email, nameOf(p.trainerId)].some((s) => s?.toLowerCase().includes(q));
    });
  }, [profiles, query, filter, nameOf]);

  const incompleteCount = useMemo(() => profiles.filter((p) => missingFields(p).length > 0).length, [profiles]);
  const sporterCount = useMemo(() => profiles.filter((p) => p.role === 'sporter').length, [profiles]);
  const filterCount: Record<Filter, number> = {
    all: profiles.length,
    sporter: sporterCount,
    trainer: trainers.length,
    incomplete: incompleteCount,
  };

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
      <PageLayout>
        <ContentCard>
          <Typography color="text.secondary">Alleen trainers en beheerders kunnen profielen beheren.</Typography>
        </ContentCard>
      </PageLayout>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
      <Tabs
        value={filter}
        onChange={(_, v: Filter) => setFilter(v)}
        variant={fullScreen ? 'scrollable' : 'fullWidth'}
        scrollButtons="auto"
        allowScrollButtonsMobile
        aria-label="Filter profielen"
        sx={{
          minHeight: 48,
          mb: 2,
          width: '100%',
          '& .MuiTab-root': {
            minHeight: 48,
            minWidth: 'auto',
            px: 2,
            textTransform: 'none',
            fontWeight: 600,
            transition: 'color 0.2s ease',
          },
          '& .MuiTabs-indicator': {
            height: 3,
            borderRadius: '3px 3px 0 0',
            transition: 'left 0.25s cubic-bezier(0.22, 1, 0.36, 1), width 0.25s cubic-bezier(0.22, 1, 0.36, 1)',
          },
        }}
      >
        {FILTERS.map((f) => (
          <Tab key={f} value={f} label={`${FILTER_LABEL[f]} (${filterCount[f]})`} id={`profielen-tab-${f}`} />
        ))}
      </Tabs>
    {/* Gewone Box als paneel: als direct kind van de flex-kolom zou PageLayout tot de inhoud krimpen. */}
    <Box sx={{ flex: 1, minHeight: 0 }}>
    <PageLayout>
      <ContentCard>
        <Typography variant="h5" sx={{ fontWeight: 600, mb: 0.5 }}>
          {FILTER_LABEL[filter]}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Alle accounts op één plek. Tik op een profiel om gegevens aan te vullen of te wijzigen.
        </Typography>

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center', mb: 2 }}>
          <TextField
            size="small"
            placeholder="Zoek op naam, e-mail of trainer"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            sx={{ flex: '1 1 240px' }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRoundedIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
            inputProps={{ 'aria-label': 'Zoek profielen' }}
          />
          <Button size="small" startIcon={<RefreshRoundedIcon />} onClick={load} disabled={loading}>
            {loading ? 'Laden…' : 'Vernieuwen'}
          </Button>
          <Button size="small" variant="contained" startIcon={<PersonAddRoundedIcon />} onClick={openCreate} disabled={!auth}>
            Nieuw account
          </Button>
        </Box>
        {message && (
          <Alert severity={message.type} sx={{ mb: 2 }} onClose={() => setMessage(null)}>
            {message.text}
          </Alert>
        )}

        <Card variant="outlined" sx={{ borderRadius: 2 }}>
          {loading && profiles.length === 0 ? (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Typography color="text.secondary">Profielen laden…</Typography>
            </Box>
          ) : visible.length === 0 ? (
            <Box sx={{ p: 3 }}>
              <Typography color="text.secondary">
                {profiles.length === 0 ? 'Nog geen profielen.' : 'Geen profielen gevonden met dit filter.'}
              </Typography>
              {profiles.length === 0 && (
                <Button size="small" startIcon={<PersonAddRoundedIcon />} onClick={openCreate} sx={{ mt: 1 }}>
                  Nieuw account aanmaken
                </Button>
              )}
            </Box>
          ) : (
            <List disablePadding>
              {visible.map((p) => {
                const missing = missingFields(p);
                const summary = summaryLine(p);
                const trainerName = p.role === 'sporter' ? nameOf(p.trainerId) : null;
                return (
                  <ListItemButton key={p.userId} divider onClick={() => openEditor(p)} sx={{ gap: 1.5, alignItems: 'flex-start', py: 1.5 }}>
                    <Box sx={{ pt: 0.25 }}>
                      <UserAvatar name={p.displayName} photoURL={p.photoURL} size={40} />
                    </Box>
                    <ListItemText
                      disableTypography
                      primary={
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.75 }}>
                          <Typography variant="body1" fontWeight={600} sx={{ minWidth: 0 }}>
                            {p.displayName?.trim() || p.email || p.userId}
                            {p.userId === selfId ? ' (ik)' : ''}
                          </Typography>
                          <Chip label={ROLE_LABEL[p.role]} size="small" variant={p.role === 'sporter' ? 'outlined' : 'filled'} />
                          {p.trainerRequested && <Chip label="Aanvraag trainer" size="small" color="warning" />}
                        </Box>
                      }
                      secondary={
                        <Box sx={{ mt: 0.25 }}>
                          <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                            {p.email ?? '—'}
                            {trainerName ? ` · trainer: ${trainerName}` : p.role === 'sporter' ? ' · geen trainer' : ''}
                          </Typography>
                          {summary && (
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                              {summary}
                            </Typography>
                          )}
                          {missing.length > 0 && (
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                              {missing.map((m) => (
                                <Chip key={m} label={`geen ${m}`} size="small" variant="outlined" color="warning" sx={{ height: 22 }} />
                              ))}
                            </Box>
                          )}
                        </Box>
                      }
                      sx={{ m: 0, minWidth: 0 }}
                    />
                  </ListItemButton>
                );
              })}
            </List>
          )}
        </Card>
      </ContentCard>

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
              <TextField label="Lengte (cm)" type="number" size="small" fullWidth inputProps={{ min: 0, inputMode: 'numeric' }} value={edit.heightCm} onChange={(e) => setEdit({ ...edit, heightCm: e.target.value })} />
              <TextField label="Rusthartslag (bpm)" type="number" size="small" fullWidth inputProps={{ min: 0, inputMode: 'numeric' }} value={edit.restingHr} onChange={(e) => setEdit({ ...edit, restingHr: e.target.value })} />
              <TextField label="Doelgewicht (kg)" type="number" size="small" fullWidth inputProps={{ min: 0, step: 0.1, inputMode: 'decimal' }} value={edit.weightGoalKg} onChange={(e) => setEdit({ ...edit, weightGoalKg: e.target.value })} />
              <TextField select label="Ranglijst" size="small" fullWidth value={edit.leaderboardVisibility} onChange={(e) => setEdit({ ...edit, leaderboardVisibility: e.target.value as LeaderboardVisibility })}>
                <MenuItem value="named">Met naam</MenuItem>
                <MenuItem value="anonymous">Anoniem</MenuItem>
                <MenuItem value="hidden">Niet op de ranglijst</MenuItem>
              </TextField>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
              Geboortedatum en geslacht zijn nodig voor het vetpercentage uit huidplooien; lengte voor BMI; rusthartslag voor hartslagzones op maat.
            </Typography>
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
    </Box>
  );
}
