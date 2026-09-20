import { useCallback, useEffect, useMemo, useState } from 'react';
import {
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
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import GroupRoundedIcon from '@mui/icons-material/GroupRounded';
import { PageLayout, ContentCard, PageTitle, EmptyState } from './layout';
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
import { designTokens } from '../theme/designTokens';
import { segmentedToggleSx } from '../theme/segmentedToggle';
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

/** Sleutel om een les te koppelen aan een "elke week"-instelling: zelfde lessoort en weekmoment. */
const standingKey = (classTypeId: string, weekday: number, startTime: string) => `${classTypeId}_${weekday}_${startTime}`;

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
  const [confirmClass, setConfirmClass] = useState<StudioClass | null>(null);
  const [cancelConfirmClass, setCancelConfirmClass] = useState<StudioClass | null>(null);
  const [participantsClass, setParticipantsClass] = useState<StudioClass | null>(null);
  const [freeCancelHours, setFreeCancelHours] = useState(DEFAULT_FREE_CANCEL_HOURS);

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

  /** Ruimtes die daadwerkelijk in gebruik zijn, voor het filter. */
  const roomOptions = useMemo(() => Array.from(new Set(classes.map((c) => c.room).filter((r): r is string => !!r))).sort(), [classes]);
  const visibleClasses = useMemo(() => (roomFilter ? classes.filter((c) => c.room === roomFilter) : classes), [classes, roomFilter]);
  /** Voor de weeklijst: gegroepeerd per dag, chronologisch. */
  const classesByDay = useMemo(() => {
    const map = new Map<string, StudioClass[]>();
    for (const c of visibleClasses) {
      const list = map.get(c.date) ?? [];
      list.push(c);
      map.set(c.date, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [visibleClasses]);
  const dayClasses = useMemo(() => visibleClasses.filter((c) => c.date === selectedDate), [visibleClasses, selectedDate]);
  const weekStrip = useMemo(() => weekOf(selectedDate), [selectedDate]);

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

  if (!me) return null;

  const renderClassRow = (cls: StudioClass) => {
    const mine = myBookingByClass.get(cls.id);
    const full = cls.bookedCount >= cls.capacity;
    const busy = busyId === cls.id;
    return (
      <Box
        key={cls.id}
        sx={{
          border: `1px solid ${designTokens.cardBorder}`,
          borderRadius: `${designTokens.cardRadius}px`,
          bgcolor: designTokens.cardBackground,
          p: 2,
          display: 'flex',
          gap: 2,
          alignItems: 'flex-start',
          opacity: cls.cancelledAt ? 0.6 : 1,
        }}
      >
        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: SESSION_KIND_COLORS[cls.sessionKind], mt: 0.75, flexShrink: 0 }} />
        <Box sx={{ flex: '1 1 auto', minWidth: 0 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            {cls.title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
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

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, flexShrink: 0, alignItems: 'flex-end' }}>
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

  return (
    <PageLayout>
      <PageTitle>Lessen</PageTitle>
      {/* Creditsaldo staat op Profiel (Abonnement); hier alleen de uitleg, geen dubbele weergave. */}
      <Typography variant="body2" color="text.secondary" sx={{ mt: -2, mb: 2, px: 0.5 }}>
        {isStaff ? 'Zet lessen op het rooster; sporters reserveren met credits.' : 'Reserveer met je credits.'}
      </Typography>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5, flexWrap: 'wrap' }}>
        <ToggleButtonGroup size="small" exclusive value={viewMode} onChange={(_, v: ViewMode | null) => v && setViewMode(v)} sx={segmentedToggleSx}>
          <ToggleButton value="week">Week</ToggleButton>
          <ToggleButton value="day">Dag</ToggleButton>
          <ToggleButton value="makeups">Inhaallessen</ToggleButton>
        </ToggleButtonGroup>
        {roomOptions.length > 0 && (
          <ToggleButtonGroup size="small" exclusive value={roomFilter} onChange={(_, v: string | null) => setRoomFilter(v ?? '')} sx={segmentedToggleSx}>
            <ToggleButton value="">Alle</ToggleButton>
            {roomOptions.map((r) => (
              <ToggleButton key={r} value={r}>
                {r}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
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
          {dayClasses.length === 0 ? (
            <ContentCard>
              <EmptyState>Nog niets gepland op {relativeDayLabel(selectedDate).toLowerCase()}.</EmptyState>
            </ContentCard>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>{dayClasses.map(renderClassRow)}</Box>
          )}
        </>
      ) : classes.length === 0 ? (
        <ContentCard>
          <EmptyState>
            {isStaff
              ? 'Nog geen lessen op het rooster. Voeg de eerste toe.'
              : 'Er staan nog geen lessen gepland. Je trainer zet ze hier neer.'}
          </EmptyState>
        </ContentCard>
      ) : classesByDay.length === 0 ? (
        <ContentCard>
          <EmptyState>Geen lessen in {roomFilter}.</EmptyState>
        </ContentCard>
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

      <BookConfirmDialog
        cls={confirmClass}
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
  credits,
  isStaff,
  freeCancelHours,
  busy,
  alreadyWeekly,
  onClose,
  onConfirm,
}: {
  cls: StudioClass | null;
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
          {[cls.room, `${cls.bookedCount} van ${cls.capacity} plekken bezet`].filter(Boolean).join(' · ')}
        </Typography>

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

  useEffect(() => {
    if (!cls) return;
    setLoading(true);
    getBookingsForClass(cls.id)
      .then((list) => setRows(list.filter((b) => b.status === 'booked' || b.status === 'waitlist')))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [cls]);

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

  if (!cls) return null;

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{cls.title}</DialogTitle>
      <DialogContent sx={{ '&&': { pt: 1.5 } }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {dayLabel(cls.date)} · {cls.startTime}
          {cls.endTime ? `–${cls.endTime}` : ''}
        </Typography>
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
