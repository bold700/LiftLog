import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Typography, Box, Snackbar, Button } from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import EmojiEventsRoundedIcon from '@mui/icons-material/EmojiEventsRounded';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { Schema, SchemaExercise } from '../types';
import { Exercise } from '../types';
import { deleteExercise } from '../utils/storage';
import {
  getLoggedExercisesForSchemaDayInLast12Hours,
  loggedExercisesFromSporterLogs,
} from '../utils/schemaSessionUtils';
import { getLogsForUser, deleteExerciseLog } from '../services/logService';
import { generateTrainingRecap } from '../services/trainingRecapService';
import {
  fromLocalExercises,
  fromSporterLogs,
  describePrevious,
  shortDate,
  buildPersonalRecords,
  describeRecord,
  localEntries,
  sporterEntries,
  type PreviousPerformance,
} from '../utils/previousPerformance';
import { getAllExercises } from '../utils/storage';
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
import { useViewAs } from '../context/ViewAsContext';
import { useNotify } from '../context/NotifyContext';
import { saveCheckin } from '../services/checkinService';
import { LastHandoverNote } from './LastHandoverNote';
import { CheckinDialog, type Feeling } from './CheckinDialog';
import { designTokens } from '../theme/designTokens';
import { PageLayout, HeaderActions } from './layout';
import { usePageTitle } from '../context/PageTitleContext';
import { formatLogDetails } from '../utils/insightsOverview';
import { AppleHealthWorkoutCard } from './AppleHealthWorkoutCard';
import { ExerciseDbDemo } from './ExerciseDbDemo';
import {
  healthSummaryKeyForSchema,
  getStoredHealthSummary,
  setStoredHealthSummary,
  clearStoredHealthSummary,
} from '../utils/healthWorkoutStorage';
import type { AppleHealthWorkoutSummary } from '../plugins/healthWorkout';

