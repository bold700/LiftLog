import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Card,
  CardContent,
  Box,
  Typography,
  TextField,
  Autocomplete,
} from '@mui/material';
import { addExercise, getExerciseNames } from '../utils/storage';
import { Exercise } from '../types';
import { getExerciseNames as getDbExerciseNames } from '../data/exercises';

// Import Material Web Components buttons
import '@material/web/button/filled-button.js';
import '@material/web/button/text-button.js';
import '@material/web/icon/icon.js';

interface AddPageProps {
  onExerciseAdded?: () => void;
}

export const AddPage = ({ onExerciseAdded }: AddPageProps) => {
  const [exerciseName, setExerciseName] = useState('');
  const [weight, setWeight] = useState('');
  const [sets, setSets] = useState('');
  const [reps, setReps] = useState('');
  const [notes, setNotes] = useState('');
  const [exerciseSuggestions, setExerciseSuggestions] = useState<string[]>([]);
  const cancelButtonRef = useRef<any>(null);
  const addButtonRef = useRef<any>(null);

  const loadExerciseSuggestions = () => {
    const dbExercises = getDbExerciseNames();
    const userExercises = getExerciseNames();
    const allExercises = [...new Set([...dbExercises, ...userExercises])].sort();
    setExerciseSuggestions(allExercises);
  };

  useEffect(() => {
    loadExerciseSuggestions();
  }, []);

  const handleAddExercise = useCallback(async () => {
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
    
    if (onExerciseAdded) {
      onExerciseAdded();
    }
  }, [exerciseName, weight, sets, reps, notes, onExerciseAdded]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddExercise();
    }
  };

  // Update disabled state and add event listeners for Material Web Components buttons
  useEffect(() => {
    const cancelButton = cancelButtonRef.current;
    const addButton = addButtonRef.current;

    // Update disabled state
    if (addButton) {
      const isDisabled = !exerciseName.trim() || !weight.trim();
      addButton.disabled = isDisabled;
      
      const updateDisabled = () => {
        const isDisabled = !exerciseName.trim() || !weight.trim();
        addButton.disabled = isDisabled;
      };
      
      const intervalId = setInterval(updateDisabled, 100);
      (addButton as any)._intervalId = intervalId;
    }

    if (cancelButton) {
      const cancelClickHandler = () => {
        setExerciseName('');
        setWeight('');
        setSets('');
        setReps('');
        setNotes('');
      };
      cancelButton.addEventListener('click', cancelClickHandler);
      (cancelButton as any)._clickHandler = cancelClickHandler;
    }
    if (addButton) {
      const addClickHandler = async () => {
        if (!addButton?.disabled) {
          await handleAddExercise();
        }
      };
      addButton.addEventListener('click', addClickHandler);
      (addButton as any)._clickHandler = addClickHandler;
    }

    return () => {
      if (cancelButton && (cancelButton as any)._clickHandler) {
        cancelButton.removeEventListener('click', (cancelButton as any)._clickHandler);
        delete (cancelButton as any)._clickHandler;
      }
      if (addButton) {
        if ((addButton as any)._clickHandler) {
          addButton.removeEventListener('click', (addButton as any)._clickHandler);
          delete (addButton as any)._clickHandler;
        }
        if ((addButton as any)._intervalId) {
          clearInterval((addButton as any)._intervalId);
          delete (addButton as any)._intervalId;
        }
      }
    };
  }, [exerciseName, weight, handleAddExercise]);

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto', pb: 10 }}>

      <Card sx={{ mb: 3, backgroundColor: '#FEF2E5', borderRadius: '16px' }} elevation={0}>
        <CardContent>
          <Typography variant="h5" gutterBottom sx={{ mb: 3, fontWeight: 600 }}>
            Nieuwe Oefening
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
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

          <Box sx={{ display: 'flex', gap: 2, mt: 3, justifyContent: 'flex-end' }}>
            {/* @ts-ignore - Material Web Components are web components */}
            <md-text-button ref={cancelButtonRef}>
              Wissen
            </md-text-button>
            {/* @ts-ignore - Material Web Components are web components */}
            <md-filled-button ref={addButtonRef}>
              {/* @ts-ignore */}
              <md-icon slot="start">add</md-icon>
              Toevoegen
            </md-filled-button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};

