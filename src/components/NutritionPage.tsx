import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  MenuItem,
  IconButton,
  Card,
  CardContent,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  ButtonBase,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemAvatar,
  Avatar,
  ToggleButton,
  ToggleButtonGroup,
  LinearProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import RestaurantRoundedIcon from '@mui/icons-material/RestaurantRounded';
import PhotoCameraRoundedIcon from '@mui/icons-material/PhotoCameraRounded';
import QrCodeScannerRoundedIcon from '@mui/icons-material/QrCodeScannerRounded';
import AddCircleRoundedIcon from '@mui/icons-material/AddCircleRounded';
import { lazy, Suspense } from 'react';
import { designTokens } from '../theme/designTokens';

// Barcode-scanner (zxing, ~150 kB) pas laden als de scanner opent.
const BarcodeScannerDialog = lazy(() =>
  import('./BarcodeScannerDialog').then((m) => ({ default: m.BarcodeScannerDialog }))
);
import { PageLayout, ContentCard } from './layout';
import { useProfile } from '../context/ProfileContext';
import { useNotify } from '../context/NotifyContext';
import { updateProfile } from '../services/profileService';
import type { NutritionGoal } from '../types';
import {
  searchFoods,
  macrosForGrams,
  saveNutritionLog,
  deleteNutritionLog,
  getNutritionLogsForUser,
  recognizeFoodPhoto,
  getProductByBarcode,
  type FoodProduct,
  type NutritionLog,
  type RecognizedFood,
  defaultMealForNow,
  MEAL_LABELS,
  MEAL_ORDER,
  MACRO_COLORS,
  type MealMoment,
} from '../services/nutritionService';
import { todayIso } from '../utils/format';
import { fileToDataUrl } from '../utils/imageDataUrl';
import { NumberField } from './NumberField';
import { ProductSheet, type PortionChoice } from './nutrition/ProductSheet';

type Period = 'day' | 'week' | 'month';

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** Array van ISO-dagen van (count-1) dagen terug t/m de anker-dag. */
function rangeDays(endIso: string, count: number): string[] {
  const [y, m, d] = endIso.split('-').map(Number);
  const end = new Date(y, m - 1, d);
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const dt = new Date(end);
    dt.setDate(end.getDate() - i);
    out.push(isoDay(dt));
  }
  return out;
}

/** Reconstrueer de waarden per 100 g uit een gelogd item (voor bewerken). */
function per100gFromLog(l: NutritionLog): FoodProduct['per100g'] {
  const f = l.grams > 0 ? 100 / l.grams : 1;
  return {
    kcal: Math.round(l.kcal * f),
    protein: Math.round(l.protein * f * 10) / 10,
    carbs: Math.round(l.carbs * f * 10) / 10,
    fat: Math.round(l.fat * f * 10) / 10,
  };
}

const EMPTY_TOTALS = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

/** Volgorde van de dag, met achteraan wat vóór de eetmomenten is gelogd en dus geen moment heeft. */
const MEAL_GROUPS: { key: MealMoment | null; label: string }[] = [
  ...MEAL_ORDER.map((m) => ({ key: m as MealMoment | null, label: MEAL_LABELS[m] })),
  { key: null, label: 'Zonder moment' },
];
function sumLogs(logs: NutritionLog[]) {
  return logs.reduce(
    (a, l) => ({
      kcal: a.kcal + l.kcal,
      protein: Math.round((a.protein + l.protein) * 10) / 10,
      carbs: Math.round((a.carbs + l.carbs) * 10) / 10,
      fat: Math.round((a.fat + l.fat) * 10) / 10,
    }),
    { ...EMPTY_TOTALS }
  );
}

/** Rijen onder de kcal-balk: label, sleutel in de totalen en macro-kleur. */
const MACRO_ROWS = [
  { key: 'protein' as const, label: 'Eiwit', color: MACRO_COLORS.protein },
  { key: 'carbs' as const, label: 'Koolhydraten', color: MACRO_COLORS.carbs },
  { key: 'fat' as const, label: 'Vet', color: MACRO_COLORS.fat },
];

