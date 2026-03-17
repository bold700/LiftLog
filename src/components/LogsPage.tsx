import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  IconButton,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Autocomplete,
  FormControl,
  InputLabel,
  Select,
  Button,
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
import { useExerciseSuggestions } from '../hooks/useExerciseSuggestions';
import { designTokens } from '../theme/designTokens';
import { PageLayout, ContentCard, PageTitle, EmptyState } from './layout';

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
  const exerciseSuggestions = useExerciseSuggestions();
  const editCancelButtonRef = useRef<any>(null);
  const editSaveButtonRef = useRef<any>(null);
  const deleteCancelButtonRef = useRef<any>(null);
  const deleteConfirmButtonRef = useRef<any>(null);

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

  // Event listeners voor edit dialog
  useEffect(() => {
    if (!openEditDialog) return;

    requestAnimationFrame(() => {
      const cancelButton = editCancelButtonRef.current;
      const saveButton = editSaveButtonRef.current;

      if (saveButton) {
        const isDisabled = !exerciseName.trim() || !weight.trim();
        saveButton.disabled = isDisabled;
        
        const updateDisabled = () => {
          const isDisabled = !exerciseName.trim() || !weight.trim();
          saveButton.disabled = isDisabled;
        };
        
        const intervalId = setInterval(updateDisabled, 100);
        (saveButton as any)._intervalId = intervalId;
      }

      if (cancelButton) {
        const cancelClickHandler = () => handleCloseEditDialog();
        cancelButton.addEventListener('click', cancelClickHandler);
        (cancelButton as any)._clickHandler = cancelClickHandler;
      }
      if (saveButton) {
        const saveClickHandler = async () => {
          if (!saveButton?.disabled) {
            await handleSaveEdit();
          }
        };
        saveButton.addEventListener('click', saveClickHandler);
        (saveButton as any)._clickHandler = saveClickHandler;
      }
    });

    return () => {
      requestAnimationFrame(() => {
        const cancelButton = editCancelButtonRef.current;
        const saveButton = editSaveButtonRef.current;
        
        if (cancelButton && (cancelButton as any)._clickHandler) {
          cancelButton.removeEventListener('click', (cancelButton as any)._clickHandler);
          delete (cancelButton as any)._clickHandler;
        }
        if (saveButton) {
          if ((saveButton as any)._clickHandler) {
            saveButton.removeEventListener('click', (saveButton as any)._clickHandler);
            delete (saveButton as any)._clickHandler;
          }
          if ((saveButton as any)._intervalId) {
            clearInterval((saveButton as any)._intervalId);
            delete (saveButton as any)._intervalId;
          }
        }
      });
    };
  }, [openEditDialog, exerciseName, weight, handleCloseEditDialog, handleSaveEdit]);

  // Event listeners voor delete dialog
  useEffect(() => {
    if (!openDeleteDialog) return;

    requestAnimationFrame(() => {
      const cancelButton = deleteCancelButtonRef.current;
      const confirmButton = deleteConfirmButtonRef.current;

      if (cancelButton) {
        const cancelClickHandler = () => handleCloseDeleteDialog();
        cancelButton.addEventListener('click', cancelClickHandler);
        (cancelButton as any)._clickHandler = cancelClickHandler;
      }
      if (confirmButton) {
        const confirmClickHandler = async () => {
          await handleConfirmDelete();
        };
        confirmButton.addEventListener('click', confirmClickHandler);
        (confirmButton as any)._clickHandler = confirmClickHandler;
      }
    });

    return () => {
      requestAnimationFrame(() => {
        const cancelButton = deleteCancelButtonRef.current;
        const confirmButton = deleteConfirmButtonRef.current;
        
        if (cancelButton && (cancelButton as any)._clickHandler) {
          cancelButton.removeEventListener('click', (cancelButton as any)._clickHandler);
          delete (cancelButton as any)._clickHandler;
        }
        if (confirmButton && (confirmButton as any)._clickHandler) {
          confirmButton.removeEventListener('click', (confirmButton as any)._clickHandler);
          delete (confirmButton as any)._clickHandler;
        }
      });
    };
  }, [openDeleteDialog, handleCloseDeleteDialog, handleConfirmDelete]);

  const selectedSchemaForSessionLog = sessionLogSchemaId ? getSchemaById(sessionLogSchemaId) : null;

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
      <Dialog 
        open={openEditDialog} 
        onClose={handleCloseEditDialog}
        maxWidth="sm"
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle>Oefening Bewerken</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <Autocomplete
              freeSolo
              options={exerciseSuggestions}
              value={exerciseName}
              onChange={(_, newValue) => {
                if (typeof newValue === 'string') {
                  setExerciseName(newValue);
                } else if (newValue) {
                  setExerciseName(newValue);
                }
              }}
              onInputChange={(_, newValue) => setExerciseName(newValue)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Oefening"
                  placeholder="Zoek of kies een oefening..."
                  autoFocus
                />
              )}
            />

            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Gewicht (kg)"
                type="number"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                sx={{ flex: 1 }}
                inputProps={{ min: 0, step: 0.5 }}
              />
              
              <TextField
                label="Sets"
                type="number"
                value={sets}
                onChange={(e) => setSets(e.target.value)}
                sx={{ flex: 1 }}
                inputProps={{ min: 1 }}
              />
              
              <TextField
                label="Reps"
                type="number"
                value={reps}
                onChange={(e) => setReps(e.target.value)}
                sx={{ flex: 1 }}
                inputProps={{ min: 1 }}
              />
            </Box>

            <TextField
              label="Notitie (optioneel)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Bijv. last van mn schouder, ging goed, was te zwaar"
              multiline
              rows={2}
            />
            
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2, pt: 2 }}>
              {/* @ts-ignore - Material Web Components are web components */}
              <md-text-button ref={editCancelButtonRef}>
                Annuleren
              </md-text-button>
              {/* @ts-ignore - Material Web Components are web components */}
              <md-filled-button ref={editSaveButtonRef}>
                {/* @ts-ignore */}
                <md-icon slot="start">save</md-icon>
                Opslaan
              </md-filled-button>
            </Box>
          </Box>
        </DialogContent>
      </Dialog>

      {/* Dialog voor verwijderen bevestiging */}
      <Dialog 
        open={openDeleteDialog} 
        onClose={handleCloseDeleteDialog}
        maxWidth="sm"
      >
        <DialogTitle>Oefening Verwijderen</DialogTitle>
        <DialogContent>
          <Typography variant="body1">
            Weet je zeker dat je deze oefening wilt verwijderen? Deze actie kan niet ongedaan worden gemaakt.
          </Typography>
        </DialogContent>
        <DialogActions>
          {/* @ts-ignore - Material Web Components are web components */}
          <md-text-button ref={deleteCancelButtonRef}>
            Annuleren
          </md-text-button>
          {/* @ts-ignore - Material Web Components are web components */}
          <md-filled-button
            ref={deleteConfirmButtonRef}
            style={{ '--md-filled-button-container-color': '#BA1A1A' } as any}
          >
            {/* @ts-ignore */}
            <md-icon slot="start">delete</md-icon>
            Verwijderen
          </md-filled-button>
        </DialogActions>
      </Dialog>

      {/* Dialog training log toevoegen/bewerken */}
      <Dialog
        open={openSessionLogDialog !== null}
        onClose={closeSessionLogDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{openSessionLogDialog === 'edit' ? 'Training log bewerken' : 'Training log toevoegen'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              label="Datum"
              type="date"
              value={sessionLogDate}
              onChange={(e) => setSessionLogDate(e.target.value)}
              size="small"
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            <FormControl size="small" fullWidth>
              <InputLabel id="session-log-schema-label">Workout</InputLabel>
              <Select
                labelId="session-log-schema-label"
                label="Workout"
                value={sessionLogSchemaId}
                onChange={(e) => {
                  setSessionLogSchemaId(e.target.value);
                  setSessionLogDayIndex(0);
                }}
              >
                {schemas.map((s) => (
                  <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            {selectedSchemaForSessionLog && selectedSchemaForSessionLog.days.length > 0 && (
              <FormControl size="small" fullWidth>
                <InputLabel id="session-log-day-label">Trainingsdag</InputLabel>
                <Select
                  labelId="session-log-day-label"
                  label="Trainingsdag"
                  value={sessionLogDayIndex}
                  onChange={(e) => setSessionLogDayIndex(Number(e.target.value))}
                >
                  {selectedSchemaForSessionLog.days.map((d, idx) => (
                    <MenuItem key={idx} value={idx}>{d.dayLabel}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            <TextField
              label="Notitie (optioneel)"
              value={sessionLogNotes}
              onChange={(e) => setSessionLogNotes(e.target.value)}
              placeholder="Bijv. goede sessie, moe aan het eind"
              multiline
              rows={3}
              size="small"
              fullWidth
            />
            <Box sx={{ display: 'flex', gap: 2, mt: 3, justifyContent: 'flex-end' }}>
              <Button
                variant="text"
                onClick={closeSessionLogDialog}
                disableElevation
                sx={{
                  color: '#000000',
                  borderRadius: '20px',
                  textTransform: 'none',
                  fontWeight: 500,
                  minHeight: 40,
                  px: 2,
                  '&:hover': { bgcolor: 'rgba(0,0,0,0.04)' },
                }}
              >
                Annuleren
              </Button>
              <Button
                variant="contained"
                onClick={saveSessionLogFromDialog}
                disabled={!sessionLogSchemaId}
                disableElevation
                sx={{
                  bgcolor: '#000000',
                  color: '#F2E4D3',
                  borderRadius: '20px',
                  textTransform: 'none',
                  fontWeight: 500,
                  minHeight: 40,
                  px: 2,
                  '&:hover': { bgcolor: '#1a1a1a' },
                  '&.Mui-disabled': {
                    bgcolor: 'rgba(0,0,0,0.12)',
                    color: 'rgba(29,27,26,0.38)',
                  },
                }}
              >
                Opslaan
              </Button>
            </Box>
          </Box>
        </DialogContent>
      </Dialog>

      {/* Dialog sessie-log verwijderen */}
      <Dialog
        open={openDeleteSessionLogDialog}
        onClose={() => { setOpenDeleteSessionLogDialog(false); setDeletingSessionLogId(null); }}
        maxWidth="sm"
      >
        <DialogTitle>Training log verwijderen</DialogTitle>
        <DialogContent>
          <Typography variant="body1">
            Weet je zeker dat je deze training log wilt verwijderen?
          </Typography>
        </DialogContent>
        <DialogActions>
          <md-text-button onClick={() => { setOpenDeleteSessionLogDialog(false); setDeletingSessionLogId(null); }}>
            Annuleren
          </md-text-button>
          <md-filled-button
            onClick={confirmDeleteSessionLog}
            style={{ '--md-filled-button-container-color': '#BA1A1A' } as any}
          >
            <md-icon slot="start">delete</md-icon>
            Verwijderen
          </md-filled-button>
        </DialogActions>
      </Dialog>
    </PageLayout>
  );
};

