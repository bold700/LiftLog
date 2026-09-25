import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Alert,
  Button,
  Chip,
  Typography,
  Box,
  Menu,
  MenuItem,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { getAllExercises, updateExercise, deleteExercise } from '../utils/storage';
import { getSessionLogs, saveSessionLog, deleteSessionLog } from '../utils/sessionLogStorage';
import { getSchemas, getSchemaById } from '../utils/schemaStorage';
import { Exercise, TrainingSessionLog } from '../types';
import { useViewAs } from '../context/ViewAsContext';
import { useProfile } from '../context/ProfileContext';
import { getLogsForUser, saveExerciseLog, deleteExerciseLog } from '../services/logService';
import { logToExercise } from '../utils/exerciseLogMapping';
import { groupExercisesIntoTrainings } from '../utils/trainingGroups';
import { useAddFromSchema } from '../context/AddFromSchemaContext';
import { designTokens } from '../theme/designTokens';
import { filterPillSx } from '../theme/segmentedToggle';
import {
  DEFAULT_LOG_FILTER,
  NO_SCHEMA,
  exerciseNames,
  filterLogs,
  groupLogsByDay,
  logDayLabel,
  logRowDetails,
  workoutOptions,
  type LogFilter,
} from '../utils/logList';
import { PageLayout, ContentCard, EmptyState } from './layout';
import { ExerciseEditDialog } from './logs/ExerciseEditDialog';
import { DeleteExerciseDialog } from './logs/DeleteExerciseDialog';
import { SessionLogDialog } from './logs/SessionLogDialog';
import { DeleteSessionDialog } from './logs/DeleteSessionDialog';

// Import Material Web Components buttons
import '@material/web/button/filled-button.js';
import '@material/web/button/text-button.js';
import '@material/web/icon/icon.js';

/** `short` staat op de pil, zodat de drie filters op een telefoon op één regel passen. */
const PERIOD_OPTIONS: { label: string; short: string; days: number | null }[] = [
  { label: 'Laatste 7 dagen', short: '7 dagen', days: 7 },
  { label: 'Laatste 30 dagen', short: '30 dagen', days: 30 },
  { label: 'Laatste 90 dagen', short: '90 dagen', days: 90 },
  { label: 'Alle datums', short: 'Alle datums', days: null },
];

/**
 * Eén regel in de lijst (Figma "Logs"): naam met eventuele notitie eronder, rechts gewicht en
 * sets × reps. Tikken opent het menu met Bewerken en Verwijderen.
 */
function LogRow({
  title,
  note,
  details,
  onOpen,
}: {
  title: string;
  note: string | null;
  details: string;
  onOpen?: (el: HTMLElement) => void;
}) {
  return (
    <Box
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      aria-haspopup={onOpen ? 'menu' : undefined}
      onClick={onOpen ? (e) => onOpen(e.currentTarget) : undefined}
      onKeyDown={
        onOpen
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpen(e.currentTarget);
              }
            }
          : undefined
      }
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        minHeight: 42,
        px: { xs: 1.75, md: 2.5 },
        py: 1,
        borderRadius: 3,
        bgcolor: designTokens.cardBackground,
        cursor: onOpen ? 'pointer' : 'default',
        transition: 'background-color 0.15s ease',
        '&:hover': onOpen ? { bgcolor: designTokens.cardBackgroundHigh } : undefined,
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 500, lineHeight: '20px' }} noWrap>
          {title}
        </Typography>
        {note && (
          <Typography sx={{ fontSize: 11, lineHeight: '16px', color: 'text.secondary' }} noWrap>
            “{note}”
          </Typography>
        )}
      </Box>
      {details && (
        <Typography sx={{ fontSize: 13, lineHeight: '18px', color: 'text.secondary', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {details}
        </Typography>
      )}
    </Box>
  );
}

/** Filterpil zoals Figma: 12px, compact, zodat drie pillen en het aantal op een telefoon naast elkaar passen. */
const pillSx = (selected: boolean) => ({ ...filterPillSx(selected), fontSize: { xs: 11, sm: 12 }, '& .MuiChip-label': { px: { xs: 1.125, sm: 1.25 } } });

