/**
 * Pagina om eigen profielgegevens te beheren (naam, e-mail tonen).
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  InputAdornment,
  MenuItem,
  Radio,
  RadioGroup,
  TextField,
  Typography,
} from '@mui/material';
import PersonRoundedIcon from '@mui/icons-material/PersonRounded';
import MailOutlineRoundedIcon from '@mui/icons-material/MailOutlineRounded';
import VisibilityOffRoundedIcon from '@mui/icons-material/VisibilityOffRounded';
import PhotoCameraRoundedIcon from '@mui/icons-material/PhotoCameraRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import { useProfile } from '../context/ProfileContext';
import { useAuth } from '../context/AuthContext';
import { updateProfile } from '../services/profileService';
import { uploadAvatar, deleteAvatar } from '../services/avatarService';
import type { LeaderboardVisibility, Limitation } from '../types';
import { PageLayout, ContentCard } from './layout';
import { PushNotificationsCard } from './PushNotificationsCard';
import { UserAvatar } from './UserAvatar';
import { AiChatConnectCard } from './AiChatConnectCard';
import { ageOnDate } from '../utils/bodyFat';
import { heartRateZones } from '../utils/heartRate';
import { todayIso } from '../utils/format';
import { LimitationsEditor } from './LimitationsEditor';

export function ProfielPage() {
  const profile = useProfile();
  const auth = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [leaderboardVisibility, setLeaderboardVisibility] = useState<LeaderboardVisibility>('named');
  const [heightCm, setHeightCm] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [gender, setGender] = useState<'man' | 'vrouw' | 'anders' | ''>('');
  const [restingHr, setRestingHr] = useState('');
  const [limitations, setLimitations] = useState<Limitation[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [currentPwd, setCurrentPwd] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);
  const [pwdDialogOpen, setPwdDialogOpen] = useState(false);
  const [pwdCurrent, setPwdCurrent] = useState('');
  const [pwdNew, setPwdNew] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);
  const isPasswordAccount = auth?.user?.providerData?.some((pr) => pr.providerId === 'password') ?? false;

  const handleChangePassword = useCallback(async () => {
    if (!auth) return;
    if (pwdNew.length < 6) {
      setMessage({ type: 'error', text: 'Nieuw wachtwoord moet minstens 6 tekens zijn.' });
      return;
    }
    if (!pwdCurrent) {
      setMessage({ type: 'error', text: 'Vul je huidige wachtwoord in.' });
      return;
    }
    setPwdSaving(true);
    setMessage(null);
    try {
      await auth.changePassword(pwdCurrent, pwdNew);
      setPwdDialogOpen(false);
      setPwdCurrent('');
      setPwdNew('');
      setMessage({ type: 'success', text: 'Wachtwoord gewijzigd.' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Wachtwoord wijzigen mislukt.';
      setMessage({ type: 'error', text: msg.includes('wrong-password') || msg.includes('invalid-credential') ? 'Onjuist huidig wachtwoord.' : msg });
    } finally {
      setPwdSaving(false);
    }
  }, [auth, pwdCurrent, pwdNew]);

  const handleChangeEmail = useCallback(async () => {
    if (!auth) return;
    const target = newEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
      setMessage({ type: 'error', text: 'Vul een geldig nieuw e-mailadres in.' });
      return;
    }
    if (!currentPwd) {
      setMessage({ type: 'error', text: 'Vul je huidige wachtwoord in.' });
      return;
    }
    setEmailSaving(true);
    setMessage(null);
    try {
      await auth.changeEmail(currentPwd, target);
      setEmailDialogOpen(false);
      setNewEmail('');
      setCurrentPwd('');
      setMessage({ type: 'success', text: `Verificatiemail verstuurd naar ${target}. Klik de link om je e-mail te wijzigen.` });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'E-mail wijzigen mislukt.';
      setMessage({ type: 'error', text: msg.includes('wrong-password') || msg.includes('invalid-credential') ? 'Onjuist wachtwoord.' : msg });
    } finally {
      setEmailSaving(false);
    }
  }, [auth, newEmail, currentPwd]);

  const p = profile?.profile;
  const uid = auth?.user?.uid ?? p?.userId;

  const handlePhotoSelected = useCallback(
    async (file: File | null) => {
      if (!file || !uid || !profile) return;
      if (!file.type.startsWith('image/')) {
        setMessage({ type: 'error', text: 'Kies een afbeelding.' });
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setMessage({ type: 'error', text: 'Foto is te groot (max 5 MB).' });
        return;
      }
      setUploadingPhoto(true);
      setMessage(null);
      try {
        const url = await uploadAvatar(uid, file);
        await updateProfile(uid, { photoURL: url });
        await profile.refreshProfile();
        setMessage({ type: 'success', text: 'Profielfoto bijgewerkt.' });
      } catch (e) {
        setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Uploaden mislukt.' });
      } finally {
        setUploadingPhoto(false);
      }
    },
    [uid, profile]
  );

  const handleRemovePhoto = useCallback(async () => {
    if (!uid || !profile) return;
    setUploadingPhoto(true);
    setMessage(null);
    try {
      await deleteAvatar(uid);
      await updateProfile(uid, { photoURL: null });
      await profile.refreshProfile();
      setMessage({ type: 'success', text: 'Profielfoto verwijderd.' });
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Verwijderen mislukt.' });
    } finally {
      setUploadingPhoto(false);
    }
  }, [uid, profile]);

  useEffect(() => {
    if (p?.displayName != null) setDisplayName(p.displayName);
    else if (p !== undefined) setDisplayName('');
    setLeaderboardVisibility(p?.leaderboardVisibility ?? 'named');
    setHeightCm(p?.heightCm != null ? String(p.heightCm) : '');
    setBirthDate(p?.birthDate ?? '');
    setGender(p?.gender ?? '');
    setRestingHr(p?.restingHrBpm != null ? String(p.restingHrBpm) : '');
    setLimitations(p?.limitations ?? []);
  }, [p?.displayName, p?.leaderboardVisibility, p?.heightCm, p?.birthDate, p?.gender, p?.restingHrBpm, p?.limitations, p]);

  const handleSave = useCallback(async () => {
    if (!uid || !profile) return;
    setSaving(true);
    setMessage(null);
    try {
      await updateProfile(uid, {
        displayName: displayName.trim() || null,
        leaderboardVisibility,
        heightCm: heightCm.trim() ? Number(heightCm) : null,
        birthDate: birthDate || null,
        gender: gender || null,
        restingHrBpm: restingHr.trim() ? Number(restingHr) : null,
        limitations,
      });
      await profile.refreshProfile();
      setMessage({ type: 'success', text: 'Profiel opgeslagen.' });
    } catch (e) {
      setMessage({
        type: 'error',
        text: e instanceof Error ? e.message : 'Opslaan mislukt.',
      });
    } finally {
      setSaving(false);
    }
  }, [uid, profile, displayName, leaderboardVisibility, heightCm, birthDate, gender, restingHr]);

  const email = auth?.user?.email ?? p?.email ?? '';

  // Hartslagzones live uit de formulierwaarden (leeftijd uit geboortedatum, rusthartslag), zodat je ze meteen ziet.
  const ageNow = ageOnDate(birthDate || null, todayIso());
  const restingNum = restingHr.trim() !== '' && Number.isFinite(Number(restingHr)) ? Number(restingHr) : null;
  const hrZones = heartRateZones(ageNow, restingNum);


  return (
    <PageLayout>
      <ContentCard>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 600, mb: 1 }}>
          Mijn profiel
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
          Beheer je gegevens. Je naam wordt gebruikt in de app en in beheeroverzichten.
        </Typography>

        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, mb: 3 }}>
          <UserAvatar name={displayName || p?.displayName} photoURL={p?.photoURL} size={72} />
          <Box>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                handlePhotoSelected(e.target.files?.[0] ?? null);
                e.target.value = '';
              }}
            />
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              <Button variant="outlined" size="small" disabled={uploadingPhoto} onClick={() => fileInputRef.current?.click()} startIcon={<PhotoCameraRoundedIcon />}>
                {uploadingPhoto ? 'Bezig…' : p?.photoURL ? 'Foto wijzigen' : 'Foto toevoegen'}
              </Button>
              {p?.photoURL && (
                <Button variant="text" size="small" disabled={uploadingPhoto} onClick={handleRemovePhoto}>
                  Verwijderen
                </Button>
              )}
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
              Zichtbaar op de ranglijst. Zonder foto tonen we je initialen. (max 5 MB)
            </Typography>
          </Box>
        </Box>

        {message && (
          <Alert
            severity={message.type}
            icon={message.type === 'success' ? <CheckCircleRoundedIcon fontSize="inherit" /> : <ErrorOutlineRoundedIcon fontSize="inherit" />}
            sx={{ mb: 2 }}
          >
            {message.text}
          </Alert>
        )}

        <Box sx={{ display: 'flex', width: '100%', flexDirection: 'column', gap: 2 }}>
          <TextField
            label="Profielnaam"
            size="small"
            fullWidth
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Bijv. Jan Jansen"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <PersonRoundedIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                </InputAdornment>
              ),
            }}
          />

          <Box sx={{ mt: 0.5 }}>
            <Typography variant="subtitle2" component="h2" sx={{ fontWeight: 600 }}>
              Persoonlijke gegevens
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              Wordt gebruikt om de AI-routekaart alvast in te vullen (leeftijd, geslacht, e.d.).
            </Typography>
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            <TextField label="Lengte (cm)" type="number" size="small" fullWidth inputProps={{ min: 0, inputMode: 'numeric' }} value={heightCm} onChange={(e) => setHeightCm(e.target.value)} />
            <TextField label="Geboortedatum" type="date" size="small" fullWidth value={birthDate} onChange={(e) => setBirthDate(e.target.value)} InputLabelProps={{ shrink: true }} />
            <TextField select label="Geslacht" size="small" fullWidth value={gender || 'none'} onChange={(e) => setGender(e.target.value === 'none' ? '' : (e.target.value as typeof gender))}>
              <MenuItem value="none">Niet opgegeven</MenuItem>
              <MenuItem value="man">Man</MenuItem>
              <MenuItem value="vrouw">Vrouw</MenuItem>
              <MenuItem value="anders">Anders</MenuItem>
            </TextField>
            <TextField label="Rusthartslag (bpm)" type="number" size="small" fullWidth inputProps={{ min: 0, inputMode: 'numeric' }} value={restingHr} onChange={(e) => setRestingHr(e.target.value)} />
          </Box>

          {/* Hartslagzones: uit leeftijd + rusthartslag, zelfde formule als de routekaart */}
          <Box sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 1, mb: 0.5 }}>
              <Typography variant="subtitle2" component="h2" sx={{ fontWeight: 600 }}>
                Hartslagzones
              </Typography>
              {hrZones && (
                <Typography variant="caption" color="text.secondary">
                  max {hrZones.maxHr} bpm (220 − leeftijd){hrZones.restingHr != null ? ` · rust ${hrZones.restingHr} bpm` : ''}
                </Typography>
              )}
            </Box>
            {hrZones ? (
              <>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                  {hrZones.method === 'karvonen'
                    ? 'Berekend met de hartslagreserve (Karvonen): rust + (max − rust) × percentage.'
                    : 'Berekend als percentage van de maximale hartslag. Vul je rusthartslag in voor zones op maat (Karvonen).'}
                </Typography>
                <Box sx={{ overflowX: 'auto' }}>
                  <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                    <Box component="thead">
                      <Box component="tr" sx={{ textAlign: 'left', color: 'text.secondary', fontSize: 12 }}>
                        <Box component="th" sx={{ py: 0.5, pr: 1, fontWeight: 500 }}>Zone</Box>
                        <Box component="th" sx={{ py: 0.5, pr: 1, fontWeight: 500 }}>bpm</Box>
                        <Box component="th" sx={{ py: 0.5, fontWeight: 500 }}>Waarvoor</Box>
                      </Box>
                    </Box>
                    <Box component="tbody">
                      {hrZones.zones.map((z) => (
                        <Box component="tr" key={z.zone} sx={{ borderTop: '1px solid', borderColor: 'divider' }}>
                          <Box component="td" sx={{ py: 0.75, pr: 1.5, whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                            <Box component="span" sx={{ fontWeight: 500 }}>Z{z.zone}</Box>{' '}
                            <Box component="span" sx={{ color: 'text.secondary' }}>{z.name}</Box>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                              {Math.round(z.low * 100)}–{Math.round(z.high * 100)}%
                            </Typography>
                          </Box>
                          <Box component="td" sx={{ py: 0.75, pr: 1, whiteSpace: 'nowrap', verticalAlign: 'top', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                            {z.lowBpm}–{z.highBpm}
                          </Box>
                          <Box component="td" sx={{ py: 0.75, verticalAlign: 'top', fontSize: 12, color: 'text.secondary' }}>
                            {z.purpose}
                          </Box>
                        </Box>
                      ))}
                    </Box>
                  </Box>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                  De 220-formule wijkt per persoon tot zo'n 10 bpm af. Een gemeten maximum uit een test is nauwkeuriger.
                </Typography>
              </>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Vul je geboortedatum in om je hartslagzones te zien. Met rusthartslag worden ze op maat berekend.
              </Typography>
            )}
          </Box>

          <TextField
            label="E-mail"
            size="small"
            fullWidth
            value={email}
            disabled
            helperText={
              isPasswordAccount
                ? 'Klik op "E-mail wijzigen" om je e-mailadres te veranderen.'
                : 'E-mail wordt beheerd via je aanbieder (Google, etc.).'
            }
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <MailOutlineRoundedIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                </InputAdornment>
              ),
            }}
          />
          {isPasswordAccount && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              <Button variant="outlined" size="small" onClick={() => setEmailDialogOpen(true)}>
                E-mail wijzigen
              </Button>
              <Button variant="outlined" size="small" onClick={() => setPwdDialogOpen(true)}>
                Wachtwoord wijzigen
              </Button>
            </Box>
          )}

          <Box component="fieldset" sx={{ mt: 0.5, width: '100%', minWidth: 0, m: 0, p: 0, border: 0 }}>
            <Typography component="legend" variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5, p: 0 }}>
              Ranglijst (privacy)
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Standaard tonen we je <strong>profielnaam</strong> op de ranglijst. Je kunt anoniem gaan of jezelf uitzetten.
            </Typography>
            <RadioGroup value={leaderboardVisibility} onChange={(e) => setLeaderboardVisibility(e.target.value as LeaderboardVisibility)}>
              <FormControlLabel value="named" control={<Radio size="small" />} label="Met mijn profielnaam op de ranglijst (standaard)" />
              <FormControlLabel value="anonymous" control={<Radio size="small" />} label="Anoniem op de ranglijst" />
              <FormControlLabel
                value="hidden"
                control={<Radio size="small" />}
                label={
                  <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
                    <VisibilityOffRoundedIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                    Niet op de ranglijst
                  </Box>
                }
              />
            </RadioGroup>
          </Box>

          <LimitationsEditor value={limitations} onChange={setLimitations} disabled={saving} />

          <Button variant="contained" onClick={handleSave} disabled={saving} sx={{ alignSelf: 'flex-start' }}>
            {saving ? 'Bezig…' : 'Opslaan'}
          </Button>
        </Box>
      </ContentCard>

      {uid && <PushNotificationsCard userId={uid} />}

      {uid && <AiChatConnectCard userId={uid} />}

      <Dialog open={emailDialogOpen} onClose={() => setEmailDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>E-mail wijzigen</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Je krijgt een verificatiemail op het nieuwe adres. Je e-mail wijzigt pas nadat je die link hebt bevestigd.
          </DialogContentText>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, py: 1 }}>
            <TextField label="Nieuw e-mailadres" type="email" size="small" fullWidth value={newEmail} onChange={(e) => setNewEmail(e.target.value)} autoComplete="email" autoFocus />
            <TextField label="Huidig wachtwoord" type="password" size="small" fullWidth value={currentPwd} onChange={(e) => setCurrentPwd(e.target.value)} autoComplete="current-password" />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEmailDialogOpen(false)}>Annuleren</Button>
          <Button variant="contained" onClick={handleChangeEmail} disabled={emailSaving}>
            {emailSaving ? 'Bezig…' : 'Verzenden'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={pwdDialogOpen} onClose={() => setPwdDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Wachtwoord wijzigen</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, py: 1 }}>
            <TextField label="Huidig wachtwoord" type="password" size="small" fullWidth value={pwdCurrent} onChange={(e) => setPwdCurrent(e.target.value)} autoComplete="current-password" autoFocus />
            <TextField label="Nieuw wachtwoord" type="password" size="small" fullWidth value={pwdNew} onChange={(e) => setPwdNew(e.target.value)} autoComplete="new-password" helperText="Minstens 6 tekens." />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPwdDialogOpen(false)}>Annuleren</Button>
          <Button variant="contained" onClick={handleChangePassword} disabled={pwdSaving}>
            {pwdSaving ? 'Bezig…' : 'Opslaan'}
          </Button>
        </DialogActions>
      </Dialog>
    </PageLayout>
  );
}
