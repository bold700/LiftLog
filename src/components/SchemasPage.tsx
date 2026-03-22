import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  IconButton,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Menu,
  MenuItem,
  Stack,
} from '@mui/material';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { useWorkouts } from '../hooks/useWorkouts';
import { getSortedDayIndices } from '../utils/schemaSessionUtils';
import {
  getCompletedSessionsInPeriod,
  getExerciseProgressInPeriod,
  getDaysRemaining,
} from '../utils/schemaProgressUtils';
import {
  formatWarmupSummary,
  formatCardioSummary,
  formatCooldownSummary,
  formatStretchingSummary,
} from '../utils/format';
import { Schema } from '../types';
import { createEmptyFormule7 } from '../utils/formule7Defaults';
import { SchemaEditView } from './SchemaEditView';
import { TrainingSessionView } from './TrainingSessionView';
import { useAddFromSchema } from '../context/AddFromSchemaContext';
import { useProfile } from '../context/ProfileContext';
import { designTokens } from '../theme/designTokens';
import { exportSchemaToPdf } from '../utils/pdfExport';
import { PageLayout, ContentCard, EmptyState } from './layout';
import '@material/web/button/filled-button.js';
import '@material/web/button/text-button.js';
import '@material/web/icon/icon.js';

type View = 'list' | 'detail' | 'edit' | 'session';

