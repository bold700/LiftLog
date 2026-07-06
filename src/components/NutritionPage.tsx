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
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemAvatar,
  Avatar,
  ToggleButton,
  ToggleButtonGroup,
  LinearProgress,
} from '@mui/material';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import RestaurantRoundedIcon from '@mui/icons-material/RestaurantRounded';
import PhotoCameraRoundedIcon from '@mui/icons-material/PhotoCameraRounded';
import QrCodeScannerRoundedIcon from '@mui/icons-material/QrCodeScannerRounded';
import { BarcodeScannerDialog } from './BarcodeScannerDialog';
import { PageLayout, ContentCard } from './layout';
import { useProfile } from '../context/ProfileContext';
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
} from '../services/nutritionService';

type Period = 'day' | 'week' | 'month';

/** Verklein een foto tot een data-URL (scheelt kosten/bandbreedte bij AI-herkenning). */
async function fileToDataUrl(file: File, max = 768, quality = 0.8): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas niet beschikbaar');
  ctx.drawImage(bitmap, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function todayIso(): string {
  return isoDay(new Date());
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

const MACROS = [
  { key: 'kcal' as const, label: 'kcal', unit: '' },
  { key: 'protein' as const, label: 'eiwit', unit: 'g' },
  { key: 'carbs' as const, label: 'koolh.', unit: 'g' },
  { key: 'fat' as const, label: 'vet', unit: 'g' },
];

export function NutritionPage() {
  const profileCtx = useProfile();
  const isTrainer = profileCtx?.isTrainer ?? false;
  const sporters = profileCtx?.allSporters ?? [];
  const selfUid = profileCtx?.profile?.userId ?? '';
  const selfTrainerId = profileCtx?.profile?.trainerId ?? null;

  const [targetId, setTargetId] = useState('');
  const [period, setPeriod] = useState<Period>('day');
  const [date, setDate] = useState(todayIso());
  const [allLogs, setAllLogs] = useState<NutritionLog[]>([]);
  const [loading, setLoading] = useState(false);

  const [term, setTerm] = useState('');
  const [results, setResults] = useState<FoodProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<FoodProduct | null>(null);
  const [grams, setGrams] = useState('100');
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
    } catch {
      setAllLogs([]);
    } finally {
      setLoading(false);
    }
  }, [effectiveUserId]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  useEffect(() => {
    const q = term.trim();
    if (!q) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(() => {
      searchFoods(q)
        .then((r) => !cancelled && setResults(r))
        .catch(() => !cancelled && setResults([]))
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

  const handleSave = async () => {
    if (!selected || !effectiveUserId) return;
    const g = Number(grams);
    if (!Number.isFinite(g) || g <= 0) return;
    setSaving(true);
    try {
      const m = macrosForGrams(selected.per100g, g);
      await saveNutritionLog({
        userId: effectiveUserId,
        loggedBy: selfUid || effectiveUserId,
        trainerId: effectiveTrainerId,
        date,
        productName: selected.name,
        brand: selected.brand,
        grams: g,
        kcal: m.kcal,
        protein: m.protein,
        carbs: m.carbs,
        fat: m.fat,
      });
      setSelected(null);
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
    await deleteNutritionLog(id).catch(() => {});
    await loadLogs();
  };

  const preview = selected ? macrosForGrams(selected.per100g, Number(grams) || 0) : null;
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
            <TextField select size="small" label="Voor wie?" value={targetId} onChange={(e) => setTargetId(e.target.value)} sx={{ minWidth: 150 }}>
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

        {/* Samenvatting */}
        <Card sx={{ backgroundColor: 'transparent', border: '1px solid', borderColor: 'divider', boxShadow: 'none', borderRadius: 2, mb: 2 }}>
          <CardContent sx={{ '&:last-child': { pb: 2 } }}>
            <Typography variant="caption" color="text.secondary">
              {periodLabel}
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center', flexWrap: 'wrap', gap: 1, mt: 1 }}>
              {MACROS.map((m) => (
                <Box key={m.key} sx={{ minWidth: 64 }}>
                  <Typography variant="h6" fontWeight={700}>
                    {shown[m.key]}
                    {m.unit && <Typography component="span" variant="caption" color="text.secondary">{' '}{m.unit}</Typography>}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {m.label}
                    {goal && goal[m.key] ? ` / ${goal[m.key]}${m.unit}` : ''}
                  </Typography>
                  {goal && goal[m.key] > 0 && (
                    <LinearProgress
                      variant="determinate"
                      value={Math.min(100, (shown[m.key] / goal[m.key]) * 100)}
                      sx={{ mt: 0.5, height: 5, borderRadius: 1 }}
                    />
                  )}
                </Box>
              ))}
            </Box>
          </CardContent>
        </Card>

        {/* Week/Maand: dagbalken */}
        {period !== 'day' && (
          <Card sx={{ backgroundColor: 'transparent', border: '1px solid', borderColor: 'divider', boxShadow: 'none', borderRadius: 2, mb: 2 }}>
            <CardContent sx={{ '&:last-child': { pb: 2 } }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                kcal per dag
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: period === 'week' ? 1 : 0.4, height: 120 }}>
                {perDay.map((p) => (
                  <Box key={p.date} sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
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
            <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap' }}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<PhotoCameraRoundedIcon />}
                disabled={recognizing}
                onClick={() => fileInputRef.current?.click()}
              >
                {recognizing ? 'Herkennen…' : 'Foto herkennen (AI)'}
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={<QrCodeScannerRoundedIcon />}
                disabled={lookingUp}
                onClick={() => setScannerOpen(true)}
              >
                {lookingUp ? 'Opzoeken…' : 'Scan barcode'}
              </Button>
            </Box>
            {photoError && (
              <Typography variant="caption" color="error" sx={{ display: 'block', mb: 1 }}>
                {photoError}
              </Typography>
            )}
            <TextField
              fullWidth
              size="small"
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
            {results.length > 0 && (
              <List dense sx={{ maxHeight: 260, overflow: 'auto', mb: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
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
              <List dense>
                {dayLogs.map((l) => (
                  <ListItem
                    key={l.id}
                    secondaryAction={
                      <IconButton edge="end" size="small" onClick={() => handleDelete(l.id)} aria-label="Verwijderen">
                        <DeleteOutlineRoundedIcon fontSize="small" />
                      </IconButton>
                    }
                  >
                    <ListItemText primary={`${l.productName} · ${l.grams} g`} secondary={`${l.kcal} kcal · E ${l.protein} · K ${l.carbs} · V ${l.fat}`} />
                  </ListItem>
                ))}
              </List>
            )}
          </>
        )}
      </ContentCard>

      <Dialog open={suggestions != null} onClose={() => setSuggestions(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ pb: 0.5 }}>Herkend op de foto</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Kies een item. De waarden zijn een AI-schatting, pas de gram gerust aan.
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
              </ListItemButton>
            ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSuggestions(null)}>Sluiten</Button>
        </DialogActions>
      </Dialog>

      <BarcodeScannerDialog open={scannerOpen} onClose={() => setScannerOpen(false)} onDetected={handleBarcode} />

      <AddDialog selected={selected} grams={grams} setGrams={setGrams} preview={preview} saving={saving} onClose={() => setSelected(null)} onSave={handleSave} />
      <GoalDialog
        open={goalOpen}
        initial={goal}
        canEdit={Boolean(effectiveUserId)}
        onClose={() => setGoalOpen(false)}
        onSave={async (g) => {
          if (!effectiveUserId) return;
          await updateProfile(effectiveUserId, { nutritionGoal: g }).catch(() => {});
          if (!targetId) await profileCtx?.refreshProfile();
          else await profileCtx?.refreshProfile();
          setGoalOpen(false);
        }}
      />
    </PageLayout>
  );
}

function AddDialog({
  selected,
  grams,
  setGrams,
  preview,
  saving,
  onClose,
  onSave,
}: {
  selected: FoodProduct | null;
  grams: string;
  setGrams: (v: string) => void;
  preview: { kcal: number; protein: number; carbs: number; fat: number } | null;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <Dialog open={selected != null} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pb: 0.5 }}>Toevoegen</DialogTitle>
      <DialogContent>
        {selected && (
          <>
            <Typography variant="subtitle1" fontWeight={600}>
              {selected.name}
            </Typography>
            {selected.brand && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                {selected.brand}
              </Typography>
            )}
            <TextField
              label="Hoeveelheid (gram)"
              type="number"
              size="small"
              fullWidth
              value={grams}
              onChange={(e) => setGrams(e.target.value)}
              inputProps={{ inputMode: 'numeric', min: 1 }}
              sx={{ mb: 2 }}
              autoFocus
            />
            {preview && (
              <Box sx={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center', p: 1, bgcolor: 'rgba(0,0,0,0.04)', borderRadius: 1 }}>
                <Macro v={preview.kcal} l="kcal" />
                <Macro v={`${preview.protein} g`} l="eiwit" />
                <Macro v={`${preview.carbs} g`} l="koolh." />
                <Macro v={`${preview.fat} g`} l="vet" />
              </Box>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Annuleren</Button>
        <Button variant="contained" onClick={onSave} disabled={saving} sx={{ bgcolor: '#000', color: '#F2E4D3', '&:hover': { bgcolor: '#1a1a1a' } }}>
          {saving ? 'Bezig…' : 'Toevoegen'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function Macro({ v, l }: { v: string | number; l: string }) {
  return (
    <Box>
      <Typography fontWeight={700}>{v}</Typography>
      <Typography variant="caption" color="text.secondary">
        {l}
      </Typography>
    </Box>
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
          <TextField label="Calorieën (kcal)" type="number" size="small" value={kcal} onChange={(e) => setKcal(e.target.value)} />
          <TextField label="Eiwit (g)" type="number" size="small" value={protein} onChange={(e) => setProtein(e.target.value)} />
          <TextField label="Koolhydraten (g)" type="number" size="small" value={carbs} onChange={(e) => setCarbs(e.target.value)} />
          <TextField label="Vet (g)" type="number" size="small" value={fat} onChange={(e) => setFat(e.target.value)} />
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
          sx={{ bgcolor: '#000', color: '#F2E4D3', '&:hover': { bgcolor: '#1a1a1a' } }}
        >
          Opslaan
        </Button>
      </DialogActions>
    </Dialog>
  );
}
