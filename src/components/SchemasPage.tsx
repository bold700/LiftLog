import { useState, useEffect, useCallback, useMemo, useRef, type CSSProperties } from 'react';
import {
  Typography,
  Box,
  Button,
  Tabs,
  Tab,
  useMediaQuery,
  useTheme,
  Snackbar,
  CircularProgress,
} from '@mui/material';
import { useWorkouts } from '../hooks/useWorkouts';
import {
  getSortedDayIndices,
  getCurrentWeekDayIndex,
  isWeeklyGroupSchema,
} from '../utils/schemaSessionUtils';
import { todayIso } from '../utils/format';
import { Schema } from '../types';
import type { GroupSession } from '../types';
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
import { useShowBackButton } from '../context/TopBarBackContext';
import { PageLayout, EmptyState } from './layout';
import { SchemaDeleteDialog } from './schemas/SchemaDeleteDialog';
import { GroupSessionSetupDialog } from './schemas/GroupSessionSetupDialog';
import { WorkoutRequestDialog } from './schemas/WorkoutRequestDialog';
import { SchemaPrintView } from './schemas/SchemaPrintView';
import { SchemaDetailView } from './schemas/SchemaDetailView';
import { usePageTitle } from '../context/PageTitleContext';
import { SchemaListFilters } from './schemas/SchemaListFilters';
import type { AssigneeOption } from './schemas/SchemaListFilters';
import { SchemaListCard } from './schemas/SchemaListCard';
import { NewSchemaDialog, type NewSchemaMode } from './schemas/NewSchemaDialog';
import { SwipeActions } from './SwipeActions';
import { useNotify } from '../context/NotifyContext';
import { scrollPageToTop } from '../utils/scrollPage';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import { createEmptyFormule7 } from '../utils/formule7Defaults';
import { designTokens } from '../theme/designTokens';
import '@material/web/button/filled-button.js';
import '@material/web/button/text-button.js';
import '@material/web/icon/icon.js';

type View = 'list' | 'detail' | 'edit' | 'session' | 'groupSession';

/** Hoe diep elk scherm zit, voor de history-gebaseerde terugnavigatie (zie handleNextDay hieronder). */
const VIEW_DEPTH: Record<View, number> = { list: 0, detail: 1, edit: 2, session: 2, groupSession: 2 };


/** Verwijderen mislukt: meestal omdat een andere trainer de workout heeft gemaakt (alleen die mag hem weghalen). */
function deleteErrorMessage(e: unknown): string {
  const code = (e as { code?: string })?.code;
  if (code === 'permission-denied') return 'Deze workout kan alleen de trainer die hem maakte verwijderen.';
  return e instanceof Error && e.message ? `Verwijderen mislukt: ${e.message}` : 'Verwijderen mislukt.';
}

interface SchemasPageProps {
  /** Vanuit het +-menu (App): meteen een nieuwe, lege workout aanmaken en bewerken. */
  initialCreateSchema?: boolean;
  onConsumeInitialCreateSchema?: () => void;
}

