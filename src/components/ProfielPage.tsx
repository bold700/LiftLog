/**
 * Pagina om eigen profielgegevens te beheren (naam, e-mail tonen).
 */
import { useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
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
  MenuItem,
  Radio,
  RadioGroup,
  TextField,
  Typography,
  InputBase,
  Select,
  CircularProgress,
} from '@mui/material';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import PhotoCameraRoundedIcon from '@mui/icons-material/PhotoCameraRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import { useProfile } from '../context/ProfileContext';
import { useI18n } from '../context/I18nContext';
import { LANGS, type Lang } from '../i18n';
import { useAuth } from '../context/AuthContext';
import { updateProfile } from '../services/profileService';
import { uploadAvatar, deleteAvatar } from '../services/avatarService';
import type { LeaderboardVisibility, Limitation } from '../types';
import { PageLayout, HeaderActions } from './layout';
import { designTokens } from '../theme/designTokens';
import { PushNotificationsCard } from './PushNotificationsCard';
import { UserAvatar } from './UserAvatar';
import { AiChatConnectCard } from './AiChatConnectCard';
import { SubscriptionCard } from './SubscriptionCard';
import { BookingsCard } from './BookingsCard';
import { ageOnDate } from '../utils/bodyFat';
import { heartRateZones } from '../utils/heartRate';
import { todayIso } from '../utils/format';
import { LimitationsEditor } from './LimitationsEditor';
import { NumberField } from './NumberField';

/** Kaart op de profielpagina (Figma: Surface Container Low, 16 rond, 24 binnenmarge). Functie: volgt het thema. */
const sectionSx = () => ({
  bgcolor: designTokens.cardBackground,
  borderRadius: `${designTokens.cardRadius}px`,
  border: 'none',
  px: 3,
  py: 2.5,
});

function SectionTitle({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <Typography component="h2" id={id} sx={{ fontSize: 14, fontWeight: 500, lineHeight: '20px', mb: 1 }}>
      {children}
    </Typography>
  );
}

/** Eén regel "label … waarde" zoals in Figma; de waarde mag een invoerveld zijn. */
function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, minHeight: 34 }}>
      <Typography sx={{ fontSize: 14, lineHeight: '20px', flexShrink: 0 }}>{label}</Typography>
      <Box sx={{ minWidth: 0, fontSize: 14, textAlign: 'right', display: 'flex', justifyContent: 'flex-end' }}>{children}</Box>
    </Box>
  );
}

function LinkButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <Box component="button" type="button" onClick={onClick} sx={{ all: 'unset', cursor: 'pointer', fontSize: 14, '&:hover': { textDecoration: 'underline' } }}>
      {children}
    </Box>
  );
}

const rowInputSx = { fontSize: 14, maxWidth: 220, '& input': { padding: 0 } } as const;
const columnSx = { display: { xs: 'contents', md: 'flex' }, flexDirection: 'column', gap: 2.5, minWidth: 0 } as const;
const radioSx = { my: -0.25, '& .MuiFormControlLabel-label': { fontSize: 14 } } as const;

