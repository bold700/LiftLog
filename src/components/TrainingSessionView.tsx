import { useState, useEffect, useCallback } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  IconButton,
  Snackbar,
  Button,
} from '@mui/material';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { Schema, SchemaExercise } from '../types';
import { Exercise } from '../types';
import { deleteExercise } from '../utils/storage';
import { getLoggedExercisesForSchemaDayInLast12Hours } from '../utils/schemaSessionUtils';
import {
  isDayMarkedCompleteInLast12Hours,
  markDayComplete,
  clearDayComplete,
} from '../utils/dayCompletionStorage';
import {
  formatWarmupSummary,
  formatCardioSummary,
  formatCooldownSummary,
  formatStretchingSummary,
} from '../utils/format';
import { useAddFromSchema } from '../context/AddFromSchemaContext';
import { designTokens } from '../theme/designTokens';
import { PageLayout, ContentCard } from './layout';
import '@material/web/button/filled-button.js';
import '@material/web/icon/icon.js';

interface TrainingSessionViewProps {
  schema: Schema;
  dayIndex: number;
  onBack: () => void;
  onNextDay: () => void;
  justLoggedExerciseId: string | null;
  onClearJustLogged: () => void;
}

/** Eerste log van vandaag voor deze oefeningnaam (schema-dag); voor klik "Gelogd" */
function findLogIdForExercise(
  logged: Exercise[],
  exerciseName: string
): string | null {
  const nameLower = exerciseName.toLowerCase();
  const found = logged.find((ex) => ex.name?.toLowerCase() === nameLower);
  return found?.id ?? null;
}