export const SchemasPage = ({ initialCreateSchema = false, onConsumeInitialCreateSchema }: SchemasPageProps = {}) => {
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
  const notify = useNotify();
  const sportersForAssignment = useMemo(() => (isTrainer ? (profile?.allSporters ?? []) : []), [isTrainer, profile?.allSporters]);
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
    scrollPageToTop();
  }, []);
  const [sessionDayIndex, setSessionDayIndex] = useState<number>(0);
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [openNewSchemaDialog, setOpenNewSchemaDialog] = useState(false);
  /**
   * Een net aangemaakte workout staat pas in de database na "Opslaan": tot dan is het een concept
   * hier in de state. Annuleren laat dus geen lege "Nieuwe workout" achter.
   */
  const [draft, setDraft] = useState<{ schema: Schema; mode: NewSchemaMode } | null>(null);
  const draftIdRef = useRef<string | null>(null);
  /** Lijst: welke kaart is opzij geveegd (Bewerken/Verwijderen), en welke wordt verwijderd. */
  const [swipedId, setSwipedId] = useState<string | null>(null);
  const [listDeleteTarget, setListDeleteTarget] = useState<Schema | null>(null);
  const [justLoggedExerciseId, setJustLoggedExerciseId] = useState<string | null>(null);
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

  const selectedSchema = selectedSchemaId
    ? draft && draft.schema.id === selectedSchemaId
      ? draft.schema
      : getSchemaById(selectedSchemaId)
    : null;
  // Op de detailweergave staat de naam van de workout in de paginakop (Figma), niet "Workouts".
  usePageTitle(view === 'detail' && selectedSchema ? selectedSchema.name : null);

  const handleBack = useCallback(() => {
    setView('list');
    setSelectedSchemaId(null);
  }, []);

  const handleSchemaClick = useCallback((schema: Schema) => {
    setSelectedSchemaId(schema.id);
    setView('detail');
  }, []);

  /**
   * Nieuwe workout, op de gekozen manier: zelf (leeg), de 7-stappenroute (Formule 7-routekaart)
   * of met AI (het AI-vak bovenaan de editor). Nog niet opslaan: zie `draft`.
   */
  const handleChooseNewSchema = useCallback(
    (mode: NewSchemaMode) => {
      const base = createEmptySchema('Nieuwe workout');
      const schema: Schema =
        mode === 'formule7'
          ? { ...base, isFormule7Template: true, formule7AssistMode: 'manual', formule7: createEmptyFormule7() }
          : base;
      draftIdRef.current = schema.id;
      setDraft({ schema, mode });
      setOpenNewSchemaDialog(false);
      setSelectedSchemaId(schema.id);
      setView('edit');
    },
    [createEmptySchema]
  );

  // Aanmaken gebeurt via het +-menu (FAB, of "+ Log" op desktop): dat zet deze vlag.
  useEffect(() => {
    if (!initialCreateSchema) return;
    onConsumeInitialCreateSchema?.();
    if (canCreateWorkouts) setOpenNewSchemaDialog(true);
  }, [initialCreateSchema, onConsumeInitialCreateSchema, canCreateWorkouts]);

  /** Vanuit de lijst (veeg naar links): meteen bewerken of verwijderen. */
  const handleEditFromList = useCallback((schema: Schema) => {
    setSelectedSchemaId(schema.id);
    setView('edit');
  }, []);
  const handleConfirmListDelete = useCallback(async () => {
    const target = listDeleteTarget;
    setListDeleteTarget(null);
    if (!target) return;
    try {
      await deleteSchema(target.id);
      notify.success(`"${target.name}" is verwijderd.`);
    } catch (e) {
      notify.error(deleteErrorMessage(e));
    }
    loadSchemas();
  }, [listDeleteTarget, deleteSchema, loadSchemas, notify]);

  const handleSaveSchema = useCallback(
    async (updated: Schema) => {
      await saveSchema(updated);
      // Het concept staat nu echt in de lijst; terug gaat dan naar de detailweergave.
      if (draftIdRef.current === updated.id) {
        draftIdRef.current = null;
        setDraft(null);
      }
      loadSchemas();
      // Via history.back() (i.p.v. direct setView) zodat de teruggeduwde history-entry van het
      // bewerkscherm meteen mee verdwijnt — zie de history-navigatie hieronder.
      window.history.back();
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

  /** PDF van de workout; jsPDF (~400 kB) laadt pas als er echt een PDF gemaakt wordt. */
  const handleDownloadPdf = useCallback(
    async (schema: Schema) => {
      const clientProfile = sportersForAssignment.find((s) => s.userId === schema.clientId);
      const clientName = clientProfile?.displayName || clientProfile?.email || null;
      const trainerName = profile?.profile?.displayName || profile?.profile?.email || null;
      const participantNames = (schema.participantIds ?? []).filter((uid) => rosterById.has(uid)).map((uid) => nameOf(uid));
      setPdfStatus('PDF maken…');
      try {
        const { exportSchemaToPdf } = await import('../utils/pdfExport');
        await exportSchemaToPdf(schema, { clientName, trainerName, participantNames, onProgress: setPdfStatus });
      } catch (err) {
        console.error('PDF maken mislukt', err);
        setPdfFailed(true);
      }
      setPdfStatus(null);
    },
    [sportersForAssignment, profile?.profile?.displayName, profile?.profile?.email, rosterById, nameOf]
  );

  const handleCancelEdit = useCallback(() => {
    // Een nooit opgeslagen concept heeft geen detailweergave: terug naar de lijst en weggooien.
    if (draftIdRef.current) {
      draftIdRef.current = null;
      setDraft(null);
      setSelectedSchemaId(null);
      setView('list');
      return;
    }
    setView('detail');
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (selectedSchemaId) {
      try {
        await deleteSchema(selectedSchemaId);
      } catch (e) {
        setOpenDeleteDialog(false);
        notify.error(deleteErrorMessage(e));
        return;
      }
      setOpenDeleteDialog(false);
      loadSchemas();
      // handleBack (via popstate) ruimt selectedSchemaId op en zet de view terug naar 'list'.
      window.history.back();
    }
  }, [selectedSchemaId, deleteSchema, loadSchemas, notify]);

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

  /**
   * Terugpijl in de bovenbalk i.p.v. boven de (scrollbare) inhoud van elk dieper scherm, en de
   * systeem-swipe-terug/hardware-terugknop laten werken alsof het gewoon een pagina terug is.
   *
   * De trucs: (1) elke stap dieper (list → detail → session/edit/groupSession) duwt evenveel
   * history-entries; (2) alle "terug"-acties (de pijl, Annuleren, verwijderen, opslaan) roepen
   * voortaan `window.history.back()` aan i.p.v. zelf `setView(...)`, zodat er altijd exact één
   * entry verdwijnt; (3) de popstate-listener bepaalt aan de hand van het huidige scherm welke
   * bestaande "terug"-functie dat moment betekent. Zonder die tweede stap zou de teller uit de
   * pas lopen en de swipe na een paar keer verkeerd springen.
   */
  const pushedDepthRef = useRef(0);
  const viewRef = useRef(view);
  viewRef.current = view;
  const suppressPopCountRef = useRef(0);

  useShowBackButton(view !== 'list');

  useEffect(() => {
    const onPopState = () => {
      if (suppressPopCountRef.current > 0) {
        suppressPopCountRef.current -= 1;
        return;
      }
      pushedDepthRef.current = Math.max(0, pushedDepthRef.current - 1);
      switch (viewRef.current) {
        case 'session':
          handleBackFromSession();
          break;
        case 'groupSession':
          handleBackFromGroupSession();
          break;
        case 'edit':
          handleCancelEdit();
          break;
        case 'detail':
          handleBack();
          break;
        default:
          break;
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const target = VIEW_DEPTH[view];
    const diff = target - pushedDepthRef.current;
    if (diff > 0) {
      for (let i = 0; i < diff; i++) window.history.pushState({ liftlogSchemasDepth: pushedDepthRef.current + i + 1 }, '');
      pushedDepthRef.current = target;
    } else if (diff < 0) {
      suppressPopCountRef.current += -diff;
      window.history.go(diff);
      pushedDepthRef.current = target;
    }
  }, [view]);

  // Staat in elk scherm klaar: het +-menu kan hem ook openen tijdens een workout of het bewerken
  // (dan blijft dat scherm eronder gewoon staan tot je een keuze maakt).
  const newSchemaDialog = (
    <NewSchemaDialog open={openNewSchemaDialog} onClose={() => setOpenNewSchemaDialog(false)} onChoose={handleChooseNewSchema} />
  );

  if (view === 'edit' && selectedSchema) {
    return (
      <>
      <SchemaEditView
        schema={selectedSchema}
        startWithAi={draft?.schema.id === selectedSchema.id && draft.mode === 'ai'}
        onSave={handleSaveSchema}
        onCancel={() => window.history.back()}
        sporters={sportersForAssignment}
        categories={categories}
      />
      {newSchemaDialog}
      </>
    );
  }

  if (view === 'session' && selectedSchema && selectedSchema.days[sessionDayIndex]) {
    return (
      <>
      <TrainingSessionView
        schema={selectedSchema}
        dayIndex={sessionDayIndex}
        onNextDay={handleNextDay}
        justLoggedExerciseId={justLoggedExerciseId}
        onClearJustLogged={() => setJustLoggedExerciseId(null)}
      />
      {newSchemaDialog}
      </>
    );
  }

  if (view === 'groupSession' && activeGroupSession) {
    const schemaForSession = selectedSchema ?? getSchemaById(activeGroupSession.schemaId);
    if (schemaForSession) {
      const participants = (profile?.allSporters ?? []).filter((p) =>
        activeGroupSession.participantIds.includes(p.userId)
      );
      return (
        <>
        <GroupSessionView
          schema={schemaForSession}
          session={activeGroupSession}
          participants={participants}
          currentUserId={profile?.profile?.userId ?? ''}
        />
        {newSchemaDialog}
        </>
      );
    }
  }

  if (view === 'detail' && selectedSchema) {
    return (
      <>
      <PageLayout maxWidth="none">
        <Box>
            {/* Print-vriendelijke variant: eenvoudige header + tabel per dag */}
            <SchemaPrintView schema={selectedSchema} />

            <Box className="workout-detail-screen">
              <SchemaDetailView
                key={selectedSchema.id}
                schema={selectedSchema}
                allSchemas={schemas}
                assigneeOf={assigneeSummary}
                isStaff={isTrainer}
                dayOrder={getSortedDayIndices(selectedSchema)}
                initialDayIndex={
                  isWeeklyGroupSchema(selectedSchema)
                    ? getCurrentWeekDayIndex(selectedSchema) ?? getSortedDayIndices(selectedSchema)[0] ?? 0
                    : getSortedDayIndices(selectedSchema)[0] ?? 0
                }
                isCurrentWeekDay={(dayIndex) =>
                  isThisWeek(selectedSchema) ||
                  (isWeeklyGroupSchema(selectedSchema) && getCurrentWeekDayIndex(selectedSchema) === dayIndex)
                }
                pdfBusy={pdfStatus !== null}
                onSelectSchema={(s) => setSelectedSchemaId(s.id)}
                onStart={(dayIndex) =>
                  isTrainer && selectedSchema.audience === 'group' ? handleOpenGroupSetup(dayIndex) : handleStartTraining(dayIndex)
                }
                onPdf={() => void handleDownloadPdf(selectedSchema)}
                onEdit={() => setView('edit')}
                onDuplicate={() => void handleDuplicateSchema(selectedSchema)}
                onDelete={() => setOpenDeleteDialog(true)}
                onBack={() => window.history.back()}
              />
            </Box>

        <SchemaDeleteDialog
          open={openDeleteDialog}
          schemaName={selectedSchema.name}
          onClose={handleCloseDeleteDialog}
          onConfirm={handleConfirmDelete}
        />
      </Box>

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
    {newSchemaDialog}
    </>
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
    <PageLayout maxWidth="none">
      <Box>
        {/* Boven de kaart staat al "Workouts" in de bovenbalk; die titel hoeft hier niet nog eens
            te staan. Bij een gekozen categorie (bijv. "Groepslessen") is de naam wel nieuwe
            informatie. Aanmaken gaat via het +-menu. */}
        {activeCategory && (
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
            {activeCategory}
          </Typography>
        )}

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
              'Nog geen workouts. Maak er een aan met de +-knop.'
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
                    sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', borderRadius: '20px', textTransform: 'none', '&:hover': { bgcolor: 'primary.dark' } }}
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
            <Box
              className="stagger-children"
              sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' }, gap: { xs: 1.5, md: 2 } }}
            >
              {visibleSchemas.map((schema, index) => {
                const card = (
                  <SchemaListCard
                    key={schema.id}
                    schema={schema}
                    index={index}
                    isThisWeek={isThisWeek(schema)}
                    assignee={assigneeSummary(schema)}
                    isStaff={isTrainer}
                    nameOf={nameOf}
                    onClick={() => handleSchemaClick(schema)}
                  />
                );
                if (!canCreateWorkouts) return card;
                // Staf: naar links vegen voor Bewerken en Verwijderen (zoals in iOS/Android-lijsten).
                return (
                  <SwipeActions
                    key={schema.id}
                    radius={designTokens.cardRadius}
                    style={{ '--stagger-index': Math.min(index, 8) } as CSSProperties}
                    open={swipedId === schema.id}
                    onOpenChange={(o) => setSwipedId(o ? schema.id : null)}
                    actions={[
                      {
                        label: 'Bewerken',
                        icon: <EditRoundedIcon fontSize="small" />,
                        onClick: () => handleEditFromList(schema),
                        bg: designTokens.secondaryContainer,
                        fg: designTokens.onSecondaryContainer,
                      },
                      {
                        label: 'Verwijderen',
                        icon: <DeleteOutlineRoundedIcon fontSize="small" />,
                        onClick: () => setListDeleteTarget(schema),
                        bg: 'error.main',
                        fg: 'error.contrastText',
                      },
                    ]}
                  >
                    {card}
                  </SwipeActions>
                );
              })}
          </Box>
        )}
      </Box>


      <SchemaDeleteDialog
        open={!!listDeleteTarget}
        schemaName={listDeleteTarget?.name ?? ''}
        onClose={() => setListDeleteTarget(null)}
        onConfirm={() => void handleConfirmListDelete()}
      />

      {newSchemaDialog}

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
