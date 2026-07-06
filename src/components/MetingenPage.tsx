import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { PageLayout, ContentCard } from './layout';
import { useProfile } from '../context/ProfileContext';
import {
  saveMeasurement,
  deleteMeasurement,
  getMeasurementsForUser,
  type Measurement,
} from '../services/measurementService';

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
  const [saving, setSaving] = useState(false);

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
  };

  const handleSave = async () => {
    if (!effectiveUserId) return;
    const w = weight.trim() !== '' ? Number(weight) : null;
    const bf = bodyFat.trim() !== '' ? Number(bodyFat) : null;
    if (w == null && bf == null) return;
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
  const wRange = wMax - wMin;

  return (
    <PageLayout>
      <ContentCard>
        <Typography variant="h5" fontWeight={600} sx={{ mb: 0.5 }}>
          Metingen
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Houd je gewicht en vetpercentage bij en volg je voortgang.
        </Typography>

        {isTrainer && sporters.length > 0 && (
          <TextField select size="small" label="Voor wie?" value={targetId} onChange={(e) => setTargetId(e.target.value)} sx={{ minWidth: 160, mb: 2 }}>
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

        {/* Gewicht-trend */}
        {weightPoints.length >= 2 && (
          <Card sx={{ backgroundColor: 'transparent', border: '1px solid', borderColor: 'divider', boxShadow: 'none', borderRadius: 2, mb: 2 }}>
            <CardContent sx={{ '&:last-child': { pb: 2 } }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                Gewicht ({wMin}–{wMax} kg)
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 0.5, height: 110 }}>
                {weightPoints.slice(-16).map((p) => (
                  <Box key={p.id} sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0 }}>
                    <Box
                      title={`${p.date}: ${p.weightKg} kg`}
                      sx={{
                        width: '78%',
                        height: `${wRange > 0 ? Math.round(((p.weightKg - wMin) / wRange) * 78) + 22 : 60}%`,
                        bgcolor: 'primary.main',
                        borderRadius: 1,
                      }}
                    />
                  </Box>
                ))}
              </Box>
            </CardContent>
          </Card>
        )}

        {/* Invoer */}
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
          {editingId ? 'Meting bewerken' : 'Nieuwe meting'}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
          <TextField type="date" size="small" label="Datum" value={date} onChange={(e) => setDate(e.target.value)} InputLabelProps={{ shrink: true }} />
          <TextField type="number" size="small" label="Gewicht (kg)" value={weight} onChange={(e) => setWeight(e.target.value)} sx={{ width: 130 }} inputProps={{ step: 0.1, min: 0 }} />
          <TextField type="number" size="small" label="Vet (%)" value={bodyFat} onChange={(e) => setBodyFat(e.target.value)} sx={{ width: 110 }} inputProps={{ step: 0.1, min: 0 }} />
        </Box>
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
                  secondary={m.note || undefined}
                />
              </ListItem>
            ))}
          </List>
        )}
      </ContentCard>
    </PageLayout>
  );
}