export interface LogsPageProps {
  /** Open direct het dialoog "Training log toevoegen" (bijv. na klik FAB → Training log). */
  openSessionLogDialogRequested?: boolean;
  onConsumeOpenSessionLogDialog?: () => void;
}

export const LogsPage = ({ openSessionLogDialogRequested, onConsumeOpenSessionLogDialog }: LogsPageProps) => {
  const addFromSchema = useAddFromSchema();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { viewed } = useViewAs();
  const profile = useProfile();
  /** Kijk je bij een sporter mee, dan komen de oefeningen uit Firestore in plaats van dit toestel. */
  const viewingOther = viewed.isOther;
  /** Profiel van de sporter waar je meekijkt; nodig om `trainerId` op de log te laten staan. */
  const viewedProfile = useMemo(
    () => (viewingOther ? profile?.members?.find((p) => p.userId === viewed.userId) ?? null : null),
    [viewingOther, profile?.members, viewed.userId]
  );
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [filter, setFilter] = useState<LogFilter>(DEFAULT_LOG_FILTER);
  const [filterMenu, setFilterMenu] = useState<{ kind: 'period' | 'exercise' | 'workout'; anchor: HTMLElement } | null>(null);
  const [menuExerciseId, setMenuExerciseId] = useState<string | null>(null);
  const [openEditDialog, setOpenEditDialog] = useState(false);
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);
  const [deletingExerciseId, setDeletingExerciseId] = useState<string | null>(null);
  const [exerciseName, setExerciseName] = useState('');
  const [weight, setWeight] = useState('');
  const [sets, setSets] = useState('');
  const [reps, setReps] = useState('');
  const [notes, setNotes] = useState('');

  // Sessie-logs (trainingen)
  const [sessionLogs, setSessionLogs] = useState<TrainingSessionLog[]>(() => getSessionLogs());
  const [openSessionLogDialog, setOpenSessionLogDialog] = useState<'add' | 'edit' | null>(null);
  const [editingSessionLog, setEditingSessionLog] = useState<TrainingSessionLog | null>(null);
  const [sessionLogDate, setSessionLogDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [sessionLogSchemaId, setSessionLogSchemaId] = useState<string>('');
  const [sessionLogDayIndex, setSessionLogDayIndex] = useState<number>(0);
  const [sessionLogNotes, setSessionLogNotes] = useState('');
  const [deletingSessionLogId, setDeletingSessionLogId] = useState<string | null>(null);
  const [openDeleteSessionLogDialog, setOpenDeleteSessionLogDialog] = useState(false);
  const schemas = getSchemas();

  // Open bewerk-dialog wanneer we vanaf schema "Gelogd" hebben geklikt
  useEffect(() => {
    const openId = addFromSchema?.openLogId;
    if (!openId || allExercises.length === 0) return;
    const exercise = allExercises.find((ex) => ex.id === openId);
    if (exercise) {
      setEditingExercise(exercise);
      setExerciseName(exercise.name || '');
      setWeight(exercise.weight?.toString() || '');
      setSets(exercise.sets?.toString() || '');
      setReps(exercise.reps?.toString() || '');
      setNotes(exercise.notes || '');
      setOpenEditDialog(true);
    }
    addFromSchema.clearOpenLogId();
  }, [addFromSchema?.openLogId, addFromSchema, allExercises]);

  /**
   * Je eigen oefeningen komen uit de lokale opslag; die wordt op de achtergrond met de cloud
   * gelijkgehouden, dus daar verandert niets aan. Kijk je bij een sporter mee, dan halen we de
   * logs rechtstreeks uit Firestore: van een ander toestel is hier niets bekend.
   */
  const loadAllExercises = useCallback(async () => {
    if (!viewingOther) {
      setLoadError(null);
      setAllExercises(getAllExercises()); // Sorteert al op datum (nieuwste eerst)
      return;
    }
    try {
      const logs = await getLogsForUser(viewed.userId);
      setLoadError(null);
      setAllExercises(logs.map(logToExercise));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setAllExercises([]);
      setLoadError(
        msg.toLowerCase().includes('permission')
          ? 'Geen toegang tot de logs van deze sporter. Zit hij of zij wel in jouw studio?'
          : 'De logs konden niet geladen worden.'
      );
    }
  }, [viewingOther, viewed.userId]);

  useEffect(() => {
    void loadAllExercises();
  }, [loadAllExercises]);

  useEffect(() => {
    // Alleen zinvol voor je eigen logs: de lokale opslag verandert niet als je meekijkt.
    if (viewingOther) return;
    const handle = () => void loadAllExercises();
    window.addEventListener('storage', handle);
    // Ook binnen dezelfde tab, want dan komt er geen storage-event.
    window.addEventListener('workoutUpdated', handle);
    return () => {
      window.removeEventListener('storage', handle);
      window.removeEventListener('workoutUpdated', handle);
    };
  }, [viewingOther, loadAllExercises]);

  const refreshSessionLogs = useCallback(() => setSessionLogs(getSessionLogs()), []);
  useEffect(() => {
    const handler = () => refreshSessionLogs();
    window.addEventListener('workoutUpdated', handler);
    return () => window.removeEventListener('workoutUpdated', handler);
  }, [refreshSessionLogs]);

  useEffect(() => {
    if (openSessionLogDialogRequested && onConsumeOpenSessionLogDialog) {
      openAddSessionLog();
      onConsumeOpenSessionLogDialog();
    }
  }, [openSessionLogDialogRequested, onConsumeOpenSessionLogDialog]);

  const handleMenuClose = () => {
    setMenuAnchorEl(null);
    setMenuExerciseId(null);
  };

  const handleEditExercise = (exercise: Exercise) => {
    setEditingExercise(exercise);
    setExerciseName(exercise.name || '');
    setWeight(exercise.weight?.toString() || '');
    setSets(exercise.sets?.toString() || '');
    setReps(exercise.reps?.toString() || '');
    setNotes(exercise.notes || '');
    setOpenEditDialog(true);
    handleMenuClose();
  };

  const handleDeleteExercise = (exerciseId: string) => {
    setDeletingExerciseId(exerciseId);
    setOpenDeleteDialog(true);
    handleMenuClose();
  };

  const handleSaveEdit = useCallback(async () => {
    if (!editingExercise || !exerciseName.trim() || !weight.trim()) {
      return;
    }

    if (viewingOther) {
      // Schrijven namens de sporter: het document blijft van hem (`userId`), maar `loggedBy`
      // houdt vast dat jij het hebt ingevoerd. Dat spoor is precies wat verloren gaat als je
      // in plaats hiervan als de sporter zou inloggen.
      await saveExerciseLog({
        id: editingExercise.id,
        userId: viewed.userId,
        loggedBy: profile?.profile?.userId ?? '',
        trainerId: viewedProfile?.trainerId ?? null,
        exerciseName: exerciseName.trim(),
        exerciseId: exerciseName.trim(),
        weight: parseFloat(weight),
        sets: sets ? parseInt(sets) : null,
        reps: reps ? parseInt(reps) : null,
        notes: notes.trim() || null,
        effort: editingExercise.effort ?? null,
        date: editingExercise.date,
        schemaId: editingExercise.schemaId ?? null,
        schemaDayIndex: editingExercise.schemaDayIndex ?? null,
      });
    } else {
      updateExercise(editingExercise.id, {
        name: exerciseName.trim(),
        weight: parseFloat(weight),
        sets: sets ? parseInt(sets) : undefined,
        reps: reps ? parseInt(reps) : undefined,
        notes: notes.trim() || undefined,
      });
    }

    setOpenEditDialog(false);
    setEditingExercise(null);
    setExerciseName('');
    setWeight('');
    setSets('');
    setReps('');
    setNotes('');

    await new Promise(resolve => setTimeout(resolve, 50));
    await loadAllExercises();
  }, [editingExercise, exerciseName, weight, sets, reps, notes, viewingOther, viewed.userId, viewedProfile?.trainerId, profile?.profile?.userId, loadAllExercises]);

  const handleCloseEditDialog = useCallback(() => {
    setOpenEditDialog(false);
    setEditingExercise(null);
    setExerciseName('');
    setWeight('');
    setSets('');
    setReps('');
    setNotes('');
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!deletingExerciseId) return;

    if (viewingOther) {
      await deleteExerciseLog(deletingExerciseId);
    } else {
      deleteExercise(deletingExerciseId);
    }

    setOpenDeleteDialog(false);
    setDeletingExerciseId(null);

    await new Promise(resolve => setTimeout(resolve, 50));
    await loadAllExercises();
  }, [deletingExerciseId, viewingOther, loadAllExercises]);

  const handleCloseDeleteDialog = useCallback(() => {
    setOpenDeleteDialog(false);
    setDeletingExerciseId(null);
  }, []);

  const openAddSessionLog = useCallback(() => {
    setEditingSessionLog(null);
    setSessionLogDate(new Date().toISOString().split('T')[0]);
    setSessionLogSchemaId(schemas[0]?.id ?? '');
    setSessionLogDayIndex(0);
    setSessionLogNotes('');
    setOpenSessionLogDialog('add');
  }, [schemas]);

  const openEditSessionLog = useCallback((log: TrainingSessionLog) => {
    setEditingSessionLog(log);
    setSessionLogDate(log.date);
    setSessionLogSchemaId(log.schemaId);
    setSessionLogDayIndex(log.schemaDayIndex);
    setSessionLogNotes(log.notes ?? '');
    setOpenSessionLogDialog('edit');
  }, []);

  const saveSessionLogFromDialog = useCallback(() => {
    if (!sessionLogSchemaId) return;
    saveSessionLog({
      date: sessionLogDate,
      schemaId: sessionLogSchemaId,
      schemaDayIndex: sessionLogDayIndex,
      notes: sessionLogNotes.trim() || null,
    });
    if (editingSessionLog) {
      // bij edit: als datum/schema/dag gewijzigd, oude verwijderen (saveSessionLog maakt/update op key date+schemaId+dayIndex)
      if (
        editingSessionLog.date !== sessionLogDate ||
        editingSessionLog.schemaId !== sessionLogSchemaId ||
        editingSessionLog.schemaDayIndex !== sessionLogDayIndex
      ) {
        deleteSessionLog(editingSessionLog.id);
      }
    }
    refreshSessionLogs();
    setOpenSessionLogDialog(null);
    setEditingSessionLog(null);
  }, [sessionLogDate, sessionLogSchemaId, sessionLogDayIndex, sessionLogNotes, editingSessionLog, refreshSessionLogs]);

  const closeSessionLogDialog = useCallback(() => {
    setOpenSessionLogDialog(null);
    setEditingSessionLog(null);
  }, []);

  const confirmDeleteSessionLog = useCallback(() => {
    if (deletingSessionLogId) {
      deleteSessionLog(deletingSessionLogId);
      refreshSessionLogs();
      setDeletingSessionLogId(null);
      setOpenDeleteSessionLogDialog(false);
    }
  }, [deletingSessionLogId, refreshSessionLogs]);

  const closeDeleteSessionLogDialog = () => { setOpenDeleteSessionLogDialog(false); setDeletingSessionLogId(null); };

  /**
   * Trainingen komen uit de oefeningen zelf: één dag (en één schema-dag) is één training.
   * Een handmatig toegevoegd trainingslog levert alleen nog de notitie; bij een sporter waar je
   * meekijkt is die notitie er niet, want die staat op diens eigen toestel.
   */
  const trainings = useMemo(
    // Bij een sporter waar je meekijkt gaan de handmatige logs niet mee: die staan op diens toestel.
    () => groupExercisesIntoTrainings(allExercises, viewingOther ? [] : sessionLogs),
    [allExercises, sessionLogs, viewingOther]
  );

  /** Peildatum voor "Vandaag" en de periodefilter; het tabblad laadt opnieuw bij elke opening. */
  const [now] = useState(() => new Date());
  const visibleLogs = useMemo(() => filterLogs(allExercises, filter, now), [allExercises, filter, now]);
  const nameOptions = useMemo(() => exerciseNames(allExercises), [allExercises]);
  const workouts = useMemo(() => workoutOptions(allExercises), [allExercises]);
  const schemaName = (id: string) => getSchemaById(id)?.name ?? 'Onbekende workout';

  /**
   * Trainingen met een eigen notitie of een handmatig toegevoegd trainingslog: die staan bovenaan
   * hun dag, zodat de notitie en het bewerken van zo'n log niet verdwijnen. Met een oefeningfilter
   * horen ze er niet bij.
   */
  const trainingNotesByDay = useMemo(() => {
    const map = new Map<string, typeof trainings>();
    if (filter.exerciseName) return map;
    // Zelfde periode- en workoutfilter als de logs: een proef-log op die dag met dat schema.
    const probe = (date: string, schemaId: string | null) =>
      filterLogs([{ id: 'x', name: 'x', date, schemaId }], filter, now).length > 0;
    for (const t of trainings) {
      if (!t.notes && !t.sessionLogId) continue;
      if (!probe(t.date, t.schemaId)) continue;
      const list = map.get(t.date) ?? [];
      list.push(t);
      map.set(t.date, list);
    }
    return map;
  }, [trainings, filter, now]);

  const days = useMemo(() => {
    const grouped = groupLogsByDay(visibleLogs, now);
    const known = new Set(grouped.map((d) => d.day));
    const extra = [...trainingNotesByDay.keys()].filter((d) => !known.has(d)).map((day) => ({ day, label: logDayLabel(day, now), logs: [] }));
    return [...grouped, ...extra].sort((x, y) => (x.day < y.day ? 1 : x.day > y.day ? -1 : 0));
  }, [visibleLogs, trainingNotesByDay, now]);

  const periodLabel = PERIOD_OPTIONS.find((o) => o.days === filter.periodDays)?.short ?? 'Alle datums';
  const workoutLabel =
    filter.schemaId == null ? 'Alle workouts' : filter.schemaId === NO_SCHEMA ? 'Losse oefeningen' : schemaName(filter.schemaId);
  const closeFilterMenu = () => setFilterMenu(null);

  const trainingTitle = (t: (typeof trainings)[number]) => {
    const schema = t.schemaId ? getSchemaById(t.schemaId) : null;
    const dayLabel = t.schemaDayIndex != null ? schema?.days[t.schemaDayIndex]?.dayLabel ?? `Dag ${t.schemaDayIndex + 1}` : null;
    return schema ? [schema.name, dayLabel].filter(Boolean).join(' – ') : 'Training';
  };

  return (
    <PageLayout maxWidth="none">
      {loadError && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {loadError}
        </Alert>
      )}

      {/* Filters en aantal, zoals Figma: "Last 30 days · All exercises · All workouts   142 entries". */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.75, sm: 1 }, mb: 2.5, flexWrap: 'wrap' }}>
        <Chip
          size="small"
          label={periodLabel}
          onClick={(e) => setFilterMenu({ kind: 'period', anchor: e.currentTarget })}
          sx={pillSx(filter.periodDays != null)}
        />
        <Chip
          size="small"
          label={filter.exerciseName ?? 'Alle oefeningen'}
          onClick={(e) => setFilterMenu({ kind: 'exercise', anchor: e.currentTarget })}
          onDelete={filter.exerciseName ? () => setFilter((f) => ({ ...f, exerciseName: null })) : undefined}
          sx={{ ...pillSx(filter.exerciseName != null), maxWidth: 200 }}
        />
        <Chip
          size="small"
          label={workoutLabel}
          onClick={(e) => setFilterMenu({ kind: 'workout', anchor: e.currentTarget })}
          onDelete={filter.schemaId ? () => setFilter((f) => ({ ...f, schemaId: null })) : undefined}
          sx={{ ...pillSx(filter.schemaId != null), maxWidth: 200 }}
        />
        <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto', whiteSpace: 'nowrap' }}>
          {visibleLogs.length} {visibleLogs.length === 1 ? 'log' : 'logs'}
        </Typography>
      </Box>

      <Menu anchorEl={filterMenu?.anchor} open={filterMenu?.kind === 'period'} onClose={closeFilterMenu}>
        {PERIOD_OPTIONS.map((o) => (
          <MenuItem
            key={o.label}
            selected={filter.periodDays === o.days}
            onClick={() => {
              setFilter((f) => ({ ...f, periodDays: o.days }));
              closeFilterMenu();
            }}
          >
            {o.label}
          </MenuItem>
        ))}
      </Menu>
      <Menu
        anchorEl={filterMenu?.anchor}
        open={filterMenu?.kind === 'exercise'}
        onClose={closeFilterMenu}
        slotProps={{ paper: { sx: { maxHeight: 360 } } }}
      >
        <MenuItem
          selected={filter.exerciseName == null}
          onClick={() => {
            setFilter((f) => ({ ...f, exerciseName: null }));
            closeFilterMenu();
          }}
        >
          Alle oefeningen
        </MenuItem>
        {nameOptions.map((n) => (
          <MenuItem
            key={n}
            selected={filter.exerciseName === n}
            onClick={() => {
              setFilter((f) => ({ ...f, exerciseName: n }));
              closeFilterMenu();
            }}
          >
            {n}
          </MenuItem>
        ))}
      </Menu>
      <Menu anchorEl={filterMenu?.anchor} open={filterMenu?.kind === 'workout'} onClose={closeFilterMenu}>
        <MenuItem
          selected={filter.schemaId == null}
          onClick={() => {
            setFilter((f) => ({ ...f, schemaId: null }));
            closeFilterMenu();
          }}
        >
          Alle workouts
        </MenuItem>
        {workouts.schemaIds.map((id) => (
          <MenuItem
            key={id}
            selected={filter.schemaId === id}
            onClick={() => {
              setFilter((f) => ({ ...f, schemaId: id }));
              closeFilterMenu();
            }}
          >
            {schemaName(id)}
          </MenuItem>
        ))}
        {workouts.hasLoose && (
          <MenuItem
            selected={filter.schemaId === NO_SCHEMA}
            onClick={() => {
              setFilter((f) => ({ ...f, schemaId: NO_SCHEMA }));
              closeFilterMenu();
            }}
          >
            Losse oefeningen
          </MenuItem>
        )}
      </Menu>

      {days.length === 0 ? (
        <ContentCard>
          <EmptyState>
            {allExercises.some((e) => e.name?.trim())
              ? 'Geen logs die bij deze filters passen.'
              : viewingOther
                ? `${viewed.name} heeft nog geen oefeningen gelogd.`
                : 'Nog geen logs. Zodra je oefeningen logt, staan ze hier per dag.'}
          </EmptyState>
          {filter.periodDays != null && allExercises.some((e) => e.name?.trim()) && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 1 }}>
              <Button size="small" onClick={() => setFilter((f) => ({ ...f, periodDays: null }))}>
                Toon alle datums
              </Button>
            </Box>
          )}
        </ContentCard>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          {days.map((d) => (
            <Box key={d.day}>
              <Typography sx={{ fontSize: 13, fontWeight: 500, lineHeight: '18px', color: 'text.secondary', mb: 1 }}>
                {d.label}
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {(trainingNotesByDay.get(d.day) ?? []).map((t) => (
                  <LogRow
                    key={t.id}
                    title={trainingTitle(t)}
                    note={t.notes}
                    details={t.exerciseCount > 0 ? `${t.exerciseCount} ${t.exerciseCount === 1 ? 'oefening' : 'oefeningen'}` : 'Training'}
                    onOpen={
                      t.sessionLogId
                        ? (el) => {
                            setMenuAnchorEl(el);
                            setMenuExerciseId(`session-${t.sessionLogId}`);
                          }
                        : undefined
                    }
                  />
                ))}
                {d.logs.map((ex) => (
                  <LogRow
                    key={ex.id}
                    title={ex.name!.trim()}
                    note={ex.notes?.trim() || null}
                    details={logRowDetails(ex)}
                    onOpen={(el) => {
                      setMenuAnchorEl(el);
                      setMenuExerciseId(ex.id);
                    }}
                  />
                ))}
              </Box>
            </Box>
          ))}
        </Box>
      )}

      {/* Menu voor edit/delete (oefening of sessie-log) */}
      <Menu
        anchorEl={menuAnchorEl}
        open={Boolean(menuAnchorEl)}
        onClose={handleMenuClose}
      >
        {menuExerciseId?.startsWith('session-') ? (
          (() => {
            const logId = menuExerciseId.replace('session-', '');
            const log = sessionLogs.find((l) => l.id === logId);
            if (!log) return null;
            return (
              <>
                <MenuItem onClick={() => { openEditSessionLog(log); handleMenuClose(); }}>
                  <EditIcon sx={{ mr: 1 }} fontSize="small" />
                  Bewerken
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setDeletingSessionLogId(logId);
                    setOpenDeleteSessionLogDialog(true);
                    handleMenuClose();
                  }}
                  sx={{ color: 'error.main' }}
                >
                  <DeleteIcon sx={{ mr: 1 }} fontSize="small" />
                  Verwijderen
                </MenuItem>
              </>
            );
          })()
        ) : menuExerciseId && allExercises.find(ex => ex.id === menuExerciseId) ? (
          <>
            <MenuItem onClick={() => handleEditExercise(allExercises.find(ex => ex.id === menuExerciseId)!)}>
              <EditIcon sx={{ mr: 1 }} fontSize="small" />
              Bewerken
            </MenuItem>
            <MenuItem
              onClick={() => handleDeleteExercise(menuExerciseId)}
              sx={{ color: 'error.main' }}
            >
              <DeleteIcon sx={{ mr: 1 }} fontSize="small" />
              Verwijderen
            </MenuItem>
          </>
        ) : null}
      </Menu>

      {/* Dialog voor bewerken oefening */}
      <ExerciseEditDialog
        open={openEditDialog}
        isMobile={isMobile}
        exerciseName={exerciseName}
        weight={weight}
        sets={sets}
        reps={reps}
        notes={notes}
        onExerciseNameChange={setExerciseName}
        onWeightChange={setWeight}
        onSetsChange={setSets}
        onRepsChange={setReps}
        onNotesChange={setNotes}
        onClose={handleCloseEditDialog}
        onSave={handleSaveEdit}
      />

      {/* Dialog voor verwijderen bevestiging */}
      <DeleteExerciseDialog open={openDeleteDialog} onClose={handleCloseDeleteDialog} onConfirm={handleConfirmDelete} />

      {/* Dialog training log toevoegen/bewerken */}
      <SessionLogDialog
        mode={openSessionLogDialog}
        schemas={schemas}
        date={sessionLogDate}
        schemaId={sessionLogSchemaId}
        dayIndex={sessionLogDayIndex}
        notes={sessionLogNotes}
        onDateChange={setSessionLogDate}
        onSchemaIdChange={setSessionLogSchemaId}
        onDayIndexChange={setSessionLogDayIndex}
        onNotesChange={setSessionLogNotes}
        onClose={closeSessionLogDialog}
        onSave={saveSessionLogFromDialog}
      />

      {/* Dialog sessie-log verwijderen */}
      <DeleteSessionDialog open={openDeleteSessionLogDialog} onClose={closeDeleteSessionLogDialog} onConfirm={confirmDeleteSessionLog} />
    </PageLayout>
  );
};
