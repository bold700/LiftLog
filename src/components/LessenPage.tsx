import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Autocomplete,
  Box,
  Typography,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControlLabel,
  IconButton,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Alert,
} from '@mui/material';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import GroupRoundedIcon from '@mui/icons-material/GroupRounded';
import { PageLayout, ContentCard, EmptyState } from './layout';
import { useProfile } from '../context/ProfileContext';
import { useNotify } from '../context/NotifyContext';
import { RescheduleDialog } from './RescheduleDialog';
import { getRescheduleRequests, rescheduleDayLabel, type RescheduleRequest } from '../services/rescheduleService';
import {
  getUpcomingClasses,
  getMyBookings,
  getMyStandingBookings,
  getTrainerNames,
  cancelClassForEveryone,
  getBookingsForClass,
  getCreditBalance,
  bookClass,
  cancelBooking,
  cancelClass,
  createClass,
  deleteClass,
  restoreClass,
  SESSION_KIND_COLORS,
  type StudioClass,
  type Booking,
  classHasStarted,
  classHasEnded,
  spotOpenFor,
  cancelIsFree,
  graceUntilMs,
  getWaitlistPositions,
  activeHoldUntil,
  settleWaitlists,
  releaseHold,
  grantCredits,
} from '../services/classService';
import { getOrg } from '../services/orgService';
import { getColleagues } from '../services/profileService';
import { designTokens } from '../theme/designTokens';
import { segmentedToggleSx, filterPillSx } from '../theme/segmentedToggle';
import { FilterGroup, FilterSheet } from './FilterSheet';
import { addWeeks, todayIso } from '../utils/format';
import { WeekTimeGrid } from './lessen/WeekTimeGrid';
import { ClassPlanDialog, ExerciseLines } from './beheer/ClassPlanDialog';
import { getClassPlan, type ClassPlan } from '../services/classPlanService';
import { getPlannableWorkouts } from '../services/workoutFirestore';
import { createGroupSession } from '../services/groupSessionService';
import { ClassSessionView } from './groupSession/ClassSessionView';
import { useShowBackButton } from '../context/TopBarBackContext';
import type { GroupSession, Profile, Schema, SessionKind, StandingBooking } from '../types';

/** Zonder eigen instelling geldt dit aantal uur, zoals de server standaard hanteert. */
const DEFAULT_FREE_CANCEL_HOURS = 12;

const SESSION_KIND_KEYS: SessionKind[] = ['1on1', 'duo', 'group', 'concept'];
const SESSION_KIND_LABELS: Record<SessionKind, string> = { '1on1': '1-op-1', duo: 'Duo PT', group: 'Groep', concept: 'Concept' };
const WEEKDAY_SHORT = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];

type ViewMode = 'week' | 'day';

const today = todayIso;

const dayLabel = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });

/** Korte dagkop voor de weeklijst: "Vandaag", "Morgen" of "maandag 15 sep". */
function relativeDayLabel(date: string): string {
  const diff = Math.round((new Date(`${date}T12:00:00`).getTime() - new Date(`${today()}T12:00:00`).getTime()) / 86_400_000);
  if (diff === 0) return 'Vandaag';
  if (diff === 1) return 'Morgen';
  return new Date(`${date}T12:00:00`).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'short' });
}

/** Maandag t/m zondag van de week waar `date` in valt. */
function weekOf(date: string): string[] {
  const d = new Date(`${date}T12:00:00`);
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    return day.toISOString().slice(0, 10);
  });
}

/** 0 = zondag .. 6 = zaterdag, zoals ClassScheduleSlot/StandingBooking. */
const weekdayOf = (date: string) => new Date(`${date}T12:00:00`).getDay();

/** Label voor de weeknavigatie: "22–28 sep" (of met losse maanden als de week overloopt). */
function weekRangeLabel(weekStrip: string[]): string {
  const start = new Date(`${weekStrip[0]}T12:00:00`);
  const end = new Date(`${weekStrip[weekStrip.length - 1]}T12:00:00`);
  const startDay = start.toLocaleDateString('nl-NL', { day: 'numeric' });
  const endLabel = end.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
  const sameMonth = start.getMonth() === end.getMonth();
  return sameMonth
    ? `${startDay}–${endLabel}`
    : `${start.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}–${endLabel}`;
}

/** Sleutel om een les te koppelen aan een "elke week"-instelling: zelfde lessoort en weekmoment. */
const standingKey = (classTypeId: string, weekday: number, startTime: string) => `${classTypeId}_${weekday}_${startTime}`;

/** Bezetting op één manier, overal: hoeveel plekken er nog vrij zijn ("3/8" las als "3 vrij"). */
/** "20:45" */
const clockOf = (ms: number) => new Date(ms).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });

/** Naar Profiel → Abonnement, waar je credits koopt. */
function goBuyCredits() {
  try {
    sessionStorage.setItem('liftlog.profielTab', 'abonnement');
  } catch {
    /* privémodus */
  }
  window.location.hash = '#profiel';
}

function spotsLabel(cls: StudioClass, mine?: Pick<Booking, 'id'> | null): string {
  const free = spotOpenFor(cls, mine) ? Math.max(0, cls.capacity - cls.bookedCount) : 0;
  if (free === 0) return 'Vol';
  return `${free} ${free === 1 ? 'plek' : 'plekken'} vrij`;
}

