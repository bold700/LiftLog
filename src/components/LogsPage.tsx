import { useState, useEffect, useCallback } from 'react';
import {
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
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
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

  useEffect(() => {
    const loadAllExercises = () => {
      const exercises = getAllExercises(); // Sorteert al op datum (nieuwste eerst)
      setAllExercises(exercises);
    };

    loadAllExercises();

    // Luister naar storage events voor updates
    const handleStorageChange = () => {
      loadAllExercises();
    };
    window.addEventListener('storage', handleStorageChange);

    // Ook luisteren naar custom storage events (voor updates binnen dezelfde tab)
    const handleCustomStorageChange = () => {
      loadAllExercises();
    };
    window.addEventListener('workoutUpdated', handleCustomStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('workoutUpdated', handleCustomStorageChange);
    };
  }, []);

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

    updateExercise(editingExercise.id, {
      name: exerciseName.trim(),
      weight: parseFloat(weight),
      sets: sets ? parseInt(sets) : undefined,
      reps: reps ? parseInt(reps) : undefined,
      notes: notes.trim() || undefined,
    });

    setOpenEditDialog(false);
    setEditingExercise(null);
    setExerciseName('');
    setWeight('');
    setSets('');
    setReps('');
    setNotes('');

    await new Promise(resolve => setTimeout(resolve, 50));

    // Herlaad exercises
    const exercises = getAllExercises();
    setAllExercises(exercises);
  }, [editingExercise, exerciseName, weight, sets, reps, notes]);

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

    deleteExercise(deletingExerciseId);

    setOpenDeleteDialog(false);
    setDeletingExerciseId(null);

    await new Promise(resolve => setTimeout(resolve, 50));

    // Herlaad exercises
    const exercises = getAllExercises();
    setAllExercises(exercises);
  }, [deletingExerciseId]);

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

  return (
    <PageLayout>
      <ContentCard>
        <PageTitle>Log</PageTitle>

        <Typography variant="subtitle2" color="text.secondary" fontWeight={600} sx={{ mb: 1 }}>
          Trainingen
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 3 }}>
          {sessionLogs.map((log) => {
            const schema = getSchemaById(log.schemaId);
            const dayLabel = schema?.days[log.schemaDayIndex]?.dayLabel ?? `Dag ${log.schemaDayIndex + 1}`;
            return (
              <Card
                key={log.id}
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
                        {schema?.name ?? log.schemaId} – {dayLabel}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        {formatExerciseDateShort(log.date)}
                      </Typography>
                      {log.notes?.trim() && (
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontStyle: 'italic' }}>
                          &quot;{log.notes.trim()}&quot;
                        </Typography>
                      )}
                    </Box>
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        setMenuAnchorEl(e.currentTarget);
                        setMenuExerciseId(`session-${log.id}`);
                      }}
                      sx={{ color: 'text.secondary', ml: 1 }}
                      aria-label="Menu sessie-log"
                    >
                      <MoreVertIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </CardContent>
              </Card>
            );
          })}
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
