/**
 * Eén trainingsdagkaart in SchemaEditView: daglabel, notitie en per oefening de keuze
 * (ExercisePicker), sets/reps/rust, en bij Formule 7 ook %1RM, max en doelgewicht.
 * Gebruikt in het dagenblok en in Formule 7 routekaart sectie 3.
 */
import { Card, CardContent, Box, IconButton, TextField, Tooltip } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import type { SchemaDay, SchemaExercise, Formule7StrengthGoal } from '../../types';
import type { NMT_PRESETS_BY_GOAL } from '../../utils/formule7Defaults';
import type { ExerciseDbEquipmentFilter } from '../../hooks/useExerciseDbSearch';
import { designTokens } from '../../theme/designTokens';
import { ExercisePicker } from './ExercisePicker';
import '@material/web/button/text-button.js';
import '@material/web/icon/icon.js';

/** NMT-voorschrift (Tabel 4) voor het gekozen krachtdoel; null buiten Formule 7. */
export type NmtPreset = (typeof NMT_PRESETS_BY_GOAL)[Formule7StrengthGoal];

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

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export interface DayCardProps {
  day: SchemaDay;
  dayIndex: number;
  isFormule7Template: boolean;
  /** Knop "Dag verwijderen" uitschakelen (laatste dag). */
  removeDayDisabled: boolean;
  nmtPreset: NmtPreset | null;
  exerciseOptions: string[];
  equipmentFilter: ExerciseDbEquipmentFilter;
  onEquipmentFilterChange: (value: ExerciseDbEquipmentFilter) => void;
  selectedMuscleGroup: string | null;
  onMuscleGroupChange: (value: string | null) => void;
  onExerciseSearchTermChange: (term: string) => void;
  updateDay: (dayIndex: number, upd: Partial<SchemaDay>) => void;
  removeDay: (dayIndex: number) => void;
  addExerciseToDay: (dayIndex: number) => void;
  updateExerciseInDay: (dayIndex: number, exIndex: number, upd: Partial<SchemaExercise>) => void;
  removeExerciseFromDay: (dayIndex: number, exIndex: number) => void;
}

export function DayCard({
  day,
  dayIndex,
  isFormule7Template,
  removeDayDisabled,
  nmtPreset,
  exerciseOptions,
  equipmentFilter,
  onEquipmentFilterChange,
  selectedMuscleGroup,
  onMuscleGroupChange,
  onExerciseSearchTermChange,
  updateDay,
  removeDay,
  addExerciseToDay,
  updateExerciseInDay,
  removeExerciseFromDay,
}: DayCardProps) {
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
            {!isFormule7Template && (
              <IconButton
                size="small"
                onClick={() => removeDay(dayIndex)}
                disabled={removeDayDisabled}
                aria-label="Dag verwijderen"
                color="error"
              >
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            )}
          </Box>
          <TextField
            label="Notitie bij deze dag (bijv. 10x10x8, Tabata, AMRAP 17 min)"
            value={day.notes ?? ''}
            onChange={(e) => updateDay(dayIndex, { notes: e.target.value })}
            size="small"
            fullWidth
            sx={{ mb: 2 }}
          />
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
                <ExercisePicker
                  value={ex.exerciseName}
                  options={exerciseOptions}
                  equipmentFilter={equipmentFilter}
                  onEquipmentFilterChange={onEquipmentFilterChange}
                  selectedMuscleGroup={selectedMuscleGroup}
                  onMuscleGroupChange={onMuscleGroupChange}
                  onSearchTermChange={onExerciseSearchTermChange}
                  onSelect={(n) => {
                    if (n === '') {
                      removeExerciseFromDay(dayIndex, exIndex);
                    } else {
                      updateExerciseInDay(dayIndex, exIndex, {
                        exerciseId: n,
                        exerciseName: n,
                      });
                    }
                  }}
                  onInput={(v) =>
                    updateExerciseInDay(dayIndex, exIndex, {
                      exerciseId: v,
                      exerciseName: v,
                    })
                  }
                />
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
}