export function LessenPage() {
  const profileCtx = useProfile();
  const notify = useNotify();
  const me = profileCtx?.profile ?? null;
  const isStaff = me?.role === 'trainer' || me?.role === 'admin';

  const [classes, setClasses] = useState<StudioClass[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [standingBookings, setStandingBookings] = useState<StandingBooking[]>([]);
  const [credits, setCredits] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [selectedDate, setSelectedDate] = useState(today());
  const [roomFilter, setRoomFilter] = useState('');
  /** Soort les (1-op-1, Duo PT, Groep, Concept); leeg = alle soorten. De legenda is tegelijk het filter. */
  const [kindFilter, setKindFilter] = useState<SessionKind | ''>('');
  /**
   * "Mijn lessen": staf ziet alleen de eigen sessies (Figma "Trainer day"), een sporter alleen de
   * lessen waarvoor hij is ingeschreven of op de wachtlijst staat.
   */
  const [myDayOnly, setMyDayOnly] = useState(false);
  const [confirmClass, setConfirmClass] = useState<StudioClass | null>(null);
  const [cancelConfirmClass, setCancelConfirmClass] = useState<StudioClass | null>(null);
  const [participantsClass, setParticipantsClass] = useState<StudioClass | null>(null);
  // Les geven: het groepsles-scherm met de ingeschreven sporters (Figma "Group session").
  const [live, setLive] = useState<{ cls: StudioClass; plan: ClassPlan; session: GroupSession; participants: Profile[] } | null>(
    null
  );
  useShowBackButton(!!live);
  // Terug (pijl in de bovenbalk, veeggebaar, Android-terugknop) sluit het lesscherm.
  useEffect(() => {
    if (!live) return;
    const onPop = () => setLive(null);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [live]);

  const startClass = useCallback(
    async (cls: StudioClass, plan: ClassPlan, bookedUserIds: string[]) => {
      if (!me) return;
      try {
        // Eén vaste sessie per les: opnieuw openen gaat verder waar de les gebleven was.
        const session = await createGroupSession({
          id: `class_${cls.id}`,
          trainerId: me.userId,
          schemaId: plan.schemaId ?? '',
          schemaName: plan.schemaName ?? cls.title,
          dayIndex: plan.dayIndex ?? 0,
          date: cls.date,
          participantIds: bookedUserIds,
        });
        const people = profileCtx?.allSporters ?? [];
        const participants = bookedUserIds
          .map((id) => people.find((p) => p.userId === id))
          .filter((p): p is Profile => !!p);
        setParticipantsClass(null);
        window.history.pushState({ liftlogClassSession: cls.id }, '');
        setLive({ cls, plan, session, participants });
      } catch (e) {
        notify?.error(e instanceof Error ? e.message : 'Les starten mislukt');
      }
    },
    [me, profileCtx?.allSporters, notify]
  );
  const [freeCancelHours, setFreeCancelHours] = useState(DEFAULT_FREE_CANCEL_HOURS);
  /** Positie op de wachtlijst per les (alleen je eigen plek, niet wie er voor of na je staat). */
  const [waitlistPositions, setWaitlistPositions] = useState<Record<string, number>>({});
  /** Afmelden binnen het late venster: eerst waarschuwen dat de credit vervalt. */
  const [lateCancel, setLateCancel] = useState<Booking | null>(null);
  /** PT-moment op tijd afgemeld: meteen een ander moment kiezen (sporter vraagt aan, staf plant in). */
  const [reschedule, setReschedule] = useState<{ classId: string; staff: boolean; memberName?: string } | null>(null);
  /** Eigen verzoeken om te verzetten (sporter): wacht op de trainer, of afgewezen. */
  const [myRequests, setMyRequests] = useState<RescheduleRequest[]>([]);
  const [requestsVersion, setRequestsVersion] = useState(0);
  useEffect(() => {
    if (!me || isStaff) return;
    let alive = true;
    getRescheduleRequests().then(
      (list) => {
        if (alive) setMyRequests(list.filter((r) => r.status !== 'approved'));
      },
      () => undefined
    );
    return () => {
      alive = false;
    };
  }, [me, isStaff, requestsVersion]);
  /**
   * Naam per trainerId, voor de trainernaam op de rij en in de reserveer-dialoog (Figma toont
   * "Kenny" onder de lestitel). Een sporter mag geen trainerprofielen lezen (firestore.rules); die
   * krijgt de namen van de server, alleen als de studio "naam van de trainer tonen" aan heeft staan.
   */
  const [trainerNames, setTrainerNames] = useState<Record<string, string>>({});

  /**
   * Vanaf wanneer lessen laden: vandaag, of het begin van de week die je bekijkt als die al voorbij
   * is. Zo toont "vorige week" de lessen die er waren (als "Afgelopen") in plaats van een leeg rooster.
   */
  const loadFrom = useMemo(() => {
    const weekStart = weekOf(selectedDate)[0];
    return weekStart < today() ? weekStart : today();
  }, [selectedDate]);
  const loadedOnce = useRef(false);

  const load = useCallback(async () => {
    if (!me) return;
    // Alleen de eerste keer een laadrondje; bij terugbladeren blijft het rooster staan tot de data er is.
    if (!loadedOnce.current) setLoading(true);
    try {
      const [cls, mine, balance, standing] = await Promise.all([
        getUpcomingClasses(loadFrom),
        getMyBookings(me.userId),
        getCreditBalance(me.userId),
        getMyStandingBookings(me.userId),
      ]);
      setClasses(cls);
      setBookings(mine);
      setCredits(balance);
      setStandingBookings(standing);
      setWaitlistPositions(mine.some((b) => b.status === 'waitlist') ? await getWaitlistPositions().catch(() => ({})) : {});
      if (me.role === 'trainer' || me.role === 'admin') {
        const colleagues = await getColleagues(me.userId).catch(() => []);
        const names: Record<string, string> = { [me.userId]: me.displayName?.trim() || me.email || me.userId };
        for (const c of colleagues) names[c.userId] = c.displayName?.trim() || c.email || c.userId;
        setTrainerNames(names);
      } else {
        // Sporter: de namen komen van de server, en alleen als de studio dat aan heeft gezet.
        setTrainerNames(await getTrainerNames().catch(() => ({})));
      }
    } catch (e) {
      notify?.error(e instanceof Error ? e.message : 'Rooster laden mislukt');
    } finally {
      loadedOnce.current = true;
      setLoading(false);
    }
  }, [me, notify, loadFrom]);

  useEffect(() => {
    void load();
  }, [load]);

  // Een vastgehouden wachtlijstplek die verlopen is, gaat bij het openen van het rooster door naar de
  // volgende (er is geen klok op de server die dat elk uur doet).
  useEffect(() => {
    void settleWaitlists()
      .then((n) => {
        if (n > 0) void load();
      })
      .catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!profileCtx?.activeOrgId) return;
    void getOrg(profileCtx.activeOrgId).then((org) => {
      if (org?.bookingPolicy?.freeCancelHours != null) setFreeCancelHours(org.bookingPolicy.freeCancelHours);
    });
  }, [profileCtx?.activeOrgId]);

  /** Actieve reservering per les, zodat elke kaart weet of je meedoet. */
  const myBookingByClass = useMemo(() => {
    const map = new Map<string, Booking>();
    for (const b of bookings) {
      if (b.status === 'booked' || b.status === 'waitlist') map.set(b.classId, b);
    }
    return map;
  }, [bookings]);

  /**
   * "Mijn dag": alleen de lessen waar ík als trainer op sta. Een vast PT-moment van een lid
   * (privé-les) ziet alleen dat lid en de staf; een week waarin het lid niet komt (afgemeld,
   * pauze) staat voor niemand op het rooster — die zie je op het profiel bij Vaste lessen.
   */
  const scopedClasses = useMemo(() => {
    // Privé-les (PT van één lid) of groepsles: alleen voor dat lid of de leden van de groep, en staf.
    const mayBook = (c: StudioClass) => (c.privateFor ? c.privateFor === me?.userId : !!me && (c.groupMemberIds ?? []).includes(me.userId));
    const visible = classes.filter((c) => !(c.privateFor || c.privateForGroup) || (!c.autoCancelled && (isStaff || mayBook(c))));
    if (!myDayOnly || !me) return visible;
    return isStaff ? visible.filter((c) => c.trainerId === me.userId) : visible.filter((c) => myBookingByClass.has(c.id));
  }, [classes, myDayOnly, me, isStaff, myBookingByClass]);
  /**
   * Ruimtes die daadwerkelijk in gebruik zijn, voor het filter. `room` is vrije tekst (geen
   * vaste lijst), dus genormaliseerd op hoofdletters/spaties: anders levert "Boven" naast "boven"
   * — een typfout, geen twee ruimtes — twee aparte filterpillen op.
   */
  const roomKey = (room: string) => room.trim().toLowerCase();
  const roomOptions = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const c of scopedClasses) {
      if (!c.room) continue;
      const key = roomKey(c.room);
      if (key && !byKey.has(key)) byKey.set(key, c.room.trim());
    }
    return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b));
  }, [scopedClasses]);
  const visibleClasses = useMemo(
    () =>
      scopedClasses.filter(
        (c) =>
          (!roomFilter || (c.room && roomKey(c.room) === roomKey(roomFilter))) && (!kindFilter || c.sessionKind === kindFilter)
      ),
    [scopedClasses, roomFilter, kindFilter]
  );
  const weekStrip = useMemo(() => weekOf(selectedDate), [selectedDate]);
  /** Voor de weekweergave: alleen de geselecteerde week, per datum (ook lege dagen krijgen zo een kolom). */
  const classesByDate = useMemo(() => {
    const weekDates = new Set(weekStrip);
    const map = new Map<string, StudioClass[]>();
    for (const c of visibleClasses) {
      if (!weekDates.has(c.date)) continue;
      const list = map.get(c.date) ?? [];
      list.push(c);
      map.set(c.date, list);
    }
    return map;
  }, [visibleClasses, weekStrip]);
  /** Dezelfde week als gesorteerde lijst, alleen de dagen mét lessen (voor de tellingen boven het rooster). */
  const classesByDay = useMemo(() => Array.from(classesByDate.entries()).sort(([a], [b]) => a.localeCompare(b)), [classesByDate]);
  const dayClasses = useMemo(() => visibleClasses.filter((c) => c.date === selectedDate), [visibleClasses, selectedDate]);

  /** Weekmomenten waar al "elke week" voor aanstaat, zodat het vinkje bij een les die daarbij hoort meteen goed staat. */
  const activeStandingKeys = useMemo(
    () => new Set(standingBookings.filter((s) => s.active).map((s) => standingKey(s.classTypeId, s.weekday, s.startTime))),
    [standingBookings]
  );

  const handleBook = useCallback(
    async (cls: StudioClass, weekly: boolean) => {
      setBusyId(cls.id);
      try {
        const result = await bookClass(cls.id, weekly);
        notify?.success(
          result.status === 'waitlist'
            ? 'Je staat op de wachtlijst. Valt er iemand af, dan schuif je vanzelf door en krijg je een melding.'
            : 'Je staat ingeschreven.'
        );
        setConfirmClass(null);
        await load();
      } catch (e) {
        notify?.error(e instanceof Error ? e.message : 'Reserveren mislukt');
      } finally {
        setBusyId(null);
      }
    },
    [notify, load]
  );

  const handleCancel = useCallback(
    async (booking: Booking) => {
      setBusyId(booking.classId);
      try {
        const result = await cancelBooking(booking.id);
        notify?.success(result.refunded ? 'Afgemeld, je credit staat weer op je saldo.' : 'Afgemeld. De credit is vervallen.');
        if (result.reschedule) setReschedule({ classId: result.reschedule.classId, staff: false });
        await load();
      } catch (e) {
        notify?.error(e instanceof Error ? e.message : 'Afmelden mislukt');
      } finally {
        setBusyId(null);
      }
    },
    [notify, load]
  );

  /** Afmelden, maar eerst waarschuwen als de credit dan vervalt (te laat, en buiten de bedenktijd). */
  const requestCancel = useCallback(
    (booking: Booking) => {
      const cls = classes.find((c) => c.id === booking.classId);
      if (booking.status === 'booked' && cls && !cancelIsFree(cls, booking, freeCancelHours)) {
        setLateCancel(booking);
        return;
      }
      void handleCancel(booking);
    },
    [classes, freeCancelHours, handleCancel]
  );

  const handleDelete = useCallback(
    async (cls: StudioClass) => {
      setCancelConfirmClass(null);
      if (cls.bookedCount > 0 || cls.waitlistCount > 0) {
        // Met deelnemers: de server meldt iedereen af, met credit terug en een melding.
        setBusyId(cls.id);
        try {
          const r = await cancelClassForEveryone(cls.id);
          await load();
          const who = r.cancelled === 1 ? '1 persoon' : `${r.cancelled} personen`;
          if (r.failed > 0) notify?.error(`${cls.title} afgelast, maar ${r.failed} afmelding(en) lukten niet. Probeer het nog eens.`);
          else notify?.success(`${cls.title} afgelast. ${who} afgemeld${r.refunded ? `, ${r.refunded} credit${r.refunded === 1 ? '' : 's'} teruggezet` : ''}.`);
        } catch (e) {
          notify?.error(e instanceof Error ? e.message : 'Les afgelasten mislukt');
        } finally {
          setBusyId(null);
        }
        return;
      }
      setBusyId(cls.id);
      try {
        // Een les uit een terugkerende lessoort afgelasten in plaats van verwijderen: anders zet de
        // dagelijkse planning 'm de volgende dag gewoon weer terug (zie cancelClass).
        if (cls.classTypeId) await cancelClass(cls.id);
        else await deleteClass(cls.id);
        await load();
        // Per ongeluk op de verkeerde les getikt: meteen terug te zetten (afgelast → herstellen,
        // losse les → opnieuw aanmaken met dezelfde gegevens).
        notify.undo(cls.classTypeId ? `${cls.title} afgelast.` : `${cls.title} verwijderd.`, async () => {
          try {
            if (cls.classTypeId) await restoreClass(cls.id);
            else await createClass(cls);
            notify.success('Les teruggezet.');
          } catch (e) {
            notify.error(e instanceof Error ? e.message : 'Les terugzetten mislukt');
          }
          await load();
        });
      } catch (e) {
        notify?.error(e instanceof Error ? e.message : 'Les verwijderen mislukt');
      } finally {
        setBusyId(null);
      }
    },
    [notify, load]
  );

  const handleRestore = useCallback(
    async (cls: StudioClass) => {
      setBusyId(cls.id);
      try {
        await restoreClass(cls.id);
        notify?.success('Les hersteld.');
        await load();
      } catch (e) {
        notify?.error(e instanceof Error ? e.message : 'Les herstellen mislukt');
      } finally {
        setBusyId(null);
      }
    },
    [notify, load]
  );

  /** Op de rij zelf klikken doet het voor de hand liggende: sporter gaat inschrijven, staf ziet wie er is ingeschreven. */
  const handleRowClick = useCallback(
    (cls: StudioClass, mine: Booking | undefined) => {
      if (cls.cancelledAt) return;
      if (isStaff) setParticipantsClass(cls);
      // Een begonnen of voorbije les opent alleen de lesinformatie (zonder reserveren).
      else if (!mine || classHasStarted(cls) || (mine.status === 'waitlist' && spotOpenFor(cls, mine))) setConfirmClass(cls);
    },
    [isStaff]
  );

  /**
   * Een blok in het weekrooster is te klein voor knoppen. Staf ziet de deelnemers, een sporter reserveert
   * een open les; voor een eigen les of een afgelaste les gaan we naar die dag, waar Afmelden en Herstellen staan.
   */
  const handleBlockClick = useCallback(
    (cls: StudioClass) => {
      const mine = myBookingByClass.get(cls.id);
      // Eigen les (afmelden) of afgelaste les: naar die dag, daar staan Afmelden en Herstellen.
      // Een voorbije les opent gewoon de lesinformatie; eerst sprong je dan onverwacht naar de dagweergave.
      const claimable = mine?.status === 'waitlist' && spotOpenFor(cls, mine);
      if (cls.cancelledAt || (!isStaff && mine && !classHasStarted(cls) && !claimable)) {
        setSelectedDate(cls.date);
        setViewMode('day');
        return;
      }
      handleRowClick(cls, mine);
    },
    [myBookingByClass, isStaff, handleRowClick]
  );

  if (!me) return null;

  const renderClassRow = (cls: StudioClass) => {
    const mine = myBookingByClass.get(cls.id);
    const onWaitlist = mine?.status === 'waitlist';
    const full = !spotOpenFor(cls, onWaitlist ? mine : null);
    // Op de wachtlijst en er is een plek vrij: nu aanmelden (wie het eerst is).
    const canClaim = onWaitlist && !full;
    const position = onWaitlist ? waitlistPositions[cls.id] : undefined;
    const graceUntil = mine?.status === 'booked' ? graceUntilMs(mine) : null;
    const busy = busyId === cls.id;
    const started = classHasStarted(cls);
    return (
      <Box
        key={cls.id}
        role="button"
        tabIndex={cls.cancelledAt || (mine && !started && !isStaff) ? -1 : 0}
        onClick={() => handleRowClick(cls, mine)}
        sx={{
          border: `1px solid ${designTokens.cardBorder}`,
          borderLeft: mine
            ? `4px solid ${mine.status === 'booked' ? designTokens.onTertiaryContainer : designTokens.outline}`
            : `1px solid ${designTokens.cardBorder}`,
          borderRadius: `${designTokens.cardRadius}px`,
          bgcolor:
            mine?.status === 'booked'
              ? designTokens.tertiaryContainer
              : mine?.status === 'waitlist'
                ? designTokens.cardBackgroundHigh
                : designTokens.cardBackground,
          p: 2,
          display: 'flex',
          gap: 2,
          alignItems: 'flex-start',
          opacity: cls.cancelledAt || started ? 0.6 : 1,
          cursor: cls.cancelledAt || (mine && !started && !isStaff) ? 'default' : 'pointer',
        }}
      >
        <Box
          sx={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            bgcolor: SESSION_KIND_COLORS[cls.sessionKind],
            mt: 0.75,
            flexShrink: 0,
          }}
        />
        <Box sx={{ flex: '1 1 auto', minWidth: 0 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            {cls.title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {/* Tijd eerst: in de Dag-weergave staat de datum al boven de lijst. */}
            {cls.startTime}
            {cls.endTime ? `–${cls.endTime}` : ''}
            {viewMode === 'day' ? '' : ` · ${dayLabel(cls.date)}`}
            {trainerNames[cls.trainerId] ? ` · ${trainerNames[cls.trainerId]}` : ''}
            {cls.room ? ` · ${cls.room}` : ''}
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.75, mt: 1, flexWrap: 'wrap' }}>
            {!canClaim && (
              <Chip
                size="small"
                label={spotsLabel(cls, onWaitlist ? mine : null)}
                sx={full ? { bgcolor: designTokens.cardBackgroundHigh, color: 'text.secondary' } : undefined}
              />
            )}
            {cls.waitlistCount > 0 && <Chip size="small" variant="outlined" label={`${cls.waitlistCount} op wachtlijst`} />}
            {cls.creditCost !== 1 && <Chip size="small" variant="outlined" label={`${cls.creditCost} credits`} />}
            {cls.cancelledAt && <Chip size="small" color="error" label="Afgelast" />}
            {!cls.cancelledAt && started && (
              <Chip
                size="small"
                label={classHasEnded(cls) ? 'Afgelopen' : 'Bezig'}
                sx={{ bgcolor: designTokens.cardBackgroundHigh, color: 'text.secondary' }}
              />
            )}
            {/* Kleuren volgen het ontwerp: wachtlijst is neutraal (Surface Container High), geboekt is Tertiary Container. */}
            {onWaitlist && !canClaim && (
              <Chip
                size="small"
                label={position ? `Op wachtlijst · ${position}e` : 'Op wachtlijst'}
                sx={{ bgcolor: designTokens.cardBackgroundHigh, color: 'text.secondary' }}
              />
            )}
            {canClaim && (
              <Chip
                size="small"
                label={
                  cls.holdBookingId === mine?.id && activeHoldUntil(cls)
                    ? `Voor jou tot ${clockOf(activeHoldUntil(cls) as number)}`
                    : 'Plek vrij voor jou'
                }
                sx={{
                  bgcolor: designTokens.tertiaryContainer,
                  color: designTokens.onTertiaryContainer,
                  fontWeight: 600,
                  maxWidth: '100%',
                }}
              />
            )}
            {/* Net doorgeschoven van de wachtlijst: laat zien tot wanneer afmelden nog gratis is. */}
            {mine?.status === 'booked' && mine.promotedAt && graceUntil && (
              <Typography variant="caption" sx={{ flexBasis: '100%', fontWeight: 600, color: designTokens.onTertiaryContainer }}>
                Doorgeschoven van de wachtlijst · gratis afmelden tot{' '}
                {new Date(graceUntil).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
              </Typography>
            )}
            {mine?.status === 'booked' && (
              <Chip
                size="small"
                label="Ingeschreven"
                sx={{ bgcolor: designTokens.tertiaryContainer, color: designTokens.onTertiaryContainer }}
              />
            )}
          </Box>
        </Box>

        <Box
          sx={{ display: 'flex', flexDirection: 'column', gap: 1, flexShrink: 0, alignItems: 'flex-end' }}
          onClick={(e) => e.stopPropagation()}
        >
          {!cls.cancelledAt &&
            !started &&
            (mine ? (
              <>
                {canClaim && (
                  <Button size="small" variant="contained" disableElevation disabled={busy} onClick={() => setConfirmClass(cls)}>
                    Aanmelden
                  </Button>
                )}
                <Button size="small" variant="outlined" disabled={busy} onClick={() => requestCancel(mine)}>
                  {onWaitlist ? 'Van wachtlijst' : 'Afmelden'}
                </Button>
              </>
            ) : (
              <Button size="small" variant="contained" disableElevation disabled={busy} onClick={() => setConfirmClass(cls)}>
                {full ? 'Wachtlijst' : 'Reserveren'}
              </Button>
            ))}
          {isStaff && !cls.cancelledAt && (
            <IconButton size="small" onClick={() => setParticipantsClass(cls)} disabled={busy} aria-label="Deelnemers">
              <GroupRoundedIcon fontSize="small" />
            </IconButton>
          )}
          {/* Een begonnen of voorbije les blijft staan: dat is de geschiedenis (wie was er, wat is er gegeven). */}
          {isStaff && !cls.cancelledAt && !started && (
            <IconButton size="small" onClick={() => setCancelConfirmClass(cls)} disabled={busy} aria-label="Les verwijderen">
              <DeleteOutlineRoundedIcon fontSize="small" />
            </IconButton>
          )}
          {isStaff && cls.cancelledAt && (
            <Button size="small" disabled={busy} onClick={() => void handleRestore(cls)}>
              Herstellen
            </Button>
          )}
        </Box>
      </Box>
    );
  };

  /** Legenda én filter: tik op een soort om alleen die lessen te zien, nog een keer om alles te zien. */
  const kindChips = (size: 'small' | 'medium') =>
    SESSION_KIND_KEYS.map((k) => (
      <Chip
        key={k}
        size={size}
        label={SESSION_KIND_LABELS[k]}
        aria-pressed={kindFilter === k}
        onClick={() => setKindFilter((cur) => (cur === k ? '' : k))}
        icon={
          <Box
            component="span"
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              bgcolor: SESSION_KIND_COLORS[k],
              ml: '10px !important',
              flexShrink: 0,
            }}
          />
        }
        sx={filterPillSx(kindFilter === k)}
      />
    ));

  if (live && me) {
    return (
      <ClassSessionView
        cls={live.cls}
        plan={live.plan}
        session={live.session}
        participants={live.participants}
        currentUserId={me.userId}
        onFinish={() => {
          notify?.success('Les afgerond. De logs staan bij de sporters.');
          window.history.back();
        }}
      />
    );
  }

  return (
    <PageLayout maxWidth="none">
      {me?.inactive && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Je lidmaatschap bij deze studio staat op inactief. Je kunt het rooster bekijken, maar niet boeken. Neem contact op met de studio
          om weer mee te doen.
        </Alert>
      )}
      {myRequests.map((r) =>
        r.status === 'declined' ? (
          <Alert
            key={r.id}
            severity="warning"
            sx={{ mb: 2 }}
            action={
              <Button color="inherit" size="small" onClick={() => setReschedule({ classId: r.fromClassId, staff: false })} sx={{ whiteSpace: 'nowrap' }}>
                Ander moment
              </Button>
            }
          >
            Je trainer kan niet op {rescheduleDayLabel(r.date)} {r.startTime}. Je credit staat nog op je saldo; kies een ander moment.
          </Alert>
        ) : (
          <Alert key={r.id} severity="info" sx={{ mb: 2 }}>
            Aangevraagd: {r.title || 'PT-moment'} op {rescheduleDayLabel(r.date)} {r.startTime}. Wacht op bevestiging van je trainer.
          </Alert>
        )
      )}
      {/* Figma "Schedule": weergave, ruimtes en legenda op één regel. Op de telefoon blijft alleen
          Week/Dag staan; de rest zit achter de filterknop in een bottom sheet. */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, rowGap: 1, mb: 2 }}>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={myDayOnly ? 'mine' : 'all'}
          onChange={(_, v: 'all' | 'mine' | null) => v && setMyDayOnly(v === 'mine')}
          sx={{ ...segmentedToggleSx, display: { xs: 'none', md: 'inline-flex' } }}
          aria-label="Alle lessen of alleen mijn lessen"
        >
          <ToggleButton value="all">Alles</ToggleButton>
          <ToggleButton value="mine">Mijn lessen</ToggleButton>
        </ToggleButtonGroup>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={viewMode}
          onChange={(_, v: ViewMode | null) => v && setViewMode(v)}
          sx={segmentedToggleSx}
          aria-label="Weergave"
        >
          <ToggleButton value="week">Week</ToggleButton>
          <ToggleButton value="day">Dag</ToggleButton>
        </ToggleButtonGroup>
        {roomOptions.length > 0 && (
          <Box role="group" aria-label="Ruimte" sx={{ display: { xs: 'none', md: 'flex' }, gap: 1, flexWrap: 'wrap' }}>
            <Chip label="Alle ruimtes" size="small" onClick={() => setRoomFilter('')} sx={filterPillSx(roomFilter === '')} />
            {roomOptions.map((r) => (
              <Chip key={r} label={r} size="small" onClick={() => setRoomFilter(r)} sx={filterPillSx(roomFilter === r)} />
            ))}
          </Box>
        )}
        <Box
          role="group"
          aria-label="Soort les"
          sx={{ display: { xs: 'none', md: 'flex' }, gap: 1, flexWrap: 'wrap', ml: 'auto' }}
        >
          {kindChips('small')}
        </Box>
        <Box sx={{ display: { xs: 'flex', md: 'none' }, ml: 'auto' }}>
          <FilterSheet
            activeCount={(myDayOnly ? 1 : 0) + (roomFilter ? 1 : 0) + (kindFilter ? 1 : 0)}
            onReset={() => {
              setMyDayOnly(false);
              setRoomFilter('');
              setKindFilter('');
            }}
          >
            <FilterGroup label="Laten zien">
              <Chip label="Alles" onClick={() => setMyDayOnly(false)} sx={filterPillSx(!myDayOnly)} />
              <Chip label="Mijn lessen" onClick={() => setMyDayOnly(true)} sx={filterPillSx(myDayOnly)} />
            </FilterGroup>
            {roomOptions.length > 0 && (
              <FilterGroup label="Ruimte">
                <Chip label="Alle ruimtes" onClick={() => setRoomFilter('')} sx={filterPillSx(roomFilter === '')} />
                {roomOptions.map((r) => (
                  <Chip key={r} label={r} onClick={() => setRoomFilter(r)} sx={filterPillSx(roomFilter === r)} />
                ))}
              </FilterGroup>
            )}
            <FilterGroup label="Soort les">
              <Chip label="Alle soorten" onClick={() => setKindFilter('')} sx={filterPillSx(kindFilter === '')} />
              {kindChips('medium')}
            </FilterGroup>
          </FilterSheet>
        </Box>
      </Box>

      {/* Het creditsaldo staat compact onder je naam (zijbalk / avatarmenu), niet meer als grote kaart boven het rooster. */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={24} />
        </Box>
      ) : viewMode === 'day' ? (
        <>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 2 }}>
            <IconButton size="small" onClick={() => setSelectedDate((d) => addWeeks(d, -1))} aria-label="Vorige week">
              <ChevronLeftRoundedIcon fontSize="small" />
            </IconButton>
            <Box sx={{ display: 'flex', flex: 1, gap: 0.5 }}>
              {weekStrip.map((d) => {
                const isToday = d === today();
                const isPast = d < today();
                const selected = d === selectedDate;
                const dt = new Date(`${d}T12:00:00`);
                return (
                  <Box
                    key={d}
                    role="button"
                    tabIndex={0}
                    aria-pressed={selected}
                    onClick={() => setSelectedDate(d)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedDate(d);
                      }
                    }}
                    sx={{
                      flex: 1,
                      textAlign: 'center',
                      py: 0.75,
                      borderRadius: 2,
                      cursor: 'pointer',
                      // Voorbije dagen iets gedempt, maar wel te openen: je ziet dan wat er was.
                      opacity: isPast && !selected ? 0.6 : 1,
                      // Volgt het ontwerp: de geselecteerde dag is Primary (gevuld), geen zachte container.
                      bgcolor: selected ? designTokens.primary : 'transparent',
                      color: selected ? designTokens.onPrimary : 'text.primary',
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{ display: 'block', textTransform: 'capitalize' }}
                      color={selected ? 'inherit' : 'text.secondary'}
                    >
                      {WEEKDAY_SHORT[dt.getDay()]}
                    </Typography>
                    <Typography variant="body2" fontWeight={isToday ? 700 : 400}>
                      {dt.getDate()}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
            <IconButton size="small" onClick={() => setSelectedDate((d) => addWeeks(d, 1))} aria-label="Volgende week">
              <ChevronRightRoundedIcon fontSize="small" />
            </IconButton>
          </Box>
          {isStaff && myDayOnly && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
              {dayClasses.length === 1 ? '1 sessie' : `${dayClasses.length} sessies`}
            </Typography>
          )}
          {dayClasses.length === 0 ? (
            <ContentCard>
              <EmptyState>
                {myDayOnly
                  ? `Geen lessen van jou op ${relativeDayLabel(selectedDate).toLowerCase()}.`
                  : `Nog niets gepland op ${relativeDayLabel(selectedDate).toLowerCase()}.`}
              </EmptyState>
            </ContentCard>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>{dayClasses.map(renderClassRow)}</Box>
          )}
        </>
      ) : (
        <>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 2 }}>
            <IconButton size="small" onClick={() => setSelectedDate((d) => addWeeks(d, -1))} aria-label="Vorige week">
              <ChevronLeftRoundedIcon fontSize="small" />
            </IconButton>
            <Typography variant="body2" fontWeight={600} sx={{ flex: 1, textAlign: 'center' }}>
              {weekStrip[0] <= today() && today() <= weekStrip[6] ? 'Deze week' : weekRangeLabel(weekStrip)}
            </Typography>
            <IconButton size="small" onClick={() => setSelectedDate((d) => addWeeks(d, 1))} aria-label="Volgende week">
              <ChevronRightRoundedIcon fontSize="small" />
            </IconButton>
          </Box>
          {isStaff && myDayOnly && classesByDay.length > 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
              {(() => {
                const n = classesByDay.reduce((sum, [, list]) => sum + list.length, 0);
                return n === 1 ? '1 sessie deze week' : `${n} sessies deze week`;
              })()}
            </Typography>
          )}
          {scopedClasses.length === 0 ? (
            <ContentCard>
              <EmptyState>
                {myDayOnly
                  ? isStaff
                    ? 'Geen eigen lessen in deze periode.'
                    : 'Je bent nog nergens voor ingeschreven. Kies "Alles" om te reserveren.'
                  : isStaff
                    ? 'Nog geen lessen op het rooster. Maak een lessoort aan bij Beheer → Lessoorten; de lessen verschijnen dan vanzelf.'
                    : 'Er staan nog geen lessen gepland. Je trainer zet ze hier neer.'}
              </EmptyState>
            </ContentCard>
          ) : (
            <>
              {classesByDay.length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, px: 0.5 }}>
                  {kindFilter
                    ? `Geen ${SESSION_KIND_LABELS[kindFilter]}-lessen${roomFilter ? ` in ${roomFilter}` : ''} deze week.`
                    : roomFilter
                      ? `Geen lessen in ${roomFilter} deze week.`
                      : 'Geen lessen deze week.'}
                </Typography>
              )}
              <WeekTimeGrid
                days={weekStrip}
                classesByDate={classesByDate}
                bookingByClass={myBookingByClass}
                trainerNames={trainerNames}
                today={today()}
                onOpenClass={handleBlockClick}
                onSelectDay={(d) => {
                  setSelectedDate(d);
                  setViewMode('day');
                }}
              />
            </>
          )}
        </>
      )}

      <Dialog open={!!lateCancel} onClose={() => setLateCancel(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Credit vervalt</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1.5 }}>
            Je meldt je binnen {freeCancelHours} uur voor de les af. Je krijgt je credit daarom niet terug.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Afmelden is wel fijn: de eerste op de wachtlijst schuift dan meteen door.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLateCancel(null)}>Terug</Button>
          <Button
            color="error"
            variant="contained"
            disableElevation
            onClick={() => {
              const b = lateCancel;
              setLateCancel(null);
              if (b) void handleCancel(b);
            }}
          >
            Toch afmelden
          </Button>
        </DialogActions>
      </Dialog>

      <BookConfirmDialog
        cls={confirmClass}
        trainerName={confirmClass ? trainerNames[confirmClass.trainerId] : undefined}
        credits={credits}
        isStaff={isStaff && !me.trainsAsMember}
        freeCancelHours={freeCancelHours}
        busy={confirmClass != null && busyId === confirmClass.id}
        myStatus={confirmClass ? myBookingByClass.get(confirmClass.id)?.status : undefined}
        myBookingId={confirmClass ? myBookingByClass.get(confirmClass.id)?.id : undefined}
        alreadyWeekly={
          confirmClass?.classTypeId
            ? activeStandingKeys.has(standingKey(confirmClass.classTypeId, weekdayOf(confirmClass.date), confirmClass.startTime))
            : false
        }
        onClose={() => setConfirmClass(null)}
        onConfirm={(weekly) => confirmClass && void handleBook(confirmClass, weekly)}
      />

      <ParticipantsDialog
        cls={participantsClass}
        sporters={profileCtx?.allSporters ?? []}
        onClose={() => setParticipantsClass(null)}
        onChanged={() => void load()}
        onStart={(cls, plan, ids) => void startClass(cls, plan, ids)}
        onReschedule={(classId, memberName) => setReschedule({ classId, staff: true, memberName })}
      />

      <RescheduleDialog
        classId={reschedule?.classId ?? null}
        staff={reschedule?.staff}
        memberName={reschedule?.memberName}
        onClose={() => setReschedule(null)}
        onDone={() => {
          void load();
          setRequestsVersion((v) => v + 1);
        }}
      />

      <CancelClassDialog
        cls={cancelConfirmClass}
        busy={cancelConfirmClass != null && busyId === cancelConfirmClass.id}
        onClose={() => setCancelConfirmClass(null)}
        onConfirm={() => cancelConfirmClass && void handleDelete(cancelConfirmClass)}
      />
    </PageLayout>
  );
}

