import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pencil, Trash2, Loader2, Camera, X } from 'lucide-react';
import { TextField, MenuItem, Accordion, AccordionSummary, AccordionDetails, Typography } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { useProfile } from '../context/ProfileContext';
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

type SectionKey = 'circ' | 'skin' | 'photos';

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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
    <div ref={ref} className="w-full text-primary">
      <svg viewBox={`0 0 ${width} ${CH}`} className="block h-[130px] w-full">
        {goal != null && <line x1={0} y1={cy(goal)} x2={width} y2={cy(goal)} stroke="#9e9e9e" strokeWidth={1} strokeDasharray="4 4" />}
        <polyline points={line} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => (
          <circle key={p.id} cx={cx(i)} cy={cy(p.value)} r={3} fill="currentColor">
            <title>{`${p.date}: ${p.value} ${unit}`}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
}

export function MetingenPage() {
  const profileCtx = useProfile();
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
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [effectiveUserId]);

  useEffect(() => {
    load();
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
    await deleteMeasurement(id).catch(() => {});
    if (m && PHOTO_VIEWS.some((v) => m[v.key] != null)) await deleteAllProgressPhotos(m.userId, id).catch(() => {});
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
    await updateProfile(effectiveUserId, { weightGoalKg: g && g > 0 ? g : null }).catch(() => {});
    await profileCtx?.refreshProfile();
    setGoalOpen(false);
  };

  return (
    <div className="animate-fade-in-up mx-auto w-full max-w-3xl pb-6">
      <Card>
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-2xl font-semibold">Metingen</h1>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setGoalInput(goalWeight != null ? String(goalWeight) : '');
                setGoalOpen(true);
              }}
            >
              {goalWeight != null ? `Doel: ${goalWeight} kg` : 'Doelgewicht instellen'}
            </Button>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            Houd je gewicht, vetpercentage, omtrekmaten en huidplooien bij en volg je voortgang.
          </p>

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
          <div className="mb-4 grid grid-cols-3 gap-x-2 gap-y-4 rounded-xl border border-border p-4 text-center sm:grid-cols-5">
            <div>
              <div className="text-lg font-bold">{latestWeight != null ? `${latestWeight} kg` : '—'}</div>
              <div className="text-xs text-muted-foreground">
                gewicht{weightDelta != null ? ` (${weightDelta > 0 ? '+' : ''}${weightDelta} kg)` : ''}
              </div>
            </div>
            <div>
              <div className="text-lg font-bold">{latestBf?.bodyFatPct != null ? `${latestBf.bodyFatPct}%` : '—'}</div>
              <div className="text-xs text-muted-foreground">
                vetpercentage{latestBf?.bodyFatMethod === 'durnin-womersley' ? ' (berekend)' : ''}
              </div>
            </div>
            <div>
              <div className="text-lg font-bold">{latestFfm != null ? `${latestFfm} kg` : '—'}</div>
              <div className="text-xs text-muted-foreground">
                vetvrije massa{ffmDelta != null ? ` (${ffmDelta > 0 ? '+' : ''}${ffmDelta} kg)` : ''}
              </div>
            </div>
            <div>
              <div className="text-lg font-bold">{latestBmi != null ? latestBmi : '—'}</div>
              <div className="text-xs text-muted-foreground">BMI</div>
            </div>
            <div>
              <div className="text-lg font-bold">{latestSkin != null ? `${latestSkin} mm` : '—'}</div>
              <div className="text-xs text-muted-foreground">
                plooien{skinDelta != null ? ` (${skinDelta > 0 ? '+' : ''}${skinDelta} mm)` : ''}
              </div>
            </div>
          </div>

          {/* Voortgang naar doel + tempo */}
          {(goalWeight != null || perWeek != null) && (
            <div className="mb-4 rounded-xl border border-border p-4">
              {goalWeight != null && (
                <>
                  <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                    <span>Naar doel ({goalWeight} kg)</span>
                    <span>{toGoal != null ? (Math.abs(toGoal) < 0.05 ? 'behaald 🎉' : `nog ${Math.abs(toGoal)} kg`) : ''}</span>
                  </div>
                  {goalProgress != null && <Progress value={goalProgress} className={perWeek != null ? 'mb-2 h-2' : 'h-2'} />}
                </>
              )}
              {perWeek != null && (
                <div className="text-xs text-muted-foreground">
                  Gemiddeld {perWeek > 0 ? '+' : ''}
                  {perWeek} kg per week
                </div>
              )}
            </div>
          )}

          {/* Gewicht-trend */}
          {weightPoints.length >= 2 && (
            <div className="mb-4 rounded-xl border border-border p-4">
              <div className="mb-2 text-xs text-muted-foreground">
                Gewicht ({wMin}–{wMax} kg)
              </div>
              <TrendChart points={weightPoints} unit="kg" goal={goalWeight} />
            </div>
          )}

          {/* Huidplooi-trend: de som is betrouwbaarder dan het absolute vetpercentage */}
          {skinPoints.length >= 2 && (
            <div className="mb-4 rounded-xl border border-border p-4">
              <div className="mb-2 text-xs text-muted-foreground">
                Som huidplooien ({sMin}–{sMax} mm)
              </div>
              <TrendChart points={skinPoints} unit="mm" />
            </div>
          )}

          {/* Foto-voortgang: eerste foto naast de laatste, per aanzicht */}
          {photoProgress.length > 0 && (
            <div className="mb-4 rounded-xl border border-border p-4">
              <div className="mb-3 text-xs text-muted-foreground">Foto's: eerste naast laatste</div>
              <div className="flex flex-col gap-4">
                {photoProgress.map((p) => (
                  <div key={p.view}>
                    <div className="mb-1.5 text-sm font-medium">{p.label}aanzicht</div>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { m: p.first, tag: 'Eerste' },
                        { m: p.last, tag: 'Laatste' },
                      ].map(({ m, tag }) =>
                        m ? (
                          <a key={tag} href={m[p.key] as string} target="_blank" rel="noreferrer" className="block min-w-0">
                            <img
                              src={m[p.key] as string}
                              alt={`${p.label}aanzicht, ${tag.toLowerCase()} foto van ${m.date}`}
                              className="aspect-[3/4] w-full rounded-lg bg-muted object-cover"
                              loading="lazy"
                            />
                            <div className="mt-1 text-xs text-muted-foreground">
                              {tag} · {m.date}
                            </div>
                          </a>
                        ) : (
                          <div key={tag} className="flex aspect-[3/4] items-center justify-center rounded-lg border border-dashed border-border p-2 text-center text-xs text-muted-foreground">
                            Nog geen tweede foto
                          </div>
                        )
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Invoer */}
          <h2 className="mb-2 text-base font-semibold">{editingId ? 'Meting bewerken' : 'Nieuwe meting'}</h2>
          <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
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
          </div>

          {/* Profiel van de sporter aanvullen (alleen trainer, alleen als het ontbreekt) */}
          {canFixProfile && (
            <div className="mb-3 rounded-xl border border-border p-3">
              <div className="mb-1 text-sm font-medium">Profiel aanvullen</div>
              <p className="mb-3 text-xs text-muted-foreground">
                Voor het vetpercentage uit huidplooien zijn geboortedatum en geslacht van {targetProfile?.displayName?.trim() || 'deze sporter'} nodig. Je kunt ze hier direct invullen.
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <TextField label="Geboortedatum" type="date" size="small" fullWidth value={fixBirth} onChange={(e) => setFixBirth(e.target.value)} InputLabelProps={{ shrink: true }} />
                <TextField select label="Geslacht" size="small" fullWidth value={fixGender || 'none'} onChange={(e) => setFixGender(e.target.value === 'none' ? '' : (e.target.value as typeof fixGender))}>
                  <MenuItem value="none">Niet opgegeven</MenuItem>
                  <MenuItem value="man">Man</MenuItem>
                  <MenuItem value="vrouw">Vrouw</MenuItem>
                  <MenuItem value="anders">Anders</MenuItem>
                </TextField>
                <Button className="h-10 w-full" variant="secondary" onClick={handleFixProfile} disabled={savingFix || (!fixBirth && !fixGender)}>
                  {savingFix ? 'Bezig…' : 'Profiel opslaan'}
                </Button>
              </div>
            </div>
          )}

          {/* Omtrekken, huidplooien en foto's ingeklapt: optioneel, samen 16 velden. Zelfde secties als de routekaart. */}
          <div className="mb-3 flex flex-col gap-3">
            <Accordion disableGutters expanded={openSections.includes('circ')} onChange={() => toggleSection('circ')} sx={ACCORDION_SX}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <div className="flex min-w-0 flex-1 items-center justify-between gap-2 pr-2">
                  <Typography variant="subtitle1" fontWeight={600}>
                    Omtrekken (cm)
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {circFilled > 0 ? `${circFilled} ingevuld` : 'optioneel'}
                  </Typography>
                </div>
              </AccordionSummary>
              <AccordionDetails sx={{ px: 0, pt: 0.5, pb: 0.5 }}>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                </div>
              </AccordionDetails>
            </Accordion>

            <Accordion disableGutters expanded={openSections.includes('skin')} onChange={() => toggleSection('skin')} sx={ACCORDION_SX}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <div className="flex min-w-0 flex-1 items-center justify-between gap-2 pr-2">
                  <Typography variant="subtitle1" fontWeight={600}>
                    Huidplooien (mm)
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {currentSkinSum != null ? `som ${currentSkinSum} mm${computedFat ? ` · ${computedFat.pct}%` : ''}` : 'optioneel'}
                  </Typography>
                </div>
              </AccordionSummary>
              <AccordionDetails sx={{ px: 0, pt: 0.5, pb: 0.5 }}>
                <p className="mb-3 text-xs text-muted-foreground">
                  Meet rechts, met dezelfde caliper en op hetzelfde moment van de dag. Biceps, triceps, rug en heup samen geven het vetpercentage (Durnin &amp; Womersley); buik telt alleen mee in de som.
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                </div>
                <div className="mt-2 rounded-lg bg-muted p-3 text-sm" aria-live="polite">
                  {computedFat ? (
                    <>
                      <span className="font-medium">Vetpercentage: {computedFat.pct}%</span>
                      <span className="text-muted-foreground"> · som {computedFat.sumMm} mm · berekend</span>
                      {formFfm != null ? (
                        <div className="mt-1">
                          <span className="font-medium">Vetvrije massa: {formFfm} kg</span>
                          <span className="text-muted-foreground"> · gewicht min vet</span>
                        </div>
                      ) : (
                        <div className="mt-1 text-xs text-muted-foreground">Vul gewicht in voor de vetvrije massa.</div>
                      )}
                    </>
                  ) : formulaHint ? (
                    <span className="text-muted-foreground">{formulaHint}</span>
                  ) : (
                    <span className="text-muted-foreground">
                      {skinFilled > 0 ? `Som ${currentSkinSum} mm. ` : ''}Vul biceps, triceps, rug en heup in voor het vetpercentage.
                    </span>
                  )}
                  {!computedFat && bodyFat && (
                    <div className="mt-1 text-xs text-muted-foreground">Opgeslagen vetpercentage van deze meting: {bodyFat}% (blijft bewaard).</div>
                  )}
                </div>
              </AccordionDetails>
            </Accordion>

            <Accordion disableGutters expanded={openSections.includes('photos')} onChange={() => toggleSection('photos')} sx={ACCORDION_SX}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <div className="flex min-w-0 flex-1 items-center justify-between gap-2 pr-2">
                  <Typography variant="subtitle1" fontWeight={600}>
                    Foto's
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {(() => {
                      const n = PHOTO_VIEWS.filter((v) => photos[v.view].file || (photos[v.view].existingUrl && !photos[v.view].remove)).length;
                      return n > 0 ? `${n} van 3` : 'optioneel';
                    })()}
                  </Typography>
                </div>
              </AccordionSummary>
              <AccordionDetails sx={{ px: 0, pt: 0.5, pb: 0.5 }}>
                <p className="mb-3 text-xs text-muted-foreground">
                  Voor, zij en achter. Zelfde plek, zelfde licht, zelfde houding: dan zie je het verschil echt.
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {PHOTO_VIEWS.map((v) => {
                    const slot = photos[v.view];
                    const shown = slot.previewUrl ?? (slot.remove ? null : slot.existingUrl);
                    return (
                      <div key={v.view} className="min-w-0">
                        <input
                          ref={(el) => {
                            photoInputs.current[v.view] = el;
                          }}
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          id={`photo-${v.view}`}
                          onChange={(e) => pickPhoto(v.view, e.target.files?.[0] ?? null)}
                        />
                        <div className="mb-1 text-xs font-medium">{v.label}</div>
                        {shown ? (
                          <div className="relative">
                            <img src={shown} alt={`${v.label}aanzicht`} className="aspect-[3/4] w-full rounded-lg bg-muted object-cover" />
                            <Button
                              type="button"
                              variant="secondary"
                              size="icon"
                              className="absolute right-1 top-1 h-8 w-8 rounded-full"
                              aria-label={`${v.label}foto verwijderen`}
                              onClick={() => clearPhoto(v.view)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <label
                            htmlFor={`photo-${v.view}`}
                            className="flex aspect-[3/4] cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-xs text-muted-foreground transition-colors hover:bg-muted focus-within:ring-2 focus-within:ring-ring"
                          >
                            <Camera className="h-5 w-5" />
                            Kies foto
                          </label>
                        )}
                        {shown && (
                          <Button type="button" variant="ghost" size="sm" className="mt-1 h-8 w-full text-xs" onClick={() => photoInputs.current[v.view]?.click()}>
                            Vervangen
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </AccordionDetails>
            </Accordion>
          </div>

          <TextField label="Notitie (optioneel)" size="small" fullWidth value={note} onChange={(e) => setNote(e.target.value)} sx={{ mb: 2 }} />
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Bezig…' : editingId ? 'Opslaan' : 'Toevoegen'}
            </Button>
            {editingId && (
              <Button variant="ghost" onClick={resetForm}>
                Annuleren
              </Button>
            )}
          </div>

          {/* Historie */}
          <h2 className="mb-2 mt-6 text-base font-semibold">Historie</h2>
          {loading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nog geen metingen.</p>
          ) : (
            <ul className="divide-y divide-border">
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
                  <li key={m.id} className="flex items-start justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">
                        {`${m.date} · ${m.weightKg != null ? `${m.weightKg} kg` : ''}${m.weightKg != null && fatLabel ? ' · ' : ''}${fatLabel}`}
                      </div>
                      {secondary && <div className="mt-0.5 text-xs text-muted-foreground">{secondary}</div>}
                    </div>
                    <div className="flex shrink-0 gap-0.5">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(m)} aria-label="Bewerken">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(m.id)} aria-label="Verwijderen">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={goalOpen} onOpenChange={setGoalOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Doelgewicht</DialogTitle>
            <DialogDescription>Vul je streefgewicht in. Laat leeg om geen doel te gebruiken.</DialogDescription>
          </DialogHeader>
          <div className="py-2">
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
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setGoalOpen(false)}>
              Annuleren
            </Button>
            <Button onClick={handleSaveGoal}>Opslaan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
