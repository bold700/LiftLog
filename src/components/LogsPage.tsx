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
  useMediaQuery,
  useTheme,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { getWorkouts, updateExercise, deleteExercise, getExerciseNames } from '../utils/storage';
import { Exercise } from '../types';
import { getExerciseNames as getDbExerciseNames } from '../data/exercises';

// Import Material Web Components buttons
import '@material/web/button/filled-button.js';
import '@material/web/button/text-button.js';
import '@material/web/icon/icon.js';

export const LogsPage = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [todayExercises, setTodayExercises] = useState<Exercise[]>([]);
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
  const [exerciseSuggestions, setExerciseSuggestions] = useState<string[]>([]);
  const editCancelButtonRef = useRef<any>(null);
  const editSaveButtonRef = useRef<any>(null);
  const deleteCancelButtonRef = useRef<any>(null);
  const deleteConfirmButtonRef = useRef<any>(null);

  const loadExerciseSuggestions = useCallback(() => {
    const dbExercises = getDbExerciseNames();
    const userExercises = getExerciseNames();
    const allExercises = [...new Set([...dbExercises, ...userExercises])].sort();
    setExerciseSuggestions(allExercises);
  }, []);

  useEffect(() => {
    loadExerciseSuggestions();
  }, [loadExerciseSuggestions]);

  useEffect(() => {
    const loadTodayExercises = () => {
      const workouts = getWorkouts();
      const today = new Date().toISOString().split('T')[0];
      const todayWorkout = workouts.find(w => w.date === today);
      const exercises = todayWorkout?.exercises || [];
      setTodayExercises(exercises);
    };

    loadTodayExercises();
    
    // Luister naar storage events voor updates
    const handleStorageChange = () => {
      loadTodayExercises();
    };
    window.addEventListener('storage', handleStorageChange);
    
    // Ook luisteren naar custom storage events (voor updates binnen dezelfde tab)
    const handleCustomStorageChange = () => {
      loadTodayExercises();
    };
    window.addEventListener('workoutUpdated', handleCustomStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('workoutUpdated', handleCustomStorageChange);
    };
  }, []);

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
    setExerciseName(exercise.name);
    setWeight(exercise.weight.toString());
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
    const workouts = getWorkouts();
    const today = new Date().toISOString().split('T')[0];
    const todayWorkout = workouts.find(w => w.date === today);
    const exercises = todayWorkout?.exercises || [];
    setTodayExercises(exercises);
    
    loadExerciseSuggestions();
  }, [editingExercise, exerciseName, weight, sets, reps, notes, loadExerciseSuggestions]);

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
    const workouts = getWorkouts();
    const today = new Date().toISOString().split('T')[0];
    const todayWorkout = workouts.find(w => w.date === today);
    const exercises = todayWorkout?.exercises || [];
    setTodayExercises(exercises);
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

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto', pb: 10 }}>
      <Box sx={{ display: 'flex', justifyContent: 'center', mb: 4 }}>
        <Box
          component="svg"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 1260.31 837.16"
          sx={{
            height: { xs: 60, sm: 80 },
            width: 'auto',
            color: 'text.primary',
          }}
        >
          <path
            fill="currentColor"
            d="M1260.31,837.16,887,0H746L445.75,673.28,145.49,0H0L373,836.4l-.34.76H518.84l-.34-.76,85.21-195,423.83,4,87.27,191.81ZM665.08,507.72l151.41-339.5,151.4,339.5Z"
          />
        </Box>
      </Box>

      {/* Log container card met Spiergroepen styling */}
      <Card sx={{ mb: 3, backgroundColor: '#FEF2E5', borderRadius: '16px' }} elevation={0}>
        <CardContent>
          <Typography variant="h5" gutterBottom sx={{ mb: 3, fontWeight: 600 }}>
            Log
          </Typography>

          {todayExercises.length > 0 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {todayExercises.map((exercise) => {
                const exerciseDate = new Date(exercise.date);
                const isToday = exerciseDate.toISOString().split('T')[0] === new Date().toISOString().split('T')[0];
                const dateStr = exerciseDate.toLocaleDateString('nl-NL', { 
                  weekday: 'short',
                  year: 'numeric',
                  month: 'short', 
                  day: 'numeric' 
                });
                
                const details = [
                  `${exercise.weight} kg`,
                  exercise.sets && `${exercise.sets} ${exercise.sets === 1 ? 'set' : 'sets'}`,
                  exercise.reps && `${exercise.reps} ${exercise.reps === 1 ? 'rep' : 'reps'}`
                ].filter(Boolean).join(' | ');

                return (
                  <Card 
                    key={exercise.id}
                    sx={{ 
                      backgroundColor: 'transparent', 
                      borderRadius: '16px',
                      border: '1px solid #D2C5B4',
                      elevation: 0,
                      m: 0,
                      boxShadow: 'none'
                    }}
                  >
                    <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                            {exercise.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                            {isToday ? `Vandaag, ${exerciseDate.toLocaleDateString('nl-NL', { month: 'short', day: 'numeric' })}` : dateStr}
                          </Typography>
                          <Typography variant="body2" color="text.primary">
                            {details}
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
                );
              })}
            </Box>
          )}

          {todayExercises.length === 0 && (
            <Typography variant="body1" color="text.secondary" align="center" sx={{ py: 4 }}>
              Nog geen oefeningen gelogd vandaag. Begin met het toevoegen van je eerste oefening!
            </Typography>
          )}
        </CardContent>
      </Card>

      {/* Menu voor edit/delete */}
      <Menu
        anchorEl={menuAnchorEl}
        open={Boolean(menuAnchorEl)}
        onClose={handleMenuClose}
      >
        {menuExerciseId && todayExercises.find(ex => ex.id === menuExerciseId) && (
          <>
            <MenuItem
              onClick={() => handleEditExercise(todayExercises.find(ex => ex.id === menuExerciseId)!)}
            >
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
        )}
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
    </Box>
  );
};

