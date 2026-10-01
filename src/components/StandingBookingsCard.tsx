/**
 * Vaste lessen ("elke week"): een sporter schrijft zich vast in voor een weekmoment van een
 * lessoort (bijv. HIIT op zaterdag), of een trainer doet dat voor een klant vanuit Beheer. De
 * server boekt de lessen die al op het rooster staan meteen, en de cron elke nieuwe week.
 *
 * Per vaste les: de komende weken met hun status, "Deze keer niet" (gewoon afmelden: binnen de
 * termijn credit terug, daarbuiten niet), pauzeren (vakantie) en stoppen.
 *
 * Staf zet hier ook een vast PT-moment voor een lid ("Bas elke vrijdag 18:00 bij Kenny"): de
 * server maakt daarvoor een privé-lessoort met dat ene weekmoment, dus er hoeft geen groepsles op
 * het rooster te staan.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  ListItemIcon,
  Menu,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PauseRoundedIcon from '@mui/icons-material/PauseRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import StopRoundedIcon from '@mui/icons-material/StopRounded';
import { useI18n } from '../context/I18nContext';
import { PlanMomentDialog } from './PlanMomentDialog';
import { RescheduleDialog } from './RescheduleDialog';
import EditCalendarRoundedIcon from '@mui/icons-material/EditCalendarRounded';
import { useNotify } from '../context/NotifyContext';
import {
  bookClass,
  cancelBooking,
  getMyBookings,
  getMyStandingBookings,
  getTrainerNames,
  getUpcomingClasses,
  pauseStandingBooking,
  setStandingBookingActive,
  type Booking,
  type StudioClass,
} from '../services/classService';
import { getClassTypes } from '../services/classTypeService';
import { designTokens } from '../theme/designTokens';
import { todayIso } from '../utils/format';
import { describeStandingResult, seriesOccurrences, singleAppointments, type SeriesStatus } from '../utils/standingSeries';
import type { ClassType, StandingBooking } from '../types';

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
/** Maandag eerst in de keuzelijst. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

const shortDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });

const STATUS: Record<SeriesStatus, { label: string; tone: 'ok' | 'muted' | 'warn' }> = {
  booked: { label: 'Geboekt', tone: 'ok' },
  waitlist: { label: 'Wachtlijst', tone: 'warn' },
  paused: { label: 'Pauze', tone: 'muted' },
  cancelledClass: { label: 'Afgelast', tone: 'muted' },
  optedOut: { label: 'Afgemeld', tone: 'muted' },
  notStarted: { label: 'Nog niet begonnen', tone: 'muted' },
  skipped: { label: 'Niet geboekt', tone: 'warn' },
};

interface Props {
  userId: string;
  /** Staf beheert de vaste lessen van een lid (Beheer → Profiel bewerken). */
  asStaff?: boolean;
  /** Zonder eigen kaart-achtergrond, voor in een dialoog. */
  embedded?: boolean;
  /** Staf: trainers om uit te kiezen bij een PT-moment (en om de naam te tonen). */
  trainers?: { userId: string; name: string }[];
  /** Staf: voorgeselecteerde trainer bij een nieuw PT-moment (de vaste trainer van het lid). */
  defaultTrainerId?: string | null;
}

const NO_TRAINERS: { userId: string; name: string }[] = [];

