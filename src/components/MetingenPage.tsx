import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  MenuItem,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Button,
  IconButton,
  CircularProgress,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import PhotoCameraRoundedIcon from '@mui/icons-material/PhotoCameraRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { PageLayout, ContentCard, OutlineCard } from './layout';
import { useProfile } from '../context/ProfileContext';
import { useNotify } from '../context/NotifyContext';
import { updateProfile } from '../services/profileService';
import {
  saveMeasurement,
  deleteMeasurement,
  getMeasurementsForUser,
  CIRCUMFERENCE_FIELDS,
  SKINFOLD_FIELDS,
  skinfoldSum,
  type Measurement,
  type CircumferenceKey,
  type SkinfoldKey,
  type BodyFatMethod,
  newMeasurementId,
} from '../services/measurementService';
import {
  PHOTO_VIEWS,
  uploadProgressPhoto,
  deleteProgressPhoto,
  deleteAllProgressPhotos,
  type PhotoView,
  type PhotoUrlKey,
} from '../services/progressPhotoService';
import { ageOnDate, bodyFatDurninWomersley, toSkinfoldSex, DW_MIN_AGE, fatFreeMassKg, bmi } from '../utils/bodyFat';
import { todayIso } from '../utils/format';

const EMPTY_CIRC = Object.fromEntries(CIRCUMFERENCE_FIELDS.map((f) => [f.key, ''])) as Record<CircumferenceKey, string>;
const EMPTY_SKIN = Object.fromEntries(SKINFOLD_FIELDS.map((f) => [f.key, ''])) as Record<SkinfoldKey, string>;

/** Per aanzicht: bestaande URL (uit de meting), nieuw gekozen bestand, en of de bestaande foto weg moet. */
interface PhotoSlot {
  existingUrl: string | null;
  file: File | null;
  previewUrl: string | null;
  remove: boolean;
}
const EMPTY_PHOTO: PhotoSlot = { existingUrl: null, file: null, previewUrl: null, remove: false };
const EMPTY_PHOTOS = Object.fromEntries(PHOTO_VIEWS.map((v) => [v.view, EMPTY_PHOTO])) as Record<PhotoView, PhotoSlot>;

/** Zelfde sectie-look als de Formule 7-routekaart in het workout-scherm. */
const ACCORDION_SX = {
  margin: 0,
  p: 1.5,
  borderRadius: 2,
  border: '1px solid rgba(0,0,0,0.08)',
  backgroundColor: 'rgba(0,0,0,0.02)',
  '&:before': { display: 'none' },
  boxShadow: 'none',
  '& .MuiAccordionSummary-root': { py: 0.5, minHeight: 44, px: 0 },
  '& .MuiAccordionSummary-content': { my: 0.75, minWidth: 0 },
} as const;

/** Omkaderd blok binnen de hoofdcard (statistieken, grafieken, foto's): compacte padding, kleine onderrand. */
const PANEL_SX = {
  mb: 2,
  '& .MuiCardContent-root': { p: 2, '&:last-child': { pb: 2 } },
} as const;

/** Twee kolommen op tablet/desktop, één op mobiel (invoervelden). */
const FIELD_GRID_SX = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
  gap: 1.5,
} as const;

/** Zwarte primaire knop, zelfde look als de andere pagina's. */
const PRIMARY_BUTTON_SX = {
  bgcolor: '#000',
  color: '#F2E4D3',
  borderRadius: '24px',
  textTransform: 'none',
  fontWeight: 600,
  '&:hover': { bgcolor: '#1a1a1a' },
  '&.Mui-disabled': { bgcolor: 'rgba(0,0,0,0.12)', color: 'rgba(29,27,26,0.38)' },
} as const;

/** Staande foto (3:4), afgerond, passend bijgesneden. */
const PHOTO_IMG_SX = {
  aspectRatio: '3 / 4',
  width: '100%',
  borderRadius: 2,
  bgcolor: 'rgba(0,0,0,0.06)',
  objectFit: 'cover',
  display: 'block',
} as const;

type SectionKey = 'circ' | 'skin' | 'photos';


interface TrendPoint {
  id: string;
  date: string;
  value: number;
}

/** Lijngrafiek (viewBox = echte pixelbreedte, geen vervorming). Optionele stippellijn voor een doel. */
function TrendChart({ points, unit, goal }: { points: TrendPoint[]; unit: string; goal?: number | null }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(320);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setWidth(Math.round(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const pts = points.slice(-20);
  const CH = 130;
  const pad = 14;
  const values = pts.map((p) => p.value);
  const min = Math.min(...values, goal ?? Infinity);
  const max = Math.max(...values, goal ?? -Infinity);
  const range = max - min || 1;
  const cx = (i: number) => (pts.length > 1 ? (i * (width - 2 * pad)) / (pts.length - 1) : (width - 2 * pad) / 2) + pad;
  const cy = (v: number) => CH - pad - ((v - min) / range) * (CH - 2 * pad);
  const line = pts.map((p, i) => `${cx(i)},${cy(p.value)}`).join(' ');
  return (
    <Box ref={ref} sx={{ width: '100%', color: 'primary.main' }}>
      <svg viewBox={`0 0 ${width} ${CH}`} style={{ display: 'block', height: CH, width: '100%' }}>
        {goal != null && <line x1={0} y1={cy(goal)} x2={width} y2={cy(goal)} stroke="#9e9e9e" strokeWidth={1} strokeDasharray="4 4" />}
        <polyline points={line} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => (
          <circle key={p.id} cx={cx(i)} cy={cy(p.value)} r={3} fill="currentColor">
            <title>{`${p.date}: ${p.value} ${unit}`}</title>
          </circle>
        ))}
      </svg>
    </Box>
  );
}