interface TrainingSessionViewProps {
  schema: Schema;
  dayIndex: number;
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
  onNextDay,
  justLoggedExerciseId,
  onClearJustLogged,
}: TrainingSessionViewProps) => {
  const addFromSchema = useAddFromSchema();
  const profileCtx = useProfile();
  const notify = useNotify();
  const { viewed, setViewing } = useViewAs();
  const isTrainer = profileCtx?.isTrainer ?? false;
  const sporters = useMemo(() => profileCtx?.allSporters ?? [], [profileCtx?.allSporters]);
  /** '' = de trainer logt voor zichzelf; anders het userId van de sporter waar "Bekijk als" op staat. */
  const logTargetId = viewed.isOther ? viewed.userId : '';
  const logTarget = logTargetId ? sporters.find((sp) => sp.userId === logTargetId) ?? null : null;

  // Een workout die aan één sporter hangt, staat meteen op die sporter: dat is bijna altijd voor
  // wie de trainer de training start. Eén keer per workout, zodat het "Bekijk als"-menu daarna
  // leidend blijft als de trainer bewust iemand anders kiest.
  const schemaClientId = schema.clientId;
  const schemaId = schema.id;
  const defaultedForSchema = useRef<string | null>(null);
  useEffect(() => {
    if (!isTrainer || !schemaClientId || defaultedForSchema.current === schemaId) return;
    const client = sporters.find((sp) => sp.userId === schemaClientId);
    if (!client) return;
    defaultedForSchema.current = schemaId;
    setViewing({ userId: client.userId, name: client.displayName?.trim() || client.email || 'Sporter', photoURL: client.photoURL });
  }, [isTrainer, schemaClientId, schemaId, sporters, setViewing]);
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [checkinSaving, setCheckinSaving] = useState(false);
  /** Overdracht uit stap 2 van de dialoog; gaat mee in de check-in die daarna wordt opgeslagen. */
  const [handover, setHandover] = useState<string | null>(null);
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
          handover: handover || null,
          date: new Date().toISOString(),
        });
      } catch (err) {
        notify.error('Check-in opslaan mislukt. De training is wel afgerond.', err);
      } finally {
        setCheckinSaving(false);
      }
      completeDay();
    },
    [profileCtx?.profile, logTarget, handover, schema.id, schema.trainerId, dayIndex, day?.dayLabel, notify, completeDay]
  );
  const [loggedExercises, setLoggedExercises] = useState<Exercise[]>(() =>
    getLoggedExercisesForSchemaDayInLast12Hours(schema.id, dayIndex)
  );
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  /** Wat deze persoon de vorige keer deed, per oefeningnaam (kleine letters). */
  const [previous, setPrevious] = useState<Map<string, PreviousPerformance>>(new Map());
  /** Personal record per oefeningnaam (kleine letters): het beste ooit, vandaag meegeteld. */
  const [records, setRecords] = useState<Map<string, PreviousPerformance>>(new Map());

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
      const logged = getLoggedExercisesForSchemaDayInLast12Hours(schema.id, dayIndex);
      setLoggedExercises(logged);
      const all = getAllExercises();
      setPrevious(fromLocalExercises(all, new Set(logged.map((ex) => ex.id))));
      setRecords(buildPersonalRecords(localEntries(all)));
      return;
    }
    getLogsForUser(logTargetId)
      .then((logs) => {
        const logged = loggedExercisesFromSporterLogs(logs, schema.id, dayIndex);
        setLoggedExercises(logged);
        setPrevious(fromSporterLogs(logs, new Set(logged.map((ex) => ex.id))));
        setRecords(buildPersonalRecords(sporterEntries(logs)));
      })
      .catch(() => {
        setLoggedExercises([]);
        setPrevious(new Map());
        setRecords(new Map());
      });
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

  /**
   * Voorzet voor de overdracht: alles wat in deze training is gelogd, met de notitie per oefening
   * en het gewicht van de vorige keer erbij, zodat de tekst kan benoemen of er iets veranderd is.
   */
  const handleRequestDraft = useCallback(
    async (feeling: number, note: string) => {
      const exercises = (day?.exercises ?? []).map((ex) => {
        const logged = loggedExercises.find(
          (l) => l.name?.toLowerCase() === ex.exerciseName.toLowerCase()
        );
        const prev = previous.get(ex.exerciseName.trim().toLowerCase()) ?? null;
        return {
          name: ex.exerciseName,
          weight: logged?.weight ?? null,
          sets: logged?.sets ?? null,
          reps: logged?.reps ?? null,
          effort: logged?.effort ?? null,
          note: logged?.notes ?? null,
          previousWeight: prev?.weight ?? null,
        };
      });
      return generateTrainingRecap({
        sporterName: logTarget?.displayName?.trim() || 'de sporter',
        dayLabel: `${schema.name} – ${day?.dayLabel ?? ''}`.trim(),
        feeling,
        sporterNote: note || null,
        exercises: exercises.filter((ex) => ex.weight != null || ex.reps != null || ex.note),
      });
    },
    [day?.exercises, day?.dayLabel, schema.name, loggedExercises, previous, logTarget]
  );

  /**
   * De overdracht komt bij deze training te staan; de volgende trainer leest hem bij het dossier
   * van de sporter. Versturen doet de app niet — daar zitten de knoppen naar WhatsApp voor, waar
   * het gesprek toch al loopt.
   */
  const handleSaveHandover = useCallback(async (draft: { handover: string; toSporter: string }) => {
    setHandover(draft.handover || null);
  }, []);

  /** Welke oefening open staat; standaard de eerste die nog niet gelogd is. */
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  /** Rust na een log: tot wanneer (ms), en na welke oefening. Figma "Rest 0:42". */
  const [rest, setRest] = useState<{ until: number; total: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!rest) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [rest]);
  useEffect(() => {
    if (rest && now >= rest.until) setRest(null);
  }, [rest, now]);

  // Na een nieuwe log: rust starten met de rusttijd uit het schema en door naar de volgende oefening.
  const lastRestFor = useRef<string | null>(null);
  useEffect(() => {
    if (!justLoggedExerciseId || lastRestFor.current === justLoggedExerciseId || !day) return;
    const log = loggedExercises.find((l) => l.id === justLoggedExerciseId);
    if (!log) return;
    lastRestFor.current = justLoggedExerciseId;
    const idx = day.exercises.findIndex((ex) => ex.exerciseName.toLowerCase() === log.name?.toLowerCase());
    const secs = idx >= 0 ? day.exercises[idx].restSeconds ?? 0 : 0;
    if (secs > 0) {
      setNow(Date.now());
      setRest({ until: Date.now() + secs * 1000, total: secs });
    }
    const nextOpen = day.exercises.findIndex(
      (ex, i) => i !== idx && !findLogIdForExercise(loggedExercises, ex.exerciseName)
    );
    if (nextOpen >= 0) setSelectedIdx(nextOpen);
  }, [justLoggedExerciseId, loggedExercises, day]);

  usePageTitle(day ? `${day.dayLabel} · sessie` : null);

  if (!day) {
    return null;
  }

  const allExercisesLogged =
    day.exercises.length > 0 &&
    day.exercises.every((ex) => findLogIdForExercise(loggedExercises, ex.exerciseName));
  const isDayComplete = dayMarkedComplete || allExercisesLogged;
  const hasMultipleDays = schema.days.length > 1;

  const loggedCount = day.exercises.filter((ex) => findLogIdForExercise(loggedExercises, ex.exerciseName)).length;
  const firstOpen = day.exercises.findIndex((ex) => !findLogIdForExercise(loggedExercises, ex.exerciseName));
  const current = selectedIdx ?? (firstOpen >= 0 ? firstOpen : 0);
  const ex = day.exercises[current] ?? null;
  const exLogId = ex ? findLogIdForExercise(loggedExercises, ex.exerciseName) : null;
  const exLog = exLogId ? loggedExercises.find((l) => l.id === exLogId) ?? null : null;
  const prev = ex ? previous.get(ex.exerciseName.trim().toLowerCase()) ?? null : null;
  const record = ex ? records.get(ex.exerciseName.trim().toLowerCase()) ?? null : null;
  // Vandaag gezet en er was al eerder gelogd: dan is het een nieuw record.
  const newRecord = !!record && !!prev && record.date.slice(0, 10) === today;
  const nextIdx = day.exercises.findIndex((e, i) => i > current && !findLogIdForExercise(loggedExercises, e.exerciseName));
  const next = nextIdx >= 0 ? day.exercises[nextIdx] : null;
  const restLeft = rest ? Math.max(0, Math.ceil((rest.until - now) / 1000)) : 0;
  const mmss = (secs: number) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  const prescription = (e: SchemaExercise) =>
    [
      `${e.setsTarget} × ${e.repsTarget}`,
      e.targetWeight ? `doel ${String(e.targetWeight).replace('.', ',')} kg` : null,
      e.restSeconds ? `${e.restSeconds}s rust` : null,
    ]
      .filter(Boolean)
      .join(' · ');
  const extras = [
    { label: 'Warming-up', text: formatWarmupSummary(day.warmup ?? schema.formule7?.warmup) },
    { label: 'Cardio', text: formatCardioSummary(day.cardio ?? schema.formule7?.cardio) },
    { label: 'Cooling-down', text: formatCooldownSummary(day.cooldown ?? schema.formule7?.cooldown) },
    { label: 'Stretching', text: formatStretchingSummary(day.stretching ?? schema.formule7?.stretching) },
  ].filter((x) => !!x.text);

  const finishButton = !dayMarkedComplete ? (
    <Button
      variant="contained"
      disableElevation
      onClick={() => setCheckinOpen(true)}
      aria-label="Training afronden en check-in invullen"
      sx={{ borderRadius: '20px', textTransform: 'none', fontWeight: 500, height: 40, px: 2.5 }}
    >
      Training afronden
    </Button>
  ) : isDayComplete && hasMultipleDays ? (
    <Button
      variant="contained"
      disableElevation
      endIcon={<ArrowForwardIosIcon sx={{ fontSize: 14 }} />}
      onClick={onNextDay}
      aria-label="Volgende dag"
      sx={{ borderRadius: '20px', textTransform: 'none', fontWeight: 500, height: 40, px: 2.5, minWidth: 0, maxWidth: '100%' }}
    >
      <Box component="span" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {`Volgende dag: ${schema.days[(dayIndex + 1) % schema.days.length].dayLabel}`}
      </Box>
    </Button>
  ) : null;

  const doneBanner = isDayComplete && (
    <Box
      sx={{
        py: 1.25,
        px: 2,
        mb: 2,
        borderRadius: 3,
        bgcolor: designTokens.secondaryContainer,
        color: designTokens.onSecondaryContainer,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 2,
        flexWrap: 'wrap',
      }}
    >
      <Typography variant="body2" fontWeight={500} sx={{ minWidth: 0, flex: 1 }}>
        {dayMarkedComplete
          ? allExercisesLogged
            ? 'Training afgerond – alle oefeningen zijn gelogd.'
            : 'Training voltooid (in één keer gemarkeerd).'
          : 'Alle oefeningen zijn gelogd. Rond de training af met je check-in.'}
      </Typography>
      {dayMarkedComplete && !allExercisesLogged && (
        <Button
          variant="outlined"
          size="small"
          color="inherit"
          onClick={() => {
            clearDayComplete(schema.id, dayIndex);
            setDayMarkedComplete(false);
          }}
          sx={{ whiteSpace: 'nowrap', borderRadius: '20px', textTransform: 'none', fontWeight: 500 }}
        >
          Reset markering
        </Button>
      )}
    </Box>
  );

  /** De open oefening: plaatje, voorschrift, vorige keer en loggen (Figma: rechterpaneel / kaart op mobiel). */
  const currentPanel = ex && (
    <Box sx={{ bgcolor: designTokens.cardBackground, borderRadius: `${designTokens.cardRadius}px`, p: { xs: 2, md: 3 } }}>
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
        <ExerciseDbDemo exerciseName={ex.exerciseName} variant="aside" />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontSize: { xs: 18, md: 22 }, fontWeight: 500, lineHeight: { xs: '24px', md: '28px' } }}>{ex.exerciseName}</Typography>
          <Typography sx={{ fontSize: 13, lineHeight: '18px', color: 'text.secondary', mt: 0.25 }}>{prescription(ex)}</Typography>
          {ex.notes && (
            <Typography sx={{ fontSize: 12, lineHeight: '16px', color: 'text.secondary', fontStyle: 'italic', mt: 0.5 }}>{ex.notes}</Typography>
          )}
          {/* Zodat je tijdens het begeleiden meteen weet of er gewicht bij kan, en wat het record is. */}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1 }}>
            <Box
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 1,
                px: 1,
                borderRadius: '8px',
                bgcolor: prev ? designTokens.tertiaryContainer : 'transparent',
                color: prev ? designTokens.onTertiaryContainer : 'text.disabled',
                border: prev ? 'none' : `1px solid ${designTokens.cardBorder}`,
                fontSize: 11,
                lineHeight: '20px',
              }}
            >
              {prev ? (
                <>
                  <Box component="span" sx={{ fontWeight: 600 }}>
                    Vorige keer
                  </Box>
                  <span>
                    {describePrevious(prev)}
                    {shortDate(prev.date) && ` · ${shortDate(prev.date)}`}
                  </span>
                </>
              ) : (
                'Nog niet eerder gelogd'
              )}
            </Box>
            {record && (
              <Box
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.5,
                  px: 1,
                  borderRadius: '8px',
                  bgcolor: newRecord ? designTokens.primary : designTokens.primaryContainer,
                  color: newRecord ? designTokens.onPrimary : designTokens.onPrimaryContainer,
                  fontSize: 11,
                  lineHeight: '20px',
                }}
              >
                <EmojiEventsRoundedIcon sx={{ fontSize: 14 }} aria-hidden />
                <Box component="span" sx={{ fontWeight: 600 }}>
                  {newRecord ? 'Nieuw PR' : 'PR'}
                </Box>
                <span>
                  {describeRecord(record)}
                  {!newRecord && shortDate(record.date) && ` · ${shortDate(record.date)}`}
                </span>
              </Box>
            )}
          </Box>
        </Box>
      </Box>

      {exLog && (
        <Box
          component={logTargetId ? 'div' : 'button'}
          type={logTargetId ? undefined : 'button'}
          onClick={() => !logTargetId && exLogId && handleGelogdClick(exLogId)}
          aria-label={logTargetId ? 'Gelogd voor deze sporter' : 'Gelogd – klik om naar log te gaan'}
          sx={{
            all: 'unset',
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            width: '100%',
            mt: 2,
            px: 2,
            minHeight: 52,
            borderRadius: 3,
            bgcolor: designTokens.cardBackgroundHigh,
            cursor: logTargetId ? 'default' : 'pointer',
          }}
        >
          <CheckCircleOutlineIcon sx={{ color: designTokens.primary }} />
          <Typography sx={{ fontSize: 14, fontWeight: 500 }}>Gelogd</Typography>
          <Typography sx={{ fontSize: 13, color: 'text.secondary', ml: 'auto' }}>{formatLogDetails(exLog)}</Typography>
        </Box>
      )}

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 2 }}>
        <Button
          variant={exLog ? 'outlined' : 'contained'}
          disableElevation
          startIcon={<AddRoundedIcon />}
          onClick={() => handleLogToevoegen(ex)}
          sx={{ borderRadius: '20px', textTransform: 'none', fontWeight: 500, height: 40, px: 2.5 }}
        >
          {exLog ? 'Nog een log' : 'Log toevoegen'}
        </Button>
        {next && (
          <Button onClick={() => setSelectedIdx(nextIdx)} sx={{ borderRadius: '20px', textTransform: 'none', fontWeight: 500, height: 40, px: 2 }}>
            Volgende oefening
          </Button>
        )}
      </Box>
    </Box>
  );

  const restCard = rest && (
    <Box
      role="timer"
      aria-live="polite"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        mt: 1.5,
        px: 2,
        minHeight: 56,
        borderRadius: 4,
        bgcolor: designTokens.secondaryContainer,
        color: designTokens.onSecondaryContainer,
      }}
    >
      <Typography sx={{ fontSize: 14, fontWeight: 500 }}>Rust</Typography>
      <Button size="small" color="inherit" onClick={() => setRest(null)} sx={{ textTransform: 'none', ml: 'auto' }}>
        Overslaan
      </Button>
      <Typography sx={{ fontSize: 24, fontWeight: 400, fontVariantNumeric: 'tabular-nums' }}>{mmss(restLeft)}</Typography>
    </Box>
  );

  const exerciseList = (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {day.exercises.map((e, i) => {
        const logId = findLogIdForExercise(loggedExercises, e.exerciseName);
        const log = logId ? loggedExercises.find((l) => l.id === logId) ?? null : null;
        const selected = i === current;
        return (
          <Box
            key={i}
            role="button"
            tabIndex={0}
            aria-current={selected ? 'step' : undefined}
            onClick={() => setSelectedIdx(i)}
            onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && setSelectedIdx(i)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              px: 2.5,
              py: 1,
              minHeight: 54,
              borderRadius: 3,
              cursor: 'pointer',
              bgcolor: selected ? designTokens.secondaryContainer : designTokens.cardBackground,
              color: selected ? designTokens.onSecondaryContainer : 'text.primary',
              '&:hover': selected ? undefined : { bgcolor: designTokens.cardBackgroundHigh },
            }}
          >
            <Box
              sx={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                flexShrink: 0,
                bgcolor: log || selected ? designTokens.primary : designTokens.cardBorder,
                opacity: log && !selected ? 0.8 : 1,
              }}
            />
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: 13, fontWeight: 500, lineHeight: '18px' }} noWrap>
                {e.exerciseName}
              </Typography>
              <Typography sx={{ fontSize: 11, lineHeight: '16px', opacity: 0.8 }} noWrap>
                {log ? `${formatLogDetails(log) || 'gelogd'} · gelogd` : `${e.setsTarget} × ${e.repsTarget}`}
              </Typography>
            </Box>
          </Box>
        );
      })}
    </Box>
  );

  const extraCards = extras.map((x) => (
    <Box key={x.label} sx={{ bgcolor: designTokens.cardBackground, borderRadius: 3, px: 2.5, py: 1.25 }}>
      <Typography sx={{ fontSize: 11, fontWeight: 600, lineHeight: '16px', color: 'text.secondary' }}>{x.label}</Typography>
      <Typography sx={{ fontSize: 13, lineHeight: '18px' }}>{x.text}</Typography>
    </Box>
  ));

  const progressLabel = `${loggedCount} van ${day.exercises.length} gelogd`;

  return (
    <PageLayout maxWidth="none">
      {/* Alleen desktop in de kop; op een telefoon staat de knop onderaan. */}
      <HeaderActions>
        <Box sx={{ display: { xs: 'none', md: 'flex' } }}>{finishButton}</Box>
      </HeaderActions>

      {logTarget && <LastHandoverNote userId={logTarget.userId} />}
      {doneBanner}

      {/* ---------- Telefoon ---------- */}
      <Box sx={{ display: { xs: 'block', md: 'none' } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 500 }}>
            {ex ? `Oefening ${current + 1} van ${day.exercises.length}` : progressLabel}
          </Typography>
          <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{progressLabel}</Typography>
        </Box>
        <Box sx={{ height: 6, borderRadius: 3, bgcolor: designTokens.cardBackgroundHigh, overflow: 'hidden', mb: 2 }}>
          <Box
            sx={{
              height: '100%',
              width: `${day.exercises.length ? (loggedCount / day.exercises.length) * 100 : 0}%`,
              bgcolor: designTokens.primary,
              borderRadius: 3,
              transition: 'width 0.3s ease',
            }}
          />
        </Box>
        {currentPanel}
        {restCard}
        {next && (
          <Typography sx={{ fontSize: 12, mt: 1.5, px: 0.5 }}>
            <Box component="span" sx={{ fontWeight: 600, mr: 1.5 }}>
              Volgende
            </Box>
            <Box component="span" sx={{ color: 'text.secondary' }}>
              {next.exerciseName} · {next.setsTarget} × {next.repsTarget}
            </Box>
          </Typography>
        )}
        <Typography sx={{ fontSize: 13, fontWeight: 500, mt: 3, mb: 1 }}>Alle oefeningen</Typography>
        {exerciseList}
        {extraCards.length > 0 && <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1 }}>{extraCards}</Box>}
        {finishButton && (
          <Box sx={{ mt: 2.5, '& .MuiButton-root': { width: '100%', height: 56, borderRadius: '28px', fontSize: 16 } }}>{finishButton}</Box>
        )}
        <Box sx={{ mt: 2 }}>
          <AppleHealthWorkoutCard storedSummary={healthSummary} onSummarySaved={onHealthSummarySaved} onSummaryCleared={onHealthSummaryCleared} />
        </Box>
      </Box>

      {/* ---------- Desktop: oefeningen links, de open oefening rechts ---------- */}
      <Box sx={{ display: { xs: 'none', md: 'grid' }, gridTemplateColumns: { md: '280px minmax(0, 1fr)', lg: '320px minmax(0, 1fr)' }, gap: 3, alignItems: 'start' }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 500, lineHeight: '16px', mb: 1 }}>
            {ex ? `Oefening ${current + 1} van ${day.exercises.length}` : 'Oefeningen'} · {progressLabel}
          </Typography>
          {exerciseList}
          {extraCards.length > 0 && <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1 }}>{extraCards}</Box>}
          <Box sx={{ mt: 2 }}>
            <AppleHealthWorkoutCard storedSummary={healthSummary} onSummarySaved={onHealthSummarySaved} onSummaryCleared={onHealthSummaryCleared} />
          </Box>
        </Box>
        <Box sx={{ minWidth: 0, mt: 3 }}>
          {currentPanel ?? (
            <Typography variant="body2" color="text.secondary">
              Geen oefeningen op deze dag.
            </Typography>
          )}
          {restCard}
          {next && (
            <Typography sx={{ fontSize: 12, mt: 1.5, px: 0.5 }}>
              <Box component="span" sx={{ fontWeight: 600, mr: 1.5 }}>
                Volgende
              </Box>
              <Box component="span" sx={{ color: 'text.secondary' }}>
                {next.exerciseName} · {next.setsTarget} × {next.repsTarget}
              </Box>
            </Typography>
          )}
        </Box>
      </Box>

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
        sporterName={logTarget ? logTarget.displayName?.trim() || logTarget.email || 'de sporter' : null}
        onRequestDraft={logTarget ? handleRequestDraft : undefined}
        onSaveHandover={logTarget ? handleSaveHandover : undefined}
      />
      </PageLayout>
  );
};
