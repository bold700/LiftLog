import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Typography,
  TextField,
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
  useMediaQuery,
  useTheme,
} from '@mui/material';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import RestaurantRoundedIcon from '@mui/icons-material/RestaurantRounded';
import PhotoCameraRoundedIcon from '@mui/icons-material/PhotoCameraRounded';
import QrCodeScannerRoundedIcon from '@mui/icons-material/QrCodeScannerRounded';
import AddCircleRoundedIcon from '@mui/icons-material/AddCircleRounded';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import { lazy, Suspense } from 'react';
import { designTokens } from '../theme/designTokens';

// Barcode-scanner (zxing, ~150 kB) pas laden als de scanner opent.
const BarcodeScannerDialog = lazy(() =>
  import('./BarcodeScannerDialog').then((m) => ({ default: m.BarcodeScannerDialog }))
);
import { PageLayout, HeaderActions } from './layout';
import { useProfile } from '../context/ProfileContext';
import { useViewAs } from '../context/ViewAsContext';
import { useNotify } from '../context/NotifyContext';
import { useI18n } from '../context/I18nContext';
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
  MEAL_ORDER,
  type MealMoment,
} from '../services/nutritionService';
import { todayIso } from '../utils/format';
import { fileToDataUrl } from '../utils/imageDataUrl';
import { NumberField } from './NumberField';
import { ProductSheet, type PortionChoice } from './nutrition/ProductSheet';
import { segmentedToggleSx } from '../theme/segmentedToggle';

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

/** Rijen onder de kcal-balk: sleutel in de totalen; het label komt uit i18n (`nutrition.macros`).
 * Alle drie de macrobalken delen één kleur (Tertiary) — het ontwerp kleurt ze niet individueel,
 * alleen de kcal-balk erboven krijgt Primary. */
const MACRO_ROW_KEYS = ['protein', 'carbs', 'fat'] as const;

/**
 * Zelfde geneste-kaart-stijl als de ACCORDION_SX in LogsPage/MetingenPage: een tint dieper dan de
 * omringende ContentCard, anders vallen de kaarten er tegenaan weg.
 */
/**
 * Kaarten op de pagina (Figma: Surface Container Low, geen rand). Functies en geen constanten:
 * designTokens volgt het actieve thema en moet bij elke render opnieuw gelezen worden.
 */
const cardSx = () =>
  ({
    backgroundColor: designTokens.cardBackground,
    border: 'none',
    boxShadow: 'none',
    borderRadius: `${designTokens.cardRadius}px`,
    overflow: 'hidden',
  }) as const;

const mealAccordionSx = () =>
  ({
    ...cardSx(),
    margin: 0,
    mb: 1,
    '&:before': { display: 'none' },
    '&.Mui-expanded': { margin: 0, mb: 1 },
  }) as const;

