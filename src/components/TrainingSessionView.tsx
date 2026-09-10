import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  IconButton,
  Snackbar,
  Button,
  TextField,
  MenuItem,
} from '@mui/material';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { Schema, SchemaExercise } from '../types';
import { Exercise } from '../types';
import { deleteExercise } from '../utils/storage';
import {
  getLoggedExercisesForSchemaDayInLast12Hours,
  loggedExercisesFromSporterLogs,
} from '../utils/schemaSessionUtils';
import { getLogsForUser, deleteExerciseLog } from '../services/logService';
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
import { useProfile } from '../context/ProfileContext';
import { useNotify } from '../context/NotifyContext';
import { saveCheckin } from '../services/checkinService';
import { CheckinDialog, type Feeling } from './CheckinDialog';
import { designTokens } from '../theme/designTokens';
import { PageLayout, ContentCard } from './layout';
import { AppleHealthWorkoutCard } from './AppleHealthWorkoutCard';
import { ExerciseDbDemo } from './ExerciseDbDemo';
import {
  healthSummaryKeyForSchema,
  getStoredHealthSummary,
  setStoredHealthSummary,
  clearStoredHealthSummary,
} from '../utils/healthWorkoutStorage';
import type { AppleHealthWorkoutSummary } from '../plugins/healthWorkout';
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
  const profileCtx = useProfile();
  const notify = useNotify();
  const isTrainer = profileCtx?.isTrainer ?? false;
  const sporters = useMemo(() => profileCtx?.allSporters ?? [], [profileCtx?.allSporters]);
  /** '' = de trainer logt voor zichzelf; anders het userId van de sporter. */
  const logTargetId = addFromSchema?.logTargetId ?? '';
  const setLogTargetId = addFromSchema?.setLogTargetId;
  const applyDefaultLogTarget = addFromSchema?.applyDefaultLogTarget;
  const logTarget = logTargetId ? sporters.find((sp) => sp.userId === logTargetId) ?? null : null;

  // Een workout die aan één sporter hangt, staat meteen op die sporter: dat is bijna altijd
  // voor wie de trainer de training start.
  const schemaClientId = schema.clientId;
  const schemaId = schema.id;
  useEffect(() => {
    if (!isTrainer || !applyDefaultLogTarget || !schemaClientId) return;
    if (!sporters.some((sp) => sp.userId === schemaClientId)) return;
    applyDefaultLogTarget(schemaId, schemaClientId);
  }, [isTrainer, applyDefaultLogTarget, schemaClientId, schemaId, sporters]);
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [checkinSaving, setCheckinSaving] = useState(false);
  const day = schema.days[dayIndex];

  const completeDay = useCallback(() => {
    markDayComplete(schema.id, dayIndex);
    setDayMarkedComplete(true);
    setCheckinOpen(false);
  }, [schema.id, dayIndex]);

  /** Check-in opslaan voor de trainer (alleen met account); daarna de dag afronden. */
  const handleCheckinSave = useCallback(
    async (feeling: Feeling, note: string) => {
      const me = profileCtx?.profile;
      if (!me) {
        completeDay();
        return;
      }
      setCheckinSaving(true);
      try {
        await saveCheckin({
          // Logt de trainer voor een sporter, dan is de check-in van die sporter.
          userId: logTarget?.userId ?? me.userId,
          loggedBy: me.userId,
          trainerId: logTarget ? logTarget.trainerId ?? me.userId : me.trainerId ?? schema.trainerId ?? null,
          schemaId: schema.id,
          schemaDayIndex: dayIndex,
          dayLabel: day?.dayLabel ?? null,
          feeling,
          note: note || null,
          date: new Date().toISOString(),
        });
      } catch (err) {
        notify.error('Check-in opslaan mislukt. De training is wel afgerond.', err);
      } finally {
        setCheckinSaving(false);
      }
      completeDay();
    },
    [profileCtx?.profile, logTarget, schema.id, schema.trainerId, dayIndex, day?.dayLabel, notify, completeDay]
  );
  const [loggedExercises, setLoggedExercises] = useState<Exercise[]>(() =>
    getLoggedExercisesForSchemaDayInLast12Hours(schema.id, dayIndex)
  );
  const [snackbarOpen, setSnackbarOpen] = useState(false);

  const today = useMemo(() => new Date().toISOString().split('T')[0], []);
  const healthStorageKey = useMemo(
    () => healthSummaryKeyForSchema(today, schema.id, dayIndex),
    [today, schema.id, dayIndex]
  );
  const [healthSummary, setHealthSummary] = useState<AppleHealthWorkoutSummary | null>(() =>
    getStoredHealthSummary(
      healthSummaryKeyForSchema(new Date().toISOString().split('T')[0], schema.id, dayIndex)
    )
  );

  useEffect(() => {
    setHealthSummary(getStoredHealthSummary(healthStorageKey));
  }, [healthStorageKey]);

  /**
   * Wat er al gelogd is voor deze trainingsdag. Voor jezelf staat dat lokaal op dit toestel; logt
   * de trainer voor een sporter, dan staat het in de cloud onder dat account — anders zou de
   * trainer geen enkel vinkje zien en oefeningen dubbel loggen.
   */
  const refreshLogged = useCallback(() => {
    if (!logTargetId) {
      setLoggedExercises(getLoggedExercisesForSchemaDayInLast12Hours(schema.id, dayIndex));
      return;
    }
    getLogsForUser(logTargetId)
      .then((logs) => setLoggedExercises(loggedExercisesFromSporterLogs(logs, schema.id, dayIndex)))
      .catch(() => setLoggedExercises([]));
  }, [schema.id, dayIndex, logTargetId]);

  useEffect(() => {
    refreshLogged();
  }, [refreshLogged]);

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

  const handleUndo = useCallback(async () => {
    if (!justLoggedExerciseId) return;
    // Voor een sporter staat de log in de cloud; lokaal verwijderen zou hem laten staan.
    if (logTargetId) {
      try {
        await deleteExerciseLog(justLoggedExerciseId);
      } catch (err) {
        notify.error('Log terugdraaien mislukt. Probeer het via Beheer of de log zelf.', err);
      }
    } else {
      deleteExercise(justLoggedExerciseId);
    }
    onClearJustLogged();
    setSnackbarOpen(false);
    refreshLogged();
  }, [justLoggedExerciseId, logTargetId, notify, onClearJustLogged, refreshLogged]);

  const handleSnackbarClose = useCallback(() => {
    setSnackbarOpen(false);
    onClearJustLogged();
  }, [onClearJustLogged]);

  const onHealthSummarySaved = useCallback(
    (summary: AppleHealthWorkoutSummary) => {
      setStoredHealthSummary(healthStorageKey, summary);
      setHealthSummary(summary);
    },
    [healthStorageKey]
  );

  const onHealthSummaryCleared = useCallback(() => {
    clearStoredHealthSummary(healthStorageKey);
    setHealthSummary(null);
  }, [healthStorageKey]);

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
          <AppleHealthWorkoutCard
            storedSummary={healthSummary}
            onSummarySaved={onHealthSummarySaved}
            onSummaryCleared={onHealthSummaryCleared}
          />
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 3, flexWrap: 'wrap' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
              <IconButton size="small" onClick={onBack} sx={{ p: 0.5 }} aria-label="Terug">
                <ArrowBackIosNewIcon fontSize="small" />
              </IconButton>
              <Typography variant="h5" sx={{ fontWeight: 600 }}>
                {schema.name} – {day.dayLabel}
              </Typography>
            </Box>
            {isDayComplete && hasMultipleDays && (
              <Button
                variant="contained"
                endIcon={<ArrowForwardIosIcon sx={{ fontSize: 16 }} />}
                onClick={onNextDay}
                aria-label="Volgende dag"
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

          {isTrainer && sporters.length > 0 && setLogTargetId && (
            <TextField
              select
              size="small"
              fullWidth
              label="Training voor"
              value={logTargetId}
              onChange={(e) => setLogTargetId(e.target.value)}
              SelectProps={{ displayEmpty: true }}
              InputLabelProps={{ shrink: true }}
              helperText={
                logTarget
                  ? 'Alles wat je hier logt komt onder het account van deze sporter.'
                  : 'Je logt voor jezelf.'
              }
              sx={{ mb: 2 }}
            >
              <MenuItem value="">Mijzelf</MenuItem>
              {sporters.map((sp) => (
                <MenuItem key={sp.userId} value={sp.userId}>
                  {sp.displayName?.trim() || sp.email || sp.userId}
                </MenuItem>
              ))}
            </TextField>
          )}

          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            <strong>Training afronden:</strong> log per oefening via &quot;Log toevoegen&quot;, of rond de hele training af met &quot;Training afronden&quot; hieronder.
          </Typography>

          {!isDayComplete && (
            <Button
              variant="outlined"
              color="inherit"
              onClick={() => setCheckinOpen(true)}
              aria-label="Training afronden en check-in invullen"
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
                  : 'Dag voltooid – alle oefeningen zijn gelogd. "Gelogd" verdwijnt na 12 uur; klik erop om de log te bekijken of bewerken.'}
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
                      <Box sx={{ flex: 1, minWidth: { xs: '100%', sm: 160 } }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                          <Typography variant="subtitle1" fontWeight={600}>
                            {ex.exerciseName}
                          </Typography>
                          {isLogged && (
                            <Box
                              component="button"
                              disabled={Boolean(logTargetId)}
                              onClick={() => !logTargetId && logId && handleGelogdClick(logId)}
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 0.5,
                                color: 'success.main',
                                cursor: logTargetId ? 'default' : 'pointer',
                                border: 'none',
                                background: 'none',
                                padding: 0,
                                font: 'inherit',
                                '&:hover': { textDecoration: logTargetId ? 'none' : 'underline' },
                              }}
                              aria-label={
                                logTargetId
                                  ? 'Gelogd voor deze sporter'
                                  : 'Gelogd – klik om naar log te gaan'
                              }
                            >
                              <CheckCircleOutlineIcon fontSize="small" />
                              <Typography variant="caption" color="success.main" component="span">
                                Gelogd
                              </Typography>
                            </Box>
                          )}
                        </Box>
                        <Typography variant="caption" color="text.secondary" display="block">
                          Voorgeschreven: {ex.setsTarget} × {ex.repsTarget} reps
                          {ex.restSeconds != null && ex.restSeconds > 0 && ` · ${ex.restSeconds}s rust`}
                        </Typography>
                        {ex.notes && (
                          <Typography variant="caption" color="text.secondary" display="block" fontStyle="italic" sx={{ mt: 0.5 }}>
                            {ex.notes}
                          </Typography>
                        )}
                        <Box
                          sx={{ cursor: 'pointer', display: 'inline-block', mt: 1.5 }}
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
                      <ExerciseDbDemo exerciseName={ex.exerciseName} variant="aside" />
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
    <CheckinDialog
        open={checkinOpen}
        dayLabel={day?.dayLabel || 'de training'}
        saving={checkinSaving}
        onSkip={completeDay}
        onSave={handleCheckinSave}
      />
      </PageLayout>
  );
};
