/**
 * Eigen profiel: eerst alles als tekst; "Wijzigen" maakt er één formulier van (gegevens, doelen,
 * ranglijst, e-mail, wachtwoord, taal) dat je in één keer opslaat of annuleert.
 */
import { useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import {
  Alert,
  Box,
  Button,
  FormControlLabel,
  MenuItem,
  Radio,
  RadioGroup,
  TextField,
  Typography,
  InputAdornment,
  CircularProgress,
  Tab,
  Tabs,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import PhotoCameraRoundedIcon from '@mui/icons-material/PhotoCameraRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import { useProfile } from '../context/ProfileContext';
import { useI18n } from '../context/I18nContext';
import { useViewAs } from '../context/ViewAsContext';
import { LANGS, type Lang } from '../i18n';
import { useAuth } from '../context/AuthContext';
import { updateProfile } from '../services/profileService';
import { uploadAvatar, deleteAvatar } from '../services/avatarService';
import { updateMemberCredentials } from '../services/adminAccountService';
import type { LeaderboardVisibility, Limitation } from '../types';
import { PageLayout, HeaderActions } from './layout';
import { designTokens } from '../theme/designTokens';
import { PushNotificationsCard } from './PushNotificationsCard';
import { UserAvatar } from './UserAvatar';
import { AiChatConnectCard } from './AiChatConnectCard';
import { CalendarFeedCard } from './CalendarFeedCard';
import { SubscriptionCard } from './SubscriptionCard';
import { BookingsCard } from './BookingsCard';
import { StandingBookingsCard } from './StandingBookingsCard';
import { ageOnDate } from '../utils/bodyFat';
import { heartRateZones } from '../utils/heartRate';
import { todayIso } from '../utils/format';
import { LimitationsEditor } from './LimitationsEditor';
import { NumberField } from './NumberField';
import { PrivacyCard } from './PrivacyCard';
import { LEADERBOARD_ENABLED } from '../config/features';

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
      <Box
        sx={{
          minWidth: 0,
          fontSize: 14,
          textAlign: 'right',
          display: 'flex',
          justifyContent: 'flex-end',
        }}
      >
        {children}
      </Box>
    </Box>
  );
}

const columnSx = { display: 'flex', flexDirection: 'column', gap: { xs: 2, md: 2.5 }, minWidth: 0 } as const;
const gridSx = { display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr) minmax(0, 1fr)' }, gap: { xs: 2, md: 2.5 }, alignItems: 'start' } as const;

type ProfileTab = 'gegevens' | 'abonnement' | 'account' | 'koppelingen';
const radioSx = { my: -0.25, '& .MuiFormControlLabel-label': { fontSize: 14 } } as const;

