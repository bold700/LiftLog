/**
 * Vaste lessen ("elke week"): een sporter schrijft zich vast in voor een weekmoment van een
 * lessoort (bijv. HIIT op zaterdag), of een trainer doet dat voor een klant vanuit Beheer. De
 * server boekt de lessen die al op het rooster staan meteen, en de cron elke nieuwe week.
 *
 * Per vaste les: de komende weken met hun status, "Deze keer niet" (gewoon afmelden: binnen de
 * termijn credit terug, daarbuiten niet), pauzeren (vakantie) en stoppen.
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
import { useNotify } from '../context/NotifyContext';
import {
  addStandingBooking,
  cancelBooking,
  getMyBookings,
  getMyStandingBookings,
  getUpcomingClasses,
  pauseStandingBooking,
  setStandingBookingActive,
  type Booking,
  type StudioClass,
} from '../services/classService';
import { getClassTypes } from '../services/classTypeService';
import { designTokens } from '../theme/designTokens';
import { todayIso } from '../utils/format';
import { describeStandingResult, seriesOccurrences, type SeriesStatus } from '../utils/standingSeries';
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
  notStarted: { label: 'Nog niet begonnen', tone: 'muted' },
  skipped: { label: 'Niet geboekt', tone: 'warn' },
};

interface Props {
  userId: string;
  /** Staf beheert de vaste lessen van een lid (Beheer → Profiel bewerken). */
  asStaff?: boolean;
  /** Zonder eigen kaart-achtergrond, voor in een dialoog. */
  embedded?: boolean;
}

export function StandingBookingsCard({ userId, asStaff = false, embedded = false }: Props) {
  const { t } = useI18n();
  const notify = useNotify();
  const [standing, setStanding] = useState<StandingBooking[]>([]);
  const [types, setTypes] = useState<ClassType[]>([]);
  const [classes, setClasses] = useState<StudioClass[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; s: StandingBooking } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [pauseFor, setPauseFor] = useState<StandingBooking | null>(null);
  const [skip, setSkip] = useState<{ booking: Booking; cls: StudioClass } | null>(null);

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
  const weekdayLabel = (wd: number) => t(`classTypes.schedule.weekdayLabels.${WEEKDAY_KEYS[wd]}`);
  const slotLabel = (s: Pick<StandingBooking, 'classTypeId' | 'weekday' | 'startTime'>) => {
    const slot = typeById.get(s.classTypeId)?.schedule.find((sl) => sl.weekday === s.weekday && sl.startTime === s.startTime);
    return `${weekdayLabel(s.weekday)} ${s.startTime}${slot ? `–${slot.endTime}` : ''}`;
  };
  const statusLine = (s: StandingBooking) => {
    if (!s.active) return 'Gestopt';
    if (s.pausedFrom) return `Pauze ${shortDate(s.pausedFrom)}${s.pausedUntil ? ` t/m ${shortDate(s.pausedUntil)}` : ', tot je hervat'}`;
    if (s.startDate && s.startDate > today) return `Elke week, vanaf ${shortDate(s.startDate)}`;
    return 'Elke week';
  };

  if (!loaded) return null;
  // Actieve eerst, daarna gestopte; binnen elk op weekdag (maandag eerst) en tijd.
  const sorted = [...standing].sort(
    (a, b) =>
      Number(b.active) - Number(a.active) ||
      WEEK_ORDER.indexOf(a.weekday) - WEEK_ORDER.indexOf(b.weekday) ||
      a.startTime.localeCompare(b.startTime)
  );

  return (
    <Box sx={embedded ? {} : { p: 2, mb: 3, borderRadius: `${designTokens.cardRadius}px`, bgcolor: designTokens.cardBackground }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="subtitle2" fontWeight={600}>
          Vaste lessen
        </Typography>
        <Button size="small" startIcon={<AddRoundedIcon />} onClick={() => setAddOpen(true)} disabled={busy} sx={{ textTransform: 'none' }}>
          Vaste les
        </Button>
      </Box>

      {sorted.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          {asStaff
            ? 'Nog geen vaste lessen. Zet dit lid vast in voor een les die elke week terugkomt; de lessen worden dan automatisch geboekt.'
            : 'Nog geen vaste lessen. Schrijf je vast in voor een les die elke week terugkomt; je wordt dan automatisch geboekt.'}
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
                    {booking && (
                      <Button size="small" onClick={() => setSkip({ booking, cls })} disabled={busy} sx={{ ml: 'auto', textTransform: 'none', minWidth: 0 }}>
                        Deze keer niet
                      </Button>
                    )}
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        );
      })}

      <Menu anchorEl={menu?.anchor} open={!!menu} onClose={() => setMenu(null)}>
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
            Stoppen (ook geboekte lessen afmelden)
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

      <AddStandingDialog
        open={addOpen}
        types={types}
        weekdayLabel={weekdayLabel}
        onClose={() => setAddOpen(false)}
        onAdd={(input) => {
          setAddOpen(false);
          void run(() => addStandingBooking({ ...input, ...(asStaff ? { userId } : {}) }));
        }}
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
        <DialogTitle>Deze keer niet?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {skip && `${skip.cls.title} op ${shortDate(skip.cls.date)} om ${skip.cls.startTime} afmelden. `}
            Binnen de afmeldtermijn krijg je de credit terug, daarna niet. De vaste les blijft gewoon staan voor de andere weken.
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

