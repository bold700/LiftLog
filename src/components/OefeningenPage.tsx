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
  Menu,
  MenuItem,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
} from 'recharts';
import { getAllExercisesByName, getExerciseNames, updateExercise, deleteExercise, getAllExercises } from '../utils/storage';
import { Exercise } from '../types';
import { getExerciseNames as getDbExerciseNamesFromData } from '../data/exercises';

// Import Material Web Components buttons
import '@material/web/button/filled-button.js';
import '@material/web/button/text-button.js';
import '@material/web/icon/icon.js';

interface ChartData {
  date: string;
  gewicht: number;
}

export const OefeningenPage = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
  const [exerciseNames, setExerciseNames] = useState<string[]>([]);
  const [chartData, setChartData] = useState<ChartData[]>([]);
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
  const [exerciseSuggestions, setExerciseSuggestions] = useState<string[]>([]);
  const editCancelButtonRef = useRef<any>(null);
  const editSaveButtonRef = useRef<any>(null);
  const deleteCancelButtonRef = useRef<any>(null);
  const deleteConfirmButtonRef = useRef<any>(null);
  const editNotesFieldRef = useRef<HTMLInputElement | null>(null);
  const editButtonsContainerRef = useRef<HTMLDivElement | null>(null);

  const loadExerciseSuggestions = useCallback(() => {
    const dbExercises = getDbExerciseNamesFromData();
    const userExercises = getExerciseNames();
    const allExercises = [...new Set([...dbExercises, ...userExercises])].sort();
    setExerciseSuggestions(allExercises);
  }, []);

  useEffect(() => {
    const loggedNames = getExerciseNames();
    setExerciseNames(loggedNames);
    loadAllExercises();
    loadExerciseSuggestions();
  }, [loadExerciseSuggestions]);

  useEffect(() => {
    if (selectedExercise) {
      const exercises = getAllExercisesByName(selectedExercise);
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

  const loadAllExercises = () => {
    const exercises = getAllExercises();
    setAllExercises(exercises);
  };

  // Stats berekening
  const stats = useMemo(() => {
    if (!selectedExercise) return null;
    const exercises = getAllExercisesByName(selectedExercise);
    if (exercises.length === 0) return null;

    const weights = exercises.map(ex => ex.weight);
    const max = Math.max(...weights);
    const latest = weights[weights.length - 1];
    const maxVsLatest = max - latest;

    return {
      max,
      latest,
      maxVsLatest,
      totalWorkouts: exercises.length,
    };
  }, [selectedExercise]);

  // Laatste 3 sessies
  const lastThreeSessions = useMemo(() => {
    if (!selectedExercise) return [];
    
    const exercises = getAllExercisesByName(selectedExercise);
    const sortedExercises = [...exercises].sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    
    return sortedExercises.slice(0, 3);
  }, [selectedExercise, allExercises.length]);

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
    
    const exercises = getAllExercises();
    setAllExercises(exercises);
    
    const loggedNames = getExerciseNames();
    setExerciseNames(loggedNames);
    
    if (selectedExercise && loggedNames.includes(selectedExercise)) {
      const current = selectedExercise;
      setSelectedExercise(null);
      setTimeout(() => setSelectedExercise(current), 0);
    }
    
    loadExerciseSuggestions();
  }, [editingExercise, exerciseName, weight, sets, reps, notes, selectedExercise, loadExerciseSuggestions]);

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
    
    const exercises = getAllExercises();
    setAllExercises(exercises);
    
    const loggedNames = getExerciseNames();
    setExerciseNames(loggedNames);
    
    if (selectedExercise && !loggedNames.includes(selectedExercise)) {
      setSelectedExercise(null);
    } else if (selectedExercise) {
      const current = selectedExercise;
      setSelectedExercise(null);
      setTimeout(() => setSelectedExercise(current), 0);
    }
    
    loadExerciseSuggestions();
  }, [deletingExerciseId, selectedExercise, loadExerciseSuggestions]);

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

  // Update exerciseNames wanneer exercises veranderen
  useEffect(() => {
    const loggedNames = getExerciseNames();
    setExerciseNames(loggedNames);
    
    if (selectedExercise && !loggedNames.includes(selectedExercise)) {
      setSelectedExercise(null);
    }
  }, [allExercises.length, selectedExercise]);

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', pb: 10 }}>
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

      {/* Oefening Selector */}
      <Card sx={{ mb: 3, backgroundColor: '#FEF2E5', borderRadius: '16px' }} elevation={0}>
        <CardContent>
          <Autocomplete
            options={exerciseNames}
            value={selectedExercise}
            onChange={(_, newValue) => setSelectedExercise(newValue)}
            clearOnEscape
            clearText="Wissen"
            noOptionsText="Geen oefeningen beschikbaar"
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
              <>
              <Card sx={{ mb: 4, backgroundColor: 'transparent', borderRadius: '16px', border: 'none', m: 0 }} elevation={0}>
                <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
                  <Typography variant="h6" gutterBottom>
                    Laatste sessie(s)
                  </Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
                    {lastThreeSessions.map((exercise) => {
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
                </CardContent>
              </Card>
              </>
            )}

            {/* Grafiek voor progressie */}
            {chartData.length > 0 && (
              <Box sx={{ mt: 4 }}>
                <Typography variant="h6" gutterBottom>
                  Overzicht
                </Typography>
                <Box sx={{ width: '100%', height: 200, mt: 3 }}>
                  <ResponsiveContainer>
                    <ComposedChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="date" 
                        label={{ value: 'Datum', position: 'insideBottom', offset: -5 }}
                        tick={{ fontSize: 12 }}
                      />
                      <YAxis 
                        label={{ value: 'Gewicht (kg)', angle: -90, position: 'insideLeft' }}
                        tick={{ fontSize: 12 }}
                      />
                      <Tooltip />
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

      {!selectedExercise && (
        <Card sx={{ mb: 3, backgroundColor: '#FEF2E5', borderRadius: '16px' }} elevation={0}>
          <CardContent>
            <Typography variant="body1" color="text.secondary" align="center" sx={{ py: 4 }}>
              Selecteer een oefening om de progressie en statistieken te bekijken.
            </Typography>
          </CardContent>
        </Card>
      )}

      {/* Menu voor edit/delete */}
      <Menu
        anchorEl={menuAnchorEl}
        open={Boolean(menuAnchorEl)}
        onClose={handleMenuClose}
      >
        {menuExerciseId && allExercises.find(ex => ex.id === menuExerciseId) && (
          <>
            <MenuItem
              onClick={() => handleEditExercise(allExercises.find(ex => ex.id === menuExerciseId)!)}
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
              inputRef={editNotesFieldRef}
              label="Notitie (optioneel)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Bijv. last van mn schouder, ging goed, was te zwaar"
              multiline
              rows={2}
            />
            
            <Box 
              ref={editButtonsContainerRef}
              sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2, pt: 2 }}>
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

