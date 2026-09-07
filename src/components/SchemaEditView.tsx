import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Typography,
  Box,
  IconButton,
  Alert,
  TextField,
  Autocomplete,
  MenuItem,
} from '@mui/material';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import { Schema, SchemaDay, SchemaExercise, Formule7Routekaart } from '../types';
import type { Profile, SchemaAudience } from '../types';
import { useProfile } from '../context/ProfileContext';
import { createEmptyFormule7, NMT_PRESETS_BY_GOAL } from '../utils/formule7Defaults';
import type { Formule7StrengthGoal } from '../types';
import { Formule7RoutekaartForm } from './Formule7RoutekaartForm';
import { useExerciseDbSearch, type ExerciseDbEquipmentFilter } from '../hooks/useExerciseDbSearch';
import { addWeeks } from '../utils/format';
import { PageLayout, ContentCard } from './layout';
import {
  defaultSchemaExercise,
  getDayCountFromSessions,
  createExercisesFromPreset,
  getDurationWeeksFromSchema,
  type DurationWeeks,
} from '../utils/formule7AiPostProcess';
import { DayCard } from './schemaEdit/DayCard';
import { AiFormule7Wizard, AiGenerationPanel } from './schemaEdit/AiPanels';
import { useAiSchemaGeneration, type AiGeneratedResult } from './schemaEdit/useAiSchemaGeneration';
import '@material/web/button/filled-button.js';
import '@material/web/button/text-button.js';
import '@material/web/icon/icon.js';

export type { DurationWeeks } from '../utils/formule7AiPostProcess';

interface SchemaEditViewProps {
  schema: Schema;
  onSave: (schema: Schema) => Promise<void> | void;
  onCancel: () => void;
  /** Lijst sporters (alleen voor trainers) om workout aan toe te wijzen. */
  sporters?: Profile[];
  /** Bestaande categorieën (voor suggesties in het categorie-veld). */
  categories?: string[];
}

const DURATION_WEEKS_OPTIONS = [4, 5, 6, 7, 8, 12, 26];