/**
 * Zelfde geneste-kaart-stijl als de ACCORDION_SX in LogsPage/MetingenPage: een tint dieper dan de
 * omringende ContentCard, anders vallen de kaarten er tegenaan weg.
 */
const NESTED_CARD_SX = {
  backgroundColor: designTokens.cardBackgroundHigh,
  border: `1px solid ${designTokens.cardBorder}`,
  boxShadow: 'none',
  borderRadius: `${designTokens.cardRadius}px`,
} as const;

const MEAL_ACCORDION_SX = {
  ...NESTED_CARD_SX,
  margin: 0,
  mb: 1,
  '&:before': { display: 'none' },
} as const;

export function NutritionPage() {
  const profileCtx = useProfile();
  const notify = useNotify();
  const isTrainer = profileCtx?.isTrainer ?? false;
  const sporters = profileCtx?.allSporters ?? [];
  const selfUid = profileCtx?.profile?.userId ?? '';
  const selfTrainerId = profileCtx?.profile?.trainerId ?? null;

  const [targetId, setTargetId] = useState('');
  const [period, setPeriod] = useState<Period>('day');
  const [date, setDate] = useState(todayIso());
  const [allLogs, setAllLogs] = useState<NutritionLog[]>([]);
  const [loading, setLoading] = useState(false);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<FoodProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchNote, setSearchNote] = useState<string | null>(null);
  const [selected, setSelected] = useState<FoodProduct | null>(null);
  const [editingLog, setEditingLog] = useState<NutritionLog | null>(null);
  const [grams, setGrams] = useState('100');
  const [meal, setMeal] = useState<MealMoment>(() => defaultMealForNow());
  const [portion, setPortion] = useState<PortionChoice | null>(null);
  const [saving, setSaving] = useState(false);

  const [goalOpen, setGoalOpen] = useState(false);

  // AI-fotoherkenning
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [recognizing, setRecognizing] = useState(false);
  const [suggestions, setSuggestions] = useState<RecognizedFood[] | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  // Barcode scannen
  const [scannerOpen, setScannerOpen] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);

  // Welke eetmoment-groepen zijn uitgeklapt (dicht bij Figma: standaard alleen een regel per moment)
  const [openMeals, setOpenMeals] = useState<string[]>([]);
  const toggleMeal = (k: string) => setOpenMeals((o) => (o.includes(k) ? o.filter((x) => x !== k) : [...o, k]));

  const handleBarcode = useCallback(async (code: string) => {
    setScannerOpen(false);
    setLookingUp(true);
    setPhotoError(null);
    try {
      const p = await getProductByBarcode(code);
      if (p) {
        setSelected(p);
        setGrams(p.servingGrams != null ? String(p.servingGrams) : '100');
      } else {
        setPhotoError(`Geen product gevonden voor barcode ${code}.`);
      }
    } catch {
      setPhotoError('Opzoeken van de barcode mislukte.');
    } finally {
      setLookingUp(false);
    }
  }, []);

  const handlePhoto = async (file: File | null) => {
    if (!file) return;
    setRecognizing(true);
    setPhotoError(null);
    try {
      const dataUrl = await fileToDataUrl(file);
      const items = await recognizeFoodPhoto(dataUrl);
      if (items.length === 0) {
        setPhotoError('Geen voeding herkend. Probeer een duidelijkere foto.');
      } else if (items.length === 1) {
        // Direct naar het toevoeg-venster als er maar één item is
        const s = items[0];
        setSelected({ code: `ai:${s.name}`, name: s.name, brand: 'AI-schatting', imageUrl: null, per100g: s.per100g, servingGrams: s.grams });
        setGrams(String(s.grams));
      } else {
        setSuggestions(items);
      }
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : 'Herkenning mislukt.');
    } finally {
      setRecognizing(false);
    }
  };

  const pickSuggestion = (s: RecognizedFood) => {
    setSuggestions(null);
    setSelected({
      code: `ai:${s.name}`,
      name: s.name,
      brand: 'AI-schatting',
      imageUrl: null,
      per100g: s.per100g,
      servingGrams: s.grams,
    });
    setGrams(String(s.grams));
  };

  const effectiveUserId = targetId || selfUid;
  const effectiveTrainerId = targetId ? sporters.find((s) => s.userId === targetId)?.trainerId ?? null : selfTrainerId;
  const goal: NutritionGoal | null = targetId
    ? sporters.find((s) => s.userId === targetId)?.nutritionGoal ?? null
    : profileCtx?.profile?.nutritionGoal ?? null;

  const loadLogs = useCallback(async () => {
    if (!effectiveUserId) return;
    setLoading(true);
    try {
      setAllLogs(await getNutritionLogsForUser(effectiveUserId));
    } catch (err) {
      setAllLogs([]);
      notify.error('Voedingslogs laden mislukt. Controleer je verbinding.', err);
    } finally {
      setLoading(false);
    }
  }, [effectiveUserId, notify]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  useEffect(() => {
    const q = term.trim();
    if (!q) {
      setResults([]);
      setSearchNote(null);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(() => {
      searchFoods(q)
        .then(({ products, remoteFailed }) => {
          if (cancelled) return;
          setResults(products);
          if (remoteFailed) {
            setSearchNote(
              products.length
                ? 'De productendatabase is even niet bereikbaar; je ziet alleen de basisproducten.'
                : 'De productendatabase is even niet bereikbaar. Probeer het zo nog eens, of voeg het product handmatig toe.'
            );
          } else {
            setSearchNote(products.length ? null : `Geen product gevonden voor "${q}".`);
          }
        })
        .catch(() => {
          if (cancelled) return;
          setResults([]);
          setSearchNote('Zoeken lukte niet. Probeer het zo nog eens.');
        })
        .finally(() => !cancelled && setSearching(false));
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [term]);

  const days = period === 'day' ? [date] : rangeDays(date, period === 'week' ? 7 : 30);
  const daySet = useMemo(() => new Set(days), [days.join(',')]);
  const rangeLogs = useMemo(() => allLogs.filter((l) => daySet.has(l.date)), [allLogs, daySet]);
  const dayLogs = useMemo(() => allLogs.filter((l) => l.date === date).sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1)), [allLogs, date]);

  const totals = useMemo(() => sumLogs(rangeLogs), [rangeLogs]);
  const perDay = useMemo(() => {
    const map: Record<string, number> = {};
    for (const d of days) map[d] = 0;
    for (const l of rangeLogs) map[l.date] = (map[l.date] ?? 0) + l.kcal;
    return days.map((d) => ({ date: d, kcal: map[d] ?? 0 }));
  }, [days.join(','), rangeLogs]);

  const nDays = days.length;
  const avg = {
    kcal: Math.round(totals.kcal / nDays),
    protein: Math.round((totals.protein / nDays) * 10) / 10,
    carbs: Math.round((totals.carbs / nDays) * 10) / 10,
    fat: Math.round((totals.fat / nDays) * 10) / 10,
  };
  // In dag-modus tonen we het dagtotaal; anders het gemiddelde per dag
  const shown = period === 'day' ? totals : avg;
  const maxKcal = Math.max(1, ...perDay.map((p) => p.kcal), goal?.kcal ?? 0);

  const openAdd = (p: FoodProduct) => {
    setSelected(p);
    setGrams(p.servingGrams != null ? String(p.servingGrams) : '100');
  };

  const openEdit = (l: NutritionLog) => {
    setEditingLog(l);
    setSelected({ code: `edit:${l.id}`, name: l.productName, brand: l.brand, imageUrl: null, per100g: per100gFromLog(l), servingGrams: l.grams });
    setGrams(String(l.grams));
    setMeal(l.meal ?? defaultMealForNow());
    setPortion(l.portionLabel && l.quantity ? { label: l.portionLabel, quantity: l.quantity } : null);
  };

  const closeDialog = () => {
    setSelected(null);
    setEditingLog(null);
    setPortion(null);
  };

  const handleSave = async () => {
    if (!selected || !effectiveUserId) return;
    const g = Number(grams);
    if (!Number.isFinite(g) || g <= 0) return;
    setSaving(true);
    try {
      const m = macrosForGrams(selected.per100g, g);
      const editing = editingLog;
      await saveNutritionLog({
        id: editing?.id,
        createdAt: editing?.createdAt,
        userId: editing?.userId || effectiveUserId,
        loggedBy: editing?.loggedBy || selfUid || effectiveUserId,
        trainerId: editing ? editing.trainerId : effectiveTrainerId,
        date: editing ? editing.date : date,
        productName: selected.name,
        brand: selected.brand,
        grams: g,
        kcal: m.kcal,
        protein: m.protein,
        carbs: m.carbs,
        fat: m.fat,
        meal,
        portionLabel: portion?.label ?? null,
        quantity: portion?.quantity ?? null,
      });
      closeDialog();
      setTerm('');
      setResults([]);
      await loadLogs();
    } catch {
      /* laat dialog open */
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteNutritionLog(id);
    } catch (err) {
      notify.error('Voedingslog verwijderen mislukt. Probeer het opnieuw.', err);
    }
    await loadLogs();
  };

  const periodLabel = period === 'day' ? 'Deze dag' : period === 'week' ? 'Gemiddeld per dag (7 dagen)' : 'Gemiddeld per dag (30 dagen)';

  return (
    <PageLayout>
      <ContentCard>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
          <Typography variant="h5" fontWeight={600}>
            Voeding
          </Typography>
          <Button size="small" variant="text" onClick={() => setGoalOpen(true)}>
            {goal ? 'Doel aanpassen' : 'Doel instellen'}
          </Button>
        </Box>

        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', my: 2, alignItems: 'center' }}>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={period}
            onChange={(_, v) => v && setPeriod(v)}
          >
            <ToggleButton value="day">Dag</ToggleButton>
            <ToggleButton value="week">Week</ToggleButton>
            <ToggleButton value="month">Maand</ToggleButton>
          </ToggleButtonGroup>
          {isTrainer && sporters.length > 0 && (
            <TextField select size="small" label="Voor wie?" value={targetId} onChange={(e) => setTargetId(e.target.value)} sx={{ minWidth: 150 }} SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }}>
              <MenuItem value="">Mijzelf</MenuItem>
              {sporters.map((s) => (
                <MenuItem key={s.userId} value={s.userId}>
                  {s.displayName?.trim() || s.email || s.userId}
                </MenuItem>
              ))}
            </TextField>
          )}
          <TextField type="date" size="small" label={period === 'day' ? 'Datum' : 'Tot en met'} value={date} onChange={(e) => setDate(e.target.value)} InputLabelProps={{ shrink: true }} />
        </Box>

        {/* Samenvatting: kcal groot bovenaan, macro's als rijen met eigen kleur (zoals het Figma-ontwerp) */}
        <Card sx={{ ...NESTED_CARD_SX, mb: 2 }}>
          <CardContent sx={{ '&:last-child': { pb: 2 } }}>
            <Typography variant="caption" color="text.secondary">
              {periodLabel}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mt: 0.5 }}>
              <Typography variant="h4" fontWeight={800}>
                {shown.kcal}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {goal?.kcal ? `van ${goal.kcal} kcal` : 'kcal'}
              </Typography>
            </Box>
            {goal?.kcal ? (
              <LinearProgress
                variant="determinate"
                value={Math.min(100, (shown.kcal / goal.kcal) * 100)}
                sx={{ mt: 1, mb: 2, height: 8, borderRadius: 1, bgcolor: designTokens.cardBorder, '& .MuiLinearProgress-bar': { bgcolor: designTokens.primary } }}
              />
            ) : (
              <Box sx={{ mb: 2 }} />
            )}
            {MACRO_ROWS.map((m) => (
              <Box key={m.key} sx={{ mb: 1.5, '&:last-child': { mb: 0 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                  <Typography variant="body2" fontWeight={600}>
                    {m.label}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {shown[m.key]} g{goal && goal[m.key] ? ` van ${goal[m.key]} g` : ''}
                  </Typography>
                </Box>
                {goal && goal[m.key] > 0 && (
                  <LinearProgress
                    variant="determinate"
                    value={Math.min(100, (shown[m.key] / goal[m.key]) * 100)}
                    sx={{ mt: 0.5, height: 5, borderRadius: 1, bgcolor: designTokens.cardBorder, '& .MuiLinearProgress-bar': { bgcolor: m.color } }}
                  />
                )}
              </Box>
            ))}
          </CardContent>
        </Card>

        {/* Week/Maand: dagbalken */}
        {period !== 'day' && (
          <Card sx={{ ...NESTED_CARD_SX, mb: 2 }}>
            <CardContent sx={{ '&:last-child': { pb: 2 } }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                kcal per dag
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'stretch', gap: period === 'week' ? 1 : 0.4, height: 120 }}>
                {perDay.map((p) => (
                  <Box key={p.date} sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', gap: 0.5, minWidth: 0, height: '100%' }}>
                    <Box
                      title={`${p.date}: ${p.kcal} kcal`}
                      sx={{
                        width: '80%',
                        height: `${Math.round((p.kcal / maxKcal) * 100)}%`,
                        minHeight: p.kcal > 0 ? 2 : 0,
                        bgcolor: goal?.kcal && p.kcal > goal.kcal ? 'warning.main' : 'success.main',
                        borderRadius: 1,
                        transition: 'height 0.2s ease',
                      }}
                    />
                    {period === 'week' && (
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem' }}>
                        {p.date.slice(8)}
                      </Typography>
                    )}
                  </Box>
                ))}
              </Box>
            </CardContent>
          </Card>
        )}

        {/* Dag-modus: zoeken + loggen */}
        {period === 'day' && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => {
                handlePhoto(e.target.files?.[0] ?? null);
                e.target.value = '';
              }}
            />
            {/* Drie gelijke ingangen om voeding toe te voegen, zoals in het Figma-ontwerp */}
            <Box sx={{ display: 'flex', bgcolor: designTokens.cardBackgroundHigh, borderRadius: `${designTokens.buttonRadius}px`, p: 0.5, gap: 0.5, mb: 1.5 }}>
              <ButtonBase
                onClick={() => searchInputRef.current?.focus()}
                sx={{ flex: 1, flexDirection: 'column', gap: 0.25, py: 1, borderRadius: `${Math.max(0, designTokens.buttonRadius - 4)}px` }}
              >
                <SearchRoundedIcon fontSize="small" />
                <Typography variant="caption" fontWeight={600}>
                  Zoeken
                </Typography>
              </ButtonBase>
              <ButtonBase
                disabled={recognizing}
                onClick={() => fileInputRef.current?.click()}
                sx={{ flex: 1, flexDirection: 'column', gap: 0.25, py: 1, borderRadius: `${Math.max(0, designTokens.buttonRadius - 4)}px` }}
              >
                {recognizing ? <CircularProgress size={20} sx={{ color: designTokens.primary }} /> : <PhotoCameraRoundedIcon fontSize="small" />}
                <Typography variant="caption" fontWeight={600}>
                  Foto
                </Typography>
              </ButtonBase>
              <ButtonBase
                disabled={lookingUp}
                onClick={() => setScannerOpen(true)}
                sx={{ flex: 1, flexDirection: 'column', gap: 0.25, py: 1, borderRadius: `${Math.max(0, designTokens.buttonRadius - 4)}px` }}
              >
                {lookingUp ? <CircularProgress size={20} sx={{ color: designTokens.primary }} /> : <QrCodeScannerRoundedIcon fontSize="small" />}
                <Typography variant="caption" fontWeight={600}>
                  Barcode
                </Typography>
              </ButtonBase>
            </Box>
            {/*
              Duidelijk zichtbare "bezig"-melding na het maken van een foto: een kleine tekstwijziging
              in de knop hierboven viel niet op (Kenny: "heel onduidelijk dat hij bezig is, heel klein").
              Material 3 heeft naast deze cirkelvormige progress-indicator ook een nieuwe "loading
              indicator" (vloeiend van vorm veranderend, bedoeld voor processen onder de 5 seconden —
              precies dit geval); die vraagt eigen vormdata die we niet hebben, dus voorlopig deze
              brede, prominente balk met de standaard M3-indicator.
            */}
            {(recognizing || lookingUp) && (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  p: 1.5,
                  mb: 1.5,
                  borderRadius: `${designTokens.cardRadius}px`,
                  bgcolor: designTokens.primaryContainer,
                  color: designTokens.onPrimaryContainer,
                }}
              >
                <CircularProgress size={26} sx={{ color: 'inherit' }} />
                <Typography variant="body2" fontWeight={600}>
                  {recognizing ? 'Foto wordt herkend…' : 'Barcode wordt opgezocht…'}
                </Typography>
              </Box>
            )}
            {photoError && (
              <Typography variant="caption" color="error" sx={{ display: 'block', mb: 1 }}>
                {photoError}
              </Typography>
            )}
            <TextField
              fullWidth
              size="small"
              inputRef={searchInputRef}
              placeholder="Zoek een product, bijv. 'magere kwark'"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              InputProps={{ startAdornment: <SearchRoundedIcon sx={{ mr: 1, color: 'action.active' }} fontSize="small" /> }}
              sx={{ mb: 1 }}
            />
            {searching && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}>
                <CircularProgress size={20} />
              </Box>
            )}
            {!searching && searchNote && (
              <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                {searchNote}
              </Typography>
            )}
            {results.length > 0 && (
              <List dense sx={{ maxHeight: 260, overflow: 'auto', mb: 2, bgcolor: designTokens.cardBackgroundHigh, border: `1px solid ${designTokens.cardBorder}`, borderRadius: 2 }}>
                {results.map((p) => (
                  <ListItemButton key={p.code || p.name} onClick={() => openAdd(p)}>
                    <ListItemAvatar sx={{ minWidth: 52 }}>
                      <Avatar src={p.imageUrl || undefined} variant="rounded" sx={{ width: 40, height: 40, bgcolor: 'rgba(0,0,0,0.06)', color: 'text.secondary' }}>
                        <RestaurantRoundedIcon fontSize="small" />
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={p.name}
                      secondary={`${p.brand ? p.brand + ' · ' : ''}${p.per100g.kcal} kcal / 100g · E ${p.per100g.protein} · K ${p.per100g.carbs} · V ${p.per100g.fat}`}
                    />
                  </ListItemButton>
                ))}
              </List>
            )}

            <Typography variant="subtitle1" fontWeight={600} sx={{ mt: 1, mb: 1 }}>
              Gelogd
            </Typography>
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                <CircularProgress size={22} />
              </Box>
            ) : dayLogs.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Nog niets gelogd op deze dag.
              </Typography>
            ) : (
              MEAL_GROUPS.map((group) => {
                const items = dayLogs.filter((l) => (l.meal ?? null) === group.key);
                if (items.length === 0) return null;
                const kcal = items.reduce((a, l) => a + l.kcal, 0);
                const groupKey = group.key ?? 'overig';
                const summary = items.map((l) => l.productName).join(', ');
                return (
                  <Accordion
                    key={groupKey}
                    disableGutters
                    expanded={openMeals.includes(groupKey)}
                    onChange={() => toggleMeal(groupKey)}
                    sx={MEAL_ACCORDION_SX}
                  >
                    <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />}>
                      <Box sx={{ display: 'flex', minWidth: 0, flex: 1, alignItems: 'center', justifyContent: 'space-between', gap: 1, pr: 1 }}>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="subtitle2" fontWeight={700}>
                            {group.label}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                            {summary}
                          </Typography>
                        </Box>
                        <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                          {kcal} kcal
                        </Typography>
                      </Box>
                    </AccordionSummary>
                    <AccordionDetails sx={{ px: 0, pt: 0, pb: 0.5 }}>
                      <List dense disablePadding>
                        {items.map((l) => (
                          <ListItem
                            key={l.id}
                            secondaryAction={
                              <Box>
                                <IconButton edge="end" size="small" onClick={() => openEdit(l)} aria-label="Bewerken" sx={{ mr: 0.5 }}>
                                  <EditRoundedIcon fontSize="small" />
                                </IconButton>
                                <IconButton edge="end" size="small" onClick={() => handleDelete(l.id)} aria-label="Verwijderen">
                                  <DeleteOutlineRoundedIcon fontSize="small" />
                                </IconButton>
                              </Box>
                            }
                          >
                            <ListItemText
                              primary={l.productName}
                              secondary={`${l.quantity && l.portionLabel ? `${l.quantity}× ${l.portionLabel} · ` : ''}${l.grams} g · ${l.kcal} kcal · E ${l.protein} · K ${l.carbs} · V ${l.fat}`}
                            />
                          </ListItem>
                        ))}
                      </List>
                    </AccordionDetails>
                  </Accordion>
                );
              })
            )}
          </>
        )}
      </ContentCard>

      <Dialog open={suggestions != null} onClose={() => setSuggestions(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ pb: 0.5 }}>Herkend op de foto</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Tik op een item om toe te voegen. De waarden zijn een AI-schatting, pas de gram gerust aan.
          </Typography>
          <List dense>
            {(suggestions ?? []).map((s, i) => (
              <ListItemButton key={i} onClick={() => pickSuggestion(s)}>
                <ListItemAvatar sx={{ minWidth: 52 }}>
                  <Avatar variant="rounded" sx={{ width: 40, height: 40, bgcolor: 'rgba(0,0,0,0.06)', color: 'text.secondary' }}>
                    <RestaurantRoundedIcon fontSize="small" />
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={`${s.name} · ~${s.grams} g`}
                  secondary={`${s.per100g.kcal} kcal / 100g · E ${s.per100g.protein} · K ${s.per100g.carbs} · V ${s.per100g.fat}`}
                />
                <AddCircleRoundedIcon sx={{ color: 'text.primary', ml: 1 }} />
              </ListItemButton>
            ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSuggestions(null)}>Sluiten</Button>
        </DialogActions>
      </Dialog>

      {scannerOpen && (
        <Suspense fallback={null}>
          <BarcodeScannerDialog open={scannerOpen} onClose={() => setScannerOpen(false)} onDetected={handleBarcode} />
        </Suspense>
      )}

      <ProductSheet
        product={selected}
        grams={grams}
        setGrams={setGrams}
        meal={meal}
        setMeal={setMeal}
        onPortion={setPortion}
        saving={saving}
        isEditing={editingLog != null}
        onClose={closeDialog}
        onSave={handleSave}
      />
      <GoalDialog
        open={goalOpen}
        initial={goal}
        canEdit={Boolean(effectiveUserId)}
        onClose={() => setGoalOpen(false)}
        onSave={async (g) => {
          if (!effectiveUserId) return;
          try {
            await updateProfile(effectiveUserId, { nutritionGoal: g });
          } catch (err) {
            notify.error('Voedingsdoel opslaan mislukt. Probeer het opnieuw.', err);
            return;
          }
          await profileCtx?.refreshProfile();
          setGoalOpen(false);
        }}
      />
    </PageLayout>
  );
}

