/**
 * Profiel (trainer of beheerder): Afwezigheid. Losse dagen (vakantie, ziek) of elke maand op een
 * vaste dag ("1e donderdag van de maand"), met eventueel een vaste invaller. Met invaller gaan de
 * lessen op die dagen naar de invaller als die vrij is; de rest staat in Beheer bij "Lessen zonder
 * trainer", met voorstellen wie vrij is. De trainer beslist, de app stelt voor.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import { designTokens } from '../theme/designTokens';
import { useNotify } from '../context/NotifyContext';
import { getTrainerNames } from '../services/classService';
import { deleteAbsence, listAbsences, saveAbsence, type AbsenceKind, type TrainerAbsence } from '../services/absenceService';
import { todayIso } from '../utils/format';

const WEEKDAYS: { weekday: number; label: string }[] = [
  { weekday: 1, label: 'maandag' },
  { weekday: 2, label: 'dinsdag' },
  { weekday: 3, label: 'woensdag' },
  { weekday: 4, label: 'donderdag' },
  { weekday: 5, label: 'vrijdag' },
  { weekday: 6, label: 'zaterdag' },
  { weekday: 0, label: 'zondag' },
];
const NTHS: { value: number; label: string }[] = [
  { value: 1, label: '1e' },
  { value: 2, label: '2e' },
  { value: 3, label: '3e' },
  { value: 4, label: '4e' },
  { value: -1, label: 'laatste' },
];

const weekdayOf = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

interface Draft {
  kind: AbsenceKind;
  from: string;
  until: string;
  nth: number;
  weekday: number;
  substituteId: string;
  note: string;
}

const newDraft = (): Draft => ({ kind: 'dates', from: todayIso(), until: todayIso(), nth: 1, weekday: weekdayOf(todayIso()), substituteId: '', note: '' });

export function AbsenceCard({ userId }: { userId: string }) {
  const notify = useNotify();
  const [absences, setAbsences] = useState<TrainerAbsence[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    listAbsences(userId).then(
      (r) => setAbsences(r.absences),
      () => setAbsences(null)
    );
  }, [userId]);

  useEffect(() => {
    load();
    getTrainerNames()
      .then(setNames)
      .catch(() => undefined);
  }, [load]);

  if (!absences) return null;
  const others = Object.entries(names)
    .filter(([id]) => id !== userId)
    .sort((a, b) => a[1].localeCompare(b[1]));

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const r = await saveAbsence({
        trainerId: userId,
        kind: draft.kind,
        from: draft.from,
        until: draft.kind === 'dates' ? draft.until || draft.from : draft.until || null,
        ...(draft.kind === 'monthly' ? { nth: draft.nth, weekday: draft.weekday } : {}),
        substituteId: draft.substituteId || null,
        note: draft.note || null,
      });
      const parts = [`Afwezig: ${r.absence.label}.`];
      if (r.assigned) parts.push(`${r.assigned} ${r.assigned === 1 ? 'les gaat' : 'lessen gaan'} naar ${names[draft.substituteId] ?? 'de invaller'}.`);
      if (r.open) parts.push(`${r.open} ${r.open === 1 ? 'les heeft' : 'lessen hebben'} nog geen invaller (Beheer → Lessen zonder trainer).`);
      notify.success(parts.join(' '));
      setDraft(null);
      load();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Opslaan mislukt.', e);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (a: TrainerAbsence) => {
    try {
      const r = await deleteAbsence(a.id);
      notify.success(r.restored ? `Weggehaald. ${r.restored} ${r.restored === 1 ? 'les gaat' : 'lessen gaan'} terug naar jou.` : 'Weggehaald.');
      load();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Weghalen mislukt.', e);
    }
  };

  const set = (patch: Partial<Draft>) => draft && setDraft({ ...draft, ...patch });
  const invalid =
    !draft ||
    !draft.from ||
    (draft.kind === 'dates' && !!draft.until && draft.until < draft.from) ||
    (draft.kind === 'monthly' && !!draft.until && draft.until < draft.from);

  return (
    <Box sx={{ bgcolor: designTokens.cardBackground, borderRadius: `${designTokens.cardRadius}px`, px: 3, py: 2.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
        <Typography component="h2" sx={{ fontSize: 14, fontWeight: 500, lineHeight: '20px', flex: 1 }}>
          Afwezigheid
        </Typography>
        <Button size="small" startIcon={<AddRoundedIcon />} onClick={() => setDraft(newDraft())}>
          Toevoegen
        </Button>
      </Box>
      <Typography sx={{ fontSize: 13, color: 'text.secondary', mb: absences.length ? 1.5 : 0 }}>
        Vrij, ziek of elke maand een vaste dag niet? Zet het hier. Met een vaste invaller gaan je lessen naar die trainer (als die vrij
        is); de rest staat in Beheer met voorstellen wie kan invallen.
      </Typography>
      {absences.map((a) => (
        <Box key={a.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1, borderTop: `1px solid ${designTokens.cardBackgroundHigh}` }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {a.label.charAt(0).toUpperCase() + a.label.slice(1)}
              {a.kind === 'monthly' && a.until ? ` t/m ${a.until.split('-').reverse().join('-')}` : ''}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {a.substituteId ? `Invaller: ${names[a.substituteId] ?? 'trainer'}` : 'Nog geen invaller'}
              {a.note ? ` · ${a.note}` : ''}
            </Typography>
          </Box>
          <IconButton size="small" aria-label="Afwezigheid weghalen" onClick={() => void remove(a)}>
            <DeleteOutlineRoundedIcon fontSize="small" />
          </IconButton>
        </Box>
      ))}

      <Dialog open={!!draft} onClose={() => setDraft(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Afwezig</DialogTitle>
        {draft && (
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, '&&': { pt: 1 } }}>
            <ToggleButtonGroup size="small" exclusive value={draft.kind} onChange={(_, v: AbsenceKind | null) => v && set({ kind: v, until: v === 'dates' ? draft.from : '' })}>
              <ToggleButton value="dates">Losse dagen</ToggleButton>
              <ToggleButton value="monthly">Elke maand</ToggleButton>
            </ToggleButtonGroup>
            {draft.kind === 'monthly' && (
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 2 }}>
                <TextField select size="small" label="Welke" value={draft.nth} onChange={(e) => set({ nth: Number(e.target.value) })}>
                  {NTHS.map((n) => (
                    <MenuItem key={n.value} value={n.value}>
                      {n.label}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField select size="small" label="Dag van de maand" value={draft.weekday} onChange={(e) => set({ weekday: Number(e.target.value) })}>
                  {WEEKDAYS.map((d) => (
                    <MenuItem key={d.weekday} value={d.weekday}>
                      {d.label}
                    </MenuItem>
                  ))}
                </TextField>
              </Box>
            )}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <TextField
                size="small"
                type="date"
                label="Van"
                value={draft.from}
                onChange={(e) => e.target.value && set({ from: e.target.value, ...(draft.kind === 'dates' && draft.until < e.target.value ? { until: e.target.value } : {}) })}
                InputLabelProps={{ shrink: true }}
                inputProps={{ min: todayIso() }}
              />
              <TextField
                size="small"
                type="date"
                label={draft.kind === 'dates' ? 'T/m' : 'T/m (optioneel)'}
                value={draft.until}
                error={!!draft.until && draft.until < draft.from}
                onChange={(e) => set({ until: e.target.value })}
                InputLabelProps={{ shrink: true }}
                inputProps={{ min: draft.from }}
              />
            </Box>
            <TextField
              select
              size="small"
              label="Vaste invaller"
              value={draft.substituteId}
              onChange={(e) => set({ substituteId: e.target.value })}
              SelectProps={{ displayEmpty: true }}
              InputLabelProps={{ shrink: true }}
            >
              <MenuItem value="">Nog niet bepalen</MenuItem>
              {others.map(([id, name]) => (
                <MenuItem key={id} value={id}>
                  {name}
                </MenuItem>
              ))}
            </TextField>
            <TextField size="small" label="Notitie (optioneel)" value={draft.note} onChange={(e) => set({ note: e.target.value })} inputProps={{ maxLength: 120 }} />
            <Typography variant="caption" color="text.secondary">
              {draft.substituteId
                ? `Je lessen op die dagen gaan naar ${names[draft.substituteId] ?? 'de invaller'}, als die dan vrij is. Wie is ingeschreven krijgt een melding.`
                : 'Je lessen op die dagen komen in Beheer bij "Lessen zonder trainer", met voorstellen wie vrij is.'}
            </Typography>
          </DialogContent>
        )}
        <DialogActions>
          <Button onClick={() => setDraft(null)}>Annuleren</Button>
          <Button variant="contained" disableElevation disabled={saving || invalid} onClick={() => void save()}>
            {saving ? 'Bezig…' : 'Opslaan'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