export const TrainingSessionView = ({
  schema,
  dayIndex,
  onBack,
  onNextDay,
  justLoggedExerciseId,
  onClearJustLogged,
}: TrainingSessionViewProps) => {
  const addFromSchema = useAddFromSchema();
  const day = schema.days[dayIndex];
  const [loggedExercises, setLoggedExercises] = useState<Exercise[]>(() =>
    getLoggedExercisesForSchemaDayInLast12Hours(schema.id, dayIndex)
  );
  const [snackbarOpen, setSnackbarOpen] = useState(false);

  const refreshLogged = useCallback(() => {
    setLoggedExercises(getLoggedExercisesForSchemaDayInLast12Hours(schema.id, dayIndex));
  }, [schema.id, dayIndex]);

  useEffect(() => {
    const handler = () => refreshLogged();
    window.addEventListener('workoutUpdated', handler);
    return () => window.removeEventListener('workoutUpdated', handler);
  }, [refreshLogged]);

  const [dayMarkedComplete, setDayMarkedComplete] = useState(() =>
    isDayMarkedCompleteInLast12Hours(schema.id, dayIndex)
  );
  useEffect(() => {
    const handler = () => setDayMarkedComplete(isDayMarkedCompleteInLast12Hours(schema.id, dayIndex));
    window.addEventListener('dayCompletionUpdated', handler);
    return () => window.removeEventListener('dayCompletionUpdated', handler);
  }, [schema.id, dayIndex]);

  useEffect(() => {
    if (justLoggedExerciseId) {
      setSnackbarOpen(true);
    }
  }, [justLoggedExerciseId]);

  const handleUndo = useCallback(() => {
    if (justLoggedExerciseId) {
      deleteExercise(justLoggedExerciseId);
      onClearJustLogged();
      setSnackbarOpen(false);
      refreshLogged();
    }
  }, [justLoggedExerciseId, onClearJustLogged, refreshLogged]);

  const handleSnackbarClose = useCallback(() => {
    setSnackbarOpen(false);
    onClearJustLogged();
  }, [onClearJustLogged]);

  const handleLogToevoegen = useCallback(
    (ex: SchemaExercise) => {
      if (!addFromSchema) return;
      addFromSchema.setAddFromSchema(
        {
          exerciseName: ex.exerciseName,
          sets: ex.setsTarget,
          reps: ex.repsTarget,
          targetWeight: ex.targetWeight ?? null,
        },
        schema.id,
        dayIndex
      );
    },
    [addFromSchema, schema.id, dayIndex]
  );

  const handleGelogdClick = useCallback(
    (logId: string) => {
      addFromSchema?.goToLog(logId);
    },
    [addFromSchema]
  );

  if (!day) {
    return null;
  }

  const allExercisesLogged =
    day.exercises.length > 0 &&
    day.exercises.every((ex) => findLogIdForExercise(loggedExercises, ex.exerciseName));
  const isDayComplete = dayMarkedComplete || allExercisesLogged;
  const hasMultipleDays = schema.days.length > 1;

  return (
    <PageLayout>
      <ContentCard>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 3, flexWrap: 'wrap' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
              <IconButton size="small" onClick={onBack} sx={{ p: 0.5 }} aria-label="Terug">
                <ArrowBackIosNewIcon fontSize="small" />
              </IconButton>
              <Typography variant="h5" sx={{ fontWeight: 600 }}>
                {schema.name} – {day.dayLabel}
              </Typography>
            </Box>
            {isDayComplete && (
              <Button
                variant="contained"
                endIcon={<ArrowForwardIosIcon sx={{ fontSize: 16 }} />}
                onClick={hasMultipleDays ? onNextDay : onBack}
                aria-label={hasMultipleDays ? 'Volgende dag' : 'Terug naar workout'}
                sx={{
                  bgcolor: '#000000',
                  color: '#F2E4D3',
                  borderRadius: '20px',
                  px: 2,
                  py: 1.25,
                  textTransform: 'none',
                  fontWeight: 500,
                  flexShrink: 0,
                  '&:hover': { bgcolor: '#1a1a1a' },
                }}
              >
                {hasMultipleDays
                  ? `Volgende dag: ${schema.days[(dayIndex + 1) % schema.days.length].dayLabel}`
                  : 'Terug naar workout'}
              </Button>
            )}
          </Box>

          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            <strong>Training afronden:</strong> log per oefening via &quot;Log toevoegen&quot;, of rond de hele training af met &quot;Training afronden&quot; hieronder.
          </Typography>

          {!isDayComplete && (
            <Button
              variant="outlined"
              color="inherit"
              onClick={() => {
                markDayComplete(schema.id, dayIndex);
                setDayMarkedComplete(true);
              }}
              aria-label="Training in één keer als voltooid markeren"
              sx={{
                mb: 2,
                borderRadius: '20px',
                textTransform: 'none',
                fontWeight: 500,
              }}
            >
              Training afronden
            </Button>
          )}

          {isDayComplete && (
            <Box
              sx={{
                py: 1.5,
                px: 2,
                mb: 2,
                borderRadius: 2,
                bgcolor: 'success.light',
                color: 'success.dark',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 2,
              }}
            >
              <Typography variant="body2" fontWeight={500}>
                {dayMarkedComplete && !allExercisesLogged
                  ? 'Training voltooid (in één keer gemarkeerd).'
                  : 'Dag voltooid – alle oefeningen zijn gelogd. &quot;Gelogd&quot; verdwijnt na 12 uur; klik erop om de log te bekijken of bewerken.'}
              </Typography>
              {dayMarkedComplete && !allExercisesLogged && (
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => {
                    clearDayComplete(schema.id, dayIndex);
                    setDayMarkedComplete(false);
                  }}
                  sx={{
                    whiteSpace: 'nowrap',
                    borderRadius: '20px',
                    textTransform: 'none',
                    fontWeight: 500,
                  }}
                >
                  Reset markering
                </Button>
              )}
            </Box>
          )}

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {formatWarmupSummary(day.warmup ?? schema.formule7?.warmup) && (
              <Card
                sx={{
                  backgroundColor: 'transparent',
                  borderRadius: `${designTokens.cardRadius}px`,
                  border: `1px solid ${designTokens.cardBorder}`,
                  boxShadow: 'none',
                }}
              >
                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>
                    Warming-up
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {formatWarmupSummary(day.warmup ?? schema.formule7?.warmup)}
                  </Typography>
                </CardContent>
              </Card>
            )}
            {formatCardioSummary(day.cardio ?? schema.formule7?.cardio) && (
              <Card
                sx={{
                  backgroundColor: 'transparent',
                  borderRadius: `${designTokens.cardRadius}px`,
                  border: `1px solid ${designTokens.cardBorder}`,
                  boxShadow: 'none',
                }}
              >
                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>
                    Cardio
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {formatCardioSummary(day.cardio ?? schema.formule7?.cardio)}
                  </Typography>
                </CardContent>
              </Card>
            )}
            {day.exercises.map((ex, exIndex) => {
              const logId = findLogIdForExercise(loggedExercises, ex.exerciseName);
              const isLogged = logId !== null;
              return (
                <Card
                  key={exIndex}
                  sx={{
                    backgroundColor: 'transparent',
                    borderRadius: `${designTokens.cardRadius}px`,
                    border: `1px solid ${designTokens.cardBorder}`,
                    boxShadow: 'none',
                  }}
                >
                  <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: 2,
                        flexWrap: 'wrap',
                        flexDirection: { xs: 'column', sm: 'row' },
                      }}
                    >
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                          <Typography variant="subtitle1" fontWeight={600}>
                            {ex.exerciseName}
                          </Typography>
                          {isLogged && (
                            <Box
                              component="button"
                              onClick={() => logId && handleGelogdClick(logId)}
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 0.5,
                                color: 'success.main',
                                cursor: 'pointer',
                                border: 'none',
                                background: 'none',
                                padding: 0,
                                font: 'inherit',
                                '&:hover': { textDecoration: 'underline' },
                              }}
                              aria-label="Gelogd – klik om naar log te gaan"
                            >
                              <CheckCircleOutlineIcon fontSize="small" />
                              <Typography variant="caption" color="success.main" component="span">
                                Gelogd
                              </Typography>
                            </Box>
                          )}
                        </Box>
                        <Typography variant="caption" color="text.secondary">
                          Voorgeschreven: {ex.setsTarget} × {ex.repsTarget} reps
                          {ex.restSeconds != null && ex.restSeconds > 0 && ` · ${ex.restSeconds}s rust`}
                        </Typography>
                        {ex.notes && (
                          <Typography variant="caption" color="text.secondary" display="block" fontStyle="italic" sx={{ mt: 0.5 }}>
                            {ex.notes}
                          </Typography>
                        )}
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                        <Box
                          sx={{ cursor: 'pointer', display: 'inline-block' }}
                          onClick={() => handleLogToevoegen(ex)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => e.key === 'Enter' && handleLogToevoegen(ex)}
                        >
                          {/* @ts-ignore */}
                          <md-filled-button>
                            <md-icon slot="start">add</md-icon>
                            Log toevoegen
                          </md-filled-button>
                        </Box>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              );
            })}
            {formatCooldownSummary(day.cooldown ?? schema.formule7?.cooldown) && (
              <Card
                sx={{
                  backgroundColor: 'transparent',
                  borderRadius: `${designTokens.cardRadius}px`,
                  border: `1px solid ${designTokens.cardBorder}`,
                  boxShadow: 'none',
                }}
              >
                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>
                    Cooling-down
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {formatCooldownSummary(day.cooldown ?? schema.formule7?.cooldown)}
                  </Typography>
                </CardContent>
              </Card>
            )}
            {formatStretchingSummary(day.stretching ?? schema.formule7?.stretching) && (
              <Card
                sx={{
                  backgroundColor: 'transparent',
                  borderRadius: `${designTokens.cardRadius}px`,
                  border: `1px solid ${designTokens.cardBorder}`,
                  boxShadow: 'none',
                }}
              >
                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>
                    Stretching
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {formatStretchingSummary(day.stretching ?? schema.formule7?.stretching)}
                  </Typography>
                </CardContent>
              </Card>
            )}
          </Box>
      </ContentCard>

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={6000}
        onClose={handleSnackbarClose}
        message="Gelogd"
        action={
          <Button color="inherit" size="small" onClick={handleUndo}>
            Ongedaan maken
          </Button>
        }
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ mb: 8 }}
      />
    </PageLayout>
  );
};
