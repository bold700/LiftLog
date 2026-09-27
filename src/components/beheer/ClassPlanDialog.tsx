/**
 * Een les voorbereiden: welke workout (en welke dag daarvan) er gegeven wordt, plus een notitie
 * voor de trainer. Alleen voor staf; sporters zien dit niet (zie classPlanService).
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { useNotify } from '../../context/NotifyContext';
import {
  deleteClassPlan,
  exercisesOfDay,
  saveClassPlan,
  type ClassPlan,
  type ClassPlanExercise,
} from '../../services/classPlanService';
import type { StudioClass } from '../../services/classService';
import { orderForClass } from '../../utils/classPlanSuggest';
import { designTokens } from '../../theme/designTokens';
import { ExerciseDbDemo } from '../ExerciseDbDemo';
import { ExerciseInfoButton } from '../exercises/ExerciseInfoButton';
import type { Schema } from '../../types';

const dayOf = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });

/**
 * Oefeningen van een planning als dezelfde kaarten als op de workoutdag (plaatje, naam, sets × reps,
 * aanwijzing), zodat de trainer in de les precies ziet wat er in de workout staat.
 */
export function ExerciseLines({ exercises }: { exercises: ClassPlanExercise[] }) {
  if (exercises.length === 0) return null;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {exercises.map((e, i) => (
        <Box
          key={`${e.name}-${i}`}
          sx={{ display: 'flex', alignItems: 'center', gap: 1.5, bgcolor: designTokens.cardBackground, borderRadius: 3, p: 1.25 }}
        >
          <ExerciseDbDemo exerciseName={e.name} variant="thumb" />
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography sx={{ fontSize: 15, fontWeight: 500, lineHeight: '20px' }}>{e.name}</Typography>
            {e.sets > 0 && e.reps > 0 && (
              <Typography sx={{ fontSize: 12, lineHeight: '16px', color: 'text.secondary' }}>
                {e.sets} × {e.reps}
              </Typography>
            )}
            {e.notes && (
              <Typography sx={{ fontSize: 12, lineHeight: '16px', color: 'text.secondary', fontStyle: 'italic' }}>
                {e.notes}
              </Typography>
            )}
          </Box>
          <ExerciseInfoButton exerciseName={e.name} />
        </Box>
      ))}
    </Box>
  );
}

export function ClassPlanDialog({
  cls,
  plan,
  workouts,
  onClose,
  onSaved,
}: {
  cls: StudioClass | null;
  plan: ClassPlan | null;
  workouts: Schema[];
  onClose: () => void;
  onSaved: (plan: ClassPlan | null) => void;
}) {
  const notify = useNotify();
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [schemaId, setSchemaId] = useState<string | null>(null);
  const [dayIndex, setDayIndex] = useState(0);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSchemaId(plan?.schemaId ?? null);
    setDayIndex(plan?.dayIndex ?? 0);
    setNote(plan?.note ?? '');
  }, [plan, cls]);

  const options = useMemo(() => (cls ? orderForClass(workouts, cls) : []), [workouts, cls]);
  const selected = workouts.find((w) => w.id === schemaId) ?? null;
  const selectedOption = options.find((o) => o.schema.id === schemaId) ?? null;
  // Een workout die deze trainer niet (meer) kan openen: toon de bewaarde momentopname.
  const unreadable = !!schemaId && !selected;
  const exercises = selected ? exercisesOfDay(selected, dayIndex) : unreadable && plan ? plan.exercises : [];

  if (!cls) return null;

  const save = async () => {
    setBusy(true);
    try {
      const saved = await saveClassPlan({
        classId: cls.id,
        date: cls.date,
        schemaId,
        schemaName: selected?.name ?? (unreadable ? (plan?.schemaName ?? null) : null),
        dayIndex: selected ? dayIndex : unreadable ? (plan?.dayIndex ?? null) : null,
        dayLabel: selected
          ? selected.days.length > 1
            ? selected.days[dayIndex]?.dayLabel || `Dag ${dayIndex + 1}`
            : null
          : unreadable
            ? (plan?.dayLabel ?? null)
            : null,
        exercises,
        note: note.trim(),
      });
      notify?.success('Planning opgeslagen.');
      onSaved(saved);
    } catch (e) {
      notify?.error(e instanceof Error ? e.message : 'Opslaan mislukt');
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    try {
      await deleteClassPlan(cls.id);
      notify?.success('Planning gewist.');
      onSaved(null);
    } catch (e) {
      notify?.error(e instanceof Error ? e.message : 'Wissen mislukt');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={() => !busy && onClose()} fullWidth maxWidth="sm" fullScreen={fullScreen}>
      <DialogTitle sx={{ pb: 0.5 }}>{cls.title} voorbereiden</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {dayOf(cls.date)} · {cls.startTime}
          {cls.endTime ? `–${cls.endTime}` : ''} · alleen zichtbaar voor trainers
        </Typography>

        <Autocomplete
          options={options}
          value={selectedOption}
          onChange={(_, v) => {
            setSchemaId(v?.schema.id ?? null);
            setDayIndex(0);
          }}
          groupBy={(o) => (o.suggested ? 'Past bij deze les' : 'Alle workouts')}
          getOptionLabel={(o) => o.schema.name}
          isOptionEqualToValue={(a, b) => a.schema.id === b.schema.id}
          renderInput={(params) => (
            <TextField {...params} label="Workout" placeholder={unreadable ? (plan?.schemaName ?? '') : 'Kies een workout'} />
          )}
          noOptionsText="Geen workouts gevonden"
        />

        {selected && selected.days.length > 1 && (
          <TextField
            select
            fullWidth
            label="Dag"
            value={dayIndex}
            onChange={(e) => setDayIndex(Number(e.target.value))}
            sx={{ mt: 2 }}
          >
            {selected.days.map((d, i) => (
              <MenuItem key={i} value={i}>
                {d.dayLabel || `Dag ${i + 1}`}
              </MenuItem>
            ))}
          </TextField>
        )}

        {exercises.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              {unreadable ? `${plan?.schemaName ?? 'Workout'} (bewaard bij het plannen)` : 'Oefeningen'}
            </Typography>
            <ExerciseLines exercises={exercises} />
          </Box>
        )}

        <TextField
          fullWidth
          multiline
          minRows={3}
          label="Notitie voor de trainer"
          placeholder="Bijv. buik maakt niet uit wat je wilt. Rugklachten: goblet squat in plaats van deadlift."
          value={note}
          onChange={(e) => setNote(e.target.value)}
          sx={{ mt: 2 }}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {plan && (
          <Button color="error" onClick={() => void clear()} disabled={busy} sx={{ mr: 'auto' }}>
            Planning wissen
          </Button>
        )}
        <Button onClick={onClose} disabled={busy}>
          Annuleren
        </Button>
        <Button variant="contained" disableElevation onClick={() => void save()} disabled={busy || (!schemaId && !note.trim())}>
          Opslaan
        </Button>
      </DialogActions>
    </Dialog>
  );
}
