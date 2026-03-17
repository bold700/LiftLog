import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  IconButton,
  TextField,
  Autocomplete,
  Tooltip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { Schema, SchemaDay, SchemaExercise, Formule7Routekaart } from '../types';
import type { Profile } from '../types';
import { createEmptyFormule7, NMT_PRESETS_BY_GOAL } from '../utils/formule7Defaults';
import type { Formule7StrengthGoal } from '../types';
import { Formule7RoutekaartForm } from './Formule7RoutekaartForm';
import { getExerciseNames } from '../utils/storage';
import { getExerciseNamesByEquipment, type ExerciseEquipment } from '../data/exercises';
import {
  MUSCLE_GROUP_OPTIONS,
  filterExerciseNamesByMuscleGroup,
} from '../utils/exerciseMuscleFilter';
import { designTokens } from '../theme/designTokens';
import { addWeeks, getWeeksBetween } from '../utils/format';
import { PageLayout, ContentCard } from './layout';
import '@material/web/button/filled-button.js';
import '@material/web/button/text-button.js';
import '@material/web/icon/icon.js';

const defaultSchemaExercise = (exerciseName: string): SchemaExercise => ({
  exerciseId: exerciseName,
  exerciseName,
  setsTarget: 3,
  repsTarget: 10,
  restSeconds: 60,
  notes: '',
});


/** Rij voor oefening-parameters: vult volle breedte; velden delen de ruimte gelijk. */
const EXERCISE_PARAMS_ROW = {
  display: 'flex',
  flexWrap: 'wrap' as const,
  gap: 2,
  alignItems: 'flex-start' as const,
  minWidth: 0,
  width: '100%',
  '& > *': {
    flex: '1 1 100%',
    minWidth: 0,
    '@media (min-width: 360px)': { flex: '1 1 0%', minWidth: 64 },
  },
};

const EQUIPMENT_FILTER_OPTIONS: { value: ExerciseEquipment | 'all'; label: string }[] = [
  { value: 'all', label: 'Alle oefeningen' },
  { value: 'machine', label: 'Alleen machines' },
  { value: 'free_weight', label: 'Alleen vrije gewichten' },
  { value: 'cable', label: 'Alleen kabels' },
  { value: 'bodyweight', label: 'Alleen bodyweight' },
  { value: 'other', label: 'Overig' },
];

/** Aantal schemadagen op basis van trainingsfrequentie per week (Formule 7). */
function getDayCountFromSessions(
  sessionsPerWeek: Formule7Routekaart['sessionsPerWeek']
): number | null {
  if (sessionsPerWeek == null) return null;
  return sessionsPerWeek;
}

/** Maakt lege oefeningen met standaard waarden uit het NMT-voorschrift (Tabel 4). */
function createExercisesFromPreset(
  goal: Formule7StrengthGoal,
  count: number
): SchemaExercise[] {
  const preset = NMT_PRESETS_BY_GOAL[goal];
  return Array.from({ length: count }, () => ({
    exerciseId: '',
    exerciseName: '',
    setsTarget: preset.sets,
    repsTarget: preset.reps,
    restSeconds: preset.restSeconds,
    intensityPercent1RM: preset.percent1RM,
    notes: '',
  }));
}

interface SchemaEditViewProps {
  schema: Schema;
  onSave: (schema: Schema) => void;
  onCancel: () => void;
  /** Lijst sporters (alleen voor trainers) om workout aan toe te wijzen. */
  sporters?: Profile[];
}

const DURATION_WEEKS_OPTIONS = [4, 5, 6, 7, 8] as const;
export type DurationWeeks = (typeof DURATION_WEEKS_OPTIONS)[number];

function getDurationWeeksFromSchema(schema: Schema): DurationWeeks {
  if (schema.startDate && schema.endDate) {
    const w = getWeeksBetween(schema.startDate, schema.endDate);
    return Math.min(8, Math.max(4, w)) as DurationWeeks;
  }
  return 6;
}

