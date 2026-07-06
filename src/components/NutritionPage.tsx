import { useCallback, useEffect, useMemo, useState } from 'react';
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
} from '@mui/material';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { PageLayout, ContentCard } from './layout';
import { useProfile } from '../context/ProfileContext';
import {
  searchFoods,
  macrosForGrams,
  saveNutritionLog,
  deleteNutritionLog,
  getNutritionLogsForDay,
  type FoodProduct,
  type NutritionLog,
} from '../services/nutritionService';

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function NutritionPage() {
  const profileCtx = useProfile();
  const isTrainer = profileCtx?.isTrainer ?? false;
  const sporters = profileCtx?.allSporters ?? [];
  const selfUid = profileCtx?.profile?.userId ?? '';
  const selfTrainerId = profileCtx?.profile?.trainerId ?? null;

  const [targetId, setTargetId] = useState(''); // '' = mijzelf
  const [date, setDate] = useState(todayIso());
  const [logs, setLogs] = useState<NutritionLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const [term, setTerm] = useState('');
  const [results, setResults] = useState<FoodProduct[]>([]);
  const [searching, setSearching] = useState(false);

  const [selected, setSelected] = useState<FoodProduct | null>(null);
  const [grams, setGrams] = useState('100');
  const [saving, setSaving] = useState(false);

  const effectiveUserId = targetId || selfUid;
  const effectiveTrainerId = targetId ? sporters.find((s) => s.userId === targetId)?.trainerId ?? null : selfTrainerId;

  const loadLogs = useCallback(async () => {
    if (!effectiveUserId) return;
    setLoadingLogs(true);
    try {
      setLogs(await getNutritionLogsForDay(effectiveUserId, date));
    } catch {
      setLogs([]);
    } finally {
      setLoadingLogs(false);
    }
  }, [effectiveUserId, date]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // Debounced zoeken
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
        .then((r) => {
          if (!cancelled) setResults(r);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [term]);

  const totals = useMemo(() => {
    return logs.reduce(
      (acc, l) => ({
        kcal: acc.kcal + l.kcal,
        protein: Math.round((acc.protein + l.protein) * 10) / 10,
        carbs: Math.round((acc.carbs + l.carbs) * 10) / 10,
        fat: Math.round((acc.fat + l.fat) * 10) / 10,
      }),
      { kcal: 0, protein: 0, carbs: 0, fat: 0 }
    );
  }, [logs]);

  const openAdd = (product: FoodProduct) => {
    setSelected(product);
    setGrams(product.servingGrams != null ? String(product.servingGrams) : '100');
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
      // laat dialog open bij fout
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteNutritionLog(id).catch(() => {});
    await loadLogs();
  };

  const preview = selected ? macrosForGrams(selected.per100g, Number(grams) || 0) : null;

  return (
    <PageLayout>
      <ContentCard>
        <Typography variant="h5" fontWeight={600} sx={{ mb: 0.5 }}>
          Voeding
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Zoek een product (via Open Food Facts) en log je inname. Calorieën en macro's per dag.
        </Typography>

        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 2 }}>
          {isTrainer && sporters.length > 0 && (
            <TextField
              select
              size="small"
              label="Voor wie?"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              sx={{ minWidth: 160 }}
            >
              <MenuItem value="">Mijzelf</MenuItem>
              {sporters.map((s) => (
                <MenuItem key={s.userId} value={s.userId}>
                  {s.displayName?.trim() || s.email || s.userId}
                </MenuItem>
              ))}
            </TextField>
          )}
          <TextField
            type="date"
            size="small"
            label="Datum"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
        </Box>

        {/* Dagtotalen */}
        <Card sx={{ backgroundColor: 'transparent', border: '1px solid', borderColor: 'divider', boxShadow: 'none', borderRadius: 2, mb: 2 }}>
          <CardContent sx={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center', flexWrap: 'wrap', gap: 1, '&:last-child': { pb: 2 } }}>
            {[
              { label: 'kcal', value: totals.kcal },
              { label: 'eiwit', value: `${totals.protein} g` },
              { label: 'koolh.', value: `${totals.carbs} g` },
              { label: 'vet', value: `${totals.fat} g` },
            ].map((t) => (
              <Box key={t.label}>
                <Typography variant="h6" fontWeight={700}>
                  {t.value}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {t.label}
                </Typography>
              </Box>
            ))}
          </CardContent>
        </Card>

        {/* Zoeken */}
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
                <ListItemText
                  primary={p.name}
                  secondary={`${p.brand ? p.brand + ' · ' : ''}${p.per100g.kcal} kcal / 100g · E ${p.per100g.protein} · K ${p.per100g.carbs} · V ${p.per100g.fat}`}
                />
              </ListItemButton>
            ))}
          </List>
        )}

        {/* Vandaag gelogd */}
        <Typography variant="subtitle1" fontWeight={600} sx={{ mt: 1, mb: 1 }}>
          Gelogd
        </Typography>
        {loadingLogs ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
            <CircularProgress size={22} />
          </Box>
        ) : logs.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Nog niets gelogd op deze dag.
          </Typography>
        ) : (
          <List dense>
            {logs.map((l) => (
              <ListItem
                key={l.id}
                secondaryAction={
                  <IconButton edge="end" size="small" onClick={() => handleDelete(l.id)} aria-label="Verwijderen">
                    <DeleteOutlineRoundedIcon fontSize="small" />
                  </IconButton>
                }
              >
                <ListItemText
                  primary={`${l.productName} · ${l.grams} g`}
                  secondary={`${l.kcal} kcal · E ${l.protein} · K ${l.carbs} · V ${l.fat}`}
                />
              </ListItem>
            ))}
          </List>
        )}
      </ContentCard>

      {/* Toevoeg-dialog */}
      <Dialog open={selected != null} onClose={() => setSelected(null)} maxWidth="xs" fullWidth>
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
                  <Box>
                    <Typography fontWeight={700}>{preview.kcal}</Typography>
                    <Typography variant="caption" color="text.secondary">kcal</Typography>
                  </Box>
                  <Box>
                    <Typography fontWeight={700}>{preview.protein} g</Typography>
                    <Typography variant="caption" color="text.secondary">eiwit</Typography>
                  </Box>
                  <Box>
                    <Typography fontWeight={700}>{preview.carbs} g</Typography>
                    <Typography variant="caption" color="text.secondary">koolh.</Typography>
                  </Box>
                  <Box>
                    <Typography fontWeight={700}>{preview.fat} g</Typography>
                    <Typography variant="caption" color="text.secondary">vet</Typography>
                  </Box>
                </Box>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelected(null)}>Annuleren</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving}
            sx={{ bgcolor: '#000', color: '#F2E4D3', '&:hover': { bgcolor: '#1a1a1a' } }}
          >
            {saving ? 'Bezig…' : 'Toevoegen'}
          </Button>
        </DialogActions>
      </Dialog>
    </PageLayout>
  );
}