export const SchemasPage = () => {
  const addFromSchema = useAddFromSchema();
  const {
    schemas,
    loading,
    loadSchemas,
    getSchemaById,
    saveSchema,
    deleteSchema,
    createEmptySchema,
    canCreateWorkouts,
    isTrainer,
  } = useWorkouts();
  const profile = useProfile();
  const sportersForAssignment = isTrainer ? (profile?.allSporters ?? []) : [];
  const [view, setView] = useState<View>('list');
  const [selectedSchemaId, setSelectedSchemaId] = useState<string | null>(null);
  const [sessionDayIndex, setSessionDayIndex] = useState<number>(0);
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [justLoggedExerciseId, setJustLoggedExerciseId] = useState<string | null>(null);
  const [openNewSchemaDialog, setOpenNewSchemaDialog] = useState(false);
  const deleteCancelButtonRef = useRef<any>(null);
  const deleteConfirmButtonRef = useRef<any>(null);
  const [actionsAnchorEl, setActionsAnchorEl] = useState<null | HTMLElement>(null);

  // Na het opslaan van een log vanuit Toevoegen: terug naar deze trainingssessie + snackbar
  useEffect(() => {
    const rt = addFromSchema?.returnToSession;
    if (!rt) return;
    setSelectedSchemaId(rt.schemaId);
    setSessionDayIndex(rt.dayIndex);
    setView('session');
    setJustLoggedExerciseId(rt.exerciseId ?? null);
    addFromSchema.clearReturnToSession();
  }, [addFromSchema?.returnToSession, addFromSchema]);

  // Bij wijziging in logs (zelfde tab of andere) dagvolgorde en status bijwerken op detail-view
  useEffect(() => {
    if (view !== 'detail') return;
    const handler = () => loadSchemas();
    window.addEventListener('workoutUpdated', handler);
    return () => window.removeEventListener('workoutUpdated', handler);
  }, [view, loadSchemas]);

  const selectedSchema = selectedSchemaId ? getSchemaById(selectedSchemaId) : null;

  const handleBack = useCallback(() => {
    setView('list');
    setSelectedSchemaId(null);
  }, []);

  const handleSchemaClick = useCallback((schema: Schema) => {
    setSelectedSchemaId(schema.id);
    setView('detail');
  }, []);

  const handleOpenActions = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setActionsAnchorEl(event.currentTarget);
  }, []);

  const handleCloseActions = useCallback(() => {
    setActionsAnchorEl(null);
  }, []);

  const handleNewSchemaClick = useCallback(() => {
    setOpenNewSchemaDialog(true);
  }, []);

  const handleCreateFreeSchema = useCallback(async () => {
    const schema = createEmptySchema('Nieuwe workout');
    await saveSchema(schema);
    loadSchemas();
    setSelectedSchemaId(schema.id);
    setView('edit');
    setOpenNewSchemaDialog(false);
  }, [createEmptySchema, saveSchema, loadSchemas]);

  const handleCreateFormule7Schema = useCallback(async () => {
    const base = createEmptySchema('Formule 7 workout');
    const schema: Schema = {
      ...base,
      isFormule7Template: true,
      formule7AssistMode: 'manual',
      formule7: createEmptyFormule7(),
    };
    await saveSchema(schema);
    loadSchemas();
    setSelectedSchemaId(schema.id);
    setView('edit');
    setOpenNewSchemaDialog(false);
  }, [createEmptySchema, saveSchema, loadSchemas]);

  const handleCreateAiFormule7Schema = useCallback(async () => {
    const base = createEmptySchema('Formule 7 workout (AI)');
    const schema: Schema = {
      ...base,
      isFormule7Template: true,
      formule7AssistMode: 'ai',
      formule7: createEmptyFormule7(),
    };
    await saveSchema(schema);
    loadSchemas();
    setSelectedSchemaId(schema.id);
    setView('edit');
    setOpenNewSchemaDialog(false);
  }, [createEmptySchema, saveSchema, loadSchemas]);

  const handleSaveSchema = useCallback(
    async (updated: Schema) => {
      await saveSchema(updated);
      loadSchemas();
      setView('detail');
    },
    [saveSchema, loadSchemas]
  );

  const handleDuplicateSchema = useCallback(
    async (schema: Schema) => {
      const base = createEmptySchema(`${schema.name} (kopie)`);
      const copy: Schema = {
        ...base,
        days: schema.days,
        formule7: schema.formule7 ?? null,
        clientId: null,
        startDate: null,
        endDate: null,
        isFormule7Template: schema.isFormule7Template,
        formule7AssistMode: schema.formule7AssistMode,
      };
      await saveSchema(copy);
      loadSchemas();
      setSelectedSchemaId(copy.id);
      setView('edit');
    },
    [createEmptySchema, saveSchema, loadSchemas]
  );

  const handleCancelEdit = useCallback(() => {
    setView('detail');
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (selectedSchemaId) {
      await deleteSchema(selectedSchemaId);
      setOpenDeleteDialog(false);
      setSelectedSchemaId(null);
      setView('list');
      loadSchemas();
    }
  }, [selectedSchemaId, deleteSchema, loadSchemas]);

  const handleCloseDeleteDialog = useCallback(() => {
    setOpenDeleteDialog(false);
  }, []);

  const handleStartTraining = useCallback((dayIndex: number) => {
    setSessionDayIndex(dayIndex);
    setView('session');
  }, []);

  const handleBackFromSession = useCallback(() => {
    setJustLoggedExerciseId(null);
    setView('detail');
  }, []);

  const handleNextDay = useCallback(() => {
    if (!selectedSchema) return;
    const next = (sessionDayIndex + 1) % selectedSchema.days.length;
    setSessionDayIndex(next);
    setJustLoggedExerciseId(null);
  }, [selectedSchema, sessionDayIndex]);

  useEffect(() => {
    if (!openDeleteDialog) return;
    requestAnimationFrame(() => {
      const cancelBtn = deleteCancelButtonRef.current;
      const confirmBtn = deleteConfirmButtonRef.current;
      if (cancelBtn) {
        const h = () => handleCloseDeleteDialog();
        cancelBtn.addEventListener('click', h);
        (cancelBtn as any)._clickHandler = h;
      }
      if (confirmBtn) {
        const h = () => handleConfirmDelete();
        confirmBtn.addEventListener('click', h);
        (confirmBtn as any)._clickHandler = h;
      }
    });
    return () => {
      requestAnimationFrame(() => {
        const cancelBtn = deleteCancelButtonRef.current;
        const confirmBtn = deleteConfirmButtonRef.current;
        if (cancelBtn && (cancelBtn as any)._clickHandler) {
          cancelBtn.removeEventListener('click', (cancelBtn as any)._clickHandler);
          delete (cancelBtn as any)._clickHandler;
        }
        if (confirmBtn && (confirmBtn as any)._clickHandler) {
          confirmBtn.removeEventListener('click', (confirmBtn as any)._clickHandler);
          delete (confirmBtn as any)._clickHandler;
        }
      });
    };
  }, [openDeleteDialog, handleCloseDeleteDialog, handleConfirmDelete]);

  if (view === 'edit' && selectedSchema) {
    return (
      <SchemaEditView
        schema={selectedSchema}
        onSave={handleSaveSchema}
        onCancel={handleCancelEdit}
        sporters={sportersForAssignment}
      />
    );
  }

  if (view === 'session' && selectedSchema && selectedSchema.days[sessionDayIndex]) {
    return (
      <TrainingSessionView
        schema={selectedSchema}
        dayIndex={sessionDayIndex}
        onBack={handleBackFromSession}
        onNextDay={handleNextDay}
        justLoggedExerciseId={justLoggedExerciseId}
        onClearJustLogged={() => setJustLoggedExerciseId(null)}
      />
    );
  }

  if (view === 'detail' && selectedSchema) {
    return (
      <PageLayout>
        <ContentCard>
            {/* Print-vriendelijke variant: eenvoudige header + tabel per dag */}
            <Box className="workout-detail-print" sx={{ display: 'none' }}>
              <Typography variant="h5" fontWeight={600} gutterBottom>
                {selectedSchema.name}
              </Typography>
              <Typography variant="body2" gutterBottom>
                Periode:{' '}
                {selectedSchema.startDate && selectedSchema.endDate
                  ? `${selectedSchema.startDate} t/m ${selectedSchema.endDate}`
                  : 'geen periode ingesteld'}
              </Typography>
              {selectedSchema.clientId && (
                <Typography variant="body2" gutterBottom>
                  Cliënt-ID: {selectedSchema.clientId}
                </Typography>
              )}
              {selectedSchema.days.map((day, dayIndex) => (
                <Box key={dayIndex} sx={{ mt: 3 }}>
                  <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                    {day.dayLabel}
                  </Typography>
                  {day.exercises.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      Geen oefeningen
                    </Typography>
                  ) : (
                    <table
                      style={{
                        width: '100%',
                        borderCollapse: 'collapse',
                        fontSize: '0.9rem',
                      }}
                    >
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '4px 0' }}>
                            Oefening
                          </th>
                          <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '4px 0' }}>
                            Sets
                          </th>
                          <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '4px 0' }}>
                            Reps
                          </th>
                          <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '4px 0' }}>
                            Rust (sec)
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {day.exercises.map((ex, idx) => (
                          <tr key={idx}>
                            <td style={{ padding: '2px 0', borderBottom: '1px solid #eee' }}>{ex.exerciseName}</td>
                            <td style={{ padding: '2px 0', borderBottom: '1px solid #eee' }}>
                              {ex.setsTarget ?? ''}
                            </td>
                            <td style={{ padding: '2px 0', borderBottom: '1px solid #eee' }}>
                              {ex.repsTarget ?? ''}
                            </td>
                            <td style={{ padding: '2px 0', borderBottom: '1px solid #eee' }}>
                              {ex.restSeconds ?? ''}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </Box>
              ))}
            </Box>

            {/* Normale scherm-layout */}
            <Box className="workout-detail-screen" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3, flexWrap: 'wrap', gap: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <IconButton size="small" onClick={handleBack} sx={{ p: 0.5 }} aria-label="Terug">
                  <ArrowBackIosNewIcon fontSize="small" />
                </IconButton>
                <Typography
                  variant="h6"
                  sx={{
                    fontWeight: 600,
                    maxWidth: '100%',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  title={selectedSchema.name}
                >
                  {selectedSchema.name}
                </Typography>
              </Box>
              {isTrainer && selectedSchema && (
                <>
                  <IconButton
                    size="small"
                    aria-label="Meer acties"
                    onClick={handleOpenActions}
                  >
                    <MoreVertIcon fontSize="small" />
                  </IconButton>
                  <Menu
                    anchorEl={actionsAnchorEl}
                    open={Boolean(actionsAnchorEl)}
                    onClose={handleCloseActions}
                    anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                    transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                  >
                    <MenuItem
                      onClick={() => {
                        handleCloseActions();
                        setView('edit');
                      }}
                    >
                      Bewerken
                    </MenuItem>
                    <MenuItem
                      onClick={() => {
                        handleCloseActions();
                        handleDuplicateSchema(selectedSchema);
                      }}
                    >
                      Dupliceren
                    </MenuItem>
                    <MenuItem
                      onClick={async () => {
                        handleCloseActions();
                        const clientProfile = sportersForAssignment.find(
                          (s) => s.userId === selectedSchema.clientId
                        );
                        const clientName =
                          clientProfile?.displayName || clientProfile?.email || null;
                        const trainerName =
                          profile?.profile?.displayName || profile?.profile?.email || null;
                        await exportSchemaToPdf(selectedSchema, { clientName, trainerName });
                      }}
                    >
                      Download PDF
                    </MenuItem>
                    <MenuItem
                      onClick={() => {
                        handleCloseActions();
                        setOpenDeleteDialog(true);
                      }}
                    >
                      Verwijderen
                    </MenuItem>
                  </Menu>
                </>
              )}
            </Box>

            {selectedSchema.startDate && selectedSchema.endDate && (
              <Box
                sx={{
                  py: 1.5,
                  px: 2,
                  mb: 2,
                  borderRadius: 2,
                  bgcolor: 'rgba(0,0,0,0.04)',
                  border: '1px solid rgba(0,0,0,0.08)',
                }}
              >
                <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                  Periode
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {new Date(selectedSchema.startDate).toLocaleDateString('nl-NL', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}{' '}
                  t/m{' '}
                  {new Date(selectedSchema.endDate).toLocaleDateString('nl-NL', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </Typography>
                {(() => {
                  const remaining = getDaysRemaining(selectedSchema.endDate);
                  if (remaining !== null) {
                    return (
                      <Typography variant="body2" sx={{ mt: 0.5 }} fontWeight={500}>
                        Nog {remaining} {remaining === 1 ? 'dag' : 'dagen'} te gaan
                      </Typography>
                    );
                  }
                  return null;
                })()}
                {(() => {
                  const sessions = getCompletedSessionsInPeriod(
                    selectedSchema,
                    selectedSchema.startDate!,
                    selectedSchema.endDate!
                  );
                  return (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      {sessions} {sessions === 1 ? 'sessie' : 'sessies'} voltooid in deze periode
                    </Typography>
                  );
                })()}
              </Box>
            )}

            {selectedSchema.days.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                Nog geen dagen. Klik op Bewerken om dagen en oefeningen toe te voegen.
              </Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {getSortedDayIndices(selectedSchema).map((dayIndex) => {
                  const day = selectedSchema.days[dayIndex];
                  return (
                  <Card
                    key={dayIndex}
                    sx={{
                      backgroundColor: 'transparent',
                      borderRadius: `${designTokens.cardRadius}px`,
                      border: `1px solid ${designTokens.cardBorder}`,
                      boxShadow: 'none',
                    }}
                  >
                    <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 1.5, flexWrap: 'wrap' }}>
                        <Typography variant="subtitle1" fontWeight={600}>
                          {day.dayLabel}
                        </Typography>
                        <Button
                          variant="contained"
                          size="small"
                          startIcon={<PlayArrowRoundedIcon />}
                          onClick={() => handleStartTraining(dayIndex)}
                          disabled={day.exercises.length === 0}
                          aria-label={`Training starten voor ${day.dayLabel}`}
                          sx={{
                            bgcolor: '#000000',
                            color: '#F2E4D3',
                            borderRadius: '20px',
                            px: 2,
                            py: 1,
                            textTransform: 'none',
                            fontWeight: 500,
                            flexShrink: 0,
                            '&:hover': { bgcolor: '#1a1a1a' },
                            '&.Mui-disabled': { bgcolor: 'rgba(0,0,0,0.12)', color: 'rgba(29,27,26,0.38)' },
                          }}
                        >
                          Training starten
                        </Button>
                      </Box>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 0 }}>
                        {formatWarmupSummary(day.warmup ?? selectedSchema.formule7?.warmup) && (
                          <Box sx={{ py: 0.5, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                            <Typography variant="caption" color="text.secondary" fontWeight={600}>
                              Warming-up
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              {formatWarmupSummary(day.warmup ?? selectedSchema.formule7?.warmup)}
                            </Typography>
                          </Box>
                        )}
                        {formatCardioSummary(day.cardio ?? selectedSchema.formule7?.cardio) && (
                          <Box sx={{ py: 0.5, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                            <Typography variant="caption" color="text.secondary" fontWeight={600}>
                              Cardio
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              {formatCardioSummary(day.cardio ?? selectedSchema.formule7?.cardio)}
                            </Typography>
                          </Box>
                        )}
                        {day.exercises.length === 0 ? (
                          <Typography variant="body2" color="text.secondary">
                            Geen oefeningen
                          </Typography>
                        ) : (
                          <>
                            <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ display: 'block', mb: 0.25 }}>
                              Krachtoefeningen
                            </Typography>
                            {day.exercises.map((ex, exIndex) => {
                            const prog =
                              selectedSchema.startDate && selectedSchema.endDate
                                ? getExerciseProgressInPeriod(
                                    selectedSchema,
                                    ex.exerciseName,
                                    selectedSchema.startDate,
                                    selectedSchema.endDate
                                  )
                                : null;
                            const hasProg =
                              prog &&
                              (prog.firstWeight != null ||
                                prog.lastWeight != null ||
                                prog.targetWeight != null);
                            const hasTarget =
                              hasProg &&
                              prog!.targetWeight != null &&
                              prog!.firstWeight != null &&
                              prog!.targetWeight > prog!.firstWeight;
                            const hasStartAndLast =
                              hasProg &&
                              prog!.firstWeight != null &&
                              prog!.lastWeight != null;
                            const barPercent =
                              hasProg && (hasTarget || (hasStartAndLast && prog!.lastWeight! > prog!.firstWeight!))
                                ? hasTarget
                                  ? prog!.lastWeight != null
                                    ? Math.min(
                                        100,
                                        ((prog!.lastWeight - prog!.firstWeight!) /
                                          (prog!.targetWeight! - prog!.firstWeight!)) *
                                          100
                                      )
                                    : 0
                                  : 100
                                : null;
                            return (
                              <Box
                                key={exIndex}
                                sx={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: 0.25,
                                  py: 1,
                                  borderBottom: exIndex < day.exercises.length - 1 ? '1px solid rgba(0,0,0,0.06)' : 'none',
                                }}
                              >
                                <Typography variant="body2" fontWeight={500}>
                                  {ex.exerciseName}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {ex.setsTarget} × {ex.repsTarget} reps
                                  {ex.restSeconds != null && ex.restSeconds > 0 && ` · ${ex.restSeconds}s rust`}
                                </Typography>
                                {ex.notes && (
                                  <Typography variant="caption" color="text.secondary" fontStyle="italic">
                                    {ex.notes}
                                  </Typography>
                                )}
                                {hasProg && (
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
                                    <Typography variant="caption" color="text.secondary">
                                      {prog!.firstWeight != null ? `${prog!.firstWeight} kg` : '–'} →{' '}
                                      {prog!.lastWeight != null ? `${prog!.lastWeight} kg` : '–'}
                                      {prog!.targetWeight != null ? ` → ${prog!.targetWeight} kg doel` : ''}
                                    </Typography>
                                    {barPercent != null && (
                                      <Box
                                        sx={{
                                          height: 5,
                                          borderRadius: 1,
                                          bgcolor: 'rgba(0,0,0,0.08)',
                                          overflow: 'hidden',
                                          minWidth: 60,
                                          maxWidth: 100,
                                        }}
                                      >
                                        <Box
                                          sx={{
                                            height: '100%',
                                            width: `${hasTarget ? barPercent : 100}%`,
                                            bgcolor: 'success.main',
                                            borderRadius: 1,
                                          }}
                                        />
                                      </Box>
                                    )}
                                  </Box>
                                )}
                              </Box>
                            );
                          })}
                          </>
                        )}
                        {formatCooldownSummary(day.cooldown ?? selectedSchema.formule7?.cooldown) && (
                          <Box sx={{ py: 0.5, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                            <Typography variant="caption" color="text.secondary" fontWeight={600}>
                              Cooling-down
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              {formatCooldownSummary(day.cooldown ?? selectedSchema.formule7?.cooldown)}
                            </Typography>
                          </Box>
                        )}
                        {formatStretchingSummary(day.stretching ?? selectedSchema.formule7?.stretching) && (
                          <Box sx={{ py: 0.5 }}>
                            <Typography variant="caption" color="text.secondary" fontWeight={600}>
                              Stretching
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              {formatStretchingSummary(day.stretching ?? selectedSchema.formule7?.stretching)}
                            </Typography>
                          </Box>
                        )}
                      </Box>
                    </CardContent>
                  </Card>
                  );
                })}
              </Box>
            )}

        <Dialog open={openDeleteDialog} onClose={handleCloseDeleteDialog} maxWidth="sm" fullWidth>
          <DialogTitle>Workout verwijderen</DialogTitle>
          <DialogContent>
            <Typography variant="body1">
              Weet je zeker dat je de workout &quot;{selectedSchema?.name}&quot; wilt verwijderen? Deze actie kan niet ongedaan worden gemaakt.
            </Typography>
          </DialogContent>
          <DialogActions>
            {/* @ts-ignore */}
            <md-text-button ref={deleteCancelButtonRef}>Annuleren</md-text-button>
            {/* @ts-ignore */}
            <md-filled-button
              ref={deleteConfirmButtonRef}
              style={{ '--md-filled-button-container-color': '#BA1A1A' } as any}
            >
              <md-icon slot="start">delete</md-icon>
              Verwijderen
            </md-filled-button>
          </DialogActions>
        </Dialog>
      </ContentCard>
    </PageLayout>
    );
  }

  return (
    <PageLayout>
      <ContentCard>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 2, flexWrap: 'wrap' }}>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>
            Workouts
          </Typography>
          {canCreateWorkouts && (
            <Box
              sx={{ display: 'inline-block' }}
              onClick={handleNewSchemaClick}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && handleNewSchemaClick()}
            >
              {/* @ts-ignore */}
              <md-filled-button>
                <md-icon slot="start">add</md-icon>
                Nieuwe workout aanmaken
              </md-filled-button>
            </Box>
          )}
        </Box>

        {loading ? (
          <Typography color="text.secondary">Workouts laden…</Typography>
        ) : schemas.length === 0 ? (
          <EmptyState>
            {canCreateWorkouts
              ? 'Nog geen workouts. Maak er een aan om te beginnen.'
              : 'Nog geen workouts toegewezen. Je trainer wijst je workouts toe via Beheer.'}
          </EmptyState>
        ) : (
            <Box className="stagger-children" sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {schemas.map((schema, index) => (
                <Card
                  key={schema.id}
                  onClick={() => handleSchemaClick(schema)}
                  sx={{
                    '--stagger-index': index,
                    backgroundColor: 'transparent',
                    borderRadius: `${designTokens.cardRadius}px`,
                    border: `1px solid ${designTokens.cardBorder}`,
                    boxShadow: 'none',
                    cursor: 'pointer',
                    transition: 'transform 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease',
                    '&:hover': {
                      backgroundColor: 'rgba(0,0,0,0.03)',
                      transform: 'translateY(-2px)',
                      boxShadow: 2,
                    },
                  } as any}
                >
                  <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <CalendarMonthRoundedIcon color="action" fontSize="small" />
                      <Typography variant="subtitle1" fontWeight={600}>
                        {schema.name}
                      </Typography>
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                      {schema.days.length} {schema.days.length === 1 ? 'dag' : 'dagen'}
                      {schema.clientId ? ` · Klant toegewezen` : ''}
                      {schema.isFormule7Template
                        ? schema.formule7AssistMode === 'ai'
                          ? ' · Formule 7 · AI'
                          : ' · Formule 7'
                        : ' · Vrij'}
                    </Typography>
                  </CardContent>
                </Card>
              ))}
          </Box>
        )}
      </ContentCard>

      <Dialog
        open={openNewSchemaDialog}
        onClose={() => setOpenNewSchemaDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Nieuwe workout aanmaken</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Kies hoe je wilt starten. Formule 7-routekaart en AI gebruiken dezelfde routekaart; bij AI
            stelt de app eerst vragen om alles te vullen.
          </Typography>
          <Stack spacing={1.25}>
            <Button variant="outlined" fullWidth onClick={handleCreateFreeSchema} sx={{ py: 1.25 }}>
              Vrij
            </Button>
            <Button variant="outlined" fullWidth onClick={handleCreateFormule7Schema} sx={{ py: 1.25 }}>
              Routekaart
            </Button>
            <Button variant="contained" fullWidth onClick={handleCreateAiFormule7Schema} sx={{ py: 1.25 }}>
              AI
            </Button>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenNewSchemaDialog(false)}>Annuleren</Button>
        </DialogActions>
      </Dialog>
    </PageLayout>
  );
};