function AddStandingDialog({
  open,
  types,
  weekdayLabel,
  onClose,
  onAdd,
}: {
  open: boolean;
  types: ClassType[];
  weekdayLabel: (wd: number) => string;
  onClose: () => void;
  onAdd: (input: { classTypeId: string; weekday: number; startTime: string; startDate: string }) => void;
}) {
  // Alle weekmomenten van alle lessoorten met een vast rooster, maandag eerst.
  const options = useMemo(
    () =>
      types
        .flatMap((ct) =>
          ct.schedule.map((sl) => ({
            key: `${ct.id}|${sl.weekday}|${sl.startTime}`,
            classTypeId: ct.id,
            weekday: sl.weekday,
            startTime: sl.startTime,
            label: `${ct.name} · ${weekdayLabel(sl.weekday)} ${sl.startTime}–${sl.endTime}`,
            cost: ct.creditCost,
          }))
        )
        .sort(
          (a, b) =>
            WEEK_ORDER.indexOf(a.weekday) - WEEK_ORDER.indexOf(b.weekday) || a.startTime.localeCompare(b.startTime) || a.label.localeCompare(b.label)
        ),
    [types, weekdayLabel]
  );
  const [key, setKey] = useState('');
  const [startDate, setStartDate] = useState(todayIso());
  useEffect(() => {
    if (open) {
      setKey('');
      setStartDate(todayIso());
    }
  }, [open]);
  const chosen = options.find((o) => o.key === key);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Vaste les</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          Elke week automatisch ingeschreven. De lessen die al op het rooster staan worden meteen geboekt; elke les kost de credits van die lessoort.
        </DialogContentText>
        {options.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Er zijn nog geen lessoorten met een vast weekmoment (Beheer → Lessoorten).
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField select label="Les" value={key} onChange={(e) => setKey(e.target.value)} fullWidth>
              {options.map((o) => (
                <MenuItem key={o.key} value={o.key}>
                  {o.label}
                  {o.cost > 0 ? ` · ${o.cost === 1 ? '1 credit' : `${o.cost} credits`}` : ''}
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
          disabled={!chosen || !startDate}
          onClick={() => chosen && onAdd({ classTypeId: chosen.classTypeId, weekday: chosen.weekday, startTime: chosen.startTime, startDate })}
        >
          Vastzetten
        </Button>
      </DialogActions>
    </Dialog>
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