export function NutritionPage() {
  const profileCtx = useProfile();
  const notify = useNotify();
  const { t } = useI18n();
  const sporters = profileCtx?.allSporters ?? [];
  const selfUid = profileCtx?.profile?.userId ?? '';
  const selfTrainerId = profileCtx?.profile?.trainerId ?? null;

  // Wie je bekijkt, komt uit "Bekijk als" (avatarmenu); een eigen keuzelijst per pagina is er niet meer.
  const { viewed } = useViewAs();
  const targetId = viewed.isOther ? viewed.userId : '';
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
        setPhotoError(t('nutrition.photoErrors.barcodeNotFound', { code }));
      }
    } catch {
      setPhotoError(t('nutrition.photoErrors.barcodeFailed'));
    } finally {
      setLookingUp(false);
    }
  }, [t]);

  const handlePhoto = async (file: File | null) => {
    if (!file) return;
    setRecognizing(true);
    setPhotoError(null);
    try {
      const dataUrl = await fileToDataUrl(file);
      const items = await recognizeFoodPhoto(dataUrl);
      if (items.length === 0) {
        setPhotoError(t('nutrition.photoErrors.none'));
      } else if (items.length === 1) {
        // Direct naar het toevoeg-venster als er maar één item is
        const s = items[0];
        setSelected({ code: `ai:${s.name}`, name: s.name, brand: t('nutrition.aiEstimateBrand'), imageUrl: null, per100g: s.per100g, servingGrams: s.grams });
        setGrams(String(s.grams));
      } else {
        setSuggestions(items);
      }
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : t('nutrition.photoErrors.recognitionFailed'));
    } finally {
      setRecognizing(false);
    }
  };

  const pickSuggestion = (s: RecognizedFood) => {
    setSuggestions(null);
    setSelected({
      code: `ai:${s.name}`,
      name: s.name,
      brand: t('nutrition.aiEstimateBrand'),
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
      notify.error(t('nutrition.loadFailed'), err);
    } finally {
      setLoading(false);
    }
  }, [effectiveUserId, notify, t]);

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
    const timer = setTimeout(() => {
      searchFoods(q)
        .then(({ products, remoteFailed }) => {
          if (cancelled) return;
          setResults(products);
          if (remoteFailed) {
            setSearchNote(products.length ? t('nutrition.searchNotes.unreachableWithResults') : t('nutrition.searchNotes.unreachableNoResults'));
          } else {
            setSearchNote(products.length ? null : t('nutrition.searchNotes.noneFound', { query: q }));
          }
        })
        .catch(() => {
          if (cancelled) return;
          setResults([]);
          setSearchNote(t('nutrition.searchNotes.failed'));
        })
        .finally(() => !cancelled && setSearching(false));
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term, t]);

  /** Volgorde van de dag, met achteraan wat vóór de eetmomenten is gelogd en dus geen moment heeft. */
  const mealGroups = useMemo<{ key: MealMoment | null; label: string }[]>(
    () => [...MEAL_ORDER.map((m) => ({ key: m as MealMoment | null, label: t(`nutrition.meals.${m}`) })), { key: null, label: t('nutrition.noMoment') }],
    [t]
  );

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
      notify.error(t('nutrition.deleteFailed'), err);
    }
    await loadLogs();
  };

  const periodLabel = period === 'day' ? t('nutrition.summary.day') : period === 'week' ? t('nutrition.summary.weekAvg') : t('nutrition.summary.monthAvg');
  const theme = useTheme();
  /** Desktop: maaltijden altijd open met kolommen voor gram en kcal (Figma); telefoon: inklapbaar. */
  const wide = useMediaQuery(theme.breakpoints.up('md'));
  const { lang } = useI18n();
  /** "Dinsdag 16 september" voor een dag; "9 sep – 15 sep" voor week (7 dagen) en maand (30 dagen) t/m de datum. */
  const dateLabel = (() => {
    const locale = lang === 'en' ? 'en-GB' : 'nl-NL';
    const end = new Date(`${date}T12:00:00`);
    if (period === 'day') {
      const label = end.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
      return label.charAt(0).toUpperCase() + label.slice(1);
    }
    const start = new Date(end);
    start.setDate(end.getDate() - (period === 'week' ? 6 : 29));
    const short = (d: Date) => d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
    return `${short(start)} – ${short(end)}`;
  })();
  /** Een dag, week of maand terug of vooruit, afhankelijk van de gekozen periode. Niet voorbij vandaag. */
  const shiftDate = (dir: -1 | 1) => {
    const d = new Date(`${date}T12:00:00`);
    // Zelfde lengte als het bereik dat getoond wordt (7 of 30 dagen), zodat perioden netjes aansluiten.
    d.setDate(d.getDate() + dir * (period === 'day' ? 1 : period === 'week' ? 7 : 30));
    const next = d.toISOString().slice(0, 10);
    setDate(next > todayIso() ? todayIso() : next);
  };
  const dateInputRef = useRef<HTMLInputElement>(null);
  const periodToggle = (
    <ToggleButtonGroup size="small" exclusive value={period} onChange={(_, v) => v && setPeriod(v)} sx={segmentedToggleSx}>
      <ToggleButton value="day">{t('nutrition.periods.day')}</ToggleButton>
      <ToggleButton value="week">{t('nutrition.periods.week')}</ToggleButton>
      <ToggleButton value="month">{t('nutrition.periods.month')}</ToggleButton>
    </ToggleButtonGroup>
  );

  /* Samenvatting: kcal groot bovenaan, macro's als rijen met eigen kleur (zoals het Figma-ontwerp).
     Op desktop in dagweergave staat dit in de linkerkolom naast het zoeken/loggen; bij week/maand
     staat het gewoon boven de dagbalken, want daar is geen tweede kolom mee te vullen. */
  const summaryCard = (
    <Card sx={{ ...cardSx(), mb: period === 'day' ? 0 : 2 }}>
      <CardContent sx={{ '&:last-child': { pb: 2 } }}>
        {/* Datum bovenaan (Figma "Tuesday 16 August"), met pijltjes om een dag/week/maand te wisselen. */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mx: -0.5 }}>
          <IconButton size="small" onClick={() => shiftDate(-1)} aria-label={t('nutrition.previous')}>
            <ChevronLeftRoundedIcon fontSize="small" />
          </IconButton>
          <Box sx={{ flex: 1, minWidth: 0, textAlign: 'center', position: 'relative' }}>
            {/* Klik op de datum opent de datumkiezer van het toestel, om verder terug te springen. */}
            <Box
              component="button"
              type="button"
              onClick={() => {
                const el = dateInputRef.current;
                if (!el) return;
                if (typeof el.showPicker === 'function') el.showPicker();
                else el.click();
              }}
              sx={{ all: 'unset', cursor: 'pointer', fontSize: 12, fontWeight: 500, lineHeight: '16px', '&:hover': { textDecoration: 'underline' } }}
            >
              {dateLabel}
            </Box>
            <Box
              component="input"
              ref={dateInputRef}
              type="date"
              value={date}
              max={todayIso()}
              tabIndex={-1}
              aria-hidden
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => e.target.value && setDate(e.target.value)}
              sx={{ position: 'absolute', left: '50%', bottom: 0, width: 1, height: 1, opacity: 0, pointerEvents: 'none', border: 0, p: 0 }}
            />
            {period !== 'day' && (
              <Typography sx={{ fontSize: 11, lineHeight: '14px', color: 'text.secondary' }} noWrap>
                {periodLabel}
              </Typography>
            )}
          </Box>
          <IconButton size="small" onClick={() => shiftDate(1)} disabled={date >= todayIso()} aria-label={t('nutrition.next')}>
            <ChevronRightRoundedIcon fontSize="small" />
          </IconButton>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mt: 1 }}>
          <Typography sx={{ fontSize: { xs: 32, md: 40 }, fontWeight: 500, lineHeight: 1.1 }}>
            {shown.kcal}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {goal?.kcal ? t('nutrition.summary.ofKcal', { kcal: goal.kcal }) : t('nutrition.summary.kcal')}
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
        {MACRO_ROW_KEYS.map((key) => (
          <Box key={key} sx={{ mb: 1.5, '&:last-child': { mb: 0 } }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
              <Typography sx={{ fontSize: 13, fontWeight: 500 }}>
                {t(`nutrition.macros.${key}`)}
              </Typography>
              <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
                {shown[key]} g{goal && goal[key] ? ` ${t('nutrition.summary.ofGrams', { grams: goal[key] })}` : ''}
              </Typography>
            </Box>
            {goal && goal[key] > 0 && (
              <LinearProgress
                variant="determinate"
                value={Math.min(100, (shown[key] / goal[key]) * 100)}
                sx={{ mt: 0.5, height: 5, borderRadius: 1, bgcolor: designTokens.cardBorder, '& .MuiLinearProgress-bar': { bgcolor: designTokens.tertiary } }}
              />
            )}
          </Box>
        ))}
        <Button size="small" onClick={() => setGoalOpen(true)} sx={{ mt: 1.5, ml: -1, textTransform: 'none' }}>
          {goal ? t('nutrition.editGoal') : t('nutrition.setGoal')}
        </Button>
      </CardContent>
    </Card>
  );

  return (
    <PageLayout maxWidth="none">
      <Box>
        {/* Desktop: periode en "Voedsel toevoegen" rechts in de paginakop (Figma). */}
        <HeaderActions>
          <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 2 }}>
            {periodToggle}
            <Button
              variant="contained"
              disableElevation
              onClick={() => {
                setPeriod('day');
                setTimeout(() => searchInputRef.current?.focus(), 0);
              }}
              sx={{ borderRadius: '20px', textTransform: 'none', fontWeight: 500, height: 40, px: 2.5 }}
            >
              {t('nutrition.addFoodButton')}
            </Button>
          </Box>
        </HeaderActions>
        {/* Telefoon: de keuzebalk over de volle breedte, zoals Figma. */}
        <Box sx={{ display: { xs: 'block', md: 'none' }, mb: 2, '& .MuiToggleButtonGroup-root': { width: '100%' } }}>{periodToggle}</Box>

        {/* Buiten dagweergave (week/maand) is er geen tweede kolom om mee te vullen: samenvatting
            en dagbalken staan dan gewoon onder elkaar, over de volle breedte. */}
        {period !== 'day' && (
          <>
            {summaryCard}
            <Card sx={{ ...cardSx(), mb: 2 }}>
              <CardContent sx={{ '&:last-child': { pb: 2 } }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  {t('nutrition.kcalPerDay')}
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
          </>
        )}

        {/* Dagweergave (Figma "Nutrition"): links de samenvatting, rechts zoeken/loggen en het
            dag-overzicht per maaltijd — op mobiel gewoon onder elkaar. */}
        {period === 'day' && (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(280px, 380px) minmax(0, 1fr)' }, gap: { xs: 2, md: 3 }, alignItems: 'start' }}>
            <Box sx={{ minWidth: 0 }}>{summaryCard}</Box>
            <Box sx={{ minWidth: 0 }}>
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
            {/*
              Drie losse omlijnde pillen met een klein gevuld Primary-vierkantje per icoon, zoals in
              het Figma-ontwerp — geen gedeelde grijze balk (dat was de vorige, onjuiste vertaling).
            */}
            <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
              {[
                {
                  key: 'search',
                  label: t('nutrition.addFood.search'),
                  icon: <SearchRoundedIcon sx={{ fontSize: 16, color: designTokens.onPrimary }} />,
                  onClick: () => searchInputRef.current?.focus(),
                  disabled: false,
                  busy: false,
                },
                {
                  key: 'photo',
                  label: t('nutrition.addFood.photo'),
                  icon: <PhotoCameraRoundedIcon sx={{ fontSize: 16, color: designTokens.onPrimary }} />,
                  onClick: () => fileInputRef.current?.click(),
                  disabled: recognizing,
                  busy: recognizing,
                },
                {
                  key: 'barcode',
                  label: t('nutrition.addFood.barcode'),
                  icon: <QrCodeScannerRoundedIcon sx={{ fontSize: 16, color: designTokens.onPrimary }} />,
                  onClick: () => setScannerOpen(true),
                  disabled: lookingUp,
                  busy: lookingUp,
                },
              ].map((btn) => (
                <ButtonBase
                  key={btn.key}
                  disabled={btn.disabled}
                  onClick={btn.onClick}
                  sx={{
                    flex: 1,
                    gap: 0.75,
                    py: 1,
                    px: 1,
                    border: `1px solid ${designTokens.outline}`,
                    borderRadius: `${designTokens.buttonRadius}px`,
                  }}
                >
                  <Box sx={{ width: 24, height: 24, borderRadius: '8px', bgcolor: designTokens.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {btn.busy ? <CircularProgress size={14} sx={{ color: designTokens.onPrimary }} /> : btn.icon}
                  </Box>
                  <Typography variant="body2" fontWeight={600}>
                    {btn.label}
                  </Typography>
                </ButtonBase>
              ))}
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
                  {recognizing ? t('nutrition.recognizingPhoto') : t('nutrition.lookingUpBarcode')}
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
              placeholder={t('nutrition.searchPlaceholder')}
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
                      secondary={`${p.brand ? p.brand + ' · ' : ''}${p.per100g.kcal} kcal / 100g · ${t('nutrition.macroAbbr.protein')} ${p.per100g.protein} · ${t('nutrition.macroAbbr.carbs')} ${p.per100g.carbs} · ${t('nutrition.macroAbbr.fat')} ${p.per100g.fat}`}
                    />
                  </ListItemButton>
                ))}
              </List>
            )}

            <Box sx={{ mt: 1 }} />
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                <CircularProgress size={22} />
              </Box>
            ) : dayLogs.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                {t('nutrition.noneLoggedToday')}
              </Typography>
            ) : (
              mealGroups.map((group) => {
                const items = dayLogs.filter((l) => (l.meal ?? null) === group.key);
                if (items.length === 0) return null;
                const kcal = items.reduce((a, l) => a + l.kcal, 0);
                const groupKey = group.key ?? 'overig';
                const summary = items.map((l) => l.productName).join(', ');
                return (
                  <Accordion
                    key={groupKey}
                    disableGutters
                    expanded={wide || openMeals.includes(groupKey)}
                    onChange={() => !wide && toggleMeal(groupKey)}
                    sx={mealAccordionSx()}
                  >
                    <AccordionSummary
                      expandIcon={wide ? null : <ExpandMoreRoundedIcon />}
                      sx={{
                        cursor: wide ? 'default !important' : undefined,
                        minWidth: 0,
                        '& .MuiAccordionSummary-content': { minWidth: 0 },
                        '& .MuiAccordionSummary-content.Mui-expanded': { minWidth: 0 },
                      }}
                    >
                      <Box sx={{ display: 'flex', minWidth: 0, flex: 1, alignItems: 'center', justifyContent: 'space-between', gap: 1, pr: 1 }}>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="subtitle2" fontWeight={700}>
                            {group.label}
                          </Typography>
                          {!wide && (
                            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                              {summary}
                            </Typography>
                          )}
                        </Box>
                        <Typography variant="body2" sx={{ whiteSpace: 'nowrap', fontWeight: 500 }}>
                          {kcal} kcal
                        </Typography>
                      </Box>
                    </AccordionSummary>
                    <AccordionDetails sx={{ px: 0, pt: 0, pb: 0.5 }}>
                      {wide ? (
                        /* Desktop (Figma): naam, gram en kcal in kolommen; bewerken/verwijderen bij aanwijzen. */
                        <Box sx={{ px: 2.5, pb: 1 }}>
                          {items.map((l) => (
                            <Box
                              key={l.id}
                              sx={{
                                display: 'grid',
                                gridTemplateColumns: 'minmax(0, 1fr) 60px 70px 64px',
                                alignItems: 'center',
                                minHeight: 28,
                                '& .row-actions': { opacity: 0, transition: 'opacity 0.15s ease' },
                                '&:hover .row-actions, &:focus-within .row-actions': { opacity: 1 },
                              }}
                            >
                              <Typography sx={{ fontSize: 13, lineHeight: '18px' }} noWrap title={l.productName}>
                                {l.quantity && l.portionLabel ? `${l.productName} · ${l.quantity}× ${l.portionLabel}` : l.productName}
                              </Typography>
                              <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{l.grams} g</Typography>
                              <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{l.kcal} kcal</Typography>
                              <Box className="row-actions" sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                                <IconButton size="small" onClick={() => openEdit(l)} aria-label={t('nutrition.edit')}>
                                  <EditRoundedIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                                <IconButton size="small" onClick={() => handleDelete(l.id)} aria-label={t('nutrition.delete')}>
                                  <DeleteOutlineRoundedIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                              </Box>
                            </Box>
                          ))}
                        </Box>
                      ) : (
                      <List dense disablePadding>
                        {items.map((l) => (
                          <ListItem
                            key={l.id}
                            secondaryAction={
                              <Box>
                                <IconButton edge="end" size="small" onClick={() => openEdit(l)} aria-label={t('nutrition.edit')} sx={{ mr: 0.5 }}>
                                  <EditRoundedIcon fontSize="small" />
                                </IconButton>
                                <IconButton edge="end" size="small" onClick={() => handleDelete(l.id)} aria-label={t('nutrition.delete')}>
                                  <DeleteOutlineRoundedIcon fontSize="small" />
                                </IconButton>
                              </Box>
                            }
                          >
                            <ListItemText
                              primary={l.productName}
                              secondary={`${l.quantity && l.portionLabel ? `${l.quantity}× ${l.portionLabel} · ` : ''}${l.grams} g · ${l.kcal} kcal · ${t('nutrition.macroAbbr.protein')} ${l.protein} · ${t('nutrition.macroAbbr.carbs')} ${l.carbs} · ${t('nutrition.macroAbbr.fat')} ${l.fat}`}
                            />
                          </ListItem>
                        ))}
                      </List>
                      )}
                    </AccordionDetails>
                  </Accordion>
                );
              })
            )}
            </Box>
          </Box>
        )}
      </Box>

      <Dialog open={suggestions != null} onClose={() => setSuggestions(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ pb: 0.5 }}>{t('nutrition.recognized.title')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {t('nutrition.recognized.help')}
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
                  secondary={`${s.per100g.kcal} kcal / 100g · ${t('nutrition.macroAbbr.protein')} ${s.per100g.protein} · ${t('nutrition.macroAbbr.carbs')} ${s.per100g.carbs} · ${t('nutrition.macroAbbr.fat')} ${s.per100g.fat}`}
                />
                <AddCircleRoundedIcon sx={{ color: 'text.primary', ml: 1 }} />
              </ListItemButton>
            ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSuggestions(null)}>{t('nutrition.recognized.close')}</Button>
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
            notify.error(t('nutrition.goal.saveFailed'), err);
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
  const { t } = useI18n();
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
      <DialogTitle sx={{ pb: 0.5 }}>{t('nutrition.goal.title')}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t('nutrition.goal.help')}
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <NumberField label={t('nutrition.goal.kcal')} size="small" value={kcal} onChange={setKcal} />
          <NumberField label={t('nutrition.goal.protein')} decimal size="small" value={protein} onChange={setProtein} />
          <NumberField label={t('nutrition.goal.carbs')} decimal size="small" value={carbs} onChange={setCarbs} />
          <NumberField label={t('nutrition.goal.fat')} decimal size="small" value={fat} onChange={setFat} />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        <Button
          variant="contained"
          disabled={!canEdit}
          onClick={() => {
            const g: NutritionGoal = { kcal: Number(kcal) || 0, protein: Number(protein) || 0, carbs: Number(carbs) || 0, fat: Number(fat) || 0 };
            onSave(g.kcal || g.protein || g.carbs || g.fat ? g : null);
          }}
          sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', '&:hover': { bgcolor: 'primary.dark' } }}
        >
          {t('common.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
