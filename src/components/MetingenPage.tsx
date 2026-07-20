import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  MenuItem,
  Button,
  Card,
  CardContent,
  CircularProgress,
  IconButton,
  List,
  ListItem,
  ListItemText,
} from '@mui/material';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import { LinearProgress, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import { PageLayout, ContentCard } from './layout';
import { useProfile } from '../context/ProfileContext';
import { updateProfile } from '../services/profileService';
import { Collapse } from '@mui/material';
import {
  saveMeasurement,
  deleteMeasurement,
  getMeasurementsForUser,
  CIRCUMFERENCE_FIELDS,
  type Measurement,
  type CircumferenceKey,
} from '../services/measurementService';

const EMPTY_CIRC = Object.fromEntries(CIRCUMFERENCE_FIELDS.map((f) => [f.key, ''])) as Record<CircumferenceKey, string>;

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
  const [bodyFat, setBodyFat] = useState('');
  const [note, setNote] = useState('');
  const [circ, setCirc] = useState<Record<CircumferenceKey, string>>(EMPTY_CIRC);
  const [showCirc, setShowCirc] = useState(false);
  const [saving, setSaving] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [goalInput, setGoalInput] = useState('');

  const effectiveUserId = targetId || selfUid;
  const effectiveTrainerId = targetId ? sporters.find((s) => s.userId === targetId)?.trainerId ?? null : selfTrainerId;

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
    setNote('');
    setCirc(EMPTY_CIRC);
    setShowCirc(false);
  };

  const circNumbers = (): Record<CircumferenceKey, number | null> => {
    const o = {} as Record<CircumferenceKey, number | null>;
    for (const f of CIRCUMFERENCE_FIELDS) {
      const v = circ[f.key].trim();
      o[f.key] = v !== '' ? Number(v) : null;
    }
    return o;
  };

  const handleSave = async () => {
    if (!effectiveUserId) return;
    const w = weight.trim() !== '' ? Number(weight) : null;
    const bf = bodyFat.trim() !== '' ? Number(bodyFat) : null;
    const cn = circNumbers();
    const hasCirc = CIRCUMFERENCE_FIELDS.some((f) => cn[f.key] != null);
    if (w == null && bf == null && !hasCirc) return;
    setSaving(true);
    try {
      const editing = items.find((m) => m.id === editingId);
      await saveMeasurement({
        id: editing?.id,
        createdAt: editing?.createdAt,
        userId: effectiveUserId,
        loggedBy: selfUid || effectiveUserId,
        trainerId: effectiveTrainerId,
        date,
        weightKg: w,
        bodyFatPct: bf,
        ...cn,
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
    setBodyFat(m.bodyFatPct != null ? String(m.bodyFatPct) : '');
    setNote(m.note);
    const c = {} as Record<CircumferenceKey, string>;
    let any = false;
    for (const f of CIRCUMFERENCE_FIELDS) {
      const v = m[f.key];
      c[f.key] = v != null ? String(v) : '';
      if (v != null) any = true;
    }
    setCirc(c);
    setShowCirc(any);
  };

  const handleDelete = async (id: string) => {
    await deleteMeasurement(id).catch(() => {});
    if (editingId === id) resetForm();
    await load();
  };

  const weightPoints = useMemo(() => items.filter((m) => m.weightKg != null) as (Measurement & { weightKg: number })[], [items]);
  const latestWeight = weightPoints.length ? weightPoints[weightPoints.length - 1].weightKg : null;
  const firstWeight = weightPoints.length ? weightPoints[0].weightKg : null;
  const weightDelta = latestWeight != null && firstWeight != null ? Math.round((latestWeight - firstWeight) * 10) / 10 : null;
  const bfPoints = items.filter((m) => m.bodyFatPct != null);
  const latestBf = bfPoints.length ? bfPoints[bfPoints.length - 1].bodyFatPct : null;

  const wMin = weightPoints.length ? Math.min(...weightPoints.map((p) => p.weightKg)) : 0;
  const wMax = weightPoints.length ? Math.max(...weightPoints.map((p) => p.weightKg)) : 1;

  const goalWeight = targetId
    ? sporters.find((s) => s.userId === targetId)?.weightGoalKg ?? null
    : profileCtx?.profile?.weightGoalKg ?? null;
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

  // Lijngrafiek-geometrie voor het gewicht (viewBox = echte pixelbreedte, geen vervorming)
  const chartRef = useRef<HTMLDivElement | null>(null);
  const [chartW, setChartW] = useState(320);
  useEffect(() => {
    const el = chartRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setChartW(Math.round(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const chartPts = weightPoints.slice(-20);
  const CW = chartW;
  const CH = 130;
  const cpad = 14;
  // Schaal met wat marge zodat de lijn niet tegen de randen plakt
  const cMin = Math.min(wMin, goalWeight ?? wMin);
  const cMax = Math.max(wMax, goalWeight ?? wMax);
  const cRange = cMax - cMin || 1;
  const cx = (i: number) => (chartPts.length > 1 ? (i * (CW - 2 * cpad)) / (chartPts.length - 1) : (CW - 2 * cpad) / 2) + cpad;
  const cy = (w: number) => CH - cpad - ((w - cMin) / cRange) * (CH - 2 * cpad);
  const linePoints = chartPts.map((p, i) => `${cx(i)},${cy(p.weightKg)}`).join(' ');
  const goalY = goalWeight != null ? cy(goalWeight) : null;

  return (
    <PageLayout>
      <ContentCard>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
          <Typography variant="h5" fontWeight={600}>
            Metingen
          </Typography>
          <Button
            size="small"
            variant="text"
            onClick={() => {
              setGoalInput(goalWeight != null ? String(goalWeight) : '');
              setGoalOpen(true);
            }}
          >
            {goalWeight != null ? `Doel: ${goalWeight} kg` : 'Doelgewicht instellen'}
          </Button>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Houd je gewicht, vetpercentage en omtrekmaten bij en volg je voortgang.
        </Typography>

        {isTrainer && sporters.length > 0 && (
          <TextField select size="small" label="Voor wie?" value={targetId} onChange={(e) => setTargetId(e.target.value)} sx={{ minWidth: 160, mb: 2 }} SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }}>
            <MenuItem value="">Mijzelf</MenuItem>
            {sporters.map((s) => (
              <MenuItem key={s.userId} value={s.userId}>
                {s.displayName?.trim() || s.email || s.userId}
              </MenuItem>
            ))}
          </TextField>
        )}

        {/* Huidige waarden */}
        <Card sx={{ backgroundColor: 'transparent', border: '1px solid', borderColor: 'divider', boxShadow: 'none', borderRadius: 2, mb: 2 }}>
          <CardContent sx={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center', flexWrap: 'wrap', gap: 1, '&:last-child': { pb: 2 } }}>
            <Box>
              <Typography variant="h6" fontWeight={700}>
                {latestWeight != null ? `${latestWeight} kg` : '—'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                gewicht{weightDelta != null ? ` (${weightDelta > 0 ? '+' : ''}${weightDelta} kg)` : ''}
              </Typography>
            </Box>
            <Box>
              <Typography variant="h6" fontWeight={700}>
                {latestBf != null ? `${latestBf}%` : '—'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                vetpercentage
              </Typography>
            </Box>
          </CardContent>
        </Card>

        {/* Voortgang naar doel + tempo */}
        {(goalWeight != null || perWeek != null) && (
          <Card sx={{ backgroundColor: 'transparent', border: '1px solid', borderColor: 'divider', boxShadow: 'none', borderRadius: 2, mb: 2 }}>
            <CardContent sx={{ '&:last-child': { pb: 2 } }}>
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
                    <LinearProgress variant="determinate" value={goalProgress} sx={{ height: 8, borderRadius: 1, mb: perWeek != null ? 1.5 : 0 }} />
                  )}
                </>
              )}
              {perWeek != null && (
                <Typography variant="caption" color="text.secondary">
                  Gemiddeld {perWeek > 0 ? '+' : ''}{perWeek} kg per week
                </Typography>
              )}
            </CardContent>
          </Card>
        )}

        {/* Gewicht-trend */}
        {weightPoints.length >= 2 && (
          <Card sx={{ backgroundColor: 'transparent', border: '1px solid', borderColor: 'divider', boxShadow: 'none', borderRadius: 2, mb: 2 }}>
            <CardContent sx={{ '&:last-child': { pb: 2 } }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                Gewicht ({wMin}–{wMax} kg)
              </Typography>
              <Box ref={chartRef} sx={{ width: '100%' }}>
                <Box
                  component="svg"
                  viewBox={`0 0 ${CW} ${CH}`}
                  sx={{ width: '100%', height: CH, display: 'block', color: 'primary.main' }}
                >
                  {goalY != null && (
                    <line x1={0} y1={goalY} x2={CW} y2={goalY} stroke="#9e9e9e" strokeWidth={1} strokeDasharray="4 4" />
                  )}
                  <polyline points={linePoints} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                  {chartPts.map((p, i) => (
                    <circle key={p.id} cx={cx(i)} cy={cy(p.weightKg)} r={3} fill="currentColor">
                      <title>{`${p.date}: ${p.weightKg} kg`}</title>
                    </circle>
                  ))}
                </Box>
              </Box>
            </CardContent>
          </Card>
        )}

        {/* Invoer */}
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
          {editingId ? 'Meting bewerken' : 'Nieuwe meting'}
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1, mb: 1 }}>
          <TextField type="date" size="small" label="Datum" value={date} onChange={(e) => setDate(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ flex: 1 }} />
          <TextField type="number" size="small" label="Gewicht (kg)" value={weight} onChange={(e) => setWeight(e.target.value)} sx={{ flex: 1 }} inputProps={{ step: 0.1, min: 0 }} />
          <TextField type="number" size="small" label="Vet (%)" value={bodyFat} onChange={(e) => setBodyFat(e.target.value)} sx={{ flex: 1 }} inputProps={{ step: 0.1, min: 0 }} />
        </Box>
        {/* Omtrekken (cm) — uitklapbaar */}
        <Button
          size="small"
          variant="text"
          onClick={() => setShowCirc((v) => !v)}
          sx={{ mb: showCirc ? 1 : 1, px: 0, minWidth: 0 }}
        >
          {showCirc ? 'Omtrekken verbergen' : 'Omtrekken toevoegen (cm)'}
        </Button>
        <Collapse in={showCirc} unmountOnExit>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' },
              gap: 1,
              mb: 1,
            }}
          >
            {CIRCUMFERENCE_FIELDS.map((f) => (
              <TextField
                key={f.key}
                type="number"
                size="small"
                label={f.label}
                value={circ[f.key]}
                onChange={(e) => setCirc((c) => ({ ...c, [f.key]: e.target.value }))}
                inputProps={{ step: 0.5, min: 0 }}
              />
            ))}
          </Box>
        </Collapse>
        <TextField size="small" label="Notitie (optioneel)" value={note} onChange={(e) => setNote(e.target.value)} fullWidth sx={{ mb: 1 }} />
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="contained" onClick={handleSave} disabled={saving} sx={{ bgcolor: '#000', color: '#F2E4D3', '&:hover': { bgcolor: '#1a1a1a' } }}>
            {saving ? 'Bezig…' : editingId ? 'Opslaan' : 'Toevoegen'}
          </Button>
          {editingId && <Button onClick={resetForm}>Annuleren</Button>}
        </Box>

        {/* Historie */}
        <Typography variant="subtitle1" fontWeight={600} sx={{ mt: 3, mb: 1 }}>
          Historie
        </Typography>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
            <CircularProgress size={22} />
          </Box>
        ) : items.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Nog geen metingen.
          </Typography>
        ) : (
          <List dense>
            {[...items].reverse().map((m) => (
              <ListItem
                key={m.id}
                secondaryAction={
                  <Box>
                    <IconButton edge="end" size="small" onClick={() => handleEdit(m)} aria-label="Bewerken" sx={{ mr: 0.5 }}>
                      <EditRoundedIcon fontSize="small" />
                    </IconButton>
                    <IconButton edge="end" size="small" onClick={() => handleDelete(m.id)} aria-label="Verwijderen">
                      <DeleteOutlineRoundedIcon fontSize="small" />
                    </IconButton>
                  </Box>
                }
              >
                <ListItemText
                  primary={`${m.date} · ${m.weightKg != null ? `${m.weightKg} kg` : ''}${m.weightKg != null && m.bodyFatPct != null ? ' · ' : ''}${m.bodyFatPct != null ? `${m.bodyFatPct}%` : ''}`}
                  secondary={
                    [
                      CIRCUMFERENCE_FIELDS.filter((f) => m[f.key] != null)
                        .map((f) => `${f.label} ${m[f.key]}`)
                        .join(' · ') || null,
                      m.note || null,
                    ]
                      .filter(Boolean)
                      .join(' — ') || undefined
                  }
                />
              </ListItem>
            ))}
          </List>
        )}
      </ContentCard>

      <Dialog open={goalOpen} onClose={() => setGoalOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Doelgewicht</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Vul je streefgewicht in. Laat leeg om geen doel te gebruiken.
          </Typography>
          <TextField
            type="number"
            size="small"
            label="Doelgewicht (kg)"
            value={goalInput}
            onChange={(e) => setGoalInput(e.target.value)}
            fullWidth
            inputProps={{ step: 0.1, min: 0 }}
            autoFocus
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setGoalOpen(false)}>Annuleren</Button>
          <Button variant="contained" onClick={handleSaveGoal} sx={{ bgcolor: '#000', color: '#F2E4D3', '&:hover': { bgcolor: '#1a1a1a' } }}>
            Opslaan
          </Button>
        </DialogActions>
      </Dialog>
    </PageLayout>
  );
}