export const SchemaEditView = ({ schema, onSave, onCancel, sporters = [], categories = [] }: SchemaEditViewProps) => {
  const me = useProfile()?.profile ?? null;
  // Trainer kan ook aan zichzelf toewijzen
  const assignOptions = me ? [me, ...sporters.filter((s) => s.userId !== me.userId)] : sporters;
  const optionLabel = (p: Profile) => (me && p.userId === me.userId ? `Mijzelf (${p.displayName || p.email || ''})` : p.displayName || p.email || p.userId);
  const [name, setName] = useState(schema.name);
  const [clientId, setClientId] = useState<string | null>(schema.clientId ?? null);
  const [audience, setAudience] = useState<SchemaAudience>(schema.audience ?? 'single');
  const [category, setCategory] = useState<string>(schema.category ?? '');
  const [participantIds, setParticipantIds] = useState<string[]>(schema.participantIds ?? []);
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
  const [equipmentFilter, setEquipmentFilter] = useState<ExerciseDbEquipmentFilter>('all');
  const [selectedMuscleGroup, setSelectedMuscleGroup] = useState<string | null>(null);
  const [exerciseSearchTerm, setExerciseSearchTerm] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const exerciseOptions = useExerciseDbSearch(
    exerciseSearchTerm,
    10000,
    equipmentFilter,
    selectedMuscleGroup
  );
  const saveButtonRef = useRef<HTMLElement | null>(null);
  const cancelButtonRef = useRef<HTMLElement | null>(null);

  // AI-resultaat in de editor-state zetten (state blijft hier eigenaar)
  const applyAiGenerated = useCallback((result: AiGeneratedResult) => {
    setName(result.name);
    if (result.formule7) setFormule7(result.formule7);
    setDays(result.days);
    if (result.periodStartDate) setStartDate(result.periodStartDate);
  }, []);
  const ai = useAiSchemaGeneration({ schema, onApplyGenerated: applyAiGenerated });
  const { aiEditorUnlocked } = ai;

  // Sync naam, clientId en datums wanneer schema wijzigt
  useEffect(() => {
    setName(schema.name);
    setClientId(schema.clientId ?? null);
    setAudience(schema.audience ?? 'single');
    setCategory(schema.category ?? '');
    setParticipantIds(schema.participantIds ?? []);
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

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaveError(null);
    setSaving(true);
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
        if (d.notes && d.notes.trim()) cleaned.notes = d.notes.trim();
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
      clientId: audience === 'single' ? clientId || null : null,
      audience,
      participantIds: audience === 'multiple' || audience === 'group' ? participantIds : [],
      category: category.trim() || null,
      startDate: start,
      endDate: endDateValue,
      days: cleanedDays,
      formule7: formule7 ?? null,
    };
    try {
      await Promise.resolve(onSave(updated));
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : typeof e === 'string'
            ? e
            : 'Opslaan mislukt. Controleer internet/Firestore en probeer opnieuw.';
      setSaveError(msg.slice(0, 300));
    } finally {
      setSaving(false);
    }
  }, [saving, schema, name, clientId, audience, category, participantIds, startDate, durationWeeks, days, formule7, onSave]);

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
      const h = () => {
        void handleSave();
      };
      saveEl.addEventListener('click', h);
      return () => saveEl.removeEventListener('click', h);
    }
  }, [handleSave]);

  useEffect(() => {
    const saveEl = saveButtonRef.current as any;
    if (!saveEl) return;
    if (saving) saveEl.setAttribute?.('disabled', '');
    else saveEl.removeAttribute?.('disabled');
  }, [saving]);

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

  /** Eén trainingsdagkaart (label + oefeningen). Gebruikt in schemaDaysBlock en in Formule7 routekaart sectie 3. */
  const renderDayCard = (dayIndex: number) => {
    const day = days[dayIndex];
    if (!day) return null;
    return (
      <DayCard
        day={day}
        dayIndex={dayIndex}
        isFormule7Template={Boolean(schema.isFormule7Template)}
        removeDayDisabled={days.length <= 1}
        nmtPreset={nmtPreset}
        exerciseOptions={exerciseOptions}
        equipmentFilter={equipmentFilter}
        onEquipmentFilterChange={setEquipmentFilter}
        selectedMuscleGroup={selectedMuscleGroup}
        onMuscleGroupChange={setSelectedMuscleGroup}
        onExerciseSearchTermChange={setExerciseSearchTerm}
        updateDay={updateDay}
        removeDay={removeDay}
        addExerciseToDay={addExerciseToDay}
        updateExerciseInDay={updateExerciseInDay}
        removeExerciseFromDay={removeExerciseFromDay}
      />
    );
  };

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

  const hideAiCompletely =
    schema.isFormule7Template && schema.formule7AssistMode === 'manual';

  const showFormule7AiWizard =
    schema.isFormule7Template &&
    schema.formule7AssistMode === 'ai' &&
    !aiEditorUnlocked;

  const showAiGenerationPanel =
    !hideAiCompletely &&
    !showFormule7AiWizard &&
    (!schema.isFormule7Template ||
      schema.formule7AssistMode === undefined ||
      schema.formule7AssistMode === 'ai');

  const showFormule7RoutekaartBlock =
    schema.isFormule7Template && Boolean(formule7) && !showFormule7AiWizard;

  return (
    <PageLayout>
      <ContentCard>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
            <IconButton size="small" onClick={onCancel} sx={{ p: 0.5 }} aria-label="Terug">
              <ArrowBackIosNewIcon fontSize="small" />
            </IconButton>
            <Typography variant="h5" sx={{ fontWeight: 600 }}>
              {showFormule7AiWizard ? 'Workout met AI (Formule 7)' : 'Workout bewerken'}
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

          <Autocomplete
            freeSolo
            options={categories}
            value={category}
            onChange={(_, v) => setCategory(typeof v === 'string' ? v : v ?? '')}
            onInputChange={(_, v) => setCategory(v)}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Categorie (tab in Workouts)"
                size="small"
                placeholder="Bijv. Groepslessen; leeg = gewone workout"
              />
            )}
            sx={{ mb: 2 }}
          />

          {showFormule7AiWizard && <AiFormule7Wizard ai={ai} />}

          {showAiGenerationPanel && (
            <AiGenerationPanel ai={ai} isFormule7Template={Boolean(schema.isFormule7Template)} />
          )}

          {sporters.length > 0 && !showFormule7AiWizard ? (
            <Box sx={{ mb: 2 }}>
              <TextField
                select
                fullWidth
                size="small"
                label="Voor wie is deze workout?"
                value={audience}
                onChange={(e) => setAudience(e.target.value as SchemaAudience)}
                sx={{ mb: audience === 'open' ? 0 : 2 }}
              >
                <MenuItem value="single">Eén klant</MenuItem>
                <MenuItem value="multiple">Meerdere klanten</MenuItem>
                <MenuItem value="open">Open voor iedereen</MenuItem>
                <MenuItem value="group">Groepsles</MenuItem>
              </TextField>

              {audience === 'single' && (
                <Autocomplete
                  options={assignOptions}
                  value={assignOptions.find((s) => s.userId === clientId) ?? null}
                  onChange={(_, profile) => setClientId(profile?.userId ?? null)}
                  getOptionLabel={optionLabel}
                  isOptionEqualToValue={(a, b) => a.userId === b.userId}
                  renderInput={(params) => (
                    <TextField {...params} label="Toewijzen aan klant" size="small" placeholder="Niet toegewezen" />
                  )}
                />
              )}

              {(audience === 'multiple' || audience === 'group') && (
                <Autocomplete
                  multiple
                  options={assignOptions}
                  value={assignOptions.filter((s) => participantIds.includes(s.userId))}
                  onChange={(_, profiles) => setParticipantIds(profiles.map((p) => p.userId))}
                  getOptionLabel={optionLabel}
                  isOptionEqualToValue={(a, b) => a.userId === b.userId}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label={audience === 'group' ? 'Deelnemers groepsles' : 'Toegewezen klanten'}
                      size="small"
                      placeholder="Kies accounts"
                    />
                  )}
                />
              )}

              {audience === 'open' && (
                <Typography variant="caption" color="text.secondary">
                  Deze workout is beschikbaar voor iedereen.
                </Typography>
              )}
            </Box>
          ) : null}

          {showFormule7RoutekaartBlock && formule7 && (
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
                options={
                  DURATION_WEEKS_OPTIONS.includes(durationWeeks)
                    ? DURATION_WEEKS_OPTIONS
                    : [...DURATION_WEEKS_OPTIONS, durationWeeks].sort((a, b) => a - b)
                }
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

          {saveError ? (
            <Alert severity="error" sx={{ mt: 2 }}>
              {saveError}
            </Alert>
          ) : null}

          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', mt: 2 }}>
            {/* @ts-ignore */}
            <md-text-button ref={cancelButtonRef}>Annuleren</md-text-button>
            {/* @ts-ignore */}
            <md-filled-button ref={saveButtonRef}>
              <md-icon slot="start">{saving ? 'sync' : 'save'}</md-icon>
              {saving ? 'Opslaan…' : 'Opslaan'}
            </md-filled-button>
          </Box>
      </ContentCard>
    </PageLayout>
  );
};
