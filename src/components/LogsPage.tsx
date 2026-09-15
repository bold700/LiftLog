import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Alert,
  Card,
  CardContent,
  Typography,
  Box,
  IconButton,
  Menu,
  MenuItem,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import MoreVertIcon from '@mui/icons-material/MoreVert';
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
import { formatExerciseDateShort, formatExerciseDetails } from '../utils/format';
import { designTokens } from '../theme/designTokens';
import { PageLayout, ContentCard, PageTitle, EmptyState } from './layout';
import { ExerciseEditDialog } from './logs/ExerciseEditDialog';
import { DeleteExerciseDialog } from './logs/DeleteExerciseDialog';
import { SessionLogDialog } from './logs/SessionLogDialog';
import { DeleteSessionDialog } from './logs/DeleteSessionDialog';

// Import Material Web Components buttons
import '@material/web/button/filled-button.js';
import '@material/web/button/text-button.js';
import '@material/web/icon/icon.js';

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
    () => (viewingOther ? profile?.allSporters?.find((p) => p.userId === viewed.userId) ?? null : null),
    [viewingOther, profile?.allSporters, viewed.userId]
  );
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
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

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, exerciseId: string) => {
    setMenuAnchorEl(event.currentTarget);
    setMenuExerciseId(exerciseId);
  };

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

  return (
    <PageLayout>
      <ContentCard>
        <PageTitle>Log</PageTitle>

        {loadError && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {loadError}
          </Alert>
        )}

        <Typography variant="subtitle2" color="text.secondary" fontWeight={600} sx={{ mb: 1 }}>
          Trainingen
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 3 }}>
          {trainings.map((t) => {
            const schema = t.schemaId ? getSchemaById(t.schemaId) : null;
            const dayLabel =
              t.schemaDayIndex != null ? schema?.days[t.schemaDayIndex]?.dayLabel ?? `Dag ${t.schemaDayIndex + 1}` : null;
            const title = schema ? [schema.name, dayLabel].filter(Boolean).join(' – ') : 'Losse oefeningen';
            return (
              <Card
                key={t.id}
                sx={{
                  backgroundColor: 'transparent',
                  borderRadius: `${designTokens.cardRadius}px`,
                  border: `1px solid ${designTokens.cardBorder}`,
                  boxShadow: 'none',
                }}
              >
                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="subtitle1" fontWeight={600}>
                        {title}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        {formatExerciseDateShort(t.date)} · {t.exerciseCount}{' '}
                        {t.exerciseCount === 1 ? 'oefening' : 'oefeningen'}
                      </Typography>
                      {t.exerciseNames.length > 0 && (
                        <Typography variant="body2" color="text.primary" sx={{ mt: 1 }}>
                          {t.exerciseNames.join(' · ')}
                        </Typography>
                      )}
                      {t.notes && (
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontStyle: 'italic' }}>
                          &quot;{t.notes}&quot;
                        </Typography>
                      )}
                    </Box>
                    {/* Alleen een handmatig toegevoegd trainingslog is te bewerken; een afgeleide
                        groep bestaat niet als document. */}
                    {t.sessionLogId && (
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          setMenuAnchorEl(e.currentTarget);
                          setMenuExerciseId(`session-${t.sessionLogId}`);
                        }}
                        sx={{ color: 'text.secondary', ml: 1 }}
                        aria-label="Menu training"
                      >
                        <MoreVertIcon fontSize="small" />
                      </IconButton>
                    )}
                  </Box>
                </CardContent>
              </Card>
            );
          })}
          {trainings.length === 0 && (
            <EmptyState>
              {viewingOther
                ? `${viewed.name} heeft nog geen oefeningen gelogd.`
                : 'Nog geen trainingen. Zodra je oefeningen logt, staan ze hier per dag bij elkaar.'}
            </EmptyState>
          )}
        </Box>

        <Typography variant="subtitle2" color="text.secondary" fontWeight={600} sx={{ mb: 1 }}>
          Oefeningen
        </Typography>

        {allExercises.length > 0 && (
          <Box className="stagger-children" sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {allExercises.map((exercise, index) => (
              <Card
                key={exercise.id}
                sx={{
                  '--stagger-index': index,
                  backgroundColor: 'transparent',
                  borderRadius: `${designTokens.cardRadius}px`,
                  border: `1px solid ${designTokens.cardBorder}`,
                  m: 0,
                  boxShadow: 'none',
                  transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                  '&:hover': {
                    transform: 'translateY(-1px)',
                    boxShadow: 1,
                  },
                } as any}
                elevation={0}
              >
                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                        {exercise.name || 'Notitie'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                        {formatExerciseDateShort(exercise.date)}
                      </Typography>
                      <Typography variant="body2" color="text.primary">
                        {formatExerciseDetails(exercise)}
                      </Typography>
                          {exercise.notes && String(exercise.notes).trim() && (
                            <Typography
                              variant="body2"
                              color="text.secondary"
                              sx={{
                                mt: 1.5,
                                fontStyle: 'italic',
                                display: 'block',
                                opacity: 0.75,
                                fontSize: '0.875rem',
                                lineHeight: 1.5
                              }}
                            >
                              &quot;{String(exercise.notes).trim()}&quot;
                            </Typography>
                          )}
                        </Box>
                        <IconButton
                          size="small"
                          onClick={(e) => handleMenuOpen(e, exercise.id)}
                          sx={{ color: 'text.secondary', ml: 1 }}
                        >
                          <MoreVertIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    </CardContent>
                  </Card>
            ))}
          </Box>
        )}

        {allExercises.length === 0 && (
          <EmptyState>Nog geen oefeningen gelogd. Begin met het toevoegen van je eerste oefening!</EmptyState>
        )}
      </ContentCard>

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