export function MetingenPage() {
  const profileCtx = useProfile();
  const notify = useNotify();
  const isTrainer = profileCtx?.isTrainer ?? false;
  const sporters = profileCtx?.allSporters ?? [];
  const selfUid = profileCtx?.profile?.userId ?? '';
  const selfTrainerId = profileCtx?.profile?.trainerId ?? null;

  const [targetId, setTargetId] = useState('');
  const [items, setItems] = useState<Measurement[]>([]);
  const [loading, setLoading] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [date, setDate] = useState(todayIso());
  const [weight, setWeight] = useState('');
  /** Handmatig/extern vetpercentage van een bestaand record (bijv. bodyscan). Alleen bewaard bij bewerken, niet meer invoerbaar. */
  const [bodyFat, setBodyFat] = useState('');
  const [bodyFatMethodStored, setBodyFatMethodStored] = useState<BodyFatMethod | null>(null);
  const [openSections, setOpenSections] = useState<SectionKey[]>([]);
  const toggleSection = (k: SectionKey) => setOpenSections((o) => (o.includes(k) ? o.filter((x) => x !== k) : [...o, k]));
  const [photos, setPhotos] = useState<Record<PhotoView, PhotoSlot>>(EMPTY_PHOTOS);
  const photoInputs = useRef<Record<PhotoView, HTMLInputElement | null>>({ front: null, side: null, back: null });
  const [note, setNote] = useState('');
  const [circ, setCirc] = useState<Record<CircumferenceKey, string>>(EMPTY_CIRC);
  const [skin, setSkin] = useState<Record<SkinfoldKey, string>>(EMPTY_SKIN);
  const [saving, setSaving] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [goalInput, setGoalInput] = useState('');
  // Trainer vult geboortedatum/geslacht van de gekozen sporter in als die ontbreken (anders wachten op de sporter).
  const [fixBirth, setFixBirth] = useState('');
  const [fixGender, setFixGender] = useState<'man' | 'vrouw' | 'anders' | ''>('');
  const [savingFix, setSavingFix] = useState(false);

  const effectiveUserId = targetId || selfUid;
  const targetProfile = targetId ? sporters.find((s) => s.userId === targetId) ?? null : profileCtx?.profile ?? null;
  const effectiveTrainerId = targetId ? targetProfile?.trainerId ?? null : selfTrainerId;

  const load = useCallback(async () => {
    if (!effectiveUserId) return;
    setLoading(true);
    try {
      setItems(await getMeasurementsForUser(effectiveUserId));
    } catch (err) {
      setItems([]);
      notify.error('Metingen laden mislukt. Controleer je verbinding.', err);
    } finally {
      setLoading(false);
    }
  }, [effectiveUserId, notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setEditingId(null);
    setDate(todayIso());
    setWeight('');
    setBodyFat('');
    setBodyFatMethodStored(null);
    setNote('');
    setCirc(EMPTY_CIRC);
    setSkin(EMPTY_SKIN);
    setOpenSections([]);
    setPhotos((p) => {
      for (const v of PHOTO_VIEWS) if (p[v.view].previewUrl) URL.revokeObjectURL(p[v.view].previewUrl as string);
      return EMPTY_PHOTOS;
    });
  };

  const pickPhoto = (view: PhotoView, file: File | null) => {
    setPhotos((p) => {
      const prev = p[view];
      if (prev.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return { ...p, [view]: { ...prev, file, previewUrl: file ? URL.createObjectURL(file) : null, remove: false } };
    });
  };

  const clearPhoto = (view: PhotoView) => {
    setPhotos((p) => {
      const prev = p[view];
      if (prev.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return { ...p, [view]: { ...prev, file: null, previewUrl: null, remove: prev.existingUrl != null } };
    });
    const el = photoInputs.current[view];
    if (el) el.value = '';
  };

  const circNumbers = (): Record<CircumferenceKey, number | null> => {
    const o = {} as Record<CircumferenceKey, number | null>;
    for (const f of CIRCUMFERENCE_FIELDS) {
      const v = circ[f.key].trim();
      o[f.key] = v !== '' ? Number(v) : null;
    }
    return o;
  };

  const skinNumbers = useMemo((): Record<SkinfoldKey, number | null> => {
    const o = {} as Record<SkinfoldKey, number | null>;
    for (const f of SKINFOLD_FIELDS) {
      const v = skin[f.key].trim();
      const n = v !== '' ? Number(v) : NaN;
      o[f.key] = Number.isFinite(n) ? n : null;
    }
    return o;
  }, [skin]);

  // Berekend vetpercentage uit de vier Durnin & Womersley-plooien + leeftijd/geslacht uit het profiel.
  const sex = toSkinfoldSex(targetProfile?.gender);
  const age = ageOnDate(targetProfile?.birthDate, date);
  const formulaFilled = SKINFOLD_FIELDS.filter((f) => f.inFormula).every((f) => skinNumbers[f.key] != null);
  const computedFat = useMemo(() => {
    if (!formulaFilled || sex == null || age == null) return null;
    return bodyFatDurninWomersley({
      bicepsMm: skinNumbers.skinfoldBicepsMm ?? 0,
      tricepsMm: skinNumbers.skinfoldTricepsMm ?? 0,
      subscapularMm: skinNumbers.skinfoldSubscapularMm ?? 0,
      suprailiacMm: skinNumbers.skinfoldSuprailiacMm ?? 0,
      sex,
      ageYears: age,
    });
  }, [formulaFilled, sex, age, skinNumbers]);
  const fatIsComputed = computedFat != null;
  const bodyFatValue = fatIsComputed ? String(computedFat.pct) : bodyFat;
  const currentSkinSum = skinfoldSum(skinNumbers);
  const weightNum = weight.trim() !== '' && Number.isFinite(Number(weight)) ? Number(weight) : null;
  const formFfm = weightNum != null && computedFat ? fatFreeMassKg(weightNum, computedFat.pct) : null;
  const formBmi = weightNum != null ? bmi(weightNum, targetProfile?.heightCm) : null;
  const circFilled = CIRCUMFERENCE_FIELDS.filter((f) => circ[f.key].trim() !== '').length;
  const skinFilled = SKINFOLD_FIELDS.filter((f) => skin[f.key].trim() !== '').length;
  let formulaHint: string | null = null;
  if (formulaFilled && computedFat == null) {
    if (sex == null && targetProfile?.gender === 'anders') formulaHint = 'De formule kent alleen man/vrouw; vul het vetpercentage handmatig in.';
    else if (sex == null || age == null) formulaHint = 'Vul geboortedatum en geslacht in bij Profiel om het vetpercentage te berekenen.';
    else if (age < DW_MIN_AGE) formulaHint = `De formule is gevalideerd vanaf ${DW_MIN_AGE} jaar; vul het vetpercentage handmatig in.`;
    else formulaHint = 'Deze plooien geven geen bruikbaar percentage; controleer de waarden.';
  }

  const profileIncomplete = !!targetProfile && (!targetProfile.birthDate || !targetProfile.gender);
  const canFixProfile = isTrainer && !!targetId && profileIncomplete;

  useEffect(() => {
    setFixBirth(targetProfile?.birthDate ?? '');
    setFixGender(targetProfile?.gender ?? '');
  }, [targetProfile?.userId, targetProfile?.birthDate, targetProfile?.gender]);

  const handleFixProfile = async () => {
    if (!targetId) return;
    setSavingFix(true);
    try {
      await updateProfile(targetId, { birthDate: fixBirth || null, gender: fixGender || null });
      await profileCtx?.refreshProfile();
    } catch {
      /* ignore */
    } finally {
      setSavingFix(false);
    }
  };

  const handleSave = async () => {
    if (!effectiveUserId) return;
    const w = weight.trim() !== '' ? Number(weight) : null;
    const bf = bodyFatValue.trim() !== '' ? Number(bodyFatValue) : null;
    const cn = circNumbers();
    const hasCirc = CIRCUMFERENCE_FIELDS.some((f) => cn[f.key] != null);
    const hasSkin = SKINFOLD_FIELDS.some((f) => skinNumbers[f.key] != null);
    const hasPhoto = PHOTO_VIEWS.some((v) => photos[v.view].file != null || (photos[v.view].existingUrl != null && !photos[v.view].remove));
    if (w == null && bf == null && !hasCirc && !hasSkin && !hasPhoto) return;
    const bodyFatMethod: BodyFatMethod | null = bf == null ? null : fatIsComputed ? 'durnin-womersley' : bodyFatMethodStored ?? 'manual';
    setSaving(true);
    try {
      const editing = items.find((m) => m.id === editingId);
      const id = editing?.id ?? newMeasurementId();
      // Foto's: nieuw bestand uploaden, verwijderde weghalen, rest laten staan.
      const photoUrls = {} as Record<PhotoUrlKey, string | null>;
      await Promise.all(
        PHOTO_VIEWS.map(async (v) => {
          const slot = photos[v.view];
          if (slot.file) {
            photoUrls[v.key] = await uploadProgressPhoto(effectiveUserId, id, v.view, slot.file);
          } else if (slot.remove) {
            await deleteProgressPhoto(effectiveUserId, id, v.view);
            photoUrls[v.key] = null;
          } else {
            photoUrls[v.key] = slot.existingUrl;
          }
        })
      );
      await saveMeasurement({
        id,
        createdAt: editing?.createdAt,
        userId: effectiveUserId,
        loggedBy: selfUid || effectiveUserId,
        trainerId: effectiveTrainerId,
        date,
        weightKg: w,
        bodyFatPct: bf,
        bodyFatMethod,
        ...cn,
        ...skinNumbers,
        ...photoUrls,
        note: note.trim(),
      });
      resetForm();
      await load();
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (m: Measurement) => {
    setEditingId(m.id);
    setDate(m.date || todayIso());
    setWeight(m.weightKg != null ? String(m.weightKg) : '');
    // Een eerder handmatig/extern percentage blijft bewaard; een berekend percentage wordt opnieuw berekend uit de plooien.
    setBodyFat(m.bodyFatPct != null && m.bodyFatMethod !== 'durnin-womersley' ? String(m.bodyFatPct) : '');
    setBodyFatMethodStored(m.bodyFatMethod);
    setNote(m.note);
    const c = {} as Record<CircumferenceKey, string>;
    for (const f of CIRCUMFERENCE_FIELDS) {
      const v = m[f.key];
      c[f.key] = v != null ? String(v) : '';
    }
    setCirc(c);
    const s = {} as Record<SkinfoldKey, string>;
    for (const f of SKINFOLD_FIELDS) {
      const v = m[f.key];
      s[f.key] = v != null ? String(v) : '';
    }
    setSkin(s);
    setPhotos((p) => {
      for (const v of PHOTO_VIEWS) if (p[v.view].previewUrl) URL.revokeObjectURL(p[v.view].previewUrl as string);
      return Object.fromEntries(
        PHOTO_VIEWS.map((v) => [v.view, { existingUrl: m[v.key], file: null, previewUrl: null, remove: false }])
      ) as Record<PhotoView, PhotoSlot>;
    });
    const open: SectionKey[] = [];
    if (CIRCUMFERENCE_FIELDS.some((f) => m[f.key] != null)) open.push('circ');
    if (SKINFOLD_FIELDS.some((f) => m[f.key] != null)) open.push('skin');
    if (PHOTO_VIEWS.some((v) => m[v.key] != null)) open.push('photos');
    setOpenSections(open);
  };

  const handleDelete = async (id: string) => {
    const m = items.find((x) => x.id === id);
    if (!window.confirm(`Meting van ${m?.date ?? 'deze datum'} verwijderen? Bijbehorende foto's worden ook verwijderd.`)) return;
    try {
      await deleteMeasurement(id);
      if (m && PHOTO_VIEWS.some((v) => m[v.key] != null)) await deleteAllProgressPhotos(m.userId, id);
    } catch (err) {
      notify.error('Meting verwijderen mislukt. Probeer het opnieuw.', err);
    }
    if (editingId === id) resetForm();
    await load();
  };

  const weightPoints = useMemo(
    () => items.filter((m) => m.weightKg != null).map((m) => ({ id: m.id, date: m.date, value: m.weightKg as number })),
    [items]
  );
  const latestWeight = weightPoints.length ? weightPoints[weightPoints.length - 1].value : null;
  const firstWeight = weightPoints.length ? weightPoints[0].value : null;
  const weightDelta = latestWeight != null && firstWeight != null ? Math.round((latestWeight - firstWeight) * 10) / 10 : null;
  const bfPoints = items.filter((m) => m.bodyFatPct != null);
  const latestBf = bfPoints.length ? bfPoints[bfPoints.length - 1] : null;
  const skinPoints = useMemo(
    () =>
      items
        .map((m) => ({ id: m.id, date: m.date, value: skinfoldSum(m) }))
        .filter((p): p is TrendPoint => p.value != null),
    [items]
  );
  /** Per aanzicht: eerste en laatste foto (items zijn oud → nieuw gesorteerd). */
  const photoProgress = useMemo(
    () =>
      PHOTO_VIEWS.map((v) => {
        const withPhoto = items.filter((m) => m[v.key] != null);
        const first = withPhoto[0] ?? null;
        const last = withPhoto.length > 1 ? withPhoto[withPhoto.length - 1] : null;
        return { ...v, first, last, count: withPhoto.length };
      }).filter((p) => p.first != null),
    [items]
  );
  const latestSkin = skinPoints.length ? skinPoints[skinPoints.length - 1].value : null;
  // Vetvrije massa uit de laatste meting die gewicht én vetpercentage heeft; BMI uit laatste gewicht + lengte (profiel).
  const latestWithBoth = [...items].reverse().find((m) => m.weightKg != null && m.bodyFatPct != null) ?? null;
  const latestFfm = latestWithBoth ? fatFreeMassKg(latestWithBoth.weightKg as number, latestWithBoth.bodyFatPct as number) : null;
  const firstWithBoth = items.find((m) => m.weightKg != null && m.bodyFatPct != null) ?? null;
  const firstFfm = firstWithBoth ? fatFreeMassKg(firstWithBoth.weightKg as number, firstWithBoth.bodyFatPct as number) : null;
  const ffmDelta = latestFfm != null && firstFfm != null && latestWithBoth !== firstWithBoth ? Math.round((latestFfm - firstFfm) * 10) / 10 : null;
  const latestBmi = latestWeight != null ? bmi(latestWeight, targetProfile?.heightCm) : null;
  const firstSkin = skinPoints.length ? skinPoints[0].value : null;
  const skinDelta = latestSkin != null && firstSkin != null ? Math.round((latestSkin - firstSkin) * 10) / 10 : null;

  const wMin = weightPoints.length ? Math.min(...weightPoints.map((p) => p.value)) : 0;
  const wMax = weightPoints.length ? Math.max(...weightPoints.map((p) => p.value)) : 1;
  const sMin = skinPoints.length ? Math.min(...skinPoints.map((p) => p.value)) : 0;
  const sMax = skinPoints.length ? Math.max(...skinPoints.map((p) => p.value)) : 1;

  const goalWeight = targetId ? targetProfile?.weightGoalKg ?? null : profileCtx?.profile?.weightGoalKg ?? null;
  const toGoal = goalWeight != null && latestWeight != null ? Math.round((latestWeight - goalWeight) * 10) / 10 : null;
  const firstDate = weightPoints.length ? weightPoints[0].date : null;
  const lastDate = weightPoints.length ? weightPoints[weightPoints.length - 1].date : null;
  const spanDays = firstDate && lastDate ? Math.max(1, (Date.parse(lastDate) - Date.parse(firstDate)) / 86400000) : 0;
  const perWeek = weightDelta != null && spanDays >= 1 ? Math.round((weightDelta / (spanDays / 7)) * 10) / 10 : null;
  const goalProgress =
    goalWeight != null && firstWeight != null && latestWeight != null && firstWeight !== goalWeight
      ? Math.max(0, Math.min(100, ((firstWeight - latestWeight) / (firstWeight - goalWeight)) * 100))
      : null;

  const handleSaveGoal = async () => {
    if (!effectiveUserId) return;
    const g = goalInput.trim() !== '' ? Number(goalInput) : null;
    try {
      await updateProfile(effectiveUserId, { weightGoalKg: g && g > 0 ? g : null });
    } catch (err) {
      notify.error('Doelgewicht opslaan mislukt. Probeer het opnieuw.', err);
      return;
    }
    await profileCtx?.refreshProfile();
    setGoalOpen(false);
  };

  return (
    <PageLayout>
      <ContentCard>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          <Typography variant="h5" fontWeight={600}>
            Metingen
          </Typography>
          <Button
            size="small"
            variant="text"
            sx={{ textTransform: 'none' }}
            onClick={() => {
              setGoalInput(goalWeight != null ? String(goalWeight) : '');
              setGoalOpen(true);
            }}
          >
            {goalWeight != null ? `Doel: ${goalWeight} kg` : 'Doelgewicht instellen'}
          </Button>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Houd je gewicht, vetpercentage, omtrekmaten en huidplooien bij en volg je voortgang.
        </Typography>

        {isTrainer && sporters.length > 0 && (
          <TextField
            select
            fullWidth
            size="small"
            label="Voor wie?"
            value={targetId || 'self'}
            onChange={(e) => setTargetId(e.target.value === 'self' ? '' : e.target.value)}
            sx={{ mb: 2 }}
          >
            <MenuItem value="self">Mijzelf</MenuItem>
            {sporters.map((s) => (
              <MenuItem key={s.userId} value={s.userId}>
                {s.displayName?.trim() || s.email || s.userId}
              </MenuItem>
            ))}
          </TextField>
        )}

        {/* Huidige waarden */}
        <OutlineCard sx={PANEL_SX}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'repeat(3, 1fr)', sm: 'repeat(5, 1fr)' },
              columnGap: 1,
              rowGap: 2,
              textAlign: 'center',
            }}
          >
            <Box>
              <Typography variant="h6" fontWeight={700}>
                {latestWeight != null ? `${latestWeight} kg` : '—'}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                gewicht{weightDelta != null ? ` (${weightDelta > 0 ? '+' : ''}${weightDelta} kg)` : ''}
              </Typography>
            </Box>
            <Box>
              <Typography variant="h6" fontWeight={700}>
                {latestBf?.bodyFatPct != null ? `${latestBf.bodyFatPct}%` : '—'}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                vetpercentage{latestBf?.bodyFatMethod === 'durnin-womersley' ? ' (berekend)' : ''}
              </Typography>
            </Box>
            <Box>
              <Typography variant="h6" fontWeight={700}>
                {latestFfm != null ? `${latestFfm} kg` : '—'}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                vetvrije massa{ffmDelta != null ? ` (${ffmDelta > 0 ? '+' : ''}${ffmDelta} kg)` : ''}
              </Typography>
            </Box>
            <Box>
              <Typography variant="h6" fontWeight={700}>
                {latestBmi != null ? latestBmi : '—'}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                BMI
              </Typography>
            </Box>
            <Box>
              <Typography variant="h6" fontWeight={700}>
                {latestSkin != null ? `${latestSkin} mm` : '—'}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                plooien{skinDelta != null ? ` (${skinDelta > 0 ? '+' : ''}${skinDelta} mm)` : ''}
              </Typography>
            </Box>
          </Box>
        </OutlineCard>

        {/* Voortgang naar doel + tempo */}
        {(goalWeight != null || perWeek != null) && (
          <OutlineCard sx={PANEL_SX}>
            {goalWeight != null && (
              <>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="caption" color="text.secondary">
                    Naar doel ({goalWeight} kg)
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {toGoal != null ? (Math.abs(toGoal) < 0.05 ? 'behaald 🎉' : `nog ${Math.abs(toGoal)} kg`) : ''}
                  </Typography>
                </Box>
                {goalProgress != null && (
                  <LinearProgress variant="determinate" value={goalProgress} sx={{ height: 8, borderRadius: 1, mb: perWeek != null ? 1 : 0 }} />
                )}
              </>
            )}
            {perWeek != null && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                Gemiddeld {perWeek > 0 ? '+' : ''}
                {perWeek} kg per week
              </Typography>
            )}
          </OutlineCard>
        )}

        {/* Gewicht-trend */}
        {weightPoints.length >= 2 && (
          <OutlineCard sx={PANEL_SX}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Gewicht ({wMin}–{wMax} kg)
            </Typography>
            <TrendChart points={weightPoints} unit="kg" goal={goalWeight} />
          </OutlineCard>
        )}

        {/* Huidplooi-trend: de som is betrouwbaarder dan het absolute vetpercentage */}
        {skinPoints.length >= 2 && (
          <OutlineCard sx={PANEL_SX}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Som huidplooien ({sMin}–{sMax} mm)
            </Typography>
            <TrendChart points={skinPoints} unit="mm" />
          </OutlineCard>
        )}

        {/* Foto-voortgang: eerste foto naast de laatste, per aanzicht */}
        {photoProgress.length > 0 && (
          <OutlineCard sx={PANEL_SX}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
              Foto's: eerste naast laatste
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {photoProgress.map((p) => (
                <Box key={p.view}>
                  <Typography variant="body2" fontWeight={500} sx={{ mb: 0.75 }}>
                    {p.label}aanzicht
                  </Typography>
                  <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1 }}>
                    {[
                      { m: p.first, tag: 'Eerste' },
                      { m: p.last, tag: 'Laatste' },
                    ].map(({ m, tag }) =>
                      m ? (
                        <Box
                          key={tag}
                          component="a"
                          href={m[p.key] as string}
                          target="_blank"
                          rel="noreferrer"
                          sx={{ display: 'block', minWidth: 0, color: 'inherit', textDecoration: 'none' }}
                        >
                          <Box
                            component="img"
                            src={m[p.key] as string}
                            alt={`${p.label}aanzicht, ${tag.toLowerCase()} foto van ${m.date}`}
                            loading="lazy"
                            sx={PHOTO_IMG_SX}
                          />
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                            {tag} · {m.date}
                          </Typography>
                        </Box>
                      ) : (
                        <Box
                          key={tag}
                          sx={{
                            display: 'flex',
                            aspectRatio: '3 / 4',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: 2,
                            border: '1px dashed',
                            borderColor: 'divider',
                            p: 1,
                            textAlign: 'center',
                          }}
                        >
                          <Typography variant="caption" color="text.secondary">
                            Nog geen tweede foto
                          </Typography>
                        </Box>
                      )
                    )}
                  </Box>
                </Box>
              ))}
            </Box>
          </OutlineCard>
        )}

        {/* Invoer */}
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
          {editingId ? 'Meting bewerken' : 'Nieuwe meting'}
        </Typography>
        <Box sx={{ ...FIELD_GRID_SX, mb: 1.5 }}>
          <TextField
            label="Datum"
            type="date"
            size="small"
            fullWidth
            value={date}
            onChange={(e) => setDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Gewicht (kg)"
            type="number"
            size="small"
            fullWidth
            inputProps={{ step: 0.1, min: 0, inputMode: 'decimal' }}
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            helperText={formBmi != null ? `BMI ${formBmi}` : weightNum != null && !targetProfile?.heightCm ? 'Vul lengte in bij Profiel voor BMI' : ' '}
          />
        </Box>

        {/* Profiel van de sporter aanvullen (alleen trainer, alleen als het ontbreekt) */}
        {canFixProfile && (
          <Box sx={{ mb: 1.5, p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
            <Typography variant="body2" fontWeight={500} sx={{ mb: 0.5 }}>
              Profiel aanvullen
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
              Voor het vetpercentage uit huidplooien zijn geboortedatum en geslacht van {targetProfile?.displayName?.trim() || 'deze sporter'} nodig. Je kunt ze hier direct invullen.
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 1.5 }}>
              <TextField label="Geboortedatum" type="date" size="small" fullWidth value={fixBirth} onChange={(e) => setFixBirth(e.target.value)} InputLabelProps={{ shrink: true }} />
              <TextField select label="Geslacht" size="small" fullWidth value={fixGender || 'none'} onChange={(e) => setFixGender(e.target.value === 'none' ? '' : (e.target.value as typeof fixGender))}>
                <MenuItem value="none">Niet opgegeven</MenuItem>
                <MenuItem value="man">Man</MenuItem>
                <MenuItem value="vrouw">Vrouw</MenuItem>
                <MenuItem value="anders">Anders</MenuItem>
              </TextField>
              <Button
                variant="outlined"
                fullWidth
                sx={{ height: 40, borderRadius: '24px', textTransform: 'none' }}
                onClick={handleFixProfile}
                disabled={savingFix || (!fixBirth && !fixGender)}
              >
                {savingFix ? 'Bezig…' : 'Profiel opslaan'}
              </Button>
            </Box>
          </Box>
        )}

        {/* Omtrekken, huidplooien en foto's ingeklapt: optioneel, samen 16 velden. Zelfde secties als de routekaart. */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 1.5 }}>
          <Accordion disableGutters expanded={openSections.includes('circ')} onChange={() => toggleSection('circ')} sx={ACCORDION_SX}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ display: 'flex', minWidth: 0, flex: 1, alignItems: 'center', justifyContent: 'space-between', gap: 1, pr: 1 }}>
                <Typography variant="subtitle1" fontWeight={600}>
                  Omtrekken (cm)
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {circFilled > 0 ? `${circFilled} ingevuld` : 'optioneel'}
                </Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 0, pt: 0.5, pb: 0.5 }}>
              <Box sx={FIELD_GRID_SX}>
                {CIRCUMFERENCE_FIELDS.map((f) => (
                  <TextField
                    key={f.key}
                    label={f.label}
                    type="number"
                    size="small"
                    fullWidth
                    inputProps={{ step: 0.5, min: 0, inputMode: 'decimal' }}
                    value={circ[f.key]}
                    onChange={(e) => setCirc((c) => ({ ...c, [f.key]: e.target.value }))}
                  />
                ))}
              </Box>
            </AccordionDetails>
          </Accordion>

          <Accordion disableGutters expanded={openSections.includes('skin')} onChange={() => toggleSection('skin')} sx={ACCORDION_SX}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ display: 'flex', minWidth: 0, flex: 1, alignItems: 'center', justifyContent: 'space-between', gap: 1, pr: 1 }}>
                <Typography variant="subtitle1" fontWeight={600}>
                  Huidplooien (mm)
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {currentSkinSum != null ? `som ${currentSkinSum} mm${computedFat ? ` · ${computedFat.pct}%` : ''}` : 'optioneel'}
                </Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 0, pt: 0.5, pb: 0.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                Meet rechts, met dezelfde caliper en op hetzelfde moment van de dag. Biceps, triceps, rug en heup samen geven het vetpercentage (Durnin &amp; Womersley); buik telt alleen mee in de som.
              </Typography>
              <Box sx={FIELD_GRID_SX}>
                {SKINFOLD_FIELDS.map((f) => (
                  <TextField
                    key={f.key}
                    label={f.label}
                    type="number"
                    size="small"
                    fullWidth
                    inputProps={{ step: 0.5, min: 0, inputMode: 'decimal' }}
                    value={skin[f.key]}
                    onChange={(e) => setSkin((s) => ({ ...s, [f.key]: e.target.value }))}
                    helperText={f.hint}
                  />
                ))}
              </Box>
              <Box sx={{ mt: 1, p: 1.5, borderRadius: 2, bgcolor: 'rgba(0,0,0,0.04)', fontSize: 14 }} aria-live="polite">
                {computedFat ? (
                  <>
                    <Box component="span" sx={{ fontWeight: 500 }}>
                      Vetpercentage: {computedFat.pct}%
                    </Box>
                    <Box component="span" sx={{ color: 'text.secondary' }}>
                      {' '}
                      · som {computedFat.sumMm} mm · berekend
                    </Box>
                    {formFfm != null ? (
                      <Box sx={{ mt: 0.5 }}>
                        <Box component="span" sx={{ fontWeight: 500 }}>
                          Vetvrije massa: {formFfm} kg
                        </Box>
                        <Box component="span" sx={{ color: 'text.secondary' }}>
                          {' '}
                          · gewicht min vet
                        </Box>
                      </Box>
                    ) : (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                        Vul gewicht in voor de vetvrije massa.
                      </Typography>
                    )}
                  </>
                ) : formulaHint ? (
                  <Box component="span" sx={{ color: 'text.secondary' }}>
                    {formulaHint}
                  </Box>
                ) : (
                  <Box component="span" sx={{ color: 'text.secondary' }}>
                    {skinFilled > 0 ? `Som ${currentSkinSum} mm. ` : ''}Vul biceps, triceps, rug en heup in voor het vetpercentage.
                  </Box>
                )}
                {!computedFat && bodyFat && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                    Opgeslagen vetpercentage van deze meting: {bodyFat}% (blijft bewaard).
                  </Typography>
                )}
              </Box>
            </AccordionDetails>
          </Accordion>

          <Accordion disableGutters expanded={openSections.includes('photos')} onChange={() => toggleSection('photos')} sx={ACCORDION_SX}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ display: 'flex', minWidth: 0, flex: 1, alignItems: 'center', justifyContent: 'space-between', gap: 1, pr: 1 }}>
                <Typography variant="subtitle1" fontWeight={600}>
                  Foto's
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {(() => {
                    const n = PHOTO_VIEWS.filter((v) => photos[v.view].file || (photos[v.view].existingUrl && !photos[v.view].remove)).length;
                    return n > 0 ? `${n} van 3` : 'optioneel';
                  })()}
                </Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 0, pt: 0.5, pb: 0.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                Voor, zij en achter. Zelfde plek, zelfde licht, zelfde houding: dan zie je het verschil echt.
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
                {PHOTO_VIEWS.map((v) => {
                  const slot = photos[v.view];
                  const shown = slot.previewUrl ?? (slot.remove ? null : slot.existingUrl);
                  return (
                    <Box key={v.view} sx={{ minWidth: 0 }}>
                      <input
                        ref={(el) => {
                          photoInputs.current[v.view] = el;
                        }}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        hidden
                        id={`photo-${v.view}`}
                        onChange={(e) => pickPhoto(v.view, e.target.files?.[0] ?? null)}
                      />
                      <Typography variant="caption" fontWeight={500} sx={{ display: 'block', mb: 0.5 }}>
                        {v.label}
                      </Typography>
                      {shown ? (
                        <Box sx={{ position: 'relative' }}>
                          <Box component="img" src={shown} alt={`${v.label}aanzicht`} sx={PHOTO_IMG_SX} />
                          <IconButton
                            type="button"
                            size="small"
                            aria-label={`${v.label}foto verwijderen`}
                            onClick={() => clearPhoto(v.view)}
                            sx={{
                              position: 'absolute',
                              top: 4,
                              right: 4,
                              width: 32,
                              height: 32,
                              bgcolor: 'background.paper',
                              boxShadow: 1,
                              '&:hover': { bgcolor: 'background.paper' },
                            }}
                          >
                            <CloseRoundedIcon fontSize="small" />
                          </IconButton>
                        </Box>
                      ) : (
                        <Box
                          component="label"
                          htmlFor={`photo-${v.view}`}
                          sx={{
                            display: 'flex',
                            aspectRatio: '3 / 4',
                            cursor: 'pointer',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 0.5,
                            borderRadius: 2,
                            border: '1px dashed',
                            borderColor: 'divider',
                            color: 'text.secondary',
                            fontSize: 12,
                            transition: 'background-color 0.2s ease',
                            '&:hover': { bgcolor: 'rgba(0,0,0,0.04)' },
                            '&:focus-within': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
                          }}
                        >
                          <PhotoCameraRoundedIcon fontSize="small" />
                          Kies foto
                        </Box>
                      )}
                      {shown && (
                        <Button
                          type="button"
                          variant="text"
                          size="small"
                          fullWidth
                          sx={{ mt: 0.5, height: 32, fontSize: 12, textTransform: 'none' }}
                          onClick={() => photoInputs.current[v.view]?.click()}
                        >
                          Vervangen
                        </Button>
                      )}
                    </Box>
                  );
                })}
              </Box>
            </AccordionDetails>
          </Accordion>
        </Box>

        <TextField label="Notitie (optioneel)" size="small" fullWidth value={note} onChange={(e) => setNote(e.target.value)} sx={{ mb: 2 }} />
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="contained" onClick={handleSave} disabled={saving} sx={PRIMARY_BUTTON_SX}>
            {saving ? 'Bezig…' : editingId ? 'Opslaan' : 'Toevoegen'}
          </Button>
          {editingId && (
            <Button variant="text" onClick={resetForm} sx={{ textTransform: 'none' }}>
              Annuleren
            </Button>
          )}
        </Box>

        {/* Historie */}
        <Typography variant="subtitle1" fontWeight={600} sx={{ mt: 3, mb: 1 }}>
          Historie
        </Typography>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
            <CircularProgress size={20} />
          </Box>
        ) : items.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Nog geen metingen.
          </Typography>
        ) : (
          <List disablePadding>
            {[...items].reverse().map((m) => {
              const circSummary = CIRCUMFERENCE_FIELDS.filter((f) => m[f.key] != null)
                .map((f) => `${f.label} ${m[f.key]}`)
                .join(' · ');
              const sum = skinfoldSum(m);
              const skinSummary = sum != null ? `Plooien ${sum} mm` : null;
              const photoCount = PHOTO_VIEWS.filter((v) => m[v.key] != null).length;
              const photoSummary = photoCount > 0 ? `${photoCount} foto${photoCount === 1 ? '' : "'s"}` : null;
              const secondary = [circSummary || null, skinSummary, photoSummary, m.note || null].filter(Boolean).join(' — ');
              const ffm = m.weightKg != null && m.bodyFatPct != null ? fatFreeMassKg(m.weightKg, m.bodyFatPct) : null;
              const fatLabel =
                m.bodyFatPct != null
                  ? `${m.bodyFatPct}%${m.bodyFatMethod === 'durnin-womersley' ? ' (berekend)' : ''}${ffm != null ? ` · VVM ${ffm} kg` : ''}`
                  : '';
              return (
                <ListItem
                  key={m.id}
                  disableGutters
                  divider
                  alignItems="flex-start"
                  sx={{ py: 1.25, pr: 10, '&:last-child': { borderBottom: 0 } }}
                  secondaryAction={
                    <Box sx={{ display: 'flex', gap: 0.25 }}>
                      <IconButton size="small" sx={{ width: 32, height: 32 }} onClick={() => handleEdit(m)} aria-label="Bewerken">
                        <EditRoundedIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" sx={{ width: 32, height: 32 }} onClick={() => handleDelete(m.id)} aria-label="Verwijderen">
                        <DeleteOutlineRoundedIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  }
                >
                  <ListItemText
                    sx={{ my: 0, minWidth: 0 }}
                    primary={`${m.date} · ${m.weightKg != null ? `${m.weightKg} kg` : ''}${m.weightKg != null && fatLabel ? ' · ' : ''}${fatLabel}`}
                    primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }}
                    secondary={secondary || null}
                    secondaryTypographyProps={{ variant: 'caption', sx: { display: 'block', mt: 0.25 } }}
                  />
                </ListItem>
              );
            })}
          </List>
        )}
      </ContentCard>

      <Dialog open={goalOpen} onClose={() => setGoalOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ pb: 0.5 }}>Doelgewicht</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Vul je streefgewicht in. Laat leeg om geen doel te gebruiken.
          </Typography>
          <Box sx={{ py: 1 }}>
            <TextField
              label="Doelgewicht (kg)"
              type="number"
              size="small"
              fullWidth
              autoFocus
              inputProps={{ step: 0.1, min: 0, inputMode: 'decimal' }}
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button variant="text" onClick={() => setGoalOpen(false)} sx={{ textTransform: 'none' }}>
            Annuleren
          </Button>
          <Button variant="contained" onClick={handleSaveGoal} sx={PRIMARY_BUTTON_SX}>
            Opslaan
          </Button>
        </DialogActions>
      </Dialog>
    </PageLayout>
  );
}
