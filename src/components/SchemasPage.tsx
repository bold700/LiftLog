import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Typography,
  Box,
  IconButton,
  Button,
  Menu,
  MenuItem,
  Tabs,
  Tab,
  useMediaQuery,
  useTheme,
  Snackbar,
  CircularProgress,
} from '@mui/material';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { useWorkouts } from '../hooks/useWorkouts';
import {
  getSortedDayIndices,
  getCurrentWeekDayIndex,
  isWeeklyGroupSchema,
} from '../utils/schemaSessionUtils';
import { todayIso } from '../utils/format';
import { Schema } from '../types';
import type { GroupSession } from '../types';
import { createEmptyFormule7 } from '../utils/formule7Defaults';
import {
  getCategories,
  getSeriesOptions,
  filterWorkouts,
  isCurrentWeek as isCurrentWeekFor,
  getCurrentScheduleWeek,
  matchesAssignees,
  getAssigneeIds,
  ASSIGNEE_OPEN,
  ASSIGNEE_UNASSIGNED,
} from '../utils/workoutFilter';
import type { Profile } from '../types';
import { SchemaEditView } from './SchemaEditView';
import { TrainingSessionView } from './TrainingSessionView';
import { GroupSessionView } from './GroupSessionView';
import { createGroupSession } from '../services/groupSessionService';
import { getMyPendingRequest } from '../services/workoutRequestService';
import { useAddFromSchema } from '../context/AddFromSchemaContext';
import { useProfile } from '../context/ProfileContext';
import { PageLayout, ContentCard, EmptyState } from './layout';
import { SchemaDeleteDialog } from './schemas/SchemaDeleteDialog';
import { GroupSessionSetupDialog } from './schemas/GroupSessionSetupDialog';
import { WorkoutRequestDialog } from './schemas/WorkoutRequestDialog';
import { NewSchemaDialog } from './schemas/NewSchemaDialog';
import { SchemaPrintView } from './schemas/SchemaPrintView';
import { SchemaPeriodSummary } from './schemas/SchemaPeriodSummary';
import { SchemaDayCard } from './schemas/SchemaDayCard';
import { SporterFeedbackCard } from './schemas/SporterFeedbackCard';
import { SchemaListFilters } from './schemas/SchemaListFilters';
import type { AssigneeOption } from './schemas/SchemaListFilters';
import { SchemaListCard } from './schemas/SchemaListCard';
import '@material/web/button/filled-button.js';
import '@material/web/button/text-button.js';
import '@material/web/icon/icon.js';

