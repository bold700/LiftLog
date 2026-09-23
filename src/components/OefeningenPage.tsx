import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Button,
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
import { Line, LineChart, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { getAllExercisesByName, getExerciseNames, updateExercise, deleteExercise, getAllExercises } from '../utils/storage';
import { Exercise } from '../types';
import { findExerciseMetadata } from '../data/exerciseMetadata';
import { getExerciseMuscleMapping } from '../utils/muscleMappingResolver';
import { computeExerciseProgress, computeTrainingBalance, type BalancePair } from '../utils/exerciseInsights';
import { formatLogDetails } from '../utils/insightsOverview';
import { useExerciseSuggestions } from '../hooks/useExerciseSuggestions';
import { designTokens } from '../theme/designTokens';
import { PageLayout, ContentCard, EmptyState } from './layout';

// Import Material Web Components buttons
import '@material/web/button/filled-button.js';
import '@material/web/button/text-button.js';
import '@material/web/icon/icon.js';
import { NumberField } from './NumberField';

const cardSx = () => ({
  backgroundColor: designTokens.cardBackground,
  borderRadius: `${designTokens.cardRadius}px`,
});

const kg = (n: number) => `${String(n).replace('.', ',')} kg`;

const DAY_FMT = new Intl.DateTimeFormat('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });

/** "Vandaag", "Gisteren", anders "vr 12 aug". */
function sessionDayLabel(date: string): string {
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T12:00:00` : date);
  const today = new Date();
  const days = Math.round(
    (new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() -
      new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) /
      86400000
  );
  if (days === 0) return 'Vandaag';
  if (days === 1) return 'Gisteren';
  const label = DAY_FMT.format(d).replace('.', '');
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Twee delen naast elkaar (Figma "Training balance"): links primary, rechts tertiary. */
function BalanceBar({ pair }: { pair: BalancePair }) {
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.625 }}>
        <Typography variant="caption">{`${pair.a} ${pair.aPct}%`}</Typography>
        <Typography variant="caption">{`${pair.b} ${100 - pair.aPct}%`}</Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: '3px', height: 8 }}>
        {pair.aPct > 0 && <Box sx={{ width: `${pair.aPct}%`, bgcolor: 'primary.main', borderRadius: 1 }} />}
        {pair.aPct < 100 && <Box sx={{ flex: 1, bgcolor: designTokens.tertiary, borderRadius: 1 }} />}
      </Box>
    </Box>
  );
}

export const OefeningenPage = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [exerciseNames, setExerciseNames] = useState<string[]>([]);
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
  const exerciseSuggestions = useExerciseSuggestions(exerciseName);
  const editCancelButtonRef = useRef<any>(null);
  const editSaveButtonRef = useRef<any>(null);
  const deleteCancelButtonRef = useRef<any>(null);
  const deleteConfirmButtonRef = useRef<any>(null);
  const editNotesFieldRef = useRef<HTMLInputElement | null>(null);
  const editButtonsContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setExerciseNames(getExerciseNames());
    loadAllExercises();
    // Figma opent met een oefening gekozen: neem de laatst gelogde.
    const latest = [...getAllExercises()]
      .filter((ex) => ex.name?.trim())
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
    if (latest?.name) setSelectedExercise(latest.name);
  }, []);

  const loadAllExercises = () => {
    const exercises = getAllExercises();
    setAllExercises(exercises);
  };

  const progress = useMemo(
    () => (selectedExercise ? computeExerciseProgress(getAllExercisesByName(selectedExercise)) : null),
    // allExercises.length: opnieuw na bewerken/verwijderen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedExercise, allExercises.length]
  );

  const balance = useMemo(
    () =>
      computeTrainingBalance(allExercises, (name) => ({
        movementType: findExerciseMetadata(name)?.movementType,
        primaryRegions: getExerciseMuscleMapping(name)?.primary ?? [],
      })),
    [allExercises]
  );

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
    
    const exercises = getAllExercises();
    setAllExercises(exercises);
    
    const loggedNames = getExerciseNames();
    setExerciseNames(loggedNames);
    
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
  }, [deletingExerciseId, selectedExercise]);

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

  const delta = progress && progress.previous != null ? progress.latest - progress.previous : null;
  const balanceRows = [balance.pushPull, balance.upperLower, balance.compoundIsolation].filter(
    (b): b is BalancePair => b != null
  );

  return (
    <PageLayout maxWidth="none">
      {exerciseNames.length === 0 ? (
        <ContentCard>
          <EmptyState>Nog geen oefeningen gelogd. Log er een om je progressie te zien.</EmptyState>
        </ContentCard>
      ) : (
        <>
          {/* Keuzebalk (Figma "Picker"): gekozen oefening met "Wijzig"; wijzigen opent de zoeklijst. */}
          {selectedExercise && !picking ? (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                minHeight: 42,
                pl: 1.75,
                pr: 0.5,
                mb: 2.5,
                border: 1,
                borderColor: 'divider',
                borderRadius: `${designTokens.cardRadius / 2}px`,
              }}
            >
              <Typography variant="body2" sx={{ fontWeight: 600, flex: 1, minWidth: 0 }} noWrap>
                {selectedExercise}
              </Typography>
              <Button size="small" onClick={() => setPicking(true)} sx={{ textTransform: 'none', fontWeight: 600 }}>
                Wijzig
              </Button>
            </Box>
          ) : (
            <Autocomplete
              options={exerciseNames}
              value={selectedExercise}
              onChange={(_, newValue) => {
                if (newValue) setSelectedExercise(newValue);
                setPicking(false);
              }}
              onBlur={() => setPicking(false)}
              openOnFocus
              noOptionsText="Geen oefeningen gevonden"
              sx={{ mb: 2.5 }}
              renderInput={(params) => (
                <TextField {...params} size="small" autoFocus={picking} label="Oefening" placeholder="Zoek een oefening" />
              )}
            />
          )}

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '3fr 2fr' },
              gridTemplateAreas: { xs: '"max" "recent" "balance"', md: '"max recent" "balance recent"' },
              gridTemplateRows: { md: 'auto 1fr' },
              gap: { xs: 2.5, md: 2.5 },
              alignItems: 'start',
            }}
          >
            <Box sx={{ gridArea: 'max', ...cardSx(), p: { xs: 2, md: 3 }, minWidth: 0 }}>
              <Typography variant="body2" color="text.secondary">
                Max gewicht
              </Typography>
              {progress ? (
                <>
                  <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mt: 1 }}>
                    <Typography sx={{ fontSize: { xs: 36, md: 45 }, lineHeight: 1.15, fontWeight: 500 }}>
                      {String(progress.max).replace('.', ',')}
                    </Typography>
                    <Typography variant="body1" color="text.secondary" sx={{ flex: 1 }}>
                      kg
                    </Typography>
                    {delta != null && delta !== 0 && (
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 600, color: delta > 0 ? 'primary.main' : 'error.main' }}
                      >
                        {delta > 0 ? '+' : '−'}
                        {kg(Math.abs(delta))}
                      </Typography>
                    )}
                  </Box>
                  {progress.previous != null && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                      Tegenover je vorige sessie, {kg(progress.previous)}
                    </Typography>
                  )}
                  {progress.sessions.length > 1 && (
                    <Box sx={{ width: '100%', height: { xs: 110, md: 160 }, mt: 2 }}>
                      <ResponsiveContainer>
                        <LineChart data={progress.sessions} margin={{ top: 8, right: 4, bottom: 4, left: 4 }}>
                          <YAxis hide domain={['dataMin - 2', 'dataMax + 2']} />
                          <Tooltip
                            formatter={(value: number) => [kg(value), 'Gewicht']}
                            labelFormatter={(_, payload) => (payload?.[0] ? sessionDayLabel(payload[0].payload.day) : '')}
                          />
                          <Line
                            type="linear"
                            dataKey="weight"
                            stroke={theme.palette.primary.main}
                            strokeWidth={2.5}
                            dot={false}
                            activeDot={{ r: 5 }}
                            isAnimationActive={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </Box>
                  )}
                </>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Nog geen gewicht gelogd voor deze oefening.
                </Typography>
              )}
            </Box>

            <Box sx={{ gridArea: 'recent', minWidth: 0 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                Recente sessies
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {lastThreeSessions.map((exercise) => (
                  <Box
                    key={exercise.id}
                    sx={{ ...cardSx(), display: 'flex', alignItems: 'flex-start', gap: 1, pl: 2.25, pr: 0.5, py: 1.25 }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {sessionDayLabel(exercise.date)}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" noWrap>
                          {formatLogDetails(exercise)}
                        </Typography>
                      </Box>
                      {exercise.notes?.trim() && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                          “{exercise.notes.trim()}”
                        </Typography>
                      )}
                    </Box>
                    <IconButton
                      size="small"
                      aria-label="Log bewerken of verwijderen"
                      onClick={(e) => handleMenuOpen(e, exercise.id)}
                      sx={{ color: 'text.secondary', mt: -0.25 }}
                    >
                      <MoreVertIcon fontSize="small" />
                    </IconButton>
                  </Box>
                ))}
              </Box>
            </Box>

            {balanceRows.length > 0 && (
              <Box sx={{ gridArea: 'balance', ...cardSx(), p: { xs: 2, md: 3 }, minWidth: 0 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>
                  Trainingsbalans
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.75 }}>
                  {balanceRows.map((pair) => (
                    <BalanceBar key={pair.a} pair={pair} />
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        </>
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
              <NumberField
                label="Gewicht (kg)"
                decimal
                value={weight}
                onChange={setWeight}
                sx={{ flex: 1 }}
              />

              <NumberField
                label="Sets"
                value={sets}
                onChange={setSets}
                sx={{ flex: 1 }}
              />

              <NumberField
                label="Reps"
                value={reps}
                onChange={setReps}
                sx={{ flex: 1 }}
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
    </PageLayout>
  );
};

