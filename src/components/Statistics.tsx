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
  Menu,
  MenuItem,
  IconButton,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
  PieChart,
  Pie,
  Cell,
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
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [menuExerciseId, setMenuExerciseId] = useState<string | null>(null);
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
      // Sorteer op datum (oudste eerst voor grafiek - chronologisch)
      const sortedExercises = [...exercises].sort((a, b) => 
        new Date(a.date).getTime() - new Date(b.date).getTime()
      );
      const data: ChartData[] = sortedExercises.map(ex => {
        return {
          date: new Date(ex.date).toLocaleDateString('nl-NL', { 
            month: 'short', 
            day: 'numeric' 
          }),
          gewicht: ex.weight,
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

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, exerciseId: string) => {
    event.stopPropagation();
    setMenuAnchorEl(event.currentTarget);
    setMenuExerciseId(exerciseId);
  };

  const handleMenuClose = () => {
    setMenuAnchorEl(null);
    setMenuExerciseId(null);
  };

  const handleEditFromMenu = (exercise: Exercise) => {
    handleEditExercise(exercise);
    handleMenuClose();
  };

  const handleDeleteFromMenu = (exerciseId: string) => {
    handleDeleteExercise(exerciseId);
    handleMenuClose();
  };

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
    if (!selectedExercise) return null;

    const exercises = getAllExercisesByName(selectedExercise);
    if (exercises.length === 0) return null;

    // Sorteer op datum (nieuwste eerst)
    const sortedExercises = [...exercises].sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    const weights = sortedExercises.map(ex => ex.weight);
    const max = Math.max(...weights);
    const latest = weights[0]; // Nieuwste is eerste in gesorteerde array
    const maxVsLatest = max - latest; // Max gewicht ten opzichte van laatste sessie

    return {
      max,
      latest,
      maxVsLatest,
      totalWorkouts: exercises.length,
    };
  }, [selectedExercise, allExercises.length]);

  // Laatste 3 sessies voor geselecteerde oefening
  const lastThreeSessions = useMemo(() => {
    if (!selectedExercise) return [];
    
    const exercises = getAllExercisesByName(selectedExercise);
    // Sorteer op datum (nieuwste eerst) en pak laatste 3
    const sortedExercises = [...exercises].sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    
    return sortedExercises.slice(0, 3);
  }, [selectedExercise, allExercises.length]);

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

  // Kleuren voor pie charts - gebaseerd op #4E6543
  // #4E6543 = RGB(78, 101, 67) - donkergroen
  // Variaties: lichtere tinten voor meer items
  const COLORS_PRIMARY = ['#4E6543', '#5D7A51', '#6C8F5F', '#7BA46D', '#8AB97B'];
  const COLORS_SECONDARY = ['#4E6543', '#5D7A51', '#6C8F5F', '#7BA46D', '#8AB97B'];
  const COLORS_PUSH_PULL = ['#4E6543', '#6C8F5F'];
  const COLORS_MOVEMENT = ['#4E6543', '#5D7A51', '#6C8F5F', '#7BA46D'];

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
            
            {/* Buttons direct onder notities */}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2, pt: 2 }}>
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
            </Box>
          </Box>
        </DialogContent>
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
            
            {/* Buttons direct onder notities */}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2, pt: 2 }}>
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

      {/* Statistieken sectie */}
      {exerciseNames.length === 0 ? (
        <Card sx={{ backgroundColor: '#FEF2E5', borderRadius: '16px' }} elevation={0}>
          <CardContent>
            <Typography variant="body1" color="text.secondary" align="center" sx={{ py: 4 }}>
              Nog geen data beschikbaar. Begin met het loggen van workouts!
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card sx={{ mb: 3, backgroundColor: '#FEF2E5', borderRadius: '16px' }} elevation={0}>
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

          {/* Specifieke oefening statistieken */}
          {selectedExercise && stats && (
            <Card sx={{ mb: 3, backgroundColor: '#FEF2E5', borderRadius: '16px' }} elevation={0}>
              <CardContent>
                {/* Progressie Sectie */}
                <Box sx={{ mb: 2 }}>
                  <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                    Progressie
                  </Typography>
                </Box>
                {/* Max Gewicht Sectie */}
                <Card sx={{ mb: 4, backgroundColor: 'transparent', borderRadius: '16px', border: '1px solid #D2C5B4' }} elevation={0}>
                  <CardContent>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      Max Gewicht
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                      <Typography variant="h4" fontWeight={600} sx={{ color: 'secondary.main' }}>
                        {stats.max} kg
                      </Typography>
                      {stats.maxVsLatest !== 0 && (
                        <Typography 
                          variant="h6" 
                          fontWeight={600}
                          color={stats.maxVsLatest > 0 ? 'error.main' : 'success.main'}
                        >
                          {stats.maxVsLatest > 0 ? '-' : '+'}{Math.abs(stats.maxVsLatest)} kg
                        </Typography>
                      )}
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                      Ten opzichte van laatste sessie ({stats.latest} kg)
                    </Typography>
                  </CardContent>
                </Card>

                {/* Laatste 3 Sessies */}
                {lastThreeSessions.length > 0 && (
                  <Card sx={{ mb: 4, backgroundColor: 'transparent', borderRadius: '16px', border: 'none', m: 0 }} elevation={0}>
                    <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
                      <Typography variant="h6" gutterBottom>
                        Laatste sessie(s)
                      </Typography>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
                        {lastThreeSessions.map((exercise, index) => {
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
                    </CardContent>
                  </Card>
                )}

                {/* Grafiek voor progressie */}
                {chartData.length > 0 && (
                  <Box sx={{ mt: 4 }}>
                    <Typography variant="h6" gutterBottom>
                      Overzicht
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
                            label={{ value: 'Gewicht (kg)', angle: -90, position: 'insideLeft' }}
                            tick={{ fontSize: 12 }}
                          />
                          <Tooltip />
                          <Legend />
                          <Line
                            type="monotone"
                            dataKey="gewicht"
                            stroke={theme.palette.primary.main}
                            strokeWidth={3}
                            dot={{ fill: theme.palette.primary.main, r: 5 }}
                            activeDot={{ r: 7 }}
                            name="Gewicht (kg)"
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </Box>
                  </Box>
                )}
              </CardContent>
            </Card>
          )}


          {/* Nieuwe Inzichten Sectie */}
          {insights.exercisesWithMetadata > 0 && (
            <Card sx={{ mb: 3, backgroundColor: '#FEF2E5', borderRadius: '16px', mt: 4 }} elevation={0}>
              <CardContent>
                <Typography variant="h5" gutterBottom sx={{ mb: 3, fontWeight: 600 }}>
                  Spiergroep Inzichten
                </Typography>

                {/* Primaire Spiergroepen Pie Chart */}
                {insights.topPrimaryMuscles.length > 0 && (
                  <Card sx={{ mb: 3, backgroundColor: 'transparent', borderRadius: '16px', border: '1px solid #D2C5B4' }} elevation={0}>
                    <CardContent>
                      <Typography variant="h6" gutterBottom>
                        Meest Getrainde Primaire Spiergroepen
                      </Typography>
                      <Box sx={{ width: '100%', height: 400, mt: 2 }}>
                        <ResponsiveContainer>
                          <PieChart>
                            <Pie
                              data={insights.topPrimaryMuscles.slice(0, 5).map(({ muscle, count }) => ({
                                name: muscle,
                                value: count,
                              }))}
                              cx="50%"
                              cy="50%"
                              labelLine={false}
                              label={({ name, value, percent }) => `${name} ${value}x`}
                              outerRadius={120}
                              fill="#8884d8"
                              dataKey="value"
                            >
                              {insights.topPrimaryMuscles.slice(0, 5).map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS_PRIMARY[index % COLORS_PRIMARY.length]} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      </Box>
                    </CardContent>
                  </Card>
                )}

                {/* Secundaire Spiergroepen Pie Chart */}
                {insights.topSecondaryMuscles.length > 0 && (
                  <Card sx={{ mb: 3, backgroundColor: 'transparent', borderRadius: '16px', border: '1px solid #D2C5B4' }} elevation={0}>
                    <CardContent>
                      <Typography variant="h6" gutterBottom>
                        Meest Getrainde Secundaire Spiergroepen
                      </Typography>
                      <Box sx={{ width: '100%', height: 400, mt: 2 }}>
                        <ResponsiveContainer>
                          <PieChart>
                            <Pie
                              data={insights.topSecondaryMuscles.slice(0, 5).map(({ muscle, count }) => ({
                                name: muscle,
                                value: count,
                              }))}
                              cx="50%"
                              cy="50%"
                              labelLine={false}
                              label={({ name, value, percent }) => `${name} ${value}x`}
                              outerRadius={120}
                              fill="#8884d8"
                              dataKey="value"
                            >
                              {insights.topSecondaryMuscles.slice(0, 5).map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS_SECONDARY[index % COLORS_SECONDARY.length]} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      </Box>
                    </CardContent>
                  </Card>
                )}

                {/* Push/Pull Ratio Pie Chart */}
                {insights.pushPullRatio && (insights.pushPullRatio.push > 0 || insights.pushPullRatio.pull > 0) && (
                  <Card sx={{ mb: 3, backgroundColor: 'transparent', borderRadius: '16px', border: '1px solid #D2C5B4' }} elevation={0}>
                    <CardContent>
                      <Typography variant="h6" gutterBottom>
                        Push/Pull Ratio
                      </Typography>
                      <Box sx={{ width: '100%', height: 400, mt: 2 }}>
                        <ResponsiveContainer>
                          <PieChart>
                            <Pie
                              data={[
                                { name: 'Push', value: insights.pushPullRatio.push },
                                { name: 'Pull', value: insights.pushPullRatio.pull },
                              ]}
                              cx="50%"
                              cy="50%"
                              labelLine={false}
                              label={({ name, value }) => `${name} ${value}%`}
                              outerRadius={120}
                              fill="#8884d8"
                              dataKey="value"
                            >
                              {[
                                { name: 'Push', value: insights.pushPullRatio.push },
                                { name: 'Pull', value: insights.pushPullRatio.pull },
                              ].map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS_PUSH_PULL[index % COLORS_PUSH_PULL.length]} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      </Box>
                    </CardContent>
                  </Card>
                )}

                {/* Bewegingstype Verdeling Pie Chart */}
                {Object.keys(insights.movementTypeCounts).length > 0 && (
                  <Card sx={{ mb: 3, backgroundColor: 'transparent', borderRadius: '16px', border: '1px solid #D2C5B4' }} elevation={0}>
                    <CardContent>
                      <Typography variant="h6" gutterBottom>
                        Bewegingstype Verdeling
                      </Typography>
                      <Box sx={{ width: '100%', height: 400, mt: 2 }}>
                        <ResponsiveContainer>
                          <PieChart>
                            <Pie
                              data={Object.entries(insights.movementTypeCounts)
                                .sort(([, a], [, b]) => b - a)
                                .map(([type, count]) => ({
                                  name: type,
                                  value: count,
                                }))}
                              cx="50%"
                              cy="50%"
                              labelLine={false}
                              label={({ name, value }) => `${name} ${value}x`}
                              outerRadius={120}
                              fill="#8884d8"
                              dataKey="value"
                            >
                              {Object.entries(insights.movementTypeCounts)
                                .sort(([, a], [, b]) => b - a)
                                .map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={COLORS_MOVEMENT[index % COLORS_MOVEMENT.length]} />
                                ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      </Box>
                    </CardContent>
                  </Card>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Logs sectie onderaan */}
      <Card sx={{ mt: 4, backgroundColor: '#FEF2E5', borderRadius: '16px' }} elevation={0}>
        <CardContent>
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
                
                const details = [
                  `${exercise.weight} kg`,
                  exercise.sets && `${exercise.sets} ${exercise.sets === 1 ? 'set' : 'sets'}`,
                  exercise.reps && `${exercise.reps} ${exercise.reps === 1 ? 'rep' : 'reps'}`
                ].filter(Boolean).join(' | ');

                return (
                  <Card key={exercise.id} elevation={0} sx={{ backgroundColor: 'transparent', borderRadius: '16px', border: '1px solid #D2C5B4' }}>
                    <CardContent>
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

          {allExercises.length === 0 && (
            <Typography variant="body1" color="text.secondary" align="center" sx={{ py: 4 }}>
              Nog geen oefeningen gelogd. Begin met het toevoegen van je eerste oefening!
            </Typography>
          )}
        </CardContent>
      </Card>

      {/* Menu voor log entries */}
      <Menu
        anchorEl={menuAnchorEl}
        open={Boolean(menuAnchorEl)}
        onClose={handleMenuClose}
      >
        {menuExerciseId && allExercises.find(ex => ex.id === menuExerciseId) && (
          <>
            <MenuItem onClick={() => handleEditFromMenu(allExercises.find(ex => ex.id === menuExerciseId)!)}>
              <EditIcon fontSize="small" sx={{ mr: 1 }} />
              Bewerken
            </MenuItem>
            <MenuItem onClick={() => handleDeleteFromMenu(menuExerciseId)} sx={{ color: 'error.main' }}>
              <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
              Verwijderen
            </MenuItem>
          </>
        )}
      </Menu>

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