/**
 * "Weet je het zeker?" voor het afgelasten/verwijderen van een les: een klik hierop is bewust
 * definitief genoeg om even te laten nadenken, met andere tekst voor herstelbaar (lessoort) vs.
 * permanent (losse les).
 */
function CancelClassDialog({
  cls,
  busy,
  onClose,
  onConfirm,
}: {
  cls: StudioClass | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!cls) return null;
  const recurring = !!cls.classTypeId;
  const people = cls.bookedCount + cls.waitlistCount;
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Les afgelasten?</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary">
          {dayLabel(cls.date)} · {cls.startTime}
          {cls.endTime ? `–${cls.endTime}` : ''} · {cls.title}
        </Typography>
        <Typography variant="body2" sx={{ mt: 1.5 }}>
          {people > 0
            ? `${[
                cls.bookedCount > 0 ? count(cls.bookedCount, 'ingeschrevene', 'ingeschrevenen') : null,
                cls.waitlistCount > 0 ? `${cls.waitlistCount} op de wachtlijst` : null,
              ]
                .filter(Boolean)
                .join(' en ')} worden afgemeld en krijgen een melding. Betaalde credits gaan terug, ook als het kort van tevoren is. Dit kun je niet terugdraaien.`
            : recurring
              ? 'Er staat nog niemand ingeschreven. Je kunt dit hierna nog herstellen.'
              : 'Dit is een losse les; ze wordt definitief verwijderd en kan niet worden hersteld.'}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Annuleren
        </Button>
        <Button variant="contained" color="error" disabled={busy} onClick={onConfirm}>
          {recurring || people > 0 ? 'Ja, afgelasten' : 'Ja, verwijderen'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Bevestigen voor je reserveert: wanneer, hoeveel plekken, wat het kost en tot wanneer gratis
 * afmelden mag. Bij een les uit een lessoort kun je 'm meteen ook op "elke week" zetten.
 */
function BookConfirmDialog({
  cls,
  trainerName,
  credits,
  isStaff,
  freeCancelHours,
  busy,
  alreadyWeekly,
  myStatus,
  myBookingId,
  onClose,
  onConfirm,
}: {
  cls: StudioClass | null;
  trainerName?: string;
  credits: number;
  /** Staf die gratis meedoet; staf die ook als lid meetraint geldt hier als sporter. */
  isStaff: boolean;
  freeCancelHours: number;
  busy: boolean;
  alreadyWeekly: boolean;
  /** Jouw boeking voor deze les, als je er een hebt (voor een voorbije les: "Je was ingeschreven"). */
  myStatus?: Booking['status'];
  myBookingId?: string;
  onClose: () => void;
  onConfirm: (weekly: boolean) => void;
}) {
  const [weekly, setWeekly] = useState(alreadyWeekly);

  useEffect(() => {
    setWeekly(alreadyWeekly);
  }, [cls?.id, alreadyWeekly]);

  if (!cls) return null;
  const full = !spotOpenFor(cls, myStatus === 'waitlist' && myBookingId ? { id: myBookingId } : null);
  const claim = myStatus === 'waitlist' && !full;
  // Te weinig credits voor een vrije plek: eerst credits kopen (staf boekt altijd gratis).
  // Staf reserveert altijd gratis (server bypasst de credit-kosten), ongeacht het saldo.
  // Groepsles: de groep betaalt uit het groepstegoed, niet het lid.
  const groupLesson = !!cls.privateForGroup;
  const cost = isStaff || groupLesson ? 0 : cls.creditCost;
  const short = !isStaff && !groupLesson && credits < cost;
  // Begonnen of voorbij: alleen informatie, niet meer te reserveren.
  const started = classHasStarted(cls);

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{cls.title}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, '&&': { pt: 1.5 } }}>
        <Typography variant="body2" color="text.secondary">
          {dayLabel(cls.date)} · {cls.startTime}
          {cls.endTime ? `–${cls.endTime}` : ''}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {[
            trainerName,
            cls.room,
            started
              ? `${cls.bookedCount} ${cls.bookedCount === 1 ? 'deelnemer' : 'deelnemers'}`
              : spotsLabel(cls, myStatus === 'waitlist' && myBookingId ? { id: myBookingId } : null),
          ]
            .filter(Boolean)
            .join(' · ')}
        </Typography>

        {cls.description && <Typography variant="body2">{cls.description}</Typography>}

        {started && (
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
            <Chip
              size="small"
              label={classHasEnded(cls) ? 'Afgelopen' : 'Bezig'}
              sx={{ bgcolor: designTokens.cardBackgroundHigh, color: 'text.secondary' }}
            />
            {myStatus === 'booked' && (
              <Chip
                size="small"
                label={classHasEnded(cls) ? 'Je was ingeschreven' : 'Ingeschreven'}
                sx={{ bgcolor: designTokens.tertiaryContainer, color: designTokens.onTertiaryContainer }}
              />
            )}
          </Box>
        )}

        {!full && !started && short && (
          <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: designTokens.tertiaryContainer, color: designTokens.onTertiaryContainer }}>
            <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
              {claim && activeHoldUntil(cls)
                ? `Deze plek wordt tot ${clockOf(activeHoldUntil(cls) as number)} voor je vastgehouden`
                : 'Niet genoeg credits'}
            </Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Je hebt {credits} {credits === 1 ? 'credit' : 'credits'}; deze les kost er {cost}. Koop credits en meld je daarna
              hier aan.
            </Typography>
            <Button
              size="small"
              variant="contained"
              disableElevation
              onClick={() => {
                onClose();
                goBuyCredits();
              }}
            >
              Credits kopen
            </Button>
          </Box>
        )}
        {!full && !started && !short && (
          <Box
            sx={{
              p: 1.5,
              borderRadius: 2,
              bgcolor: designTokens.cardBackgroundHigh,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1,
            }}
          >
            <Typography variant="body2" fontWeight={600}>
              {groupLesson
                ? 'Groepsles · betaald uit het groepstegoed'
                : cost === 0
                  ? isStaff
                    ? 'Gratis (staf)'
                    : 'Gratis'
                  : cost === 1
                    ? 'Kost 1 credit'
                    : `Kost ${cost} credits`}
            </Typography>
            {!groupLesson && (
              <Typography variant="caption" color="text.secondary">
                {cost > 0 ? `Saldo ${credits} · daarna ${credits - cost}` : `Saldo ${credits}`}
              </Typography>
            )}
          </Box>
        )}

        {!started && (
          <Typography variant="caption" color="text.secondary">
            {full
              ? 'De les is vol. Valt er iemand af, dan schuif je vanzelf door: er gaat dan een credit af en je krijgt een melding. Kun je dan toch niet, meld je binnen een uur gratis af.'
              : `Gratis afmelden tot ${freeCancelHours} uur van tevoren, of binnen een uur na het boeken. Daarna kost het je de credit.`}
          </Typography>
        )}

        {cls.classTypeId && !started && (
          <FormControlLabel
            control={<Checkbox size="small" checked={weekly} onChange={(e) => setWeekly(e.target.checked)} />}
            label="Elke week inschrijven"
          />
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Sluiten
        </Button>
        {!started && (
          <Button variant="contained" disableElevation disabled={busy || (!full && short)} onClick={() => onConfirm(weekly)}>
            {full
              ? 'Op de wachtlijst'
              : `${claim ? 'Aanmelden' : 'Reserveren'}${cost === 0 ? '' : ` · ${cost} credit${cost > 1 ? 's' : ''}`}`}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

/**
 * Deelnemers van één les, voor de trainer: wie staat er straks in de zaal, en iemand verwijderen
 * die zich via WhatsApp heeft afgemeld in plaats van in de app.
 */
function ParticipantsDialog({
  cls,
  sporters,
  onClose,
  onChanged,
  onStart,
  onReschedule,
}: {
  cls: StudioClass | null;
  sporters: Profile[];
  onClose: () => void;
  onChanged: () => void;
  onStart: (cls: StudioClass, plan: ClassPlan, bookedUserIds: string[]) => void;
  /** PT-moment afgemeld met credit terug: meteen een ander moment inplannen voor dit lid. */
  onReschedule?: (classId: string, memberName: string) => void;
}) {
  const notify = useNotify();
  const [rows, setRows] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addTarget, setAddTarget] = useState<Profile | null>(null);
  const [adding, setAdding] = useState(false);
  // Lesvoorbereiding (alleen staf opent dit venster): welke training, met notitie.
  const myId = useProfile()?.profile?.userId ?? null;
  const [plan, setPlan] = useState<ClassPlan | null>(null);
  const [planWorkouts, setPlanWorkouts] = useState<Schema[] | null>(null);
  const [planOpen, setPlanOpen] = useState(false);

  useEffect(() => {
    setPlan(null);
    if (!cls) return;
    let alive = true;
    getClassPlan(cls.id)
      .then((p) => alive && setPlan(p))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [cls]);

  const openPlan = () => {
    setPlanOpen(true);
    if (planWorkouts === null && myId) {
      getPlannableWorkouts(myId)
        .then(setPlanWorkouts)
        .catch(() => setPlanWorkouts([]));
    }
  };

  const load = useCallback(() => {
    if (!cls) return;
    setLoading(true);
    getBookingsForClass(cls.id)
      .then((list) => setRows(list.filter((b) => b.status === 'booked' || b.status === 'waitlist')))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [cls]);

  useEffect(() => {
    load();
    setAddTarget(null);
  }, [load]);

  const nameFor = (userId: string) => {
    const p = sporters.find((s) => s.userId === userId);
    return p?.displayName?.trim() || p?.email || userId;
  };

  const remove = async (booking: Booking) => {
    setBusyId(booking.id);
    try {
      const r = await cancelBooking(booking.id);
      setRows((prev) => prev.filter((b) => b.id !== booking.id));
      onChanged();
      // Zeg erbij wat er met de credit gebeurde: binnen de afmeldtermijn vervalt die (tenzij de studio anders instelde).
      if (booking.status === 'booked' && (Number(booking.creditsSpent) || 0) > 0) {
        notify?.success(
          r.refunded
            ? `${nameFor(booking.userId)} afgemeld. De credit staat weer op het saldo.`
            : `${nameFor(booking.userId)} afgemeld. Binnen de afmeldtermijn, dus de credit vervalt.`
        );
      }
      if (r.reschedule) onReschedule?.(r.reschedule.classId, nameFor(booking.userId));
    } catch (e) {
      notify?.error(e instanceof Error ? e.message : 'Verwijderen mislukt');
    } finally {
      setBusyId(null);
    }
  };

  const add = async () => {
    if (!cls || !addTarget) return;
    setAdding(true);
    try {
      const result = await bookClass(cls.id, false, addTarget.userId);
      notify?.success(
        result.status === 'waitlist'
          ? `${nameFor(addTarget.userId)} staat op de wachtlijst.`
          : `${nameFor(addTarget.userId)} is ingeschreven.`
      );
      setAddTarget(null);
      load();
      onChanged();
    } catch (e) {
      notify?.error(e instanceof Error ? e.message : 'Toevoegen mislukt');
    } finally {
      setAdding(false);
    }
  };

  if (!cls) return null;

  const bookedUserIds = new Set(rows.map((b) => b.userId));
  const addableSporters = sporters.filter((s) => !bookedUserIds.has(s.userId));
  const holdUntilMs = activeHoldUntil(cls);

  /** De trainer beslist: credit geven en inschrijven, of de plek doorgeven aan de volgende. */
  const grantAndBook = async () => {
    if (!cls.holdUserId) return;
    setAdding(true);
    try {
      await grantCredits(cls.holdUserId, Math.max(1, cls.creditCost), `Wachtlijst: ${cls.title} ${cls.date}`);
      await bookClass(cls.id, false, cls.holdUserId);
      notify?.success(`${nameFor(cls.holdUserId)} is ingeschreven.`);
      load();
      onChanged();
    } catch (e) {
      notify?.error(e instanceof Error ? e.message : 'Inschrijven mislukt');
    } finally {
      setAdding(false);
    }
  };
  const passOn = async () => {
    setAdding(true);
    try {
      const r = await releaseHold(cls.id);
      notify?.success(r.promotedUserId ? `De plek is doorgegeven aan ${nameFor(r.promotedUserId)}.` : 'De plek is vrijgegeven.');
      load();
      onChanged();
    } catch (e) {
      notify?.error(e instanceof Error ? e.message : 'Doorgeven mislukt');
    } finally {
      setAdding(false);
    }
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{cls.title}</DialogTitle>
      <DialogContent sx={{ '&&': { pt: 1.5 } }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {dayLabel(cls.date)} · {cls.startTime}
          {cls.endTime ? `–${cls.endTime}` : ''}
        </Typography>

        <Box sx={{ p: 1.5, mb: 2, borderRadius: 2, border: `1px solid ${designTokens.cardBorder}` }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" fontWeight={600} sx={{ flex: 1 }}>
              Voorbereiding
            </Typography>
            <Button size="small" onClick={openPlan}>
              {plan ? 'Bewerken' : 'Voorbereiden'}
            </Button>
          </Box>
          {plan && plan.exercises.length > 0 && !cls.cancelledAt && (
            <Button
              fullWidth
              variant="contained"
              disableElevation
              sx={{ my: 1 }}
              onClick={() => onStart(cls, plan, rows.filter((b) => b.status === 'booked' || b.status === 'attended').map((b) => b.userId))}
            >
              Start les · {rows.filter((b) => b.status === 'booked' || b.status === 'attended').length} deelnemers
            </Button>
          )}
          {plan ? (
            <>
              {plan.schemaName && (
                <Typography variant="body2" sx={{ color: designTokens.primary, mb: 0.5 }}>
                  {plan.schemaName}
                  {plan.dayLabel ? ` · ${plan.dayLabel}` : ''}
                </Typography>
              )}
              <ExerciseLines exercises={plan.exercises} />
              {plan.note && (
                <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-line' }}>
                  {plan.note}
                </Typography>
              )}
            </>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Nog geen training gekozen. Alleen trainers zien dit.
            </Typography>
          )}
        </Box>

        {cls.holdUserId && holdUntilMs && (
          <Box
            sx={{
              p: 1.5,
              mb: 2,
              borderRadius: 2,
              bgcolor: designTokens.tertiaryContainer,
              color: designTokens.onTertiaryContainer,
            }}
          >
            <Typography variant="body2" fontWeight={600}>
              Plek vastgehouden voor {nameFor(cls.holdUserId)} tot {clockOf(holdUntilMs)}
            </Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Eerste op de wachtlijst, maar geen credits. Daarna gaat de plek vanzelf naar de volgende.
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button size="small" variant="contained" disableElevation disabled={adding} onClick={() => void grantAndBook()}>
                Credit geven en inschrijven
              </Button>
              <Button size="small" variant="outlined" disabled={adding} onClick={() => void passOn()}>
                Geef plek aan volgende
              </Button>
            </Box>
          </Box>
        )}

        {!cls.cancelledAt && (
          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <Autocomplete
              size="small"
              fullWidth
              options={addableSporters}
              value={addTarget}
              onChange={(_, v) => setAddTarget(v)}
              getOptionLabel={(p) => p.displayName?.trim() || p.email || p.userId}
              isOptionEqualToValue={(a, b) => a.userId === b.userId}
              renderInput={(params) => <TextField {...params} label="Sporter toevoegen" />}
            />
            <Button variant="contained" disabled={!addTarget || adding} onClick={() => void add()}>
              Toevoegen
            </Button>
          </Box>
        )}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
            <CircularProgress size={20} />
          </Box>
        ) : rows.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Nog niemand ingeschreven.
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            {rows.map((b) => (
              <Box
                key={b.id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  py: 1,
                  borderTop: `1px solid ${designTokens.cardBackgroundHigh}`,
                }}
              >
                <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>
                  {nameFor(b.userId)}
                </Typography>
                <Chip size="small" label={b.status === 'waitlist' ? 'Wachtlijst' : 'Ingeschreven'} />
                <Button size="small" color="error" disabled={busyId === b.id} onClick={() => void remove(b)}>
                  Verwijderen
                </Button>
              </Box>
            ))}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Sluiten</Button>
      </DialogActions>
      {planOpen && (
        <ClassPlanDialog
          cls={cls}
          plan={plan}
          workouts={planWorkouts ?? []}
          onClose={() => setPlanOpen(false)}
          onSaved={(saved) => {
            setPlan(saved);
            setPlanOpen(false);
          }}
        />
      )}
    </Dialog>
  );
}