export function StandingBookingsCard({ userId, asStaff = false, embedded = false, trainers = NO_TRAINERS, defaultTrainerId = null }: Props) {
  const { t } = useI18n();
  const notify = useNotify();
  const [standing, setStanding] = useState<StandingBooking[]>([]);
  const [types, setTypes] = useState<ClassType[]>([]);
  const [classes, setClasses] = useState<StudioClass[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; s: StandingBooking } | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  /** Staf: hele reeks van een PT-moment wijzigen. */
  const [moveSeries, setMoveSeries] = useState<StandingBooking | null>(null);
  /** Eén afspraak verzetten (staf direct) of na afmelden een ander moment kiezen (sporter). */
  const [moveOne, setMoveOne] = useState<{ classId: string; bookingId: string | null } | null>(null);
  const [pauseFor, setPauseFor] = useState<StandingBooking | null>(null);
  const [skip, setSkip] = useState<{ booking: Booking; cls: StudioClass } | null>(null);
  /** Sporter: namen van de server, alleen als de studio "naam van de trainer tonen" aan heeft. */
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});

  const today = todayIso();
  const load = useCallback(async () => {
    const [s, c, cls, b] = await Promise.all([
      getMyStandingBookings(userId).catch(() => []),
      getClassTypes().catch(() => []),
      getUpcomingClasses(todayIso()).catch(() => []),
      getMyBookings(userId).catch(() => []),
    ]);
    setStanding(s);
    setTypes(c);
    setClasses(cls);
    setBookings(b);
    setLoaded(true);
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (asStaff) return;
    let cancelled = false;
    getTrainerNames()
      .then((names) => !cancelled && setMemberNames(names))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [asStaff]);

  /** Server-actie uitvoeren, samenvatting tonen en opnieuw laden. */
  const run = async (fn: () => Promise<Parameters<typeof describeStandingResult>[0]>) => {
    setBusy(true);
    try {
      const r = await fn();
      notify.success(describeStandingResult(r));
      await load();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Aanpassen mislukt');
    } finally {
      setBusy(false);
    }
  };

  const typeById = useMemo(() => new Map(types.map((c) => [c.id, c])), [types]);
  const publicTypes = useMemo(() => types.filter((c) => !c.privateFor && !c.privateForGroup), [types]);
  const trainerName = (id: string | null | undefined) =>
    id ? (trainers.find((tr) => tr.userId === id)?.name ?? memberNames[id]) : undefined;
  const weekdayLabel = (wd: number) => t(`classTypes.schedule.weekdayLabels.${WEEKDAY_KEYS[wd]}`);
  const slotLabel = (s: Pick<StandingBooking, 'classTypeId' | 'weekday' | 'startTime'>) => {
    const slot = typeById.get(s.classTypeId)?.schedule.find((sl) => sl.weekday === s.weekday && sl.startTime === s.startTime);
    return `${weekdayLabel(s.weekday)} ${s.startTime}${slot ? `–${slot.endTime}` : ''}`;
  };
  const statusLine = (s: StandingBooking) => {
    if (!s.active) return 'Gestopt';
    const ct = typeById.get(s.classTypeId);
    const who = ct?.privateFor && trainerName(ct.defaultTrainerId) ? ` · bij ${trainerName(ct.defaultTrainerId)}` : '';
    const kind = ct?.privateFor ? 'PT-moment, elke week' : ct?.privateForGroup ? 'Groepsles, elke week' : 'Elke week';
    if (s.pausedFrom) return `Pauze ${shortDate(s.pausedFrom)}${s.pausedUntil ? ` t/m ${shortDate(s.pausedUntil)}` : ', tot je hervat'}${who}`;
    if (s.startDate && s.startDate > today) return `${kind}, vanaf ${shortDate(s.startDate)}${who}`;
    return `${kind}${who}`;
  };

  if (!loaded) return null;
  // Actieve eerst, daarna gestopte; binnen elk op weekdag (maandag eerst) en tijd. Een vaste les
  // waarvan de lessoort weg is (verwijderd, of een gestopt PT-moment) valt weg.
  const sorted = [...standing].filter((s) => typeById.has(s.classTypeId)).sort(
    (a, b) =>
      Number(b.active) - Number(a.active) ||
      WEEK_ORDER.indexOf(a.weekday) - WEEK_ORDER.indexOf(b.weekday) ||
      a.startTime.localeCompare(b.startTime)
  );

  const singles = singleAppointments(standing, classes, bookings, today);
  const skipIsSingle = !!skip && singles.some((x) => x.cls.id === skip.cls.id);

  return (
    <Box sx={embedded ? {} : { p: 2, mb: 3, borderRadius: `${designTokens.cardRadius}px`, bgcolor: designTokens.cardBackground }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography component="h2" sx={{ fontSize: 14, fontWeight: 500, lineHeight: '20px' }}>
          Afspraken
        </Typography>
        {/* Eén knop: wat er kan hangt af van het abonnement (PT-momenten, groepslessen of allebei). */}
        <Button size="small" startIcon={<AddRoundedIcon />} onClick={() => setPlanOpen(true)} disabled={busy} sx={{ textTransform: 'none' }}>
          Moment inplannen
        </Button>
      </Box>

      {sorted.length === 0 && singles.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          {asStaff
            ? 'Nog geen afspraken. Plan een losse afspraak of een vast moment (elke week) in; vaste lessen worden elke week automatisch geboekt.'
            : 'Nog geen afspraken. Plan een losse afspraak of een vast moment in; bij een vast moment word je elke week automatisch ingeschreven.'}
        </Typography>
      )}

      {sorted.map((s) => {
        const ct = typeById.get(s.classTypeId);
        const upcoming = s.active ? seriesOccurrences(s, classes, bookings, today) : [];
        return (
          <Box key={s.id} sx={{ py: 1.25, borderTop: `1px solid ${designTokens.cardBackgroundHigh}`, opacity: s.active ? 1 : 0.6 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" fontWeight={600} noWrap>
                  {ct?.name ?? 'Lessoort'} · {slotLabel(s)}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                  {statusLine(s)}
                </Typography>
              </Box>
              <IconButton size="small" aria-label="Acties vaste les" onClick={(e) => setMenu({ anchor: e.currentTarget, s })} disabled={busy}>
                <MoreVertIcon fontSize="small" />
              </IconButton>
            </Box>
            {upcoming.length > 0 && (
              <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                {upcoming.map(({ cls, booking, status }) => (
                  <Box key={cls.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 32 }}>
                    <Typography variant="body2" sx={{ width: 96, flexShrink: 0 }}>
                      {shortDate(cls.date)}
                    </Typography>
                    <Chip
                      size="small"
                      label={STATUS[status].label}
                      sx={{
                        height: 22,
                        fontSize: 12,
                        bgcolor:
                          STATUS[status].tone === 'ok'
                            ? designTokens.primaryContainer
                            : STATUS[status].tone === 'warn'
                              ? designTokens.tertiaryContainer
                              : designTokens.cardBackgroundHigh,
                        color:
                          STATUS[status].tone === 'ok'
                            ? designTokens.onPrimaryContainer
                            : STATUS[status].tone === 'warn'
                              ? designTokens.onTertiaryContainer
                              : 'text.secondary',
                      }}
                    />
                    {booking && asStaff && ct?.privateFor && booking.status === 'booked' && (
                      <Button size="small" onClick={() => setMoveOne({ classId: cls.id, bookingId: booking.id })} disabled={busy} sx={{ ml: 'auto', textTransform: 'none', minWidth: 0 }}>
                        Verzetten
                      </Button>
                    )}
                    {booking && (
                      <Button
                        size="small"
                        onClick={() => setSkip({ booking, cls })}
                        disabled={busy}
                        sx={{ ml: asStaff && ct?.privateFor && booking.status === 'booked' ? 0 : 'auto', textTransform: 'none', minWidth: 0 }}
                      >
                        Deze keer niet
                      </Button>
                    )}
                    {status === 'optedOut' && (
                      <Button
                        size="small"
                        onClick={() =>
                          void run(async () => {
                            const r = await bookClass(cls.id, false, asStaff ? userId : undefined);
                            return r.status === 'waitlist' ? { skippedFull: 1 } : { booked: 1 };
                          })
                        }
                        disabled={busy}
                        sx={{ ml: 'auto', textTransform: 'none', minWidth: 0 }}
                      >
                        Toch wel
                      </Button>
                    )}
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        );
      })}

      {singles.length > 0 && (
        <Box sx={{ pt: 1.25, borderTop: `1px solid ${designTokens.cardBackgroundHigh}` }}>
          <Typography variant="body2" fontWeight={600}>
            Losse afspraken
          </Typography>
          <Box sx={{ mt: 0.5, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {singles.map(({ cls, booking }) => (
              <Box key={cls.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 32 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" noWrap>
                    {shortDate(cls.date)} {cls.startTime}
                    {cls.endTime ? `–${cls.endTime}` : ''} · {cls.title}
                  </Typography>
                  {(booking.status === 'waitlist' || (cls.privateFor && trainerName(cls.trainerId))) && (
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                      {booking.status === 'waitlist' ? 'Wachtlijst' : `bij ${trainerName(cls.trainerId)}`}
                    </Typography>
                  )}
                </Box>
                {asStaff && cls.privateFor && booking.status === 'booked' && (
                  <Button size="small" onClick={() => setMoveOne({ classId: cls.id, bookingId: booking.id })} disabled={busy} sx={{ textTransform: 'none', minWidth: 0 }}>
                    Verzetten
                  </Button>
                )}
                <Button size="small" onClick={() => setSkip({ booking, cls })} disabled={busy} sx={{ textTransform: 'none', minWidth: 0 }}>
                  Afmelden
                </Button>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      <Menu anchorEl={menu?.anchor} open={!!menu} onClose={() => setMenu(null)}>
        {asStaff && menu?.s.active && typeById.get(menu.s.classTypeId)?.privateFor && (
          <MenuItem
            onClick={() => {
              setMoveSeries(menu.s);
              setMenu(null);
            }}
          >
            <ListItemIcon>
              <EditCalendarRoundedIcon fontSize="small" />
            </ListItemIcon>
            Reeks wijzigen (dag, tijd of trainer)
          </MenuItem>
        )}
        {menu?.s.active && !menu.s.pausedFrom && (
          <MenuItem
            onClick={() => {
              setPauseFor(menu.s);
              setMenu(null);
            }}
          >
            <ListItemIcon>
              <PauseRoundedIcon fontSize="small" />
            </ListItemIcon>
            Pauzeren (vakantie)
          </MenuItem>
        )}
        {menu?.s.active && menu.s.pausedFrom && (
          <MenuItem
            onClick={() => {
              const id = menu.s.id;
              setMenu(null);
              void run(() => pauseStandingBooking(id, null, null));
            }}
          >
            <ListItemIcon>
              <PlayArrowRoundedIcon fontSize="small" />
            </ListItemIcon>
            Pauze opheffen
          </MenuItem>
        )}
        {menu?.s.active ? (
          <MenuItem
            onClick={() => {
              const id = menu.s.id;
              setMenu(null);
              void run(() => setStandingBookingActive(id, false));
            }}
          >
            <ListItemIcon>
              <StopRoundedIcon fontSize="small" />
            </ListItemIcon>
            {typeById.get(menu.s.classTypeId)?.privateFor ? 'PT-moment stoppen (ook geboekte lessen afmelden)' : 'Stoppen (ook geboekte lessen afmelden)'}
          </MenuItem>
        ) : (
          <MenuItem
            onClick={() => {
              const id = menu?.s.id;
              setMenu(null);
              if (id) void run(() => setStandingBookingActive(id, true));
            }}
          >
            <ListItemIcon>
              <PlayArrowRoundedIcon fontSize="small" />
            </ListItemIcon>
            Weer aanzetten
          </MenuItem>
        )}
      </Menu>

      <PlanMomentDialog
        open={planOpen}
        userId={userId}
        asStaff={asStaff}
        types={publicTypes}
        classes={classes}
        trainers={trainers}
        defaultTrainerId={defaultTrainerId}
        onClose={() => setPlanOpen(false)}
        onDone={() => void load()}
      />

      <PlanMomentDialog
        open={!!moveSeries}
        userId={userId}
        asStaff={asStaff}
        types={publicTypes}
        trainers={trainers}
        defaultTrainerId={defaultTrainerId}
        moveSeries={
          moveSeries
            ? {
                standingBookingId: moveSeries.id,
                classTypeId: moveSeries.classTypeId,
                label: `${typeById.get(moveSeries.classTypeId)?.name ?? 'PT-moment'} · ${slotLabel(moveSeries)}`,
                trainerId: typeById.get(moveSeries.classTypeId)?.defaultTrainerId ?? null,
                duration: seriesDuration(typeById.get(moveSeries.classTypeId), moveSeries),
              }
            : null
        }
        onClose={() => setMoveSeries(null)}
        onDone={() => void load()}
      />

      <RescheduleDialog
        classId={moveOne?.classId ?? null}
        staff={asStaff}
        moveBookingId={moveOne?.bookingId ?? null}
        onClose={() => setMoveOne(null)}
        onDone={() => void load()}
      />

      <PauseDialog
        standing={pauseFor}
        label={pauseFor ? `${typeById.get(pauseFor.classTypeId)?.name ?? 'Lessoort'} · ${slotLabel(pauseFor)}` : ''}
        onClose={() => setPauseFor(null)}
        onPause={(from, until) => {
          const id = pauseFor?.id;
          setPauseFor(null);
          if (id) void run(() => pauseStandingBooking(id, from, until));
        }}
      />

      <Dialog open={!!skip} onClose={() => setSkip(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{skipIsSingle ? 'Afmelden?' : 'Deze keer niet?'}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {skip && `${skip.cls.title} op ${shortDate(skip.cls.date)} om ${skip.cls.startTime} afmelden. `}
            Binnen de afmeldtermijn krijg je de credit terug, daarna niet.{skipIsSingle ? '' : ' De vaste les blijft gewoon staan voor de andere weken.'}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSkip(null)}>Terug</Button>
          <Button
            variant="contained"
            disableElevation
            onClick={() => {
              const b = skip?.booking;
              setSkip(null);
              if (b)
                void run(async () => {
                  const r = await cancelBooking(b.id);
                  // PT-moment op tijd afgemeld: meteen een ander moment kiezen (sporter vraagt aan, staf plant in).
                  if (r.reschedule) setMoveOne({ classId: r.reschedule.classId, bookingId: null });
                  return { cancelled: 1, refunded: r.refunded ? 1 : 0 };
                });
            }}
          >
            Afmelden
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function PauseDialog({
  standing,
  label,
  onClose,
  onPause,
}: {
  standing: StandingBooking | null;
  label: string;
  onClose: () => void;
  onPause: (from: string, until: string | null) => void;
}) {
  const [from, setFrom] = useState(todayIso());
  const [until, setUntil] = useState('');
  useEffect(() => {
    if (standing) {
      setFrom(todayIso());
      setUntil('');
    }
  }, [standing]);
  const invalid = !from || (!!until && until < from);
  return (
    <Dialog open={!!standing} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Pauzeren</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          {label}. Geboekte lessen in deze periode worden afgemeld (binnen de afmeldtermijn met credit terug). Daarna loopt de vaste les gewoon door.
        </DialogContentText>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, pt: 1 }}>
          <TextField label="Van" type="date" value={from} onChange={(e) => setFrom(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
          <TextField
            label="Tot en met"
            type="date"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
            InputLabelProps={{ shrink: true }}
            helperText="Leeg = tot je hervat"
            error={!!until && until < from}
            fullWidth
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Annuleren</Button>
        <Button variant="contained" disableElevation disabled={invalid} onClick={() => onPause(from, until || null)}>
          Pauzeren
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Duur in minuten van het weekmoment van een vaste les (standaard een uur). */
function seriesDuration(ct: ClassType | undefined, s: Pick<StandingBooking, 'weekday' | 'startTime'>): number {
  const slot = ct?.schedule.find((sl) => sl.weekday === s.weekday && sl.startTime === s.startTime);
  if (!slot) return 60;
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  return Math.max(30, m(slot.endTime) - m(slot.startTime));
}

/** Een uur na de begintijd, als voorstel voor de eindtijd. */
const plusHour = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return `${String(Math.min(h + 1, 23)).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

/**
 * Vast PT-moment voor een lid: lessoort (voor prijs, soort en ruimte), dag, tijd, trainer en
 * startdatum. PT-lessoorten (1-op-1, duo) staan bovenaan.
 */
export function PersonalSlotDialog({
  open,
  types,
  trainers,
  defaultTrainerId,
  weekdayLabel,
  onClose,
  onAdd,
  title = 'Vast PT-moment',
  intro,
}: {
  open: boolean;
  /** Ook gebruikt voor een vaste groepsles (Beheer → Groepen), met een eigen titel en uitleg. */
  title?: string;
  intro?: string;
  types: ClassType[];
  trainers: { userId: string; name: string }[];
  defaultTrainerId: string | null;
  weekdayLabel: (wd: number) => string;
  onClose: () => void;
  onAdd: (input: { baseClassTypeId: string; weekday: number; startTime: string; endTime: string; trainerId: string | null; startDate: string }) => void;
}) {
  const ordered = useMemo(() => {
    const pt = (c: ClassType) => (c.sessionKind === '1on1' || c.sessionKind === 'duo' ? 0 : 1);
    return [...types].sort((a, b) => pt(a) - pt(b) || a.name.localeCompare(b.name));
  }, [types]);
  const [typeId, setTypeId] = useState('');
  const [weekday, setWeekday] = useState(5);
  const [startTime, setStartTime] = useState('18:00');
  const [endTime, setEndTime] = useState('19:00');
  const [trainerId, setTrainerId] = useState('');
  const [startDate, setStartDate] = useState(todayIso());
  useEffect(() => {
    if (!open) return;
    const first = ordered[0];
    setTypeId(first?.id ?? '');
    setWeekday(5);
    setStartTime('18:00');
    setEndTime('19:00');
    setTrainerId(defaultTrainerId || first?.defaultTrainerId || trainers[0]?.userId || '');
    setStartDate(todayIso());
  }, [open, ordered, defaultTrainerId, trainers]);
  const base = ordered.find((c) => c.id === typeId);
  const timeError = !!startTime && !!endTime && endTime <= startTime;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          {intro ?? (
            <>
              Elke week op dezelfde dag en tijd, alleen voor dit lid. Het moment komt vanzelf op het rooster van de trainer en het lid wordt elke week geboekt
              {base ? ` (${base.creditCost === 0 ? 'gratis' : base.creditCost === 1 ? '1 credit' : `${base.creditCost} credits`} per keer)` : ''}.
            </>
          )}
        </DialogContentText>
        {ordered.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Maak eerst een lessoort aan (Beheer → Lessoorten), bijvoorbeeld "Personal training".
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField select label="Lessoort" value={typeId} onChange={(e) => setTypeId(e.target.value)} fullWidth>
              {ordered.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField select label="Dag" value={weekday} onChange={(e) => setWeekday(Number(e.target.value))} fullWidth>
              {WEEK_ORDER.map((wd) => (
                <MenuItem key={wd} value={wd}>
                  {weekdayLabel(wd)}
                </MenuItem>
              ))}
            </TextField>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <TextField
                label="Van"
                type="time"
                value={startTime}
                onChange={(e) => {
                  const next = e.target.value;
                  // Eindtijd schuift mee zolang hij nog op "een uur later" stond.
                  if (endTime === plusHour(startTime) && next) setEndTime(plusHour(next));
                  setStartTime(next);
                }}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
              <TextField
                label="Tot"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                InputLabelProps={{ shrink: true }}
                error={timeError}
                helperText={timeError ? 'Na de begintijd' : ' '}
                fullWidth
              />
            </Box>
            <TextField select label="Trainer" value={trainerId} onChange={(e) => setTrainerId(e.target.value)} fullWidth>
              {trainers.map((tr) => (
                <MenuItem key={tr.userId} value={tr.userId}>
                  {tr.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Vanaf"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              inputProps={{ min: todayIso() }}
              fullWidth
            />
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Annuleren</Button>
        <Button
          variant="contained"
          disableElevation
          disabled={!base || !startTime || !endTime || timeError || !startDate}
          onClick={() => onAdd({ baseClassTypeId: typeId, weekday, startTime, endTime, trainerId: trainerId || null, startDate })}
        >
          Vastzetten
        </Button>
      </DialogActions>
    </Dialog>
  );
}