function GoalDialog({
  open,
  initial,
  canEdit,
  onClose,
  onSave,
}: {
  open: boolean;
  initial: NutritionGoal | null;
  canEdit: boolean;
  onClose: () => void;
  onSave: (g: NutritionGoal | null) => void;
}) {
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');

  useEffect(() => {
    if (open) {
      setKcal(initial?.kcal ? String(initial.kcal) : '');
      setProtein(initial?.protein ? String(initial.protein) : '');
      setCarbs(initial?.carbs ? String(initial.carbs) : '');
      setFat(initial?.fat ? String(initial.fat) : '');
    }
  }, [open, initial]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pb: 0.5 }}>Dagdoel</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Laat leeg (0) om zonder doel te loggen.
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <NumberField label="Calorieën (kcal)" size="small" value={kcal} onChange={setKcal} />
          <NumberField label="Eiwit (g)" decimal size="small" value={protein} onChange={setProtein} />
          <NumberField label="Koolhydraten (g)" decimal size="small" value={carbs} onChange={setCarbs} />
          <NumberField label="Vet (g)" decimal size="small" value={fat} onChange={setFat} />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Annuleren</Button>
        <Button
          variant="contained"
          disabled={!canEdit}
          onClick={() => {
            const g: NutritionGoal = { kcal: Number(kcal) || 0, protein: Number(protein) || 0, carbs: Number(carbs) || 0, fat: Number(fat) || 0 };
            onSave(g.kcal || g.protein || g.carbs || g.fat ? g : null);
          }}
          sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', '&:hover': { bgcolor: 'primary.dark' } }}
        >
          Opslaan
        </Button>
      </DialogActions>
    </Dialog>
  );
}