type View = 'list' | 'detail' | 'edit' | 'session' | 'groupSession';


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
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up('sm'));
  const today = todayIso();
  const isThisWeek = useCallback((s: Schema) => isCurrentWeekFor(s, today), [today]);
  const currentScheduleWeek = getCurrentScheduleWeek();
  // Tabs in de lijst: '' = gewone workouts (zonder categorie), anders de categorie (bijv. "Groepslessen").
  const [activeCategory, setActiveCategory] = useState<string>('');
  const [activeSeries, setActiveSeries] = useState<string | null>(null);
  const [onlyCurrentWeek, setOnlyCurrentWeek] = useState(false);
  const categories = useMemo(() => getCategories(schemas), [schemas]);
  useEffect(() => {
    if (activeCategory && !categories.includes(activeCategory)) {
      setActiveCategory('');
      setActiveSeries(null);
      setOnlyCurrentWeek(false);
    }
  }, [activeCategory, categories]);
  const seriesOptions = useMemo(() => getSeriesOptions(schemas, activeCategory), [schemas, activeCategory]);
  // Filter op sporter (tab Workouts, alleen trainer): zoekveld met meerdere selecties.
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeOption[]>([]);
  const rosterById = useMemo(() => {
    const m = new Map<string, Profile>();
    for (const p of sportersForAssignment) m.set(p.userId, p);
    return m;
  }, [sportersForAssignment]);
  const nameOf = useCallback(
    (uid: string) => {
      const p = rosterById.get(uid);
      return p?.displayName?.trim() || p?.email || 'Onbekende sporter';
    },
    [rosterById]
  );
  const assigneeOptions = useMemo<AssigneeOption[]>(() => {
    const people = [...sportersForAssignment]
      .sort((a, b) => nameOf(a.userId).localeCompare(nameOf(b.userId), 'nl'))
      .map((p) => ({ key: p.userId, label: nameOf(p.userId), profile: p }));
    return [
      { key: ASSIGNEE_OPEN, label: 'Open voor iedereen' },
      { key: ASSIGNEE_UNASSIGNED, label: 'Niet toegewezen' },
      ...people,
    ];
  }, [sportersForAssignment, nameOf]);
  const visibleSchemas = useMemo(() => {
    const list = filterWorkouts(schemas, { category: activeCategory, series: activeSeries, onlyCurrentWeek }, today);
    if (activeCategory || assigneeFilter.length === 0) return list;
    const keys = assigneeFilter.map((o) => o.key);
    return list.filter((s) => matchesAssignees(s, keys));
  }, [schemas, activeCategory, activeSeries, onlyCurrentWeek, today, assigneeFilter]);
  /** Korte omschrijving van voor wie de workout is, met namen i.p.v. "Klant toegewezen". */
  const assigneeSummary = useCallback(
    (s: Schema): { text: string; avatars: Profile[] } => {
      if (s.audience === 'group') return { text: `Groepsles (${s.participantIds?.length ?? 0})`, avatars: [] };
      if (s.audience === 'open') return { text: 'Open voor iedereen', avatars: [] };
      const ids = getAssigneeIds(s);
      if (ids.length === 0) return { text: 'Niet toegewezen', avatars: [] };
      const names = ids.map(nameOf);
      const shown = names.slice(0, 3).join(', ');
      const rest = names.length - 3;
      return {
        text: rest > 0 ? `${shown} +${rest}` : shown,
        avatars: ids.map((id) => rosterById.get(id)).filter((p): p is Profile => Boolean(p)).slice(0, 3),
      };
    },
    [nameOf, rosterById]
  );
  /** Wisselt van filter en springt terug naar de bovenkant van de lijst. */
  const applyFilter = useCallback((change: () => void) => {
    change();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);
  const [sessionDayIndex, setSessionDayIndex] = useState<number>(0);
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [justLoggedExerciseId, setJustLoggedExerciseId] = useState<string | null>(null);
  const [openNewSchemaDialog, setOpenNewSchemaDialog] = useState(false);
  const [actionsAnchorEl, setActionsAnchorEl] = useState<null | HTMLElement>(null);
  /** Statusmelding tijdens het maken van de PDF (plaatjes ophalen kan even duren). */
  const [pdfStatus, setPdfStatus] = useState<string | null>(null);
  const [pdfFailed, setPdfFailed] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [hasPendingRequest, setHasPendingRequest] = useState(false);
  const [activeGroupSession, setActiveGroupSession] = useState<GroupSession | null>(null);
  const [groupSetup, setGroupSetup] = useState<{
    open: boolean;
    dayIndex: number;
    date: string;
    participantIds: string[];
    starting: boolean;
  }>({ open: false, dayIndex: 0, date: todayIso(), participantIds: [], starting: false });

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

  const handleOpenGroupSetup = useCallback(
    (dayIndex: number) => {
      setGroupSetup({
        open: true,
        dayIndex,
        date: todayIso(),
        participantIds: selectedSchema?.participantIds ?? [],
        starting: false,
      });
    },
    [selectedSchema]
  );

  const handleCloseGroupSetup = useCallback(() => {
    setGroupSetup((s) => ({ ...s, open: false }));
  }, []);

  const handleGroupDateChange = useCallback((date: string) => {
    setGroupSetup((s) => ({ ...s, date }));
  }, []);

  const toggleGroupParticipant = useCallback((userId: string) => {
    setGroupSetup((s) => ({
      ...s,
      participantIds: s.participantIds.includes(userId)
        ? s.participantIds.filter((id) => id !== userId)
        : [...s.participantIds, userId],
    }));
  }, []);

  const handleConfirmGroupStart = useCallback(async () => {
    if (!selectedSchema || !profile?.profile || groupSetup.participantIds.length === 0) return;
    setGroupSetup((s) => ({ ...s, starting: true }));
    try {
      const session = await createGroupSession({
        trainerId: profile.profile.userId,
        schemaId: selectedSchema.id,
        schemaName: selectedSchema.name,
        dayIndex: groupSetup.dayIndex,
        date: groupSetup.date,
        participantIds: groupSetup.participantIds,
      });
      setActiveGroupSession(session);
      setGroupSetup((s) => ({ ...s, open: false, starting: false }));
      setView('groupSession');
    } catch {
      setGroupSetup((s) => ({ ...s, starting: false }));
    }
  }, [selectedSchema, profile, groupSetup]);

  const handleBackFromGroupSession = useCallback(() => {
    setActiveGroupSession(null);
    setView('detail');
  }, []);

  // Sporter: check of er al een openstaande workout-aanvraag is
  useEffect(() => {
    if (isTrainer || !profile?.profile?.userId) return;
    getMyPendingRequest(profile.profile.userId)
      .then((r) => setHasPendingRequest(!!r))
      .catch(() => {});
  }, [isTrainer, profile?.profile?.userId]);

  const handleRequestSent = useCallback(() => {
    setHasPendingRequest(true);
    setRequestOpen(false);
  }, []);

  const handleNextDay = useCallback(() => {
    if (!selectedSchema) return;
    const next = (sessionDayIndex + 1) % selectedSchema.days.length;
    setSessionDayIndex(next);
    setJustLoggedExerciseId(null);
  }, [selectedSchema, sessionDayIndex]);

  if (view === 'edit' && selectedSchema) {
    return (
      <SchemaEditView
        schema={selectedSchema}
        onSave={handleSaveSchema}
        onCancel={handleCancelEdit}
        sporters={sportersForAssignment}
        categories={categories}
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

  if (view === 'groupSession' && activeGroupSession) {
    const schemaForSession = selectedSchema ?? getSchemaById(activeGroupSession.schemaId);
    if (schemaForSession) {
      const participants = (profile?.allSporters ?? []).filter((p) =>
        activeGroupSession.participantIds.includes(p.userId)
      );
      return (
        <GroupSessionView
          schema={schemaForSession}
          session={activeGroupSession}
          participants={participants}
          currentUserId={profile?.profile?.userId ?? ''}
          onBack={handleBackFromGroupSession}
        />
      );
    }
  }

  if (view === 'detail' && selectedSchema) {
    return (
      <PageLayout>
        <ContentCard>
            {/* Print-vriendelijke variant: eenvoudige header + tabel per dag */}
            <SchemaPrintView schema={selectedSchema} />

            {/* Normale scherm-layout */}
            {/* Eén regel: de titel kort af met … zodat het menu rechts blijft staan. */}
            <Box className="workout-detail-screen" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3, flexWrap: 'nowrap', gap: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: '1 1 auto', minWidth: 0 }}>
                <IconButton size="small" onClick={handleBack} sx={{ p: 0.5, flexShrink: 0 }} aria-label="Terug">
                  <ArrowBackIosNewIcon fontSize="small" />
                </IconButton>
                <Typography
                  variant="h6"
                  sx={{
                    fontWeight: 600,
                    // minWidth 0 is nodig: een flex-item krimpt anders niet onder zijn tekstbreedte.
                    minWidth: 0,
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
                    sx={{ flexShrink: 0 }}
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
                      disabled={pdfStatus !== null}
                      onClick={async () => {
                        handleCloseActions();
                        const clientProfile = sportersForAssignment.find(
                          (s) => s.userId === selectedSchema.clientId
                        );
                        const clientName =
                          clientProfile?.displayName || clientProfile?.email || null;
                        const trainerName =
                          profile?.profile?.displayName || profile?.profile?.email || null;
                        const participantNames = (selectedSchema.participantIds ?? [])
                          .filter((uid) => rosterById.has(uid))
                          .map((uid) => nameOf(uid));
                        setPdfStatus('PDF maken…');
                        try {
                          // jsPDF (~400 kB) pas laden als er echt een PDF gemaakt wordt.
                          const { exportSchemaToPdf } = await import('../utils/pdfExport');
                          await exportSchemaToPdf(selectedSchema, {
                            clientName,
                            trainerName,
                            participantNames,
                            onProgress: setPdfStatus,
                          });
                        } catch (err) {
                          console.error('PDF maken mislukt', err);
                          setPdfFailed(true);
                          setPdfStatus(null);
                          return;
                        }
                        setPdfStatus(null);
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
              <SchemaPeriodSummary
                schema={selectedSchema}
                startDate={selectedSchema.startDate}
                endDate={selectedSchema.endDate}
              />
            )}

            {isTrainer && selectedSchema.clientId && selectedSchema.audience !== 'group' && (
              <SporterFeedbackCard
                userId={selectedSchema.clientId}
                sporterName={nameOf(selectedSchema.clientId)}
                schemaId={selectedSchema.id}
              />
            )}

            {selectedSchema.days.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                Nog geen dagen. Klik op Bewerken om dagen en oefeningen toe te voegen.
              </Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {getSortedDayIndices(selectedSchema).map((dayIndex) => {
                  const isCurrentWeek =
                    isThisWeek(selectedSchema) ||
                    (isWeeklyGroupSchema(selectedSchema) && getCurrentWeekDayIndex(selectedSchema) === dayIndex);
                  return (
                    <SchemaDayCard
                      key={dayIndex}
                      schema={selectedSchema}
                      dayIndex={dayIndex}
                      isCurrentWeek={isCurrentWeek}
                      onStart={() =>
                        isTrainer && selectedSchema.audience === 'group'
                          ? handleOpenGroupSetup(dayIndex)
                          : handleStartTraining(dayIndex)
                      }
                    />
                  );
                })}
              </Box>
            )}

        <SchemaDeleteDialog
          open={openDeleteDialog}
          schemaName={selectedSchema.name}
          onClose={handleCloseDeleteDialog}
          onConfirm={handleConfirmDelete}
        />
      </ContentCard>

      <GroupSessionSetupDialog
        open={groupSetup.open}
        dayLabel={selectedSchema.days[groupSetup.dayIndex]?.dayLabel ?? `Dag ${groupSetup.dayIndex + 1}`}
        date={groupSetup.date}
        participantIds={groupSetup.participantIds}
        starting={groupSetup.starting}
        roster={profile?.allSporters ?? []}
        assignedParticipantIds={selectedSchema.participantIds ?? []}
        onDateChange={handleGroupDateChange}
        onToggleParticipant={toggleGroupParticipant}
        onClose={handleCloseGroupSetup}
        onConfirm={handleConfirmGroupStart}
      />
    </PageLayout>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
      {categories.length > 0 && (
        <Tabs
          value={activeCategory}
          onChange={(_, v: string) =>
            applyFilter(() => {
              setActiveCategory(v);
              setActiveSeries(null);
              setOnlyCurrentWeek(false);
            })
          }
          variant={wide ? 'fullWidth' : 'scrollable'}
          scrollButtons="auto"
          allowScrollButtonsMobile
          sx={{
            minHeight: 48,
            mb: 2,
            width: '100%',
            '& .MuiTab-root': {
              minHeight: 48,
              minWidth: 'auto',
              px: 2,
              textTransform: 'none',
              fontWeight: 600,
              transition: 'color 0.2s ease',
            },
            '& .MuiTabs-indicator': {
              height: 3,
              borderRadius: '3px 3px 0 0',
              transition: 'left 0.25s cubic-bezier(0.22, 1, 0.36, 1), width 0.25s cubic-bezier(0.22, 1, 0.36, 1)',
            },
          }}
        >
          <Tab label="Workouts" value="" id="workouts-tab-alle" />
          {categories.map((c) => (
            <Tab key={c} label={c} value={c} id={`workouts-tab-${c}`} />
          ))}
        </Tabs>
      )}
    {/* Gewone Box als paneel (zoals bij Inzichten): als direct kind van de flex-kolom zou
        PageLayout met zijn automatische marges tot de inhoud krimpen i.p.v. 800px breed worden. */}
    <Box sx={{ flex: 1, minHeight: 0 }}>
    <PageLayout>
      <ContentCard>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 2, flexWrap: 'wrap' }}>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>
            {activeCategory || 'Workouts'}
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

        <SchemaListFilters
          activeCategory={activeCategory}
          showAssigneeFilter={isTrainer && sportersForAssignment.length > 0}
          assigneeOptions={assigneeOptions}
          assigneeFilter={assigneeFilter}
          onAssigneeFilterChange={(v) => applyFilter(() => setAssigneeFilter(v))}
          seriesOptions={seriesOptions}
          activeSeries={activeSeries}
          onSeriesChange={(s) => applyFilter(() => setActiveSeries(s))}
          onlyCurrentWeek={onlyCurrentWeek}
          onToggleCurrentWeek={() => applyFilter(() => setOnlyCurrentWeek((v) => !v))}
          currentScheduleWeek={currentScheduleWeek}
          visibleCount={visibleSchemas.length}
        />

        {loading ? (
          <Typography color="text.secondary">Workouts laden…</Typography>
        ) : schemas.length === 0 ? (
          <EmptyState>
            {canCreateWorkouts ? (
              'Nog geen workouts. Maak er een aan om te beginnen.'
            ) : (
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Nog geen workouts voor jou. Vraag je trainer om een schema, of wacht op een openbare workout.
                </Typography>
                {hasPendingRequest ? (
                  <Typography variant="body2" color="success.main" fontWeight={600}>
                    Aanvraag verstuurd ✓ Je trainer neemt contact op.
                  </Typography>
                ) : (
                  <Button
                    variant="contained"
                    onClick={() => setRequestOpen(true)}
                    sx={{ bgcolor: '#000', color: '#F2E4D3', borderRadius: '20px', textTransform: 'none', '&:hover': { bgcolor: '#1a1a1a' } }}
                  >
                    Workout aanvragen
                  </Button>
                )}
              </Box>
            )}
          </EmptyState>
        ) : visibleSchemas.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
            {activeCategory
              ? onlyCurrentWeek
                ? `Geen training in week ${currentScheduleWeek}${activeSeries ? ` voor ${activeSeries}` : ''}.`
                : `Geen workouts in "${activeCategory}".`
              : 'Geen gewone workouts. Kijk in de andere tabs.'}
          </Typography>
        ) : (
            <Box className="stagger-children" sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {visibleSchemas.map((schema, index) => (
                <SchemaListCard
                  key={schema.id}
                  schema={schema}
                  index={index}
                  isThisWeek={isThisWeek(schema)}
                  assignee={assigneeSummary(schema)}
                  nameOf={nameOf}
                  onClick={() => handleSchemaClick(schema)}
                />
              ))}
          </Box>
        )}
      </ContentCard>

      <NewSchemaDialog
        open={openNewSchemaDialog}
        onClose={() => setOpenNewSchemaDialog(false)}
        onCreateFree={handleCreateFreeSchema}
        onCreateAi={handleCreateAiFormule7Schema}
      />

      <WorkoutRequestDialog
        open={requestOpen}
        profile={profile?.profile ?? null}
        onClose={() => setRequestOpen(false)}
        onSent={handleRequestSent}
      />
    </PageLayout>
    </Box>
      <Snackbar
        open={pdfStatus !== null}
        message={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <CircularProgress size={16} color="inherit" />
            {pdfStatus}
          </Box>
        }
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
      <Snackbar
        open={pdfFailed}
        autoHideDuration={5000}
        onClose={() => setPdfFailed(false)}
        message="PDF maken mislukt. Probeer het opnieuw."
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
};
