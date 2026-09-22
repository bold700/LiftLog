import { useCallback, useEffect, useMemo, useState } from 'react';
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
  useMediaQuery,
  useTheme,
} from '@mui/material';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import GroupRoundedIcon from '@mui/icons-material/GroupRounded';
import { PageLayout, ContentCard, EmptyState } from './layout';
import { CreditBalanceCard } from './SubscriptionCard';
import { useProfile } from '../context/ProfileContext';
import { useNotify } from '../context/NotifyContext';
import {
  getUpcomingClasses,
  getMyBookings,
  getMyStandingBookings,
  getBookingsForClass,
  getCreditBalance,
  bookClass,
  cancelBooking,
  cancelClass,
  deleteClass,
  restoreClass,
  SESSION_KIND_COLORS,
  type StudioClass,
  type Booking,
} from '../services/classService';
import { getOrg } from '../services/orgService';
import { getColleagues } from '../services/profileService';
import { designTokens } from '../theme/designTokens';
import { segmentedToggleSx, filterPillSx } from '../theme/segmentedToggle';
import { addWeeks } from '../utils/format';
import type { Profile, SessionKind, StandingBooking } from '../types';

/** Zonder eigen instelling geldt dit aantal uur, zoals de server standaard hanteert. */
const DEFAULT_FREE_CANCEL_HOURS = 12;

const SESSION_KIND_KEYS: SessionKind[] = ['1on1', 'duo', 'group', 'concept'];
const SESSION_KIND_LABELS: Record<SessionKind, string> = { '1on1': '1-op-1', duo: 'Duo PT', group: 'Groep', concept: 'Concept' };
const WEEKDAY_SHORT = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];

type ViewMode = 'week' | 'day' | 'makeups';

const today = () => new Date().toISOString().slice(0, 10);

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
  return sameMonth ? `${startDay}–${endLabel}` : `${start.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}–${endLabel}`;
}

/** Sleutel om een les te koppelen aan een "elke week"-instelling: zelfde lessoort en weekmoment. */
const standingKey = (classTypeId: string, weekday: number, startTime: string) => `${classTypeId}_${weekday}_${startTime}`;