export const SchemaEditView = ({ schema, onSave, onCancel, sporters = [] }: SchemaEditViewProps) => {
  const [name, setName] = useState(schema.name);
  const [clientId, setClientId] = useState<string | null>(schema.clientId ?? null);
  const [startDate, setStartDate] = useState(schema.startDate ?? '');
  const [durationWeeks, setDurationWeeks] = useState<DurationWeeks>(() =>
    getDurationWeeksFromSchema(schema)
  );
  const [days, setDays] = useState<SchemaDay[]>(
    schema.days.length > 0 ? schema.days : [{ dayLabel: 'Dag 1', exercises: [] }]
  );
  const [formule7, setFormule7] = useState<Formule7Routekaart | null>(() =>
    schema.formule7 ?? (schema.isFormule7Template ? createEmptyFormule7() : null)
  );
  const [equipmentFilter, setEquipmentFilter] = useState<ExerciseEquipment | 'all'>('all');
  const [selectedMuscleGroup, setSelectedMuscleGroup] = useState<string | null>(null);
  const exerciseOptions = useMemo(() => {
    const userNames = getExerciseNames();
    const byEquipment = getExerciseNamesByEquipment(equipmentFilter, userNames);
    return filterExerciseNamesByMuscleGroup(byEquipment, selectedMuscleGroup);
  }, [equipmentFilter, selectedMuscleGroup]);
  const saveButtonRef = useRef<HTMLElement | null>(null);
  const cancelButtonRef = useRef<HTMLElement | null>(null);

  // Sync naam, clientId en datums wanneer schema wijzigt
  useEffect(() => {
    setName(schema.name);
    setClientId(schema.clientId ?? null);
    setStartDate(schema.startDate ?? '');
    setDurationWeeks(getDurationWeeksFromSchema(schema));
    setFormule7(
      schema.formule7 ?? (schema.isFormule7Template ? createEmptyFormule7() : null)
    );
  }, [schema.id, schema.name, schema.clientId, schema.startDate, schema.endDate]);

  // Dagen alleen bij wissel van schema (niet bij elke render, anders verlies je bewerkingen)
  useEffect(() => {
    setDays(
      schema.days.length > 0 ? schema.days : [{ dayLabel: 'Dag 1', exercises: [] }]
    );
  }, [schema.id]);

  // Bij Formule 7: dagen aanmaken + per dag oefeningen met voorschrift (sets, reps, rust) voorinvullen
  useEffect(() => {
    if (!schema.isFormule7Template || !formule7) return;
    const n = getDayCountFromSessions(formule7.sessionsPerWeek);
    if (n == null || n <= 0) return;
    const goal = formule7.neuromuscular?.goal;
    const exerciseCount = formule7.neuromuscular?.desiredExerciseCount ?? 6;
    const hasPreset = goal && exerciseCount >= 4 && exerciseCount <= 9;

    setDays((prev) => {
      let next = [...prev];
      // Aantal dagen laten meelopen met frequentie: inkorten of uitbreiden
      if (next.length > n) {
        next = next.slice(0, n);
      }
      while (next.length < n) {
        const dayIndex = next.length + 1;
        const exercises = hasPreset
          ? createExercisesFromPreset(goal as Formule7StrengthGoal, exerciseCount)
          : [];
        next.push({
          dayLabel: `Dag ${dayIndex}`,
          exercises,
          warmup: { ...formule7.warmup },
          cardio: { ...formule7.cardio, zones: formule7.cardio.zones.map((z) => ({ ...z })) },
          cooldown: { ...formule7.cooldown },
          stretching: formule7.stretching.length ? formule7.stretching.map((s) => ({ ...s })) : [],
        });
      }
      // Bestaande dagen: aantal oefeningen laten meelopen; ontbrekende per-dag velden vullen met defaults
      const withDefaults = next.map((d) => ({
        ...d,
        warmup: d.warmup ?? { ...formule7.warmup },
        cardio: d.cardio ?? { ...formule7.cardio, zones: formule7.cardio.zones.map((z) => ({ ...z })) },
        cooldown: d.cooldown ?? { ...formule7.cooldown },
        stretching: d.stretching?.length ? d.stretching : (formule7.stretching.length ? formule7.stretching.map((s) => ({ ...s })) : []),
      }));
      if (hasPreset) {
        const preset = NMT_PRESETS_BY_GOAL[goal as Formule7StrengthGoal];
        return withDefaults.map((d) => {
          if (d.exercises.length === 0) {
            return { ...d, exercises: createExercisesFromPreset(goal as Formule7StrengthGoal, exerciseCount) };
          }
          if (d.exercises.length > exerciseCount) {
            return { ...d, exercises: d.exercises.slice(0, exerciseCount) };
          }
          if (d.exercises.length < exerciseCount) {
            const extra = exerciseCount - d.exercises.length;
            const newExercises = Array.from({ length: extra }, () => ({
              exerciseId: '',
              exerciseName: '',
              setsTarget: preset.sets,
              repsTarget: preset.reps,
              restSeconds: preset.restSeconds,
              intensityPercent1RM: preset.percent1RM,
              notes: '',
            }));
            return { ...d, exercises: [...d.exercises, ...newExercises] };
          }
          return d;
        });
      }
      return withDefaults;
    });
  }, [
    schema.isFormule7Template,
    formule7?.sessionsPerWeek,
    formule7?.neuromuscular?.goal,
    formule7?.neuromuscular?.desiredExerciseCount,
  ]);

  const handleSave = useCallback(() => {
    const trimmedName = name.trim() || 'Nieuw schema';
    const cleanedDays: SchemaDay[] = days
      .filter((d) => d.dayLabel.trim() !== '' || d.exercises.length > 0)
      .map((d) => {
        const dayLabel = d.dayLabel.trim() || 'Dag';
        const exercises = d.exercises.filter((ex) => ex.exerciseName.trim() !== '');
        const cleaned: SchemaDay = {
          dayLabel,
          exercises,
        };
        if (d.warmup != null) cleaned.warmup = d.warmup;
        if (d.cardio != null) cleaned.cardio = d.cardio;
        if (d.cooldown != null) cleaned.cooldown = d.cooldown;
        if (d.stretching && d.stretching.length > 0) cleaned.stretching = d.stretching;
        return cleaned;
      });
    const start = startDate.trim() || null;
    const endDateValue = start ? addWeeks(start, durationWeeks) : null;
    const updated: Schema = {
      ...schema,
      name: trimmedName,
      clientId: clientId || null,
      startDate: start,
      endDate: endDateValue,
      days: cleanedDays,
      formule7: formule7 ?? null,
    };
    onSave(updated);
  }, [schema, name, clientId, startDate, durationWeeks, days, formule7, onSave]);

  const addDay = useCallback(() => {
    setDays((prev) => [...prev, { dayLabel: `Dag ${prev.length + 1}`, exercises: [] }]);
  }, []);

  const updateDay = useCallback((dayIndex: number, upd: Partial<SchemaDay>) => {
    setDays((prev) =>
      prev.map((d, i) => (i === dayIndex ? { ...d, ...upd } : d))
    );
  }, []);

  const removeDay = useCallback((dayIndex: number) => {
    setDays((prev) => prev.filter((_, i) => i !== dayIndex));
  }, []);

  const addExerciseToDay = useCallback((dayIndex: number) => {
    setDays((prev) =>
      prev.map((d, i) =>
        i === dayIndex
          ? { ...d, exercises: [...d.exercises, defaultSchemaExercise('')] }
          : d
      )
    );
  }, []);

  const updateExerciseInDay = useCallback(
    (dayIndex: number, exIndex: number, upd: Partial<SchemaExercise>) => {
      setDays((prev) =>
        prev.map((d, i) =>
          i === dayIndex
            ? {
                ...d,
                exercises: d.exercises.map((ex, j) =>
                  j === exIndex ? { ...ex, ...upd } : ex
                ),
              }
            : d
        )
      );
    },
    []
  );

  const removeExerciseFromDay = useCallback((dayIndex: number, exIndex: number) => {
    setDays((prev) =>
      prev.map((d, i) =>
        i === dayIndex
          ? { ...d, exercises: d.exercises.filter((_, j) => j !== exIndex) }
          : d
      )
    );
  }, []);

  useEffect(() => {
    const saveEl = saveButtonRef.current;
    if (saveEl) {
      const h = () => handleSave();
      saveEl.addEventListener('click', h);
      return () => saveEl.removeEventListener('click', h);
    }
  }, [handleSave]);

  useEffect(() => {
    const el = cancelButtonRef.current;
    if (!el) return;
    const h = () => onCancel();
    el.addEventListener('click', h);
    return () => el.removeEventListener('click', h);
  }, [onCancel]);

  const nmtPreset =
    schema.isFormule7Template && formule7?.neuromuscular?.goal
      ? NMT_PRESETS_BY_GOAL[formule7.neuromuscular.goal as Formule7StrengthGoal]
      : null;
  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

  /** Eén trainingsdagkaart (label + oefeningen). Gebruikt in schemaDaysBlock en in Formule7 routekaart sectie 3. */
  const renderDayCard = (dayIndex: number) => {
    const day = days[dayIndex];
    if (!day) return null;
    return (
      <Card
        sx={{
          backgroundColor: 'transparent',
          borderRadius: `${designTokens.cardRadius}px`,
          border: `1px solid ${designTokens.cardBorder}`,
          boxShadow: 'none',
          mb: 2,
          minWidth: 0,
          overflow: 'hidden',
        }}
      >
        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 }, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <TextField
              label="Dag (bijv. Maandag of Dag A)"
              value={day.dayLabel}
              onChange={(e) => updateDay(dayIndex, { dayLabel: e.target.value })}
              size="small"
              fullWidth
              sx={{ minWidth: 0, flex: 1 }}
            />
            {!schema.isFormule7Template && (
              <IconButton
                size="small"
                onClick={() => removeDay(dayIndex)}
                disabled={days.length <= 1}
                aria-label="Dag verwijderen"
                color="error"
              >
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            )}
          </Box>
            {day.exercises.map((ex, exIndex) => (
              <Box
                key={exIndex}
                sx={{
                  p: 1.5,
                  mb: 1,
                  borderRadius: 1,
                  backgroundColor: 'rgba(0,0,0,0.03)',
                  border: '1px solid rgba(0,0,0,0.06)',
                  minWidth: 0,
                  width: '100%',
                }}
              >
                {filtersRow}
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1.5, minWidth: 0, width: '100%' }}>
                  <Autocomplete
                    freeSolo
                    options={exerciseOptions}
                    value={ex.exerciseName}
                    onChange={(_, v) => {
                      const n = typeof v === 'string' ? v : v ?? '';
                      if (n === '') {
                        removeExerciseFromDay(dayIndex, exIndex);
                      } else {
                        updateExerciseInDay(dayIndex, exIndex, {
                          exerciseId: n,
                          exerciseName: n,
                        });
                      }
                    }}
                    onInputChange={(_, v) =>
                      updateExerciseInDay(dayIndex, exIndex, {
                        exerciseId: v,
                        exerciseName: v,
                      })
                    }
                    renderInput={(params) => (
                      <TextField {...params} label="Oefening" size="small" fullWidth />
                    )}
                    sx={{ flex: 1, minWidth: 0 }}
                  />
                </Box>
                <Box sx={{ ...EXERCISE_PARAMS_ROW, mt: 0.5 }}>
                  {nmtPreset && (
                    <TextField
                      label="% 1RM"
                      type="number"
                      value={ex.intensityPercent1RM ?? ''}
                      placeholder={String(nmtPreset.percent1RM)}
                      onChange={(e) => {
                        const raw = e.target.value === '' ? undefined : parseInt(e.target.value, 10);
                        const val =
                          raw == null
                            ? undefined
                            : clamp(raw, nmtPreset.percent1RMMin, nmtPreset.percent1RMMax);
                        const targetWeight =
                          ex.estimated1RMKg != null && val != null
                            ? Math.round((ex.estimated1RMKg * val) / 100 * 10) / 10
                            : undefined;
                        updateExerciseInDay(dayIndex, exIndex, {
                          intensityPercent1RM: val,
                          ...(targetWeight !== undefined && { targetWeight }),
                        });
                      }}
                      size="small"
                      fullWidth
                      InputProps={{
                        endAdornment: (
                          <Tooltip
                            title={
                              <>
                                1RM = het zwaarste gewicht (kg) waarmee je precies 1 herhaling kunt doen. Dit percentage bepaalt hoe zwaar je traint.
                                <br />
                                <br />
                                Standaard {nmtPreset.percent1RM}%. Toegestaan: {nmtPreset.percent1RMMin}–{nmtPreset.percent1RMMax}%.
                              </>
                            }
                            placement="top"
                            arrow
                          >
                            <span style={{ display: 'inline-flex', cursor: 'help' }}>
                              <InfoOutlinedIcon sx={{ fontSize: 16, opacity: 0.6 }} />
                            </span>
                          </Tooltip>
                        ),
                      }}
                      inputProps={{
                        min: nmtPreset.percent1RMMin,
                        max: nmtPreset.percent1RMMax,
                      }}
                    />
                  )}
                  <TextField
                    label="Sets"
                    type="number"
                    value={ex.setsTarget}
                    onChange={(e) => {
                      const raw = parseInt(e.target.value, 10) || 0;
                      const val = nmtPreset ? clamp(raw, nmtPreset.setsMin, nmtPreset.setsMax) : raw;
                      updateExerciseInDay(dayIndex, exIndex, { setsTarget: val });
                    }}
                    size="small"
                    fullWidth
                    InputProps={
                      nmtPreset
                        ? {
                            endAdornment: (
                              <Tooltip
                                title={`Standaard ${nmtPreset.sets}. Toegestaan: ${nmtPreset.setsMin}–${nmtPreset.setsMax}`}
                                placement="top"
                                arrow
                              >
                                <span style={{ display: 'inline-flex', cursor: 'help' }}>
                                  <InfoOutlinedIcon sx={{ fontSize: 16, opacity: 0.6 }} />
                                </span>
                              </Tooltip>
                            ),
                          }
                        : undefined
                    }
                    inputProps={
                      nmtPreset ? { min: nmtPreset.setsMin, max: nmtPreset.setsMax } : { min: 1 }
                    }
                  />
                  <TextField
                    label="Reps"
                    type="number"
                    value={ex.repsTarget}
                    onChange={(e) => {
                      const raw = parseInt(e.target.value, 10) || 0;
                      const val = nmtPreset ? clamp(raw, nmtPreset.repsMin, nmtPreset.repsMax) : raw;
                      updateExerciseInDay(dayIndex, exIndex, { repsTarget: val });
                    }}
                    size="small"
                    fullWidth
                    InputProps={
                      nmtPreset
                        ? {
                            endAdornment: (
                              <Tooltip
                                title={`Standaard ${nmtPreset.reps}. Toegestaan: ${nmtPreset.repsMin}–${nmtPreset.repsMax}`}
                                placement="top"
                                arrow
                              >
                                <span style={{ display: 'inline-flex', cursor: 'help' }}>
                                  <InfoOutlinedIcon sx={{ fontSize: 16, opacity: 0.6 }} />
                                </span>
                              </Tooltip>
                            ),
                          }
                        : undefined
                    }
                    inputProps={
                      nmtPreset ? { min: nmtPreset.repsMin, max: nmtPreset.repsMax } : { min: 1 }
                    }
                  />
                  <TextField
                    label="Rust (sec)"
                    type="number"
                    value={ex.restSeconds ?? ''}
                    onChange={(e) => {
                      const raw = e.target.value === '' ? undefined : parseInt(e.target.value, 10) || 0;
                      const val =
                        raw == null
                          ? undefined
                          : nmtPreset
                            ? clamp(raw, nmtPreset.restSecMin, nmtPreset.restSecMax)
                            : raw;
                      updateExerciseInDay(dayIndex, exIndex, { restSeconds: val });
                    }}
                    size="small"
                    fullWidth
                    placeholder="60"
                    InputProps={
                      nmtPreset
                        ? {
                            endAdornment: (
                              <Tooltip
                                title={`Standaard ${nmtPreset.restSeconds}s. Toegestaan: ${nmtPreset.restSecMin}–${nmtPreset.restSecMax}s`}
                                placement="top"
                                arrow
                              >
                                <span style={{ display: 'inline-flex', cursor: 'help' }}>
                                  <InfoOutlinedIcon sx={{ fontSize: 16, opacity: 0.6 }} />
                                </span>
                              </Tooltip>
                            ),
                          }
                        : undefined
                    }
                    inputProps={
                      nmtPreset
                        ? { min: nmtPreset.restSecMin, max: nmtPreset.restSecMax }
                        : { min: 0 }
                    }
                  />
                </Box>
                {nmtPreset && (
                  <Box
                    sx={{
                      display: 'grid',
                      gap: 1.5,
                      minWidth: 0,
                      width: '100%',
                      mt: 2,
                      gridTemplateColumns: '1fr 1fr',
                      '@media (max-width: 400px)': { gridTemplateColumns: '1fr' },
                    }}
                  >
                    <TextField
                      label="Mijn max (kg)"
                      type="number"
                      value={ex.estimated1RMKg ?? ''}
                      onChange={(e) => {
                        const raw = e.target.value === '' ? undefined : parseFloat(e.target.value);
                        const val = raw != null && raw > 0 ? raw : undefined;
                        const targetWeight =
                          val != null && ex.intensityPercent1RM != null
                            ? Math.round((val * ex.intensityPercent1RM) / 100 * 10) / 10
                            : undefined;
                        updateExerciseInDay(dayIndex, exIndex, {
                          estimated1RMKg: val,
                          ...(targetWeight !== undefined && { targetWeight }),
                        });
                      }}
                      size="small"
                      fullWidth
                      placeholder="Vul je max in"
                      InputLabelProps={{ shrink: true }}
                      inputProps={{ min: 0, step: 0.5 }}
                      sx={{ minWidth: 0 }}
                    />
                    <TextField
                      label="Doelgewicht (kg)"
                      type="number"
                      value={ex.targetWeight ?? ''}
                      onChange={(e) =>
                        updateExerciseInDay(dayIndex, exIndex, {
                          targetWeight: e.target.value === '' ? undefined : parseFloat(e.target.value) || undefined,
                        })
                      }
                      size="small"
                      fullWidth
                      placeholder={ex.estimated1RMKg != null ? 'Berekend' : 'Vul eerst je max in'}
                      InputLabelProps={{ shrink: true }}
                      inputProps={{ min: 0, step: 0.5 }}
                      sx={{ minWidth: 0 }}
                    />
                  </Box>
                )}
              </Box>
            ))}
            <Box
              sx={{ mt: 1, cursor: 'pointer', display: 'inline-block' }}
              onClick={() => addExerciseToDay(dayIndex)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && addExerciseToDay(dayIndex)}
            >
              {/* @ts-ignore */}
              <md-text-button>
                <md-icon slot="start">add</md-icon>
                Oefening toevoegen
              </md-text-button>
            </Box>
          </CardContent>
        </Card>
    );
  };

  /** Beide filters naast elkaar, direct boven Oefening in elke dagkaart. */
  const filtersRow = (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 1.5 }}>
      <FormControl size="small" sx={{ minWidth: 180, flex: '1 1 160px' }}>
        <InputLabel id="equipment-filter-label">Oefeningen tonen</InputLabel>
        <Select
          labelId="equipment-filter-label"
          value={equipmentFilter}
          label="Oefeningen tonen"
          onChange={(e) => setEquipmentFilter(e.target.value as ExerciseEquipment | 'all')}
        >
          {EQUIPMENT_FILTER_OPTIONS.map((opt) => (
            <MenuItem key={opt.value} value={opt.value}>
              {opt.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <FormControl size="small" sx={{ minWidth: 180, flex: '1 1 160px' }}>
        <InputLabel id="muscle-group-filter-label" shrink>
          Filter op spiergroep
        </InputLabel>
        <Select
          labelId="muscle-group-filter-label"
          value={selectedMuscleGroup ?? ''}
          label="Filter op spiergroep"
          onChange={(e) =>
            setSelectedMuscleGroup(e.target.value === '' ? null : (e.target.value as string))
          }
          displayEmpty
        >
          <MenuItem value="">
            <em>Geen filter</em>
          </MenuItem>
          {MUSCLE_GROUP_OPTIONS.map((muscle) => (
            <MenuItem key={muscle} value={muscle}>
              {muscle}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    </Box>
  );

  const schemaDaysBlock = (
    <>
      {days.map((_, dayIndex) => (
        <Box key={dayIndex}>{renderDayCard(dayIndex)}</Box>
      ))}
      {!schema.isFormule7Template && (
        <Box
          sx={{ mt: 2, mb: 3, cursor: 'pointer', display: 'inline-block' }}
          onClick={addDay}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && addDay()}
        >
          {/* @ts-ignore */}
          <md-text-button>
            <md-icon slot="start">add</md-icon>
            Dag toevoegen
          </md-text-button>
        </Box>
      )}
    </>
  );

  return (
    <PageLayout>
      <ContentCard>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
            <IconButton size="small" onClick={onCancel} sx={{ p: 0.5 }} aria-label="Terug">
              <ArrowBackIosNewIcon fontSize="small" />
            </IconButton>
            <Typography variant="h5" sx={{ fontWeight: 600 }}>
              Workout bewerken
            </Typography>
          </Box>

          <TextField
            label="Naam workout"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            sx={{ mb: 2 }}
            placeholder="Bijv. Push Pull Legs"
          />

          {sporters.length > 0 ? (
            <Autocomplete
              options={sporters}
              value={sporters.find((s) => s.userId === clientId) ?? null}
              onChange={(_, profile) => setClientId(profile?.userId ?? null)}
              getOptionLabel={(p) => p.displayName || p.email || p.userId}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Toewijzen aan sporter"
                  size="small"
                  placeholder="Niet toegewezen"
                />
              )}
              sx={{ mb: 2 }}
            />
          ) : null}

          {schema.isFormule7Template && formule7 && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                Formule 7-routekaart
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Vul de routekaart in volgens de volgorde van je opleiding. Elke sectie heeft korte uitleg.
              </Typography>
              <Formule7RoutekaartForm
                formule7={formule7}
                setFormule7={setFormule7}
                days={days}
                updateDay={updateDay}
                startDate={startDate}
                durationWeeks={durationWeeks}
                onStartDateChange={setStartDate}
                onDurationWeeksChange={setDurationWeeks}
                schemaExerciseNames={days.flatMap((d) => d.exercises).map((e) => e.exerciseName).filter(Boolean)}
                exerciseOptions={exerciseOptions}
                sporters={sporters}
                selectedClientId={clientId}
                onClientIdChange={setClientId}
                childrenAfterNeuromuscular={(dayIndex) => renderDayCard(dayIndex)}
              />
            </Box>
          )}

          {!schema.isFormule7Template && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 3 }}>
              <TextField
                label="Startdatum periode"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                size="small"
                InputLabelProps={{ shrink: true }}
                sx={{ minWidth: 180 }}
              />
              <Autocomplete
                options={DURATION_WEEKS_OPTIONS}
                value={durationWeeks}
                onChange={(_, v) => v != null && setDurationWeeks(v)}
                getOptionLabel={(v) => `${v} weken`}
                renderInput={(params) => (
                  <TextField {...params} label="Duur (weken)" size="small" sx={{ minWidth: 140 }} />
                )}
              />
            </Box>
          )}

          {!schema.isFormule7Template && schemaDaysBlock}

          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
            {/* @ts-ignore */}
            <md-text-button ref={cancelButtonRef}>Annuleren</md-text-button>
            {/* @ts-ignore */}
            <md-filled-button ref={saveButtonRef}>
              <md-icon slot="start">save</md-icon>
              Opslaan
            </md-filled-button>
          </Box>
      </ContentCard>
    </PageLayout>
  );
};