export function ProfielPage({ onLogout }: { onLogout?: () => void }) {
  const profile = useProfile();
  const { t, lang, setLang } = useI18n();
  const auth = useAuth();
  const { viewed } = useViewAs();
  const theme = useTheme();
  const wideTabs = useMediaQuery(theme.breakpoints.up('md'));
  const [tab, setTab] = useState<ProfileTab>('gegevens');
  const [displayName, setDisplayName] = useState('');
  const [leaderboardVisibility, setLeaderboardVisibility] = useState<LeaderboardVisibility>('named');
  const [heightCm, setHeightCm] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [gender, setGender] = useState<'man' | 'vrouw' | 'anders' | ''>('');
  const [restingHr, setRestingHr] = useState('');
  const [limitations, setLimitations] = useState<Limitation[]>([]);
  const [saving, setSaving] = useState(false);
  /** Bekijken of bewerken: pas na "Wijzigen" worden de gegevens invoervelden (M3 outlined). */
  const [editing, setEditing] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  /** Melding staat bovenaan; na opslaan onderaan (telefoon) er even naartoe schuiven, anders mis je hem. */
  const messageRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (message) messageRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }, [message]);

  // Account en doelen doen mee in hetzelfde formulier: alles in één keer wijzigen en opslaan.
  const [emailInput, setEmailInput] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [langChoice, setLangChoice] = useState<Lang>(lang);
  const [goalWeight, setGoalWeight] = useState('');
  const [goalKcal, setGoalKcal] = useState('');
  const [goalProtein, setGoalProtein] = useState('');
  const [goalCarbs, setGoalCarbs] = useState('');
  const [goalFat, setGoalFat] = useState('');

  const p = profile?.profile;
  /**
   * "Bekijk als": Profiel toont en bewerkt dan het profiel van de gekozen sporter, niet dat van de
   * ingelogde trainer — inclusief inloggegevens (via de server, zie updateMemberCredentials), zodat
   * het voor de trainer volledig aanvoelt alsof hij als die sporter is ingelogd.
   */
  const viewedProfile = viewed.isOther ? (profile?.members ?? []).find((s) => s.userId === viewed.userId) ?? null : null;
  const effective = viewed.isOther ? viewedProfile : p;
  // Bij "Bekijk als" kan dat ook een collega (trainer/beheerder) zijn: die heeft geen abonnement-tab.
  const effectiveRole = viewed.isOther ? (viewedProfile?.role ?? 'sporter') : p?.role;
  // Nee gezegd tegen gezondheidsgegevens: dan ook geen rusthartslag en blessures invullen (zie firestore.rules).
  const healthRefused = effective?.healthConsent?.given === false;
  const uid = viewed.isOther ? viewed.userId : (auth?.user?.uid ?? p?.userId);
  const isPasswordAccount = viewed.isOther ? true : (auth?.user?.providerData?.some((pr) => pr.providerId === 'password') ?? false);

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

  /** Formulier terugzetten naar wat er is opgeslagen (bij laden en bij Annuleren). */
  const resetForm = useCallback(() => {
    setDisplayName(effective?.displayName ?? '');
    setLeaderboardVisibility(effective?.leaderboardVisibility ?? 'named');
    setHeightCm(effective?.heightCm != null ? String(effective.heightCm) : '');
    setBirthDate(effective?.birthDate ?? '');
    setGender(effective?.gender ?? '');
    setRestingHr(effective?.restingHrBpm != null ? String(effective.restingHrBpm) : '');
    setLimitations(effective?.limitations ?? []);
    setEmailInput((viewed.isOther ? effective?.email : auth?.user?.email ?? effective?.email) ?? '');
    setNewPassword('');
    setCurrentPassword('');
    setLangChoice(viewed.isOther ? (effective?.language as Lang) ?? lang : lang);
    const str = (n: number | null | undefined) => (n ? String(n) : '');
    setGoalWeight(effective?.weightGoalKg ? String(effective.weightGoalKg).replace('.', ',') : '');
    setGoalKcal(str(effective?.nutritionGoal?.kcal));
    setGoalProtein(str(effective?.nutritionGoal?.protein));
    setGoalCarbs(str(effective?.nutritionGoal?.carbs));
    setGoalFat(str(effective?.nutritionGoal?.fat));
  }, [effective, viewed.isOther, auth?.user?.email, lang]);

  useEffect(() => {
    resetForm();
  }, [resetForm]);

  const handleCancel = useCallback(() => {
    resetForm();
    setEditing(false);
    setMessage(null);
  }, [resetForm]);

  const currentEmail = (viewed.isOther ? effective?.email : auth?.user?.email ?? effective?.email) ?? '';
  const emailChanged = isPasswordAccount && emailInput.trim().toLowerCase() !== currentEmail.toLowerCase();
  /**
   * E-mail of wachtwoord wijzigen vraagt normaal om je huidige wachtwoord (Firebase wil je opnieuw
   * herkennen). Bij "Bekijk als" loopt dit via de server met de rechten van de trainer/beheerder
   * zelf — de sporter hoeft er niet voor open te staan, dus dat veld vervalt dan.
   */
  const needsCurrentPassword = !viewed.isOther && (emailChanged || newPassword.length > 0);

  const handleSave = useCallback(async () => {
    if (!uid || !profile || !auth) return;
    const numOrNull = (v: string) => (v.trim() ? Number(v.replace(',', '.')) : null);
    const targetEmail = emailInput.trim();
    if (emailChanged && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
      setMessage({ type: 'error', text: 'Vul een geldig e-mailadres in.' });
      return;
    }
    if (newPassword && newPassword.length < 6) {
      setMessage({ type: 'error', text: 'Een nieuw wachtwoord moet minstens 6 tekens zijn.' });
      return;
    }
    if (needsCurrentPassword && !currentPassword) {
      setMessage({ type: 'error', text: 'Vul je huidige wachtwoord in om je e-mail of wachtwoord te wijzigen.' });
      return;
    }
    if (viewed.isOther && (newPassword || emailChanged)) {
      const naam = effective?.displayName?.trim() || effective?.email || 'deze sporter';
      if (!window.confirm(`Je wijzigt hiermee de inloggegevens van ${naam}. Doorgaan?`)) return;
    }
    setSaving(true);
    setMessage(null);
    const done: string[] = [];
    try {
      if (viewed.isOther) {
        // Bekijk als: rechtstreeks via de server (Admin SDK), zonder wachtwoord van de sporter zelf.
        if (newPassword || emailChanged) {
          if (!auth.user) throw new Error('Niet ingelogd.');
          await updateMemberCredentials(auth.user, uid, {
            email: emailChanged ? targetEmail : undefined,
            password: newPassword || undefined,
          });
          if (newPassword) done.push('Wachtwoord gewijzigd.');
          if (emailChanged) done.push('E-mailadres gewijzigd.');
        }
      } else {
        // Eerst wat je huidige wachtwoord nodig heeft: klopt dat niet, dan is er nog niets half opgeslagen.
        if (newPassword) {
          await auth.changePassword(currentPassword, newPassword);
          done.push('Wachtwoord gewijzigd.');
        }
        if (emailChanged) {
          await auth.changeEmail(currentPassword, targetEmail);
          done.push(`Bevestig je nieuwe e-mailadres via de link die naar ${targetEmail} is gestuurd; tot dan log je in met je oude adres.`);
        }
      }
      const goalNums = [goalKcal, goalProtein, goalCarbs, goalFat].map((v) => numOrNull(v) ?? 0);
      await updateProfile(uid, {
        displayName: displayName.trim() || null,
        leaderboardVisibility,
        heightCm: heightCm.trim() ? Number(heightCm) : null,
        birthDate: birthDate || null,
        gender: gender || null,
        restingHrBpm: restingHr.trim() ? Number(restingHr) : null,
        limitations,
        weightGoalKg: numOrNull(goalWeight),
        nutritionGoal: goalNums.some((n) => n > 0)
          ? { kcal: goalNums[0], protein: goalNums[1], carbs: goalNums[2], fat: goalNums[3] }
          : null,
        ...(viewed.isOther ? { language: langChoice } : {}),
      });
      if (!viewed.isOther && langChoice !== lang) await setLang(langChoice);
      await profile.refreshProfile();
      setEditing(false);
      setNewPassword('');
      setCurrentPassword('');
      setMessage({ type: 'success', text: ['Profiel opgeslagen.', ...done].join(' ') });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Opslaan mislukt.';
      const wrongPwd = msg.includes('wrong-password') || msg.includes('invalid-credential');
      setMessage({
        type: 'error',
        text: wrongPwd ? 'Je huidige wachtwoord klopt niet. Er is niets gewijzigd.' : [...done, msg].join(' '),
      });
    } finally {
      setSaving(false);
    }
  }, [
    uid, profile, auth, viewed.isOther, effective, emailInput, emailChanged, newPassword, needsCurrentPassword, currentPassword,
    displayName, leaderboardVisibility, heightCm, birthDate, gender, restingHr, limitations,
    goalWeight, goalKcal, goalProtein, goalCarbs, goalFat, langChoice, lang, setLang,
  ]);

  const email = (viewed.isOther ? effective?.email : auth?.user?.email ?? effective?.email) ?? '';
  /** "maart 2025": wanneer het profiel is aangemaakt (Figma "Member since March 2025"). */
  const memberSince = (() => {
    const d = effective?.createdAt ? new Date(effective.createdAt) : null;
    return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString(lang === 'en' ? 'en-GB' : 'nl-NL', { month: 'long', year: 'numeric' }) : null;
  })();

  /** Taal om te tonen op de niet-bewerkbare rij: van de bekeken sporter, of anders je eigen app-taal. */
  const displayLang: Lang = viewed.isOther ? (effective?.language as Lang) ?? 'nl' : lang;

  // Hartslagzones live uit de formulierwaarden (leeftijd uit geboortedatum, rusthartslag), zodat je ze meteen ziet.
  const ageNow = ageOnDate(birthDate || null, todayIso());
  const restingNum = restingHr.trim() !== '' && Number.isFinite(Number(restingHr)) ? Number(restingHr) : null;
  const hrZones = heartRateZones(ageNow, restingNum);


  const pillSx = { borderRadius: '20px', textTransform: 'none', fontWeight: 500, height: 40, px: 2.5 } as const;
  const editActions = editing ? (
    <>
      <Button variant="text" onClick={handleCancel} disabled={saving} sx={{ ...pillSx, flex: { xs: 1, md: 'none' } }}>
        Annuleren
      </Button>
      <Button variant="contained" disableElevation onClick={handleSave} disabled={saving} sx={{ ...pillSx, flex: { xs: 1, md: 'none' } }}>
        {saving ? (
          'Bezig…'
        ) : (
          <>
            <Box component="span" sx={{ display: { xs: 'inline', md: 'none' } }}>
              Opslaan
            </Box>
            <Box component="span" sx={{ display: { xs: 'none', md: 'inline' } }}>
              Wijzigingen opslaan
            </Box>
          </>
        )}
      </Button>
    </>
  ) : (
    <Button
      variant="outlined"
      startIcon={<EditRoundedIcon />}
      onClick={() => {
        setMessage(null);
        setEditing(true);
      }}
      sx={{ ...pillSx, flex: { xs: 1, md: 'none' } }}
    >
      Wijzigen
    </Button>
  );

  const genderLabel = { man: 'Man', vrouw: 'Vrouw', anders: 'Anders' } as const;
  const birthLabel = birthDate
    ? new Date(`${birthDate}T12:00:00`).toLocaleDateString(lang === 'en' ? 'en-GB' : 'nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
    : '–';
  const visibilityLabel: Record<LeaderboardVisibility, string> = {
    named: 'Met mijn profielnaam',
    anonymous: 'Anoniem',
    hidden: 'Verborgen',
  };


  // Kaarten per tab. Het formulier (Wijzigen/Opslaan) omvat Gegevens en Account samen; wisselen
  // van tab tijdens bewerken houdt je invoer vast, want alle velden leven in deze component.
  const personalCard = (
    <Box sx={{ ...sectionSx() }}>
      <SectionTitle>Persoonlijke gegevens</SectionTitle>
      {editing ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, pt: 1 }}>
          <TextField
            label="Profielnaam"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Bijv. Jan Jansen"
            fullWidth
            autoFocus
            sx={{ gridColumn: { sm: '1 / -1' } }}
          />
          <TextField
            label="Geboortedatum"
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />
          <TextField
            select
            label="Geslacht"
            value={gender || 'none'}
            onChange={(e) => setGender(e.target.value === 'none' ? '' : (e.target.value as typeof gender))}
            fullWidth
          >
            <MenuItem value="none">Niet opgegeven</MenuItem>
            <MenuItem value="man">Man</MenuItem>
            <MenuItem value="vrouw">Vrouw</MenuItem>
            <MenuItem value="anders">Anders</MenuItem>
          </TextField>
          <NumberField
            label="Lengte"
            value={heightCm}
            onChange={setHeightCm}
            fullWidth
            InputProps={{ endAdornment: <InputAdornment position="end">cm</InputAdornment> }}
          />
          {!healthRefused && (
            <NumberField
              label="Rusthartslag"
              value={restingHr}
              onChange={setRestingHr}
              fullWidth
              InputProps={{ endAdornment: <InputAdornment position="end">bpm</InputAdornment> }}
            />
          )}
        </Box>
      ) : (
        <>
          <FieldRow label="Profielnaam">{displayName || '–'}</FieldRow>
          <FieldRow label="Geboortedatum">{birthLabel}</FieldRow>
          <FieldRow label="Geslacht">{gender ? genderLabel[gender] : '–'}</FieldRow>
          <FieldRow label="Lengte">{heightCm ? `${heightCm} cm` : '–'}</FieldRow>
          {!healthRefused && <FieldRow label="Rusthartslag">{restingHr ? `${restingHr} bpm` : '–'}</FieldRow>}
        </>
      )}
      <Typography sx={{ fontSize: 11, color: 'text.secondary', mt: editing ? 1.5 : 1 }}>
        Je naam staat in de app. Leeftijd en geslacht vullen de AI-routekaart alvast in.
      </Typography>
    </Box>
  );

  const heartRateCard = (
    <Box sx={{ ...sectionSx() }}>
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
  );

  const limitationsCard = (
    <Box sx={{ ...sectionSx() }}>
      {healthRefused ? (
        <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
          Blessures en beperkingen worden niet bijgehouden: er is geen toestemming voor gezondheidsgegevens.
        </Typography>
      ) : (
        <LimitationsEditor value={limitations} onChange={setLimitations} disabled={saving || !editing} />
      )}
    </Box>
  );

  const goalsCard = (
    <Box sx={{ ...sectionSx() }}>
      <SectionTitle>Doelen</SectionTitle>
      {editing ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr' }, gap: 2, pt: 1 }}>
          <NumberField
            label="Streefgewicht"
            decimal
            value={goalWeight}
            onChange={setGoalWeight}
            fullWidth
            InputProps={{ endAdornment: <InputAdornment position="end">kg</InputAdornment> }}
          />
          <NumberField
            label="Calorieën per dag"
            value={goalKcal}
            onChange={setGoalKcal}
            fullWidth
            InputProps={{ endAdornment: <InputAdornment position="end">kcal</InputAdornment> }}
          />
          <NumberField label="Eiwit" value={goalProtein} onChange={setGoalProtein} fullWidth InputProps={{ endAdornment: <InputAdornment position="end">g</InputAdornment> }} />
          <NumberField label="Koolhydraten" value={goalCarbs} onChange={setGoalCarbs} fullWidth InputProps={{ endAdornment: <InputAdornment position="end">g</InputAdornment> }} />
          <NumberField label="Vet" value={goalFat} onChange={setGoalFat} fullWidth InputProps={{ endAdornment: <InputAdornment position="end">g</InputAdornment> }} />
        </Box>
      ) : (
        <>
          <FieldRow label="Streefgewicht">{effective?.weightGoalKg ? `${String(effective.weightGoalKg).replace('.', ',')} kg` : '–'}</FieldRow>
          <FieldRow label="Calorieën per dag">{effective?.nutritionGoal?.kcal ? `${effective.nutritionGoal.kcal.toLocaleString('nl-NL')} kcal` : '–'}</FieldRow>
          <FieldRow label="Eiwit">{effective?.nutritionGoal?.protein ? `${effective.nutritionGoal.protein} g` : '–'}</FieldRow>
          <FieldRow label="Koolhydraten">{effective?.nutritionGoal?.carbs ? `${effective.nutritionGoal.carbs} g` : '–'}</FieldRow>
          <FieldRow label="Vet">{effective?.nutritionGoal?.fat ? `${effective.nutritionGoal.fat} g` : '–'}</FieldRow>
        </>
      )}
      <Typography sx={{ fontSize: 11, color: 'text.secondary', mt: editing ? 1.5 : 1 }}>
        Dezelfde doelen als bij Metingen (gewicht) en Voeding (calorieën en macro's).
      </Typography>
    </Box>
  );

  const leaderboardCard = (
    <Box sx={{ ...sectionSx() }}>
      <SectionTitle id="ranglijst-titel">Ranglijst</SectionTitle>
      {editing ? (
        <RadioGroup aria-labelledby="ranglijst-titel" value={leaderboardVisibility} onChange={(e) => setLeaderboardVisibility(e.target.value as LeaderboardVisibility)}>
          <FormControlLabel value="named" control={<Radio size="small" />} label="Met mijn profielnaam" sx={radioSx} />
          <FormControlLabel value="anonymous" control={<Radio size="small" />} label="Anoniem" sx={radioSx} />
          <FormControlLabel value="hidden" control={<Radio size="small" />} label="Verborgen" sx={radioSx} />
        </RadioGroup>
      ) : (
        <FieldRow label="Zichtbaarheid">{visibilityLabel[leaderboardVisibility]}</FieldRow>
      )}
      <Typography sx={{ fontSize: 11, color: 'text.secondary', mt: 0.5 }}>Alleen totalen worden gedeeld; je logs blijven privé.</Typography>
    </Box>
  );

  const accountCard = (
    <Box sx={{ ...sectionSx() }}>
      <SectionTitle>Account</SectionTitle>
      {editing ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1, pb: 1 }}>
          <TextField
            label="E-mail"
            type="email"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            disabled={!isPasswordAccount}
            helperText={
              !isPasswordAccount
                ? 'Beheerd via je aanbieder (Google, etc.).'
                : viewed.isOther
                  ? 'Wordt direct gewijzigd, zonder bevestigingsmail.'
                  : 'Na opslaan krijg je een bevestigingslink op het nieuwe adres.'
            }
            autoComplete="email"
            inputProps={{ autoCapitalize: 'none', autoCorrect: 'off' }}
            fullWidth
          />
          {isPasswordAccount && (
            <TextField
              label="Nieuw wachtwoord"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              helperText="Leeg laten als je het niet wilt wijzigen. Minstens 6 tekens."
              autoComplete="new-password"
              fullWidth
            />
          )}
          {needsCurrentPassword && (
            <TextField
              label="Huidig wachtwoord"
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              helperText="Nodig om je e-mail of wachtwoord te wijzigen."
              autoComplete="current-password"
              fullWidth
            />
          )}
          {/* Taal: op het profiel, zodat elk apparaat dezelfde keuze laat zien. */}
          <TextField select label={t('lang.label')} value={langChoice} onChange={(e) => setLangChoice(e.target.value as Lang)} fullWidth>
            {LANGS.map((l) => (
              <MenuItem key={l} value={l}>
                {t(`lang.${l}`)}
              </MenuItem>
            ))}
          </TextField>
        </Box>
      ) : (
        <>
          <FieldRow label="E-mail">
            <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', maxWidth: 240 }} title={email}>
              {email}
            </Box>
          </FieldRow>
          {isPasswordAccount && <FieldRow label="Wachtwoord">••••••••</FieldRow>}
          <FieldRow label={t('lang.label')}>{t(`lang.${displayLang}`)}</FieldRow>
          {!isPasswordAccount && (
            <Typography sx={{ fontSize: 11, color: 'text.secondary', mt: 0.5 }}>E-mail wordt beheerd via je aanbieder (Google, etc.).</Typography>
          )}
        </>
      )}
      {/* Uitloggen hoort bij het account (ontwerp: Account-kaart, "Sign out"); op desktop staat hij ook in de zijbalk.
          Bij "Bekijk als" verborgen: hij logt altijd de trainer zelf uit, nooit de bekeken sporter. */}
      {onLogout && !viewed.isOther && (
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
  );

  const isSporterProfile = !!uid && effectiveRole === 'sporter';
  const tabs: { value: ProfileTab; label: string }[] = [
    { value: 'gegevens', label: 'Gegevens' },
    ...(isSporterProfile ? [{ value: 'abonnement' as const, label: 'Abonnement' }] : []),
    { value: 'account', label: 'Account' },
    { value: 'koppelingen', label: 'Koppelingen' },
  ];
  // Een trainer heeft geen abonnement-tab; val terug op Gegevens als die tab wegvalt (bijv. na "Bekijk als").
  const activeTab: ProfileTab = tabs.some((x) => x.value === tab) ? tab : 'gegevens';
  // "Wijzigen" hoort bij de tabs met invulvelden; tijdens bewerken blijven Annuleren/Opslaan altijd staan.
  const showEditActions = editing || activeTab === 'gegevens' || activeTab === 'account';
  return (
    <PageLayout maxWidth="none">
      {message && (
        <Alert
          ref={messageRef}
          severity={message.type}
          icon={message.type === 'success' ? <CheckCircleRoundedIcon fontSize="inherit" /> : <ErrorOutlineRoundedIcon fontSize="inherit" />}
          sx={{ mb: 2 }}
        >
          {message.text}
        </Alert>
      )}

      {/* Desktop: rechts in de paginakop eerst "Wijzigen"; tijdens bewerken "Annuleren" en "Wijzigingen opslaan". */}
      <HeaderActions>
        {showEditActions && <Box sx={{ display: { xs: 'none', md: 'flex' }, gap: 1 }}>{editActions}</Box>}
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
          aria-label={effective?.photoURL ? 'Foto wijzigen' : 'Foto toevoegen'}
          sx={{ all: 'unset', cursor: 'pointer', borderRadius: '50%', flexShrink: 0, position: 'relative', display: 'flex', '&:focus-visible': { outline: `2px solid ${designTokens.primary}`, outlineOffset: 2 } }}
        >
          <Box sx={{ display: { xs: 'flex', md: 'none' } }}>
            <UserAvatar name={displayName || effective?.displayName} photoURL={effective?.photoURL} size={64} />
          </Box>
          <Box sx={{ display: { xs: 'none', md: 'flex' } }}>
            <UserAvatar name={displayName || effective?.displayName} photoURL={effective?.photoURL} size={84} />
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
            {displayName || effective?.displayName || email}
          </Typography>
          <Typography sx={{ fontSize: { xs: 12, md: 13 }, color: 'text.secondary' }}>
            {memberSince ? `Lid sinds ${memberSince}` : ' '}
            {effective?.photoURL && (
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

      {/* Telefoon: Wijzigen (en tijdens bewerken Annuleren/Opslaan) direct onder je naam; op desktop in de paginakop. */}
      {showEditActions && <Box sx={{ display: { xs: 'flex', md: 'none' }, gap: 1, mb: 2 }}>{editActions}</Box>}

      {/* Tabs zoals bij Beheer, over de volle breedte. Per tab twee kolommen op desktop, onder elkaar op
          de telefoon. minmax(0, …): anders rekt een lange regel met noWrap (bijv. een plannaam) de kolom
          op tot voorbij de schermrand en kan de hele pagina horizontaal scrollen. */}
      <Tabs
        value={activeTab}
        onChange={(_, v: ProfileTab) => setTab(v)}
        aria-label="Profiel"
        variant={wideTabs ? 'fullWidth' : 'scrollable'}
        scrollButtons={false}
        sx={{ minHeight: 44, mb: 2.5, borderBottom: '1px solid', borderColor: 'divider', '& .MuiTab-root': { minHeight: 44, textTransform: 'none', fontWeight: 600, px: 2 } }}
      >
        {tabs.map((x) => (
          <Tab key={x.value} value={x.value} label={x.label} />
        ))}
      </Tabs>

      {activeTab === 'gegevens' && (
        <Box sx={gridSx}>
          <Box sx={columnSx}>
            {personalCard}
            {heartRateCard}
          </Box>
          <Box sx={columnSx}>
            {goalsCard}
            {limitationsCard}
          </Box>
        </Box>
      )}

      {activeTab === 'abonnement' && isSporterProfile && (
        // Kaarten los in het raster: een kaart die niets toont (bijv. geen abonnementen in de studio) laat zo geen gat achter.
        <Box sx={gridSx}>
          <SubscriptionCard userId={uid} />
          <BookingsCard userId={uid} />
          <StandingBookingsCard userId={uid} />
        </Box>
      )}

      {activeTab === 'account' && (
        <Box sx={gridSx}>
          <Box sx={columnSx}>{accountCard}</Box>
          <Box sx={columnSx}>
            {/* Toestemming en account verwijderen gaan altijd over jezelf, nooit over een bekeken sporter. */}
            {!viewed.isOther && <PrivacyCard />}
            {LEADERBOARD_ENABLED && leaderboardCard}
          </Box>
        </Box>
      )}

      {activeTab === 'koppelingen' && uid && (
        <Box sx={gridSx}>
          <PushNotificationsCard userId={uid} />
          <AiChatConnectCard userId={uid} />
          <CalendarFeedCard userId={uid} />
          {(effectiveRole === 'trainer' || effectiveRole === 'admin') && <CalendarFeedCard userId={uid} kind="trainer" />}
        </Box>
      )}

      {/* Telefoon: na een lang formulier ook onderaan opslaan, zonder terug te scrollen. */}
      {editing && <Box sx={{ display: { xs: 'flex', md: 'none' }, gap: 1, mt: 2.5 }}>{editActions}</Box>}
    </PageLayout>
  );
}
