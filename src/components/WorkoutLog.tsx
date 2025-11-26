import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Card,
  CardContent,
  TextField,
  Box,
  Typography,
  Chip,
  Fab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Autocomplete,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { addExercise, getWorkouts, getExerciseNames } from '../utils/storage';
import { Exercise } from '../types';
import { getExerciseNames as getDbExerciseNames } from '../data/exercises';

// Import Material Web Components buttons
import '@material/web/button/filled-button.js';
import '@material/web/button/text-button.js';
import '@material/web/icon/icon.js';

export const WorkoutLog = () => {
  const [exerciseName, setExerciseName] = useState('');
  const [weight, setWeight] = useState('');
  const [sets, setSets] = useState('');
  const [reps, setReps] = useState('');
  const [notes, setNotes] = useState('');
  const [todayExercises, setTodayExercises] = useState<Exercise[]>([]);
  const [exerciseSuggestions, setExerciseSuggestions] = useState<string[]>([]);
  const [openDialog, setOpenDialog] = useState(false);
  const cancelButtonRef = useRef<any>(null);
  const addButtonRef = useRef<any>(null);

  const loadTodayExercises = useCallback(() => {
    const workouts = getWorkouts();
    const today = new Date().toISOString().split('T')[0];
    const todayWorkout = workouts.find(w => w.date === today);
    const exercises = todayWorkout?.exercises || [];
    setTodayExercises(exercises);
  }, []);

  const loadExerciseSuggestions = () => {
    const dbExercises = getDbExerciseNames();
    const userExercises = getExerciseNames();
    const allExercises = [...new Set([...dbExercises, ...userExercises])].sort();
    setExerciseSuggestions(allExercises);
  };

  const handleAddExercise = useCallback(() => {
    if (!exerciseName.trim() || !weight.trim()) return;

    const exercise: Exercise = {
      id: Date.now().toString(),
      name: exerciseName.trim(),
      weight: parseFloat(weight),
      date: new Date().toISOString(),
      sets: sets ? parseInt(sets) : undefined,
      reps: reps ? parseInt(reps) : undefined,
      notes: notes.trim() || undefined,
    };

    addExercise(exercise);
    
    setExerciseName('');
    setWeight('');
    setSets('');
    setReps('');
    setNotes('');
    setOpenDialog(false);
    
    loadTodayExercises();
    loadExerciseSuggestions();
  }, [exerciseName, weight, sets, reps, notes, loadTodayExercises]);

  const handleCloseDialog = useCallback(() => {
    setOpenDialog(false);
    setExerciseName('');
    setWeight('');
    setSets('');
    setReps('');
    setNotes('');
  }, []);

  useEffect(() => {
    loadTodayExercises();
    loadExerciseSuggestions();
  }, [loadTodayExercises]);

  // Update disabled state and add event listeners for Material Web Components buttons
  useEffect(() => {
    if (!openDialog) return; // Only add listeners when dialog is open

    const cancelButton = cancelButtonRef.current;
    const addButton = addButtonRef.current;

    // Update disabled state
    if (addButton) {
      const isDisabled = !exerciseName.trim() || !weight.trim();
      addButton.disabled = isDisabled;
    }

    if (cancelButton) {
      const cancelClickHandler = () => {
        handleCloseDialog();
      };
      cancelButton.addEventListener('click', cancelClickHandler);
      // Store handler for cleanup
      (cancelButton as any)._clickHandler = cancelClickHandler;
    }
    if (addButton) {
      // Always add listener, but check disabled inside handler
      const addClickHandler = () => {
        if (!addButton?.disabled) {
          handleAddExercise();
        }
      };
      addButton.addEventListener('click', addClickHandler);
      // Store handler for cleanup
      (addButton as any)._clickHandler = addClickHandler;
    }

    return () => {
      if (cancelButton && (cancelButton as any)._clickHandler) {
        cancelButton.removeEventListener('click', (cancelButton as any)._clickHandler);
        delete (cancelButton as any)._clickHandler;
      }
      if (addButton && (addButton as any)._clickHandler) {
        addButton.removeEventListener('click', (addButton as any)._clickHandler);
        delete (addButton as any)._clickHandler;
      }
    };
  }, [openDialog, exerciseName, weight, handleCloseDialog, handleAddExercise]); // Re-add listeners when dialog opens/closes or form values change

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddExercise();
    }
  };

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto' }}>

      <Dialog 
        open={openDialog} 
        onClose={handleCloseDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Nieuwe Oefening</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <Autocomplete
              freeSolo
              options={exerciseSuggestions}
              value={exerciseName}
              onInputChange={(_, newValue) => setExerciseName(newValue)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Oefening"
                  placeholder="Bijv. Bench Press"
                  onKeyPress={handleKeyPress}
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
                onKeyPress={handleKeyPress}
                sx={{ flex: 1 }}
                inputProps={{ min: 0, step: 0.5 }}
              />
              
              <TextField
                label="Sets"
                type="number"
                value={sets}
                onChange={(e) => setSets(e.target.value)}
                onKeyPress={handleKeyPress}
                sx={{ flex: 1 }}
                inputProps={{ min: 1 }}
              />
              
              <TextField
                label="Reps"
                type="number"
                value={reps}
                onChange={(e) => setReps(e.target.value)}
                onKeyPress={handleKeyPress}
                sx={{ flex: 1 }}
                inputProps={{ min: 1 }}
              />
            </Box>

            <TextField
              label="Notitie (optioneel)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onKeyPress={handleKeyPress}
              multiline
              rows={2}
              placeholder="Bijv. last van mn schouder, ging goed, was te zwaar"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          {/* @ts-ignore - Material Web Components are web components */}
          <md-text-button ref={cancelButtonRef}>
            Annuleren
          </md-text-button>
          {/* @ts-ignore - Material Web Components are web components */}
          <md-filled-button
            ref={addButtonRef}
          >
            {/* @ts-ignore */}
            <md-icon slot="start">add</md-icon>
            Toevoegen
          </md-filled-button>
        </DialogActions>
      </Dialog>

      <Typography variant="h5" gutterBottom sx={{ mb: 3, fontWeight: 600 }}>
        Log
      </Typography>

      {todayExercises.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {todayExercises.map((exercise) => {
            return (
              <Card key={exercise.id} elevation={1}>
                <CardContent>
                  <Box sx={{ display: 'flex', gap: 2 }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                        {exercise.name}
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
                        <Chip
                          label={`${exercise.weight} kg`}
                          color="primary"
                          size="small"
                        />
                        {exercise.sets && (
                          <Chip
                            label={`${exercise.sets} ${exercise.sets === 1 ? 'set' : 'sets'}`}
                            color="secondary"
                            variant="outlined"
                            size="small"
                          />
                        )}
                        {exercise.reps && (
                          <Chip
                            label={`${exercise.reps} ${exercise.reps === 1 ? 'rep' : 'reps'}`}
                            color="secondary"
                            variant="outlined"
                            size="small"
                          />
                        )}
                      </Box>
                      {exercise.notes && String(exercise.notes).trim() ? (
                        <Box sx={{ mt: 1.5 }}>
                          <Typography 
                            variant="body2" 
                            color="text.secondary" 
                            sx={{ 
                              fontStyle: 'italic', 
                              display: 'block',
                              opacity: 0.75,
                              fontSize: '0.875rem',
                              lineHeight: 1.5
                            }}
                          >
                            &quot;{String(exercise.notes).trim()}&quot;
                          </Typography>
                        </Box>
                      ) : null}
                    </Box>
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

      <Fab
        color="primary"
        aria-label="add"
        sx={{
          position: 'fixed',
          bottom: 88,
          right: 16,
          zIndex: 1001,
        }}
        onClick={() => setOpenDialog(true)}
      >
        <AddIcon />
      </Fab>
    </Box>
  );
};