export function LessenPage() {
  const profileCtx = useProfile();
  const notify = useNotify();
  const theme = useTheme();
  /** Vanaf md past de week in zeven dagkolommen (Figma "Book a class"); daaronder stapelen we per dag. */
  const wide = useMediaQuery(theme.breakpoints.up('md'));
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
  /** Staf-only: "Mijn dag" toont alleen de eigen sessies (Figma "Trainer day"). */
  const [myDayOnly, setMyDayOnly] = useState(false);
  const [confirmClass, setConfirmClass] = useState<StudioClass | null>(null);
  const [cancelConfirmClass, setCancelConfirmClass] = useState<StudioClass | null>(null);
  const [participantsClass, setParticipantsClass] = useState<StudioClass | null>(null);
  const [freeCancelHours, setFreeCancelHours] = useState(DEFAULT_FREE_CANCEL_HOURS);
  /**
   * Naam per trainerId, voor de trainernaam op de rij en in de reserveer-dialoog (Figma toont
   * "Kenny" onder de lestitel). Alleen voor staf: een sporter mag niet elk trainerprofiel lezen
   * (firestore.rules), dus voor sporters blijft dit leeg en tonen we simpelweg geen naam.
   */
  const [trainerNames, setTrainerNames] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!me) return;
    setLoading(true);
    try {
      const [cls, mine, balance, standing] = await Promise.all([
        getUpcomingClasses(today()),
        getMyBookings(me.userId),
        getCreditBalance(me.userId),
        getMyStandingBookings(me.userId),
      ]);
      setClasses(cls);
      setBookings(mine);
      setCredits(balance);
      setStandingBookings(standing);
      if (me.role === 'trainer' || me.role === 'admin') {
        const colleagues = await getColleagues(me.userId).catch(() => []);
        const names: Record<string, string> = { [me.userId]: me.displayName?.trim() || me.email || me.userId };
        for (const c of colleagues) names[c.userId] = c.displayName?.trim() || c.email || c.userId;
        setTrainerNames(names);
      }
    } catch (e) {
      notify?.error(e instanceof Error ? e.message : 'Rooster laden mislukt');
    } finally {
      setLoading(false);
    }
  }, [me, notify]);

  useEffect(() => {
    void load();
  }, [load]);

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

  /** "Mijn dag": alleen de lessen waar ík als trainer op sta. */
  const scopedClasses = useMemo(
    () => (myDayOnly && me ? classes.filter((c) => c.trainerId === me.userId) : classes),
    [classes, myDayOnly, me]
  );
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
    () => (roomFilter ? scopedClasses.filter((c) => c.room && roomKey(c.room) === roomKey(roomFilter)) : scopedClasses),
    [scopedClasses, roomFilter]
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
  /** Dezelfde week als gesorteerde lijst, alleen de dagen mét lessen (voor de gestapelde lijst op kleine schermen). */
  const classesByDay = useMemo(
    () => Array.from(classesByDate.entries()).sort(([a], [b]) => a.localeCompare(b)),
    [classesByDate]
  );
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
            ? 'De les is vol. Je staat op de wachtlijst en betaalt pas als je doorschuift.'
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
        notify?.success(
          result.refunded ? 'Afgemeld, je credit staat weer op je saldo.' : 'Afgemeld. De credit is vervallen.'
        );
        await load();
      } catch (e) {
        notify?.error(e instanceof Error ? e.message : 'Afmelden mislukt');
      } finally {
        setBusyId(null);
      }
    },
    [notify, load]
  );

  const handleDelete = useCallback(
    async (cls: StudioClass) => {
      if (cls.bookedCount > 0) {
        notify?.error('Er staan mensen ingeschreven. Meld die eerst af.');
        return;
      }
      setCancelConfirmClass(null);
      setBusyId(cls.id);
      try {
        // Een les uit een terugkerende lessoort afgelasten in plaats van verwijderen: anders zet de
        // dagelijkse planning 'm de volgende dag gewoon weer terug (zie cancelClass).
        if (cls.classTypeId) await cancelClass(cls.id);
        else await deleteClass(cls.id);
        await load();
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
      else if (!mine) setConfirmClass(cls);
    },
    [isStaff]
  );

  if (!me) return null;

  const renderClassRow = (cls: StudioClass) => {
    const mine = myBookingByClass.get(cls.id);
    const full = cls.bookedCount >= cls.capacity;
    const busy = busyId === cls.id;
    return (
      <Box
        key={cls.id}
        role="button"
        tabIndex={cls.cancelledAt ? -1 : 0}
        onClick={() => handleRowClick(cls, mine)}
        sx={{
          border: `1px solid ${designTokens.cardBorder}`,
          borderLeft: mine ? `4px solid ${mine.status === 'booked' ? designTokens.onTertiaryContainer : designTokens.outline}` : `1px solid ${designTokens.cardBorder}`,
          borderRadius: `${designTokens.cardRadius}px`,
          bgcolor: mine?.status === 'booked' ? designTokens.tertiaryContainer : mine?.status === 'waitlist' ? designTokens.cardBackgroundHigh : designTokens.cardBackground,
          p: 2,
          display: 'flex',
          gap: 2,
          alignItems: 'flex-start',
          opacity: cls.cancelledAt ? 0.6 : 1,
          cursor: cls.cancelledAt ? 'default' : 'pointer',
        }}
      >
        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: SESSION_KIND_COLORS[cls.sessionKind], mt: 0.75, flexShrink: 0 }} />
        <Box sx={{ flex: '1 1 auto', minWidth: 0 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            {cls.title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {trainerNames[cls.trainerId] ? `${trainerNames[cls.trainerId]} · ` : ''}
            {dayLabel(cls.date)} · {cls.startTime}
            {cls.endTime ? `–${cls.endTime}` : ''}
            {cls.room ? ` · ${cls.room}` : ''}
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.75, mt: 1, flexWrap: 'wrap' }}>
            <Chip
              size="small"
              label={`${cls.bookedCount}/${cls.capacity} plekken`}
              sx={full ? { bgcolor: designTokens.cardBackgroundHigh, color: 'text.secondary' } : undefined}
            />
            {cls.waitlistCount > 0 && <Chip size="small" variant="outlined" label={`${cls.waitlistCount} op wachtlijst`} />}
            {cls.creditCost !== 1 && <Chip size="small" variant="outlined" label={`${cls.creditCost} credits`} />}
            {cls.cancelledAt && <Chip size="small" color="error" label="Afgelast" />}
            {/* Kleuren volgen het ontwerp: wachtlijst is neutraal (Surface Container High), geboekt is Tertiary Container. */}
            {mine?.status === 'waitlist' && <Chip size="small" label="Op wachtlijst" sx={{ bgcolor: designTokens.cardBackgroundHigh, color: 'text.secondary' }} />}
            {mine?.status === 'booked' && <Chip size="small" label="Ingeschreven" sx={{ bgcolor: designTokens.tertiaryContainer, color: designTokens.onTertiaryContainer }} />}
          </Box>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, flexShrink: 0, alignItems: 'flex-end' }} onClick={(e) => e.stopPropagation()}>
          {!cls.cancelledAt &&
            (mine ? (
              <Button size="small" variant="outlined" disabled={busy} onClick={() => void handleCancel(mine)}>
                Afmelden
              </Button>
            ) : (
              <Button size="small" variant="contained" disabled={busy} onClick={() => setConfirmClass(cls)}>
                {full ? 'Wachtlijst' : 'Reserveren'}
              </Button>
            ))}
          {isStaff && !cls.cancelledAt && (
            <IconButton size="small" onClick={() => setParticipantsClass(cls)} disabled={busy} aria-label="Deelnemers">
              <GroupRoundedIcon fontSize="small" />
            </IconButton>
          )}
          {isStaff && !cls.cancelledAt && (
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

  /**
   * Compacte leskaart voor de dagkolommen van de weekweergave (Figma "Book a class"): tijd, titel,
   * trainer en één pil met de stand. Kleur volgt de status: open = Primary Container, ingeschreven =
   * Tertiary Container, vol/wachtlijst/afgelast = Surface Container High. Klikken doet hetzelfde als
   * op de brede rij; de staf-acties staan klein rechtsboven.
   */
  const renderCompactCard = (cls: StudioClass) => {
    const mine = myBookingByClass.get(cls.id);
    const full = cls.bookedCount >= cls.capacity;
    const busy = busyId === cls.id;
    const left = Math.max(0, cls.capacity - cls.bookedCount);
    const muted = !!cls.cancelledAt || (full && !mine);
    const pillLabel = cls.cancelledAt
      ? 'Afgelast'
      : mine?.status === 'booked'
        ? 'Ingeschreven'
        : mine?.status === 'waitlist'
          ? 'Op wachtlijst'
          : full
            ? 'Vol · wachtlijst'
            : `${cls.creditCost} ${cls.creditCost === 1 ? 'credit' : 'credits'} · ${left} vrij`;
    return (
      <Box
        key={cls.id}
        role="button"
        tabIndex={cls.cancelledAt ? -1 : 0}
        onClick={() => handleRowClick(cls, mine)}
        sx={{
          position: 'relative',
          borderRadius: 2,
          p: 1.25,
          bgcolor: mine?.status === 'booked' ? designTokens.tertiaryContainer : muted ? designTokens.cardBackgroundHigh : designTokens.primaryContainer,
          color: mine?.status === 'booked' ? designTokens.onTertiaryContainer : muted ? 'text.secondary' : designTokens.onPrimaryContainer,
          opacity: cls.cancelledAt ? 0.6 : 1,
          cursor: cls.cancelledAt ? 'default' : 'pointer',
          display: 'flex',
          flexDirection: 'column',
          gap: 0.25,
          minWidth: 0,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: SESSION_KIND_COLORS[cls.sessionKind], flexShrink: 0 }} />
          <Typography variant="caption" sx={{ fontWeight: 600, lineHeight: 1.4 }}>
            {cls.startTime}
          </Typography>
          {isStaff && !cls.cancelledAt && (
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                setCancelConfirmClass(cls);
              }}
              disabled={busy}
              aria-label="Les verwijderen"
              sx={{ ml: 'auto', mr: -0.5, mt: -0.5, p: 0.25, color: 'inherit' }}
            >
              <DeleteOutlineRoundedIcon sx={{ fontSize: 16 }} />
            </IconButton>
          )}
        </Box>
        <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.25, overflowWrap: 'anywhere' }}>
          {cls.title}
        </Typography>
        {trainerNames[cls.trainerId] && (
          <Typography variant="caption" sx={{ lineHeight: 1.4, opacity: 0.8 }} noWrap>
            {trainerNames[cls.trainerId]}
          </Typography>
        )}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
          <Box
            component="span"
            sx={{
              px: 0.75,
              py: 0.125,
              borderRadius: '10px',
              fontSize: 11,
              fontWeight: 600,
              lineHeight: 1.5,
              whiteSpace: 'nowrap',
              bgcolor: cls.cancelledAt ? 'error.main' : muted ? 'transparent' : designTokens.primary,
              color: cls.cancelledAt ? 'error.contrastText' : muted ? 'text.secondary' : designTokens.onPrimary,
              border: muted && !cls.cancelledAt ? `1px solid ${designTokens.cardBorder}` : 'none',
            }}
          >
            {pillLabel}
          </Box>
          {!isStaff && mine && !cls.cancelledAt && (
            <Button
              size="small"
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation();
                void handleCancel(mine);
              }}
              sx={{ minWidth: 0, px: 0.5, py: 0, fontSize: 11, lineHeight: 1.5, color: 'inherit' }}
            >
              Afmelden
            </Button>
          )}
          {isStaff && cls.cancelledAt && (
            <Button
              size="small"
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation();
                void handleRestore(cls);
              }}
              sx={{ minWidth: 0, px: 0.5, py: 0, fontSize: 11, lineHeight: 1.5 }}
            >
              Herstellen
            </Button>
          )}
        </Box>
      </Box>
    );
  };

  return (
    <PageLayout maxWidth="none">
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2, px: 0.5 }}>
        {isStaff
          ? myDayOnly
            ? 'Alleen je eigen sessies vandaag.'
            : 'Zet lessen op het rooster; sporters reserveren met credits.'
          : 'Reserveer met je credits.'}
      </Typography>

      {isStaff && (
        <Box sx={{ mb: 1.5 }}>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={myDayOnly ? 'mine' : 'all'}
            onChange={(_, v: 'all' | 'mine' | null) => v && setMyDayOnly(v === 'mine')}
            sx={segmentedToggleSx}
          >
            <ToggleButton value="all">Rooster</ToggleButton>
            <ToggleButton value="mine">Mijn dag</ToggleButton>
          </ToggleButtonGroup>
        </Box>
      )}

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5, flexWrap: 'wrap' }}>
        <ToggleButtonGroup size="small" exclusive value={viewMode} onChange={(_, v: ViewMode | null) => v && setViewMode(v)} sx={segmentedToggleSx}>
          <ToggleButton value="week">Week</ToggleButton>
          <ToggleButton value="day">Dag</ToggleButton>
          <ToggleButton value="makeups">Inhaallessen</ToggleButton>
        </ToggleButtonGroup>
        {roomOptions.length > 0 && (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Chip label="Alle" size="small" onClick={() => setRoomFilter('')} sx={filterPillSx(roomFilter === '')} />
            {roomOptions.map((r) => (
              <Chip key={r} label={r} size="small" onClick={() => setRoomFilter(r)} sx={filterPillSx(roomFilter === r)} />
            ))}
          </Box>
        )}
      </Box>

      {viewMode !== 'makeups' && (
        <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
          {SESSION_KIND_KEYS.map((k) => (
            <Box key={k} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: SESSION_KIND_COLORS[k] }} />
              <Typography variant="caption" color="text.secondary">
                {SESSION_KIND_LABELS[k]}
              </Typography>
            </Box>
          ))}
        </Box>
      )}

      {/* Creditsaldo prominent bovenaan het rooster, zoals in het Figma-ontwerp ("8 credits left"). */}
      <CreditBalanceCard userId={me.userId} />

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={24} />
        </Box>
      ) : viewMode === 'makeups' ? (
        <ContentCard>
          <EmptyState>Inhaallessen komen in een volgende stap: gemiste sessies als tegoed, in te plannen in een vrij gat.</EmptyState>
        </ContentCard>
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
                    tabIndex={isPast ? -1 : 0}
                    onClick={() => !isPast && setSelectedDate(d)}
                    sx={{
                      flex: 1,
                      textAlign: 'center',
                      py: 0.75,
                      borderRadius: 2,
                      cursor: isPast ? 'default' : 'pointer',
                      opacity: isPast ? 0.35 : 1,
                      // Volgt het ontwerp: de geselecteerde dag is Primary (gevuld), geen zachte container.
                      bgcolor: selected ? designTokens.primary : 'transparent',
                      color: selected ? designTokens.onPrimary : 'text.primary',
                    }}
                  >
                    <Typography variant="caption" sx={{ display: 'block', textTransform: 'capitalize' }} color={selected ? 'inherit' : 'text.secondary'}>
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
                {myDayOnly ? `Geen eigen sessies op ${relativeDayLabel(selectedDate).toLowerCase()}.` : `Nog niets gepland op ${relativeDayLabel(selectedDate).toLowerCase()}.`}
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
                  ? 'Geen eigen sessies deze week.'
                  : isStaff
                    ? 'Nog geen lessen op het rooster. Voeg de eerste toe.'
                    : 'Er staan nog geen lessen gepland. Je trainer zet ze hier neer.'}
              </EmptyState>
            </ContentCard>
          ) : classesByDay.length === 0 && !wide ? (
            <ContentCard>
              <EmptyState>{roomFilter ? `Geen lessen in ${roomFilter} deze week.` : 'Geen lessen deze week.'}</EmptyState>
            </ContentCard>
          ) : wide ? (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 1.5, alignItems: 'stretch' }}>
              {weekStrip.map((d) => {
                const dt = new Date(`${d}T12:00:00`);
                const isToday = d === today();
                const dayList = classesByDate.get(d) ?? [];
                return (
                  <Box
                    key={d}
                    sx={{
                      bgcolor: designTokens.cardBackground,
                      borderRadius: `${designTokens.cardRadius}px`,
                      p: 1.5,
                      minHeight: 280,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 1,
                      minWidth: 0,
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{ fontWeight: isToday ? 700 : 600, textTransform: 'capitalize', color: isToday ? designTokens.primary : 'text.primary' }}
                    >
                      {WEEKDAY_SHORT[dt.getDay()]} {dt.getDate()}
                    </Typography>
                    {dayList.length === 0 ? (
                      <Typography variant="caption" color="text.secondary">
                        Geen lessen
                      </Typography>
                    ) : (
                      dayList.map(renderCompactCard)
                    )}
                  </Box>
                );
              })}
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              {classesByDay.map(([date, dayList]) => (
                <Box key={date}>
                  <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1, textTransform: 'capitalize' }}>
                    {relativeDayLabel(date)}
                  </Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>{dayList.map(renderClassRow)}</Box>
                </Box>
              ))}
            </Box>
          )}
        </>
      )}

      <BookConfirmDialog
        cls={confirmClass}
        trainerName={confirmClass ? trainerNames[confirmClass.trainerId] : undefined}
        credits={credits}
        isStaff={isStaff}
        freeCancelHours={freeCancelHours}
        busy={confirmClass != null && busyId === confirmClass.id}
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

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Les afgelasten?</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary">
          {dayLabel(cls.date)} · {cls.startTime}
          {cls.endTime ? `–${cls.endTime}` : ''} · {cls.title}
        </Typography>
        <Typography variant="body2" sx={{ mt: 1.5 }}>
          {recurring
            ? 'Sporters die al ingeschreven waren zien de les als afgelast. Je kunt dit hierna nog herstellen.'
            : 'Dit is een losse les; ze wordt definitief verwijderd en kan niet worden hersteld.'}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Annuleren
        </Button>
        <Button variant="contained" color="error" disabled={busy} onClick={onConfirm}>
          {recurring ? 'Ja, afgelasten' : 'Ja, verwijderen'}
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
  onClose,
  onConfirm,
}: {
  cls: StudioClass | null;
  trainerName?: string;
  credits: number;
  isStaff: boolean;
  freeCancelHours: number;
  busy: boolean;
  alreadyWeekly: boolean;
  onClose: () => void;
  onConfirm: (weekly: boolean) => void;
}) {
  const [weekly, setWeekly] = useState(alreadyWeekly);

  useEffect(() => {
    setWeekly(alreadyWeekly);
  }, [cls?.id, alreadyWeekly]);

  if (!cls) return null;
  const full = cls.bookedCount >= cls.capacity;
  // Staf reserveert altijd gratis (server bypasst de credit-kosten), ongeacht het saldo.
  const cost = isStaff ? 0 : cls.creditCost;

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{cls.title}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, '&&': { pt: 1.5 } }}>
        <Typography variant="body2" color="text.secondary">
          {dayLabel(cls.date)} · {cls.startTime}
          {cls.endTime ? `–${cls.endTime}` : ''}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {[trainerName, cls.room, `${cls.bookedCount} van ${cls.capacity} plekken bezet`].filter(Boolean).join(' · ')}
        </Typography>

        {cls.description && <Typography variant="body2">{cls.description}</Typography>}

        {!full && (
          <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: designTokens.cardBackgroundHigh, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
            <Typography variant="body2" fontWeight={600}>
              {cost === 0 ? (isStaff ? 'Gratis (staf)' : 'Gratis') : cost === 1 ? 'Kost 1 credit' : `Kost ${cost} credits`}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {cost > 0 ? `Je hebt ${credits} · ${credits - cost} over na deze` : `Je hebt ${credits}`}
            </Typography>
          </Box>
        )}

        <Typography variant="caption" color="text.secondary">
          Gratis afmelden tot {freeCancelHours} uur van tevoren. Daarna kost het je de credit.
        </Typography>

        {cls.classTypeId && (
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
        <Button variant="contained" disabled={busy} onClick={() => onConfirm(weekly)}>
          {full ? 'Wachtlijst' : cost === 0 ? 'Reserveren' : `Reserveren · ${cost} credit${cost > 1 ? 's' : ''}`}
        </Button>
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
}: {
  cls: StudioClass | null;
  sporters: Profile[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const notify = useNotify();
  const [rows, setRows] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addTarget, setAddTarget] = useState<Profile | null>(null);
  const [adding, setAdding] = useState(false);

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
      await cancelBooking(booking.id);
      setRows((prev) => prev.filter((b) => b.id !== booking.id));
      onChanged();
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
        result.status === 'waitlist' ? `${nameFor(addTarget.userId)} staat op de wachtlijst.` : `${nameFor(addTarget.userId)} is ingeschreven.`
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

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{cls.title}</DialogTitle>
      <DialogContent sx={{ '&&': { pt: 1.5 } }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {dayLabel(cls.date)} · {cls.startTime}
          {cls.endTime ? `–${cls.endTime}` : ''}
        </Typography>

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
              <Box key={b.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1, borderTop: `1px solid ${designTokens.cardBackgroundHigh}` }}>
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
    </Dialog>
  );
}