export function ProfielPage({ onLogout }: { onLogout?: () => void }) {
  const profile = useProfile();
  const { t, lang, setLang } = useI18n();
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
  }, [uid, profile, displayName, leaderboardVisibility, heightCm, birthDate, gender, restingHr, limitations]);

  const email = auth?.user?.email ?? p?.email ?? '';
  /** "maart 2025": wanneer het profiel is aangemaakt (Figma "Member since March 2025"). */
  const memberSince = (() => {
    const d = p?.createdAt ? new Date(p.createdAt) : null;
    return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString(lang === 'en' ? 'en-GB' : 'nl-NL', { month: 'long', year: 'numeric' }) : null;
  })();

  // Hartslagzones live uit de formulierwaarden (leeftijd uit geboortedatum, rusthartslag), zodat je ze meteen ziet.
  const ageNow = ageOnDate(birthDate || null, todayIso());
  const restingNum = restingHr.trim() !== '' && Number.isFinite(Number(restingHr)) ? Number(restingHr) : null;
  const hrZones = heartRateZones(ageNow, restingNum);


  return (
    <PageLayout maxWidth="none">
      {message && (
        <Alert
          severity={message.type}
          icon={message.type === 'success' ? <CheckCircleRoundedIcon fontSize="inherit" /> : <ErrorOutlineRoundedIcon fontSize="inherit" />}
          sx={{ mb: 2 }}
        >
          {message.text}
        </Alert>
      )}

      {/* Desktop: "Wijzigingen opslaan" rechts in de paginakop (Figma). */}
      <HeaderActions>
        <Box sx={{ display: { xs: 'none', md: 'flex' } }}>
          <Button variant="contained" disableElevation onClick={handleSave} disabled={saving} sx={{ borderRadius: '20px', textTransform: 'none', fontWeight: 500, height: 40, px: 2.5 }}>
            {saving ? 'Bezig…' : 'Wijzigingen opslaan'}
          </Button>
        </Box>
      </HeaderActions>

      {/* Wie je bent: grote avatar (tik om de foto te wijzigen), naam en sinds wanneer je lid bent. */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 2, md: 2.5 }, mb: { xs: 2, md: 2.5 } }}>
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
        <Box
          component="button"
          type="button"
          disabled={uploadingPhoto}
          onClick={() => fileInputRef.current?.click()}
          aria-label={p?.photoURL ? 'Foto wijzigen' : 'Foto toevoegen'}
          sx={{ all: 'unset', cursor: 'pointer', borderRadius: '50%', flexShrink: 0, position: 'relative', display: 'flex', '&:focus-visible': { outline: `2px solid ${designTokens.primary}`, outlineOffset: 2 } }}
        >
          <Box sx={{ display: { xs: 'flex', md: 'none' } }}>
            <UserAvatar name={displayName || p?.displayName} photoURL={p?.photoURL} size={64} />
          </Box>
          <Box sx={{ display: { xs: 'none', md: 'flex' } }}>
            <UserAvatar name={displayName || p?.displayName} photoURL={p?.photoURL} size={84} />
          </Box>
          <Box
            sx={{
              position: 'absolute',
              right: -2,
              bottom: -2,
              width: 26,
              height: 26,
              borderRadius: '50%',
              bgcolor: designTokens.primary,
              color: designTokens.onPrimary,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: `2px solid ${designTokens.surface}`,
            }}
          >
            {uploadingPhoto ? <CircularProgress size={12} sx={{ color: 'inherit' }} /> : <PhotoCameraRoundedIcon sx={{ fontSize: 14 }} />}
          </Box>
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: { xs: 22, md: 26 }, fontWeight: 500, lineHeight: 1.25 }} noWrap>
            {displayName || p?.displayName || email}
          </Typography>
          <Typography sx={{ fontSize: { xs: 12, md: 13 }, color: 'text.secondary' }}>
            {memberSince ? `Lid sinds ${memberSince}` : ' '}
            {p?.photoURL && (
              <Box
                component="button"
                type="button"
                onClick={handleRemovePhoto}
                disabled={uploadingPhoto}
                sx={{ all: 'unset', cursor: 'pointer', ml: 1.5, color: designTokens.primary, '&:hover': { textDecoration: 'underline' } }}
              >
                Foto verwijderen
              </Box>
            )}
          </Typography>
        </Box>
      </Box>

      {/* Twee kolommen op desktop (Figma "Profile"): links abonnement, boekingen en je gegevens;
          rechts doelen, ranglijst en account. Op een telefoon staat alles onder elkaar. */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '14fr 14fr' }, gap: { xs: 2, md: 2.5 }, alignItems: 'start' }}>
        {/* Op een telefoon lossen de kolommen op (display: contents) en bepaalt `order` de volgorde
            zoals Figma: abonnement, boekingen, gegevens, doelen, ranglijst, account, dan de rest. */}
        <Box sx={columnSx}>
          {uid && p?.role === 'sporter' && (
            <Box sx={{ order: { xs: 1, md: 0 } }}>
              <SubscriptionCard userId={uid} />
            </Box>
          )}
          {uid && p?.role === 'sporter' && (
            <Box sx={{ order: { xs: 2, md: 0 } }}>
              <BookingsCard userId={uid} />
            </Box>
          )}

          <Box sx={{ ...sectionSx(), order: { xs: 3, md: 0 } }}>
            <SectionTitle>Persoonlijke gegevens</SectionTitle>
            <FieldRow label="Profielnaam">
              <InputBase value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Bijv. Jan Jansen" inputProps={{ 'aria-label': 'Profielnaam', style: { textAlign: 'right' } }} sx={rowInputSx} />
            </FieldRow>
            <FieldRow label="Geboortedatum">
              <InputBase type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} inputProps={{ 'aria-label': 'Geboortedatum', style: { textAlign: 'right' } }} sx={rowInputSx} />
            </FieldRow>
            <FieldRow label="Geslacht">
              <Select
                variant="standard"
                disableUnderline
                value={gender || 'none'}
                onChange={(e) => setGender(e.target.value === 'none' ? '' : (e.target.value as typeof gender))}
                inputProps={{ 'aria-label': 'Geslacht' }}
                sx={{ fontSize: 14, '& .MuiSelect-select': { textAlign: 'right', py: 0.25 } }}
              >
                <MenuItem value="none">Niet opgegeven</MenuItem>
                <MenuItem value="man">Man</MenuItem>
                <MenuItem value="vrouw">Vrouw</MenuItem>
                <MenuItem value="anders">Anders</MenuItem>
              </Select>
            </FieldRow>
            <FieldRow label="Lengte">
              <NumberField
                variant="standard"
                value={heightCm}
                onChange={setHeightCm}
                placeholder="–"
                InputProps={{ disableUnderline: true, endAdornment: <Box component="span" sx={{ fontSize: 14, color: 'text.secondary', ml: 0.5 }}>cm</Box> }}
                inputProps={{ 'aria-label': 'Lengte in cm', style: { textAlign: 'right', width: 48, fontSize: 14, padding: 0 } }}
              />
            </FieldRow>
            <FieldRow label="Rusthartslag">
              <NumberField
                variant="standard"
                value={restingHr}
                onChange={setRestingHr}
                placeholder="–"
                InputProps={{ disableUnderline: true, endAdornment: <Box component="span" sx={{ fontSize: 14, color: 'text.secondary', ml: 0.5 }}>bpm</Box> }}
                inputProps={{ 'aria-label': 'Rusthartslag in bpm', style: { textAlign: 'right', width: 48, fontSize: 14, padding: 0 } }}
              />
            </FieldRow>
            <Typography sx={{ fontSize: 11, color: 'text.secondary', mt: 1 }}>
              Je naam staat in de app en op de ranglijst. Leeftijd en geslacht vullen de AI-routekaart alvast in.
            </Typography>
            {/* Op een telefoon staat opslaan hier; op desktop in de paginakop. */}
            <Button
              variant="contained"
              disableElevation
              onClick={handleSave}
              disabled={saving}
              sx={{ display: { md: 'none' }, mt: 2, width: '100%', height: 48, borderRadius: '24px', textTransform: 'none', fontWeight: 500 }}
            >
              {saving ? 'Bezig…' : 'Wijzigingen opslaan'}
            </Button>
          </Box>

          {/* Hartslagzones: uit leeftijd + rusthartslag, zelfde formule als de routekaart */}
          <Box sx={{ ...sectionSx(), order: { xs: 7, md: 0 } }}>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 1, mb: 0.5 }}>
              <SectionTitle>Hartslagzones</SectionTitle>
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

          <Box sx={{ ...sectionSx(), order: { xs: 8, md: 0 } }}>
            <LimitationsEditor value={limitations} onChange={setLimitations} disabled={saving} />
          </Box>
        </Box>

        <Box sx={columnSx}>
          {/* Doelen: wat er op Metingen en Voeding is ingesteld, op één plek (Figma "Goals"). */}
          <Box sx={{ ...sectionSx(), order: { xs: 4, md: 0 } }}>
            <SectionTitle>Doelen</SectionTitle>
            <FieldRow label="Streefgewicht">{p?.weightGoalKg ? `${String(p.weightGoalKg).replace('.', ',')} kg` : '–'}</FieldRow>
            <FieldRow label="Calorieën per dag">{p?.nutritionGoal?.kcal ? `${p.nutritionGoal.kcal.toLocaleString('nl-NL')} kcal` : '–'}</FieldRow>
            <FieldRow label="Eiwit">{p?.nutritionGoal?.protein ? `${p.nutritionGoal.protein} g` : '–'}</FieldRow>
            <FieldRow label="Koolhydraten">{p?.nutritionGoal?.carbs ? `${p.nutritionGoal.carbs} g` : '–'}</FieldRow>
            <FieldRow label="Vet">{p?.nutritionGoal?.fat ? `${p.nutritionGoal.fat} g` : '–'}</FieldRow>
            <Typography sx={{ fontSize: 11, color: 'text.secondary', mt: 1 }}>Aanpassen doe je bij Metingen (gewicht) en Voeding (calorieën en macro's).</Typography>
          </Box>

          <Box sx={{ ...sectionSx(), order: { xs: 5, md: 0 } }}>
            <SectionTitle id="ranglijst-titel">Ranglijst</SectionTitle>
            <RadioGroup aria-labelledby="ranglijst-titel" value={leaderboardVisibility} onChange={(e) => setLeaderboardVisibility(e.target.value as LeaderboardVisibility)}>
              <FormControlLabel value="named" control={<Radio size="small" />} label="Met mijn profielnaam" sx={radioSx} />
              <FormControlLabel value="anonymous" control={<Radio size="small" />} label="Anoniem" sx={radioSx} />
              <FormControlLabel value="hidden" control={<Radio size="small" />} label="Verborgen" sx={radioSx} />
            </RadioGroup>
            <Typography sx={{ fontSize: 11, color: 'text.secondary', mt: 0.5 }}>Alleen totalen worden gedeeld; je logs blijven privé. Wordt bewaard met Wijzigingen opslaan.</Typography>
          </Box>

          <Box sx={{ ...sectionSx(), order: { xs: 6, md: 0 } }}>
            <SectionTitle>Account</SectionTitle>
            <FieldRow label="E-mail">
              <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', maxWidth: 240 }} title={email}>
                {email}
              </Box>
            </FieldRow>
            {isPasswordAccount && (
              <>
                <FieldRow label="E-mailadres wijzigen">
                  <LinkButton onClick={() => setEmailDialogOpen(true)}>Wijzigen</LinkButton>
                </FieldRow>
                <FieldRow label="Wachtwoord">
                  <LinkButton onClick={() => setPwdDialogOpen(true)}>Wijzigen</LinkButton>
                </FieldRow>
              </>
            )}
            {/* Taal: op het profiel, zodat elk apparaat dezelfde keuze laat zien (ontwerp: Account-kaart, rij "Language"). */}
            <FieldRow label={t('lang.label')}>
              <Select
                variant="standard"
                disableUnderline
                value={lang}
                onChange={(e) => void setLang(e.target.value as Lang)}
                inputProps={{ 'aria-label': t('lang.label') }}
                sx={{ fontSize: 14, '& .MuiSelect-select': { textAlign: 'right', py: 0.25 } }}
              >
                {LANGS.map((l) => (
                  <MenuItem key={l} value={l}>
                    {t(`lang.${l}`)}
                  </MenuItem>
                ))}
              </Select>
            </FieldRow>
            {!isPasswordAccount && (
              <Typography sx={{ fontSize: 11, color: 'text.secondary', mt: 0.5 }}>E-mail wordt beheerd via je aanbieder (Google, etc.).</Typography>
            )}
            {/* Uitloggen hoort bij het account (ontwerp: Account-kaart, "Sign out"); op desktop staat hij ook in de zijbalk. */}
            {onLogout && (
              <Box
                component="button"
                type="button"
                onClick={onLogout}
                sx={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 1, minHeight: 34, fontSize: 14, mt: 0.5, '&:hover': { textDecoration: 'underline' } }}
              >
                <LogoutRoundedIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                {t('nav.signOut')}
              </Box>
            )}
          </Box>

          {uid && (
            <Box sx={{ order: { xs: 9, md: 0 } }}>
              <PushNotificationsCard userId={uid} />
            </Box>
          )}

          {uid && (
            <Box sx={{ order: { xs: 10, md: 0 } }}>
              <AiChatConnectCard userId={uid} />
            </Box>
          )}
        </Box>
      </Box>

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
