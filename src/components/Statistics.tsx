import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Autocomplete,
  TextField,
  useTheme,
  useMediaQuery,
  Chip,
  Fab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import IconButton from '@mui/material/IconButton';
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
} from 'recharts';
import { getAllExercisesByName, getExerciseNames, getWorkouts, addExercise, updateExercise, deleteExercise, getAllExercises } from '../utils/storage';
import { Exercise } from '../types';
import { getExerciseImageUrl } from '../utils/exercisedb';
import { findExerciseMetadata, getAllExerciseNames } from '../data/exerciseMetadata';

// Import Material Web Components buttons
import '@material/web/button/filled-button.js';
import '@material/web/button/text-button.js';
import '@material/web/icon/icon.js';

interface ChartData {
  date: string;
  gewicht: number;
  volume?: number; // sets × reps × gewicht
}

export const Statistics = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
  const [exerciseNames, setExerciseNames] = useState<string[]>([]);
  const [chartData, setChartData] = useState<ChartData[]>([]);
  
  // WorkoutLog state
  const [exerciseName, setExerciseName] = useState('');
  const [weight, setWeight] = useState('');
  const [sets, setSets] = useState('');
  const [reps, setReps] = useState('');
  const [notes, setNotes] = useState('');
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [exerciseSuggestions, setExerciseSuggestions] = useState<string[]>([]);
  const [openDialog, setOpenDialog] = useState(false);
  const [openEditDialog, setOpenEditDialog] = useState(false);
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);
  const [deletingExerciseId, setDeletingExerciseId] = useState<string | null>(null);
  const [exerciseImages, setExerciseImages] = useState<Record<string, string | null>>({});
  const cancelButtonRef = useRef<any>(null);
  const addButtonRef = useRef<any>(null);
  const editCancelButtonRef = useRef<any>(null);
  const editSaveButtonRef = useRef<any>(null);
  const deleteCancelButtonRef = useRef<any>(null);
  const deleteConfirmButtonRef = useRef<any>(null);

  useEffect(() => {
    const loggedNames = getExerciseNames();
    setExerciseNames(loggedNames);
    if (loggedNames.length > 0 && !selectedExercise) {
      setSelectedExercise(loggedNames[0]);
    }
    loadAllExercises();
    loadExerciseSuggestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedExercise) {
      const exercises = getAllExercisesByName(selectedExercise);
      const data: ChartData[] = exercises.map(ex => {
        const volume = (ex.sets && ex.reps) ? ex.sets * ex.reps * ex.weight : undefined;
        return {
          date: new Date(ex.date).toLocaleDateString('nl-NL', { 
            month: 'short', 
            day: 'numeric' 
          }),
          gewicht: ex.weight,
          volume,
        };
      });
      setChartData(data);
    }
  }, [selectedExercise]);

  const loadAllExercises = async () => {
    const exercises = getAllExercises();
    setAllExercises(exercises);

    // Haal afbeeldingen op voor alle oefeningen
    const imageMap: Record<string, string | null> = {};
    await Promise.all(
      exercises.map(async (exercise) => {
        if (!exerciseImages[exercise.name]) {
          const imageUrl = await getExerciseImageUrl(exercise.name);
          imageMap[exercise.name] = imageUrl;
        } else {
          imageMap[exercise.name] = exerciseImages[exercise.name];
        }
      })
    );
    setExerciseImages(prev => ({ ...prev, ...imageMap }));
  };

  const loadExerciseSuggestions = () => {
    // Haal alle oefeningen uit metadata database (inclusief alternatieve namen)
    const metadataExercises = getAllExerciseNames();
    // Haal user-logged oefeningen op (voor personalisatie)
    const userExercises = getExerciseNames();
    // Combineer en verwijder duplicaten, sorteer
    const allExercises = [...new Set([...metadataExercises, ...userExercises])].sort();
    setExerciseSuggestions(allExercises);
  };

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
    setOpenDialog(false);
    
    // Wacht even om te zorgen dat localStorage is ge-updatet
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Direct de exercises state updaten voor snelle UI refresh
    const exercises = getAllExercises();
    setAllExercises(exercises);
    
    // Laad afbeelding voor nieuwe oefening als die er nog niet is
    if (!exerciseImages[exercise.name]) {
      const imageUrl = await getExerciseImageUrl(exercise.name);
      if (imageUrl) {
        setExerciseImages(prev => ({ ...prev, [exercise.name]: imageUrl }));
      }
    }
    
    loadExerciseSuggestions();
    
    // Update exerciseNames voor statistieken
    const loggedNames = getExerciseNames();
    setExerciseNames(loggedNames);
    
    // Update selectedExercise als nodig
    if (!selectedExercise || !loggedNames.includes(selectedExercise)) {
      if (loggedNames.length > 0) {
        setSelectedExercise(loggedNames[0]);
      }
    } else if (selectedExercise && loggedNames.includes(selectedExercise)) {
      // Forceer re-render van chart
      const current = selectedExercise;
      setSelectedExercise(null);
      setTimeout(() => setSelectedExercise(current), 0);
    }
  }, [exerciseName, weight, sets, reps, notes, selectedExercise, exerciseImages]);

  const handleEditExercise = (exercise: Exercise) => {
    setEditingExercise(exercise);
    setExerciseName(exercise.name);
    setWeight(exercise.weight.toString());
    setSets(exercise.sets?.toString() || '');
    setReps(exercise.reps?.toString() || '');
    setNotes(exercise.notes || '');
    setOpenEditDialog(true);
  };

  const handleSaveEdit = useCallback(async () => {
    if (!editingExercise || !exerciseName.trim() || !weight.trim()) {
      console.warn('Cannot save: missing exercise or invalid data');
      return;
    }

    console.log('Updating exercise:', editingExercise.id, {
      name: exerciseName.trim(),
      weight: parseFloat(weight),
      sets: sets ? parseInt(sets) : undefined,
      reps: reps ? parseInt(reps) : undefined,
      notes: notes.trim() || undefined,
    });

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
    
    // Wacht even om te zorgen dat localStorage is ge-updatet
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Herlaad alle exercises
    const exercises = getAllExercises();
    setAllExercises(exercises);
    
    loadExerciseSuggestions();
    
    // Update exerciseNames voor statistieken
    const loggedNames = getExerciseNames();
    setExerciseNames(loggedNames);
    
    // Update selectedExercise als nodig - forceer re-render
    if (selectedExercise && loggedNames.includes(selectedExercise)) {
      const current = selectedExercise;
      setSelectedExercise(null);
      setTimeout(() => setSelectedExercise(current), 0);
    }
  }, [editingExercise, exerciseName, weight, sets, reps, notes, selectedExercise]);

  const handleCloseEditDialog = useCallback(() => {
    setOpenEditDialog(false);
    setEditingExercise(null);
    setExerciseName('');
    setWeight('');
    setSets('');
    setReps('');
    setNotes('');
  }, []);

  const handleDeleteExercise = (exerciseId: string) => {
    setDeletingExerciseId(exerciseId);
    setOpenDeleteDialog(true);
  };

  const handleConfirmDelete = useCallback(async () => {
    if (!deletingExerciseId) return;

    console.log('Deleting exercise:', deletingExerciseId);
    deleteExercise(deletingExerciseId);
    
    setOpenDeleteDialog(false);
    setDeletingExerciseId(null);
    
    // Wacht even om te zorgen dat localStorage is ge-updatet
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Herlaad alle exercises
    const exercises = getAllExercises();
    setAllExercises(exercises);
    
    // Update images cache - verwijder image van verwijderde oefening
    setExerciseImages(prev => {
      const updated = { ...prev };
      // Verwijder images van oefeningen die niet meer bestaan
      const existingNames = new Set(exercises.map(ex => ex.name));
      Object.keys(updated).forEach(name => {
        if (!existingNames.has(name)) {
          delete updated[name];
        }
      });
      return updated;
    });
    
    // Update exerciseNames voor statistieken
    const loggedNames = getExerciseNames();
    setExerciseNames(loggedNames);
    
    // Update selectedExercise als nodig
    if (selectedExercise && !loggedNames.includes(selectedExercise)) {
      if (loggedNames.length > 0) {
        setSelectedExercise(loggedNames[0]);
      } else {
        setSelectedExercise(null);
      }
    } else if (selectedExercise) {
      // Forceer re-render van chart door state te updaten
      const current = selectedExercise;
      setSelectedExercise(null);
      setTimeout(() => setSelectedExercise(current), 0);
    }
  }, [deletingExerciseId, selectedExercise]);

  const handleCloseDeleteDialog = useCallback(() => {
    setOpenDeleteDialog(false);
    setDeletingExerciseId(null);
  }, []);

  const handleCloseDialog = useCallback(() => {
    setOpenDialog(false);
    setExerciseName('');
    setWeight('');
    setSets('');
    setReps('');
    setNotes('');
  }, []);

  // Update disabled state and add event listeners for Material Web Components buttons
  useEffect(() => {
    if (!openDialog) return;

    // Use requestAnimationFrame om te zorgen dat de DOM elementen er zijn
    requestAnimationFrame(() => {
      const cancelButton = cancelButtonRef.current;
      const addButton = addButtonRef.current;

      // Update disabled state
      if (addButton) {
        const isDisabled = !exerciseName.trim() || !weight.trim();
        addButton.disabled = isDisabled;
        
        // Update disabled state bij elke verandering
        const updateDisabled = () => {
          const isDisabled = !exerciseName.trim() || !weight.trim();
          addButton.disabled = isDisabled;
        };
        
        // Update disabled state periodiek
        const intervalId = setInterval(updateDisabled, 100);
        (addButton as any)._intervalId = intervalId;
      }

      if (cancelButton) {
        const cancelClickHandler = (e: Event) => {
          e.preventDefault();
          e.stopPropagation();
          console.log('Cancel clicked');
          handleCloseDialog();
        };
        cancelButton.addEventListener('click', cancelClickHandler);
        (cancelButton as any)._clickHandler = cancelClickHandler;
      }
      if (addButton) {
        const addClickHandler = async (e: Event) => {
          e.preventDefault();
          e.stopPropagation();
          console.log('Add clicked');
          if (!addButton?.disabled) {
            await handleAddExercise();
          }
        };
        addButton.addEventListener('click', addClickHandler);
        (addButton as any)._clickHandler = addClickHandler;
      }
    });

    return () => {
      requestAnimationFrame(() => {
        const cancelButton = cancelButtonRef.current;
        const addButton = addButtonRef.current;
        
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
      });
    };
  }, [openDialog, exerciseName, weight, handleCloseDialog, handleAddExercise]);

  // Event listeners voor edit dialog
  useEffect(() => {
    if (!openEditDialog) return;

    // Use requestAnimationFrame om te zorgen dat de DOM elementen er zijn
    requestAnimationFrame(() => {
      const cancelButton = editCancelButtonRef.current;
      const saveButton = editSaveButtonRef.current;

      if (saveButton) {
        const isDisabled = !exerciseName.trim() || !weight.trim();
        saveButton.disabled = isDisabled;
        
        // Update disabled state bij elke verandering
        const updateDisabled = () => {
          const isDisabled = !exerciseName.trim() || !weight.trim();
          saveButton.disabled = isDisabled;
        };
        
        // Update disabled state periodiek
        const intervalId = setInterval(updateDisabled, 100);
        (saveButton as any)._intervalId = intervalId;
      }

      if (cancelButton) {
        const cancelClickHandler = (e: Event) => {
          e.preventDefault();
          e.stopPropagation();
          console.log('Edit cancel clicked');
          handleCloseEditDialog();
        };
        cancelButton.addEventListener('click', cancelClickHandler);
        (cancelButton as any)._clickHandler = cancelClickHandler;
      }
      if (saveButton) {
        const saveClickHandler = async (e: Event) => {
          e.preventDefault();
          e.stopPropagation();
          console.log('Edit save clicked');
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

    // Use requestAnimationFrame om te zorgen dat de DOM elementen er zijn
    requestAnimationFrame(() => {
      const cancelButton = deleteCancelButtonRef.current;
      const confirmButton = deleteConfirmButtonRef.current;

      if (cancelButton) {
        const cancelClickHandler = (e: Event) => {
          e.preventDefault();
          e.stopPropagation();
          console.log('Delete cancel clicked');
          handleCloseDeleteDialog();
        };
        cancelButton.addEventListener('click', cancelClickHandler);
        (cancelButton as any)._clickHandler = cancelClickHandler;
      }
      if (confirmButton) {
        const confirmClickHandler = async (e: Event) => {
          e.preventDefault();
          e.stopPropagation();
          console.log('Delete confirm clicked, calling handleConfirmDelete');
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

  const handleKeyPress = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && exerciseName.trim() && weight.trim()) {
      await handleAddExercise();
    }
  };

  const stats = useMemo(() => {
    if (!selectedExercise || chartData.length === 0) return null;

    const weights = chartData.map(d => d.gewicht);
    const max = Math.max(...weights);
    const latest = weights[weights.length - 1];
    const first = weights[0];
    const improvement = latest - first;

    // Volume calculations
    const volumes = chartData.map(d => d.volume).filter((v): v is number => v !== undefined);
    const maxVolume = volumes.length > 0 ? Math.max(...volumes) : undefined;
    const latestVolume = volumes.length > 0 ? volumes[volumes.length - 1] : undefined;
    const firstVolume = volumes.length > 0 ? volumes[0] : undefined;
    const volumeImprovement = (latestVolume !== undefined && firstVolume !== undefined) 
      ? latestVolume - firstVolume 
      : undefined;

    return {
      max,
      latest,
      first,
      improvement,
      totalWorkouts: chartData.length,
      maxVolume,
      latestVolume,
      firstVolume,
      volumeImprovement,
      hasVolumeData: volumes.length > 0,
    };
  }, [selectedExercise, chartData]);

  const allWorkouts = useMemo(() => {
    return getWorkouts();
  }, [selectedExercise]);

  // Algemene statistieken voor wanneer er geen specifieke oefening is geselecteerd
  const overallStats = useMemo(() => {
    const exercises = getAllExercises();
    if (exercises.length === 0) return null;

    // Bereken gemiddelden en totalen
    const totalWeight = exercises.reduce((sum, ex) => sum + ex.weight, 0);
    const avgWeight = totalWeight / exercises.length;
    const maxWeight = Math.max(...exercises.map(ex => ex.weight));
    const minWeight = Math.min(...exercises.map(ex => ex.weight));

    // Volume berekenen
    const volumes = exercises
      .filter(ex => ex.sets && ex.reps)
      .map(ex => ex.sets! * ex.reps! * ex.weight);
    const totalVolume = volumes.reduce((sum, vol) => sum + vol, 0);
    const avgVolume = volumes.length > 0 ? totalVolume / volumes.length : 0;
    const maxVolume = volumes.length > 0 ? Math.max(...volumes) : 0;

    // Meest gedane oefeningen
    const exerciseCounts: Record<string, number> = {};
    exercises.forEach(ex => {
      exerciseCounts[ex.name] = (exerciseCounts[ex.name] || 0) + 1;
    });
    const topExercises = Object.entries(exerciseCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    // Unieke oefeningen
    const uniqueExercises = new Set(exercises.map(ex => ex.name)).size;

    // Workouts per dag/week
    const workoutDates = allWorkouts.map(w => w.date).sort();
    const uniqueDays = new Set(workoutDates).size;
    const daysSinceFirst = workoutDates.length > 0 
      ? Math.ceil((new Date().getTime() - new Date(workoutDates[0]).getTime()) / (1000 * 60 * 60 * 24))
      : 0;
    const workoutsPerDay = daysSinceFirst > 0 ? (allWorkouts.length / Math.max(daysSinceFirst, 1)) : 0;

    return {
      totalExercises: exercises.length,
      uniqueExercises,
      avgWeight: avgWeight.toFixed(1),
      maxWeight,
      minWeight,
      totalVolume: totalVolume.toLocaleString('nl-NL'),
      avgVolume: avgVolume > 0 ? avgVolume.toLocaleString('nl-NL', { maximumFractionDigits: 0 }) : 0,
      maxVolume: maxVolume > 0 ? maxVolume.toLocaleString('nl-NL', { maximumFractionDigits: 0 }) : 0,
      topExercises,
      totalWorkouts: allWorkouts.length,
      uniqueDays,
      workoutsPerDay: workoutsPerDay.toFixed(1),
      hasVolumeData: volumes.length > 0,
    };
  }, [allExercises.length, allWorkouts.length]);

  // Nieuwe inzichten: spiergroepen, bewegingstypes, push/pull ratio
  const insights = useMemo(() => {
    const exercises = getAllExercises();
    
    // Tel spiergroepen
    const primaryMuscleCounts: Record<string, number> = {};
    const secondaryMuscleCounts: Record<string, number> = {};
    const movementTypeCounts: Record<string, number> = {};
    let pushCount = 0;
    let pullCount = 0;
    const unmatchedExercises: string[] = [];
    
    exercises.forEach(exercise => {
      const metadata = findExerciseMetadata(exercise.name);
      if (metadata) {
        // Tel primaire spiergroepen
        metadata.primaryMuscles.forEach(muscle => {
          primaryMuscleCounts[muscle] = (primaryMuscleCounts[muscle] || 0) + 1;
        });
        
        // Tel secundaire spiergroepen
        metadata.secondaryMuscles.forEach(muscle => {
          secondaryMuscleCounts[muscle] = (secondaryMuscleCounts[muscle] || 0) + 1;
        });
        
        // Tel bewegingstypes
        movementTypeCounts[metadata.movementType] = (movementTypeCounts[metadata.movementType] || 0) + 1;
        
        // Tel push/pull
        if (metadata.movementType === 'Push') pushCount++;
        if (metadata.movementType === 'Pull') pullCount++;
      } else {
        unmatchedExercises.push(exercise.name);
      }
    });
    
    // Debug logging
    console.log('Push/Pull Ratio Debug:', {
      totalExercises: exercises.length,
      matchedExercises: exercises.length - unmatchedExercises.length,
      unmatchedExercises,
      pushCount,
      pullCount,
      movementTypeCounts,
    });
    
    // Sorteer spiergroepen op frequentie
    const topPrimaryMuscles = Object.entries(primaryMuscleCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([muscle, count]) => ({ muscle, count }));
    
    const topSecondaryMuscles = Object.entries(secondaryMuscleCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([muscle, count]) => ({ muscle, count }));
    
    // Bereken push/pull ratio
    const totalPushPull = pushCount + pullCount;
    const pushPullRatio = totalPushPull > 0 
      ? {
          push: Math.round((pushCount / totalPushPull) * 100),
          pull: Math.round((pullCount / totalPushPull) * 100),
        }
      : null;
    
    return {
      topPrimaryMuscles,
      topSecondaryMuscles,
      movementTypeCounts,
      pushPullRatio,
      pushCount,
      pullCount,
      totalExercises: exercises.length,
      exercisesWithMetadata: exercises.filter(ex => findExerciseMetadata(ex.name) !== null).length,
    };
  }, [allExercises.length]);

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
      {/* Logo bovenaan */}
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

      {/* Dialog voor nieuwe oefening */}
      <Dialog 
        open={openDialog} 
        onClose={handleCloseDialog}
        maxWidth="sm"
        fullWidth
        fullScreen={isMobile}
        sx={{
          '& .MuiDialog-container': {
            alignItems: { xs: 'flex-start', sm: 'center' },
            paddingTop: { xs: '0', sm: '48px' },
          },
          '& .MuiDialog-paper': {
            margin: { xs: '0', sm: '32px auto' },
            maxHeight: { xs: '100vh', sm: '90vh' },
            borderRadius: { xs: '0', sm: 1 },
            height: { xs: '100vh', sm: 'auto' },
          }
        }}
      >
        <DialogTitle>Nieuwe Oefening</DialogTitle>
        <DialogContent sx={{ overflowY: 'auto', maxHeight: { xs: 'calc(100vh - 180px)', sm: 'none' }, pb: 2 }}>
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
                  onKeyPress={handleKeyPress}
                  autoFocus
                />
              )}
              filterOptions={(options, state) => {
                const inputValue = state.inputValue.toLowerCase().trim();
                if (!inputValue) return options;
                
                // Filter op basis van input
                return options.filter(option => 
                  option.toLowerCase().includes(inputValue)
                );
              }}
              ListboxProps={{
                style: { maxHeight: '300px' }
              }}
            />

            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Gewicht (kg)"
                type="number"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                onKeyPress={handleKeyPress}
                sx={{ flex: 1 }}
                inputProps={{ min: 0, step: 0.5, inputMode: 'decimal' }}
              />
              
              <TextField
                label="Sets"
                type="number"
                value={sets}
                onChange={(e) => setSets(e.target.value)}
                onKeyPress={handleKeyPress}
                sx={{ flex: 1 }}
                inputProps={{ min: 1, inputMode: 'numeric' }}
              />
              
              <TextField
                label="Reps"
                type="number"
                value={reps}
                onChange={(e) => setReps(e.target.value)}
                onKeyPress={handleKeyPress}
                sx={{ flex: 1 }}
                inputProps={{ min: 1, inputMode: 'numeric' }}
              />
            </Box>

            <TextField
              label="Notitie (optioneel)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Bijv. last van mn schouder, ging goed, was te zwaar..."
              multiline
              rows={2}
              fullWidth
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

      {/* Dialog voor bewerken oefening */}
      <Dialog 
        open={openEditDialog} 
        onClose={handleCloseEditDialog}
        maxWidth="sm"
        fullWidth
        fullScreen={isMobile}
        sx={{
          '& .MuiDialog-container': {
            alignItems: { xs: 'flex-start', sm: 'center' },
            paddingTop: { xs: '0', sm: '48px' },
          },
          '& .MuiDialog-paper': {
            margin: { xs: '0', sm: '32px auto' },
            maxHeight: { xs: '100vh', sm: '90vh' },
            borderRadius: { xs: '0', sm: 1 },
            height: { xs: '100vh', sm: 'auto' },
          }
        }}
      >
        <DialogTitle>Oefening Bewerken</DialogTitle>
        <DialogContent sx={{ overflowY: 'auto', maxHeight: { xs: 'calc(100vh - 180px)', sm: 'none' }, pb: 2 }}>
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
              filterOptions={(options, state) => {
                const inputValue = state.inputValue.toLowerCase().trim();
                if (!inputValue) return options;
                
                // Filter op basis van input
                return options.filter(option => 
                  option.toLowerCase().includes(inputValue)
                );
              }}
              ListboxProps={{
                style: { maxHeight: '300px' }
              }}
            />

            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Gewicht (kg)"
                type="number"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                sx={{ flex: 1 }}
                inputProps={{ min: 0, step: 0.5, inputMode: 'decimal' }}
              />
              
              <TextField
                label="Sets"
                type="number"
                value={sets}
                onChange={(e) => setSets(e.target.value)}
                sx={{ flex: 1 }}
                inputProps={{ min: 1, inputMode: 'numeric' }}
              />
              
              <TextField
                label="Reps"
                type="number"
                value={reps}
                onChange={(e) => setReps(e.target.value)}
                sx={{ flex: 1 }}
                inputProps={{ min: 1, inputMode: 'numeric' }}
              />
            </Box>

            <TextField
              label="Notitie (optioneel)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Bijv. last van mn schouder, ging goed, was te zwaar..."
              multiline
              rows={2}
              fullWidth
            />
          </Box>
        </DialogContent>
        <DialogActions>
          {/* @ts-ignore - Material Web Components are web components */}
          <md-text-button ref={editCancelButtonRef}>
            Annuleren
          </md-text-button>
          {/* @ts-ignore - Material Web Components are web components */}
          <md-filled-button
            ref={editSaveButtonRef}
          >
            {/* @ts-ignore */}
            <md-icon slot="start">save</md-icon>
            Opslaan
          </md-filled-button>
        </DialogActions>
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

      {/* Statistieken sectie */}
      {exerciseNames.length === 0 ? (
        <Card>
          <CardContent>
            <Typography variant="body1" color="text.secondary" align="center" sx={{ py: 4 }}>
              Nog geen data beschikbaar. Begin met het loggen van workouts!
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Autocomplete
                options={exerciseNames}
                value={selectedExercise}
                onChange={(_, newValue) => setSelectedExercise(newValue)}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Selecteer Oefening"
                    placeholder="Kies een oefening om progressie te zien (optioneel)"
                  />
                )}
              />
            </CardContent>
          </Card>

          {/* Algemene statistieken wanneer geen oefening geselecteerd */}
          {!selectedExercise && overallStats && (
            <>
              <Typography variant="h6" gutterBottom sx={{ mb: 2, fontWeight: 600 }}>
                Overzicht Statistieken
              </Typography>
              
              <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
                <Card sx={{ 
                  flex: { xs: '0 0 calc(50% - 8px)', sm: 1 }, 
                  minWidth: { xs: 'auto', sm: 200 } 
                }}>
                  <CardContent>
                    <Typography variant="body2" color="text.secondary">
                      Totaal Oefeningen
                    </Typography>
                    <Typography variant="h4" fontWeight={600}>
                      {overallStats.totalExercises}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {overallStats.uniqueExercises} unieke oefeningen
                    </Typography>
                  </CardContent>
                </Card>

                <Card sx={{ 
                  flex: { xs: '0 0 calc(50% - 8px)', sm: 1 }, 
                  minWidth: { xs: 'auto', sm: 200 } 
                }}>
                  <CardContent>
                    <Typography variant="body2" color="text.secondary">
                      Gemiddeld Gewicht
                    </Typography>
                    <Typography variant="h4" fontWeight={600}>
                      {overallStats.avgWeight} kg
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      over alle oefeningen
                    </Typography>
                  </CardContent>
                </Card>

                <Card sx={{ 
                  flex: { xs: '0 0 calc(50% - 8px)', sm: 1 }, 
                  minWidth: { xs: 'auto', sm: 200 } 
                }}>
                  <CardContent>
                    <Typography variant="body2" color="text.secondary">
                      Max Gewicht
                    </Typography>
                    <Typography variant="h4" fontWeight={600} sx={{ color: 'secondary.main' }}>
                      {overallStats.maxWeight} kg
                    </Typography>
                  </CardContent>
                </Card>

                {overallStats.hasVolumeData && (
                  <>
                    <Card sx={{ 
                      flex: { xs: '0 0 calc(50% - 8px)', sm: 1 }, 
                      minWidth: { xs: 'auto', sm: 200 } 
                    }}>
                      <CardContent>
                        <Typography variant="body2" color="text.secondary">
                          Totaal Volume
                        </Typography>
                        <Typography variant="h4" fontWeight={600}>
                          {overallStats.totalVolume} kg
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          sets × reps × gewicht
                        </Typography>
                      </CardContent>
                    </Card>

                    <Card sx={{ 
                      flex: { xs: '0 0 calc(50% - 8px)', sm: 1 }, 
                      minWidth: { xs: 'auto', sm: 200 } 
                    }}>
                      <CardContent>
                        <Typography variant="body2" color="text.secondary">
                          Gemiddeld Volume
                        </Typography>
                        <Typography variant="h4" fontWeight={600}>
                          {overallStats.avgVolume} kg
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          per oefening
                        </Typography>
                      </CardContent>
                    </Card>

                    <Card sx={{ 
                      flex: { xs: '0 0 calc(50% - 8px)', sm: 1 }, 
                      minWidth: { xs: 'auto', sm: 200 } 
                    }}>
                      <CardContent>
                        <Typography variant="body2" color="text.secondary">
                          Max Volume
                        </Typography>
                        <Typography variant="h4" fontWeight={600} sx={{ color: 'secondary.main' }}>
                          {overallStats.maxVolume} kg
                        </Typography>
                      </CardContent>
                    </Card>
                  </>
                )}

                <Card sx={{ 
                  flex: { xs: '0 0 calc(50% - 8px)', sm: 1 }, 
                  minWidth: { xs: 'auto', sm: 200 } 
                }}>
                  <CardContent>
                    <Typography variant="body2" color="text.secondary">
                      Totaal Workouts
                    </Typography>
                    <Typography variant="h4" fontWeight={600}>
                      {overallStats.totalWorkouts}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {overallStats.uniqueDays} unieke dagen
                    </Typography>
                  </CardContent>
                </Card>

                <Card sx={{ 
                  flex: { xs: '0 0 calc(50% - 8px)', sm: 1 }, 
                  minWidth: { xs: 'auto', sm: 200 } 
                }}>
                  <CardContent>
                    <Typography variant="body2" color="text.secondary">
                      Workouts per Dag
                    </Typography>
                    <Typography variant="h4" fontWeight={600}>
                      {overallStats.workoutsPerDay}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      gemiddeld
                    </Typography>
                  </CardContent>
                </Card>
              </Box>

              {overallStats.topExercises.length > 0 && (
                <Card sx={{ mb: 3 }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Meest Gedane Oefeningen
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 2 }}>
                      {overallStats.topExercises.map(({ name, count }) => (
                        <Chip
                          key={name}
                          label={`${name} (${count}x)`}
                          color="primary"
                          variant="outlined"
                          onClick={() => setSelectedExercise(name)}
                          sx={{ cursor: 'pointer' }}
                        />
                      ))}
                    </Box>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {/* Specifieke oefening statistieken */}
          {selectedExercise && stats && (
            <>
              <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
                <Card sx={{ 
                  flex: { xs: '0 0 calc(50% - 8px)', sm: 1 }, 
                  minWidth: { xs: 'auto', sm: 200 } 
                }}>
                  <CardContent>
                    <Typography variant="body2" color="text.secondary">
                      Huidig Gewicht
                    </Typography>
                    <Typography variant="h4" fontWeight={600}>
                      {stats.latest} kg
                    </Typography>
                  </CardContent>
                </Card>

                <Card sx={{ 
                  flex: { xs: '0 0 calc(50% - 8px)', sm: 1 }, 
                  minWidth: { xs: 'auto', sm: 200 } 
                }}>
                  <CardContent>
                    <Typography variant="body2" color="text.secondary">
                      Max Gewicht
                    </Typography>
                    <Typography variant="h4" fontWeight={600} sx={{ color: 'secondary.main' }}>
                      {stats.max} kg
                    </Typography>
                  </CardContent>
                </Card>

                <Card sx={{ 
                  flex: { xs: '0 0 calc(50% - 8px)', sm: 1 }, 
                  minWidth: { xs: 'auto', sm: 200 } 
                }}>
                  <CardContent>
                    <Typography variant="body2" color="text.secondary">
                      Progressie
                    </Typography>
                    <Typography 
                      variant="h4" 
                      fontWeight={600}
                      color={stats.improvement >= 0 ? 'success.main' : 'error.main'}
                    >
                      {stats.improvement >= 0 ? '+' : ''}{stats.improvement.toFixed(1)} kg
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      vanaf {stats.first} kg
                    </Typography>
                  </CardContent>
                </Card>

                <Card sx={{ 
                  flex: { xs: '0 0 calc(50% - 8px)', sm: 1 }, 
                  minWidth: { xs: 'auto', sm: 200 } 
                }}>
                  <CardContent>
                    <Typography variant="body2" color="text.secondary">
                      Totaal Workouts
                    </Typography>
                    <Typography variant="h4" fontWeight={600}>
                      {stats.totalWorkouts}
                    </Typography>
                  </CardContent>
                </Card>

                {stats.hasVolumeData && stats.latestVolume && (
                  <>
                    <Card sx={{ 
                      flex: { xs: '0 0 calc(50% - 8px)', sm: 1 }, 
                      minWidth: { xs: 'auto', sm: 200 } 
                    }}>
                      <CardContent>
                        <Typography variant="body2" color="text.secondary">
                          Huidig Volume
                        </Typography>
                        <Typography variant="h4" fontWeight={600}>
                          {stats.latestVolume.toLocaleString('nl-NL')} kg
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          sets × reps × gewicht
                        </Typography>
                      </CardContent>
                    </Card>

                    <Card sx={{ 
                      flex: { xs: '0 0 calc(50% - 8px)', sm: 1 }, 
                      minWidth: { xs: 'auto', sm: 200 } 
                    }}>
                      <CardContent>
                        <Typography variant="body2" color="text.secondary">
                          Max Volume
                        </Typography>
                        <Typography variant="h4" fontWeight={600} sx={{ color: 'secondary.main' }}>
                          {stats.maxVolume?.toLocaleString('nl-NL')} kg
                        </Typography>
                      </CardContent>
                    </Card>

                    {stats.volumeImprovement !== undefined && (
                      <Card sx={{ 
                        flex: { xs: '0 0 calc(50% - 8px)', sm: 1 }, 
                        minWidth: { xs: 'auto', sm: 200 } 
                      }}>
                        <CardContent>
                          <Typography variant="body2" color="text.secondary">
                            Volume Progressie
                          </Typography>
                          <Typography 
                            variant="h4" 
                            fontWeight={600}
                            color={stats.volumeImprovement >= 0 ? 'success.main' : 'error.main'}
                          >
                            {stats.volumeImprovement >= 0 ? '+' : ''}{stats.volumeImprovement.toLocaleString('nl-NL')} kg
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            vanaf {stats.firstVolume?.toLocaleString('nl-NL')} kg
                          </Typography>
                        </CardContent>
                      </Card>
                    )}
                  </>
                )}
              </Box>

              {chartData.length > 0 && (
                <Card sx={{ mb: 3 }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Progressie Overzicht
                    </Typography>
                    <Box sx={{ width: '100%', height: 400, mt: 3 }}>
                      <ResponsiveContainer>
                        <ComposedChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis 
                            dataKey="date" 
                            tick={{ fontSize: 12 }}
                          />
                          <YAxis 
                            yAxisId="left"
                            label={{ value: 'Gewicht (kg)', angle: -90, position: 'insideLeft' }}
                            tick={{ fontSize: 12 }}
                          />
                          {stats.hasVolumeData && (
                            <YAxis 
                              yAxisId="right"
                              orientation="right"
                              label={{ value: 'Volume (kg)', angle: 90, position: 'insideRight' }}
                              tick={{ fontSize: 12 }}
                            />
                          )}
                          <Tooltip 
                            formatter={(value: number, name: string) => {
                              if (name === 'Volume (kg)') {
                                return [value.toLocaleString('nl-NL'), name];
                              }
                              return [value, name];
                            }}
                          />
                          <Legend />
                          <Line
                            yAxisId="left"
                            type="monotone"
                            dataKey="gewicht"
                            stroke={theme.palette.primary.main}
                            strokeWidth={3}
                            dot={{ fill: theme.palette.primary.main, r: 5 }}
                            activeDot={{ r: 7 }}
                            name="Gewicht (kg)"
                          />
                          {stats.hasVolumeData && (
                            <Line
                              yAxisId="right"
                              type="monotone"
                              dataKey="volume"
                              stroke={theme.palette.secondary.main}
                              strokeWidth={2}
                              dot={{ fill: theme.palette.secondary.main, r: 4 }}
                              activeDot={{ r: 6 }}
                              name="Volume (kg)"
                              strokeDasharray="5 5"
                            />
                          )}
                        </ComposedChart>
                      </ResponsiveContainer>
                    </Box>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {allWorkouts.length > 0 && (
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Totaal Workouts: {allWorkouts.length}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Totaal Oefeningen: {allWorkouts.reduce((sum, w) => sum + w.exercises.length, 0)}
                </Typography>
              </CardContent>
            </Card>
          )}

          {/* Nieuwe Inzichten Sectie */}
          {insights.exercisesWithMetadata > 0 && (
            <>
              <Card sx={{ mb: 3 }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Spiergroep Inzichten
                  </Typography>
                  
                  {insights.topPrimaryMuscles.length > 0 && (
                    <Box sx={{ mt: 2 }}>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        Meest Getrainde Primaire Spiergroepen:
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
                        {insights.topPrimaryMuscles.map(({ muscle, count }) => (
                          <Chip
                            key={muscle}
                            label={`${muscle} (${count}x)`}
                            color="primary"
                            size="small"
                            variant="outlined"
                          />
                        ))}
                      </Box>
                    </Box>
                  )}

                  {insights.topSecondaryMuscles.length > 0 && (
                    <Box sx={{ mt: 2 }}>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        Meest Getrainde Secundaire Spiergroepen:
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
                        {insights.topSecondaryMuscles.map(({ muscle, count }) => (
                          <Chip
                            key={muscle}
                            label={`${muscle} (${count}x)`}
                            color="secondary"
                            size="small"
                            variant="outlined"
                          />
                        ))}
                      </Box>
                    </Box>
                  )}

                  {insights.pushPullRatio && (insights.pushPullRatio.push > 0 || insights.pushPullRatio.pull > 0) && (
                    <Box sx={{ mt: 3 }}>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        Push/Pull Ratio:
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 2, mt: 1, alignItems: 'center' }}>
                        <Box sx={{ flex: 1 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                            <Typography variant="caption">Push</Typography>
                            <Typography variant="caption">{insights.pushPullRatio.push}%</Typography>
                          </Box>
                          <Box
                            sx={{
                              height: 8,
                              backgroundColor: theme.palette.secondary.light,
                              borderRadius: 1,
                              overflow: 'hidden',
                            }}
                          >
                            <Box
                              sx={{
                                height: '100%',
                                width: `${Math.max(insights.pushPullRatio.push, 1)}%`,
                                backgroundColor: theme.palette.primary.main,
                                minWidth: insights.pushPullRatio.push > 0 ? '4px' : 0,
                              }}
                            />
                          </Box>
                        </Box>
                        <Box sx={{ flex: 1 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                            <Typography variant="caption">Pull</Typography>
                            <Typography variant="caption">{insights.pushPullRatio.pull}%</Typography>
                          </Box>
                          <Box
                            sx={{
                              height: 8,
                              backgroundColor: theme.palette.secondary.light,
                              borderRadius: 1,
                              overflow: 'hidden',
                            }}
                          >
                            <Box
                              sx={{
                                height: '100%',
                                width: `${Math.max(insights.pushPullRatio.pull, 1)}%`,
                                backgroundColor: theme.palette.secondary.main,
                                minWidth: insights.pushPullRatio.pull > 0 ? '4px' : 0,
                              }}
                            />
                          </Box>
                        </Box>
                      </Box>
                      {insights.pushCount === 0 && insights.pullCount === 0 && (
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                          Geen Push of Pull oefeningen gedetecteerd. Voeg oefeningen toe met movementType 'Push' of 'Pull'.
                        </Typography>
                      )}
                    </Box>
                  )}

                  {Object.keys(insights.movementTypeCounts).length > 0 && (
                    <Box sx={{ mt: 3 }}>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        Bewegingstype Verdeling:
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
                        {Object.entries(insights.movementTypeCounts)
                          .sort(([, a], [, b]) => b - a)
                          .map(([type, count]) => (
                            <Chip
                              key={type}
                              label={`${type}: ${count}x`}
                              size="small"
                            />
                          ))}
                      </Box>
                    </Box>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}

      {/* Logs sectie onderaan */}
      <Box sx={{ mt: 4 }}>
        <Typography variant="h5" gutterBottom sx={{ mb: 3, fontWeight: 600 }}>
          Log
        </Typography>

        {allExercises.length > 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {allExercises.map((exercise) => {
              const imageUrl = exerciseImages[exercise.name];
              const exerciseDate = new Date(exercise.date);
              const isToday = exerciseDate.toISOString().split('T')[0] === new Date().toISOString().split('T')[0];
              const dateStr = exerciseDate.toLocaleDateString('nl-NL', { 
                weekday: 'short',
                year: 'numeric', 
                month: 'short', 
                day: 'numeric' 
              });
              
              const metadata = findExerciseMetadata(exercise.name);
              
              return (
                <Card key={exercise.id} elevation={1}>
                  <CardContent>
                    <Box sx={{ display: 'flex', gap: 2 }}>
                      {imageUrl && (
                        <Box
                          component="img"
                          src={imageUrl}
                          alt={exercise.name}
                          sx={{
                            width: 120,
                            height: 120,
                            objectFit: 'cover',
                            borderRadius: 2,
                            flexShrink: 0,
                          }}
                          onError={() => {
                            setExerciseImages(prev => ({ ...prev, [exercise.name]: null }));
                          }}
                        />
                      )}
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                          <Box>
                            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                              {exercise.name}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {isToday ? `Vandaag, ${exerciseDate.toLocaleDateString('nl-NL', { month: 'short', day: 'numeric' })}` : dateStr}
                            </Typography>
                          </Box>
                          <Box sx={{ display: 'flex', gap: 0.5 }}>
                            <IconButton
                              size="small"
                              onClick={() => handleEditExercise(exercise)}
                              sx={{ color: 'text.secondary' }}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                            <IconButton
                              size="small"
                              onClick={() => handleDeleteExercise(exercise.id)}
                              sx={{ color: 'error.main' }}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        </Box>
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
                        {exercise.notes && (
                          <Box sx={{ mt: 1.5, p: 1.5, backgroundColor: 'rgba(0, 0, 0, 0.03)', borderRadius: 1 }}>
                            <Typography variant="body2" sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
                              {exercise.notes}
                            </Typography>
                          </Box>
                        )}
                        {metadata && (
                          <Box sx={{ mt: 2 }}>
                            {metadata.movementType && (
                              <Chip
                                label={metadata.movementType}
                                size="small"
                                sx={{ mr: 0.5, mb: 0.5 }}
                              />
                            )}
                            {metadata.primaryMuscles.length > 0 && (
                              <Box sx={{ mt: 1 }}>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                                  Primaire spiergroepen:
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                                  {metadata.primaryMuscles.map((muscle) => (
                                    <Chip
                                      key={muscle}
                                      label={muscle}
                                      size="small"
                                      color="primary"
                                      variant="outlined"
                                    />
                                  ))}
                                </Box>
                              </Box>
                            )}
                            {metadata.secondaryMuscles.length > 0 && (
                              <Box sx={{ mt: 1 }}>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                                  Secundaire spiergroepen:
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                                  {metadata.secondaryMuscles.map((muscle) => (
                                    <Chip
                                      key={muscle}
                                      label={muscle}
                                      size="small"
                                      color="secondary"
                                      variant="outlined"
                                    />
                                  ))}
                                </Box>
                              </Box>
                            )}
                          </Box>
                        )}
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              );
            })}
          </Box>
        )}

        {allExercises.length === 0 && (
          <Typography variant="body1" color="text.secondary" align="center" sx={{ py: 4 }}>
            Nog geen oefeningen gelogd. Begin met het toevoegen van je eerste oefening!
          </Typography>
        )}
      </Box>

      {/* FAB Button */}
      <Fab
        color="primary"
        aria-label="add"
        sx={{
          position: 'fixed',
          bottom: 16,
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
