import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Autocomplete,
  Box,
  Typography,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  IconButton,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import ConfirmationNumberRoundedIcon from '@mui/icons-material/ConfirmationNumberRounded';
import { PageLayout, ContentCard, PageTitle, EmptyState } from './layout';
import { useProfile } from '../context/ProfileContext';
import { useI18n } from '../context/I18nContext';
import { getClassTypes } from '../services/classTypeService';
import { useNotify } from '../context/NotifyContext';
import {
  getUpcomingClasses,
  getMyBookings,
  getCreditBalance,
  bookClass,
  cancelBooking,
  cancelClass,
  createClass,
  deleteClass,
  grantCredits,
  newClassId,
  SESSION_KIND_COLORS,
  type StudioClass,
  type Booking,
} from '../services/classService';
import { designTokens } from '../theme/designTokens';
import { addMinutes, addWeeks } from '../utils/format';
import type { ClassType, Profile, SessionKind } from '../types';

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

export function LessenPage() {
  const profileCtx = useProfile();
  const notify = useNotify();
  const me = profileCtx?.profile ?? null;
  const isStaff = me?.role === 'trainer' || me?.role === 'admin';

  const [classes, setClasses] = useState<StudioClass[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [credits, setCredits] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [selectedDate, setSelectedDate] = useState(today());
  const [roomFilter, setRoomFilter] = useState('');

  const load = useCallback(async () => {
    if (!me) return;
    setLoading(true);
    try {
      const [cls, mine, balance] = await Promise.all([
        getUpcomingClasses(today()),
        getMyBookings(me.userId),
        getCreditBalance(me.userId),
      ]);
      setClasses(cls);
      setBookings(mine);
      setCredits(balance);
    } catch (e) {
      notify?.error(e instanceof Error ? e.message : 'Rooster laden mislukt');
    } finally {
      setLoading(false);
    }
  }, [me, notify]);

  useEffect(() => {
    void load();
  }, [load]);

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

  const handleBook = useCallback(
    async (cls: StudioClass) => {
      setBusyId(cls.id);
      try {
        const result = await bookClass(cls.id);
        notify?.success(
          result.status === 'waitlist'
            ? 'De les is vol. Je staat op de wachtlijst en betaalt pas als je doorschuift.'
            : 'Je staat ingeschreven.'
        );
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
            <Chip size="small" label={`${cls.bookedCount}/${cls.capacity} plekken`} color={full ? 'warning' : 'default'} />
            {cls.waitlistCount > 0 && <Chip size="small" variant="outlined" label={`${cls.waitlistCount} op wachtlijst`} />}
            {cls.creditCost !== 1 && <Chip size="small" variant="outlined" label={`${cls.creditCost} credits`} />}
            {cls.cancelledAt && <Chip size="small" color="error" label="Afgelast" />}
            {mine?.status === 'waitlist' && <Chip size="small" color="info" label="Op wachtlijst" />}
            {mine?.status === 'booked' && <Chip size="small" color="success" label="Ingeschreven" />}
          </Box>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, flexShrink: 0, alignItems: 'flex-end' }}>
          {!cls.cancelledAt &&
            (mine ? (
              <Button size="small" variant="outlined" disabled={busy} onClick={() => void handleCancel(mine)}>
                Afmelden
              </Button>
            ) : (
              <Button size="small" variant="contained" disabled={busy} onClick={() => void handleBook(cls)}>
                {full ? 'Wachtlijst' : 'Reserveren'}
              </Button>
            ))}
          {isStaff && !cls.cancelledAt && (
            <IconButton size="small" onClick={() => void handleDelete(cls)} disabled={busy} aria-label="Les verwijderen">
              <DeleteOutlineRoundedIcon fontSize="small" />
            </IconButton>
          )}
        </Box>
      </Box>
    );
  };

  return (
    <PageLayout>
      <PageTitle>Lessen</PageTitle>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: -2, mb: 2, px: 0.5, flexWrap: 'wrap' }}>
        <Chip
          icon={<ConfirmationNumberRoundedIcon />}
          label={credits === 1 ? '1 credit' : `${credits} credits`}
          color={credits > 0 ? 'default' : 'warning'}
          size="small"
        />
        <Typography variant="body2" color="text.secondary">
          {isStaff ? 'Zet lessen op het rooster; sporters reserveren met credits.' : 'Reserveer met je credits.'}
        </Typography>
      </Box>

      {isStaff && (
        <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
          <Button startIcon={<AddRoundedIcon />} onClick={() => setNewOpen(true)}>
            Les toevoegen
          </Button>
          <Button startIcon={<ConfirmationNumberRoundedIcon />} onClick={() => setCreditsOpen(true)}>
            Credits toekennen
          </Button>
        </Box>
      )}

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5, flexWrap: 'wrap' }}>
        <ToggleButtonGroup size="small" exclusive value={viewMode} onChange={(_, v: ViewMode | null) => v && setViewMode(v)}>
          <ToggleButton value="week">Week</ToggleButton>
          <ToggleButton value="day">Dag</ToggleButton>
          <ToggleButton value="makeups">Inhaallessen</ToggleButton>
        </ToggleButtonGroup>
        {roomOptions.length > 0 && (
          <ToggleButtonGroup size="small" exclusive value={roomFilter} onChange={(_, v: string | null) => setRoomFilter(v ?? '')}>
            <ToggleButton value="">Alle ruimtes</ToggleButton>
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
                      bgcolor: selected ? designTokens.primaryContainer : 'transparent',
                      color: selected ? designTokens.onPrimaryContainer : 'text.primary',
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

      <NewClassDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        trainerId={me.userId}
        onCreated={() => {
          setNewOpen(false);
          void load();
        }}
      />

      <GrantCreditsDialog
        open={creditsOpen}
        onClose={() => setCreditsOpen(false)}
        sporters={profileCtx?.allSporters ?? []}
        onGranted={() => {
          setCreditsOpen(false);
          void load();
        }}
      />
    </PageLayout>
  );
}

/** Een les op het rooster zetten. Bewust kort: titel, wanneer, hoeveel plekken, wat het kost. */
function NewClassDialog({
  open,
  onClose,
  trainerId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  trainerId: string;
  onCreated: () => void;
}) {
  const notify = useNotify();
  const { t } = useI18n();
  const [types, setTypes] = useState<ClassType[]>([]);
  const [typeId, setTypeId] = useState('');
  const [title, setTitle] = useState('Small Group Training');
  const [date, setDate] = useState(today());
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [capacity, setCapacity] = useState('8');
  const [creditCost, setCreditCost] = useState('1');
  const [room, setRoom] = useState('');
  const [sessionKind, setSessionKind] = useState<SessionKind>('group');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) getClassTypes().then(setTypes).catch(() => setTypes([]));
  }, [open]);

  const roomOptions = useMemo(() => Array.from(new Set(types.map((c) => c.room).filter((r): r is string => !!r))).sort(), [types]);

  // Lessoort gekozen: naam, eindtijd, plekken, credits, ruimte en sessiesoort invullen (Beheer → Lessoorten).
  const pickType = (id: string) => {
    setTypeId(id);
    const ct = types.find((c) => c.id === id);
    if (!ct) return;
    setTitle(ct.name);
    setEndTime(addMinutes(startTime, ct.durationMin));
    setCapacity(ct.capacity == null ? '' : String(ct.capacity));
    setCreditCost(String(Math.min(ct.creditCost, 3)));
    setRoom(ct.room ?? '');
    setSessionKind(ct.sessionKind);
  };

  const submit = async () => {
    setBusy(true);
    try {
      const chosen = types.find((c) => c.id === typeId) ?? null;
      // Geen limiet op de lessoort: het rooster vraagt toch een getal (de regels eisen dat).
      const plekken = capacity.trim() === '' && chosen?.capacity == null ? 999 : Number(capacity);
      const kosten = Number(creditCost);
      if (!Number.isInteger(plekken) || plekken < 1) throw new Error('Vul een geldig aantal plekken in.');
      if (!Number.isInteger(kosten) || kosten < 0) throw new Error('Vul een geldig aantal credits in.');

      await createClass({
        id: newClassId(),
        title: title.trim() || 'Les',
        date,
        startTime,
        endTime: endTime || null,
        trainerId: chosen?.defaultTrainerId ?? trainerId,
        capacity: plekken,
        creditCost: kosten,
        schemaId: chosen?.schemaId ?? null,
        classTypeId: chosen?.id ?? null,
        room: room.trim() || null,
        sessionKind,
      });
      notify?.success('Les staat op het rooster.');
      onCreated();
    } catch (e) {
      notify?.error(e instanceof Error ? e.message : 'Les toevoegen mislukt');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Les toevoegen</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, '&&': { pt: 1.5 } }}>
        {types.length > 0 && (
          <TextField label={t('classTypes.classType')} select value={typeId} onChange={(e) => pickType(e.target.value)} size="small">
            <MenuItem value="">{t('classTypes.looseClass')}</MenuItem>
            {types.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
              </MenuItem>
            ))}
          </TextField>
        )}
        <TextField label="Naam" value={title} onChange={(e) => setTitle(e.target.value)} size="small" />
        <TextField
          label="Datum"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          size="small"
          InputLabelProps={{ shrink: true }}
        />
        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField
            label="Van"
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            size="small"
            fullWidth
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Tot"
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            size="small"
            fullWidth
            InputLabelProps={{ shrink: true }}
          />
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField
            label="Plekken"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            size="small"
            fullWidth
            inputMode="numeric"
          />
          <TextField
            label="Credits"
            select
            value={creditCost}
            onChange={(e) => setCreditCost(e.target.value)}
            size="small"
            fullWidth
          >
            {['0', '1', '2', '3'].map((v) => (
              <MenuItem key={v} value={v}>
                {v === '0' ? 'Gratis' : v}
              </MenuItem>
            ))}
          </TextField>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField label={t('classTypes.sessionKind')} select value={sessionKind} onChange={(e) => setSessionKind(e.target.value as SessionKind)} size="small" fullWidth>
            {SESSION_KIND_KEYS.map((k) => (
              <MenuItem key={k} value={k}>
                {t(`classTypes.sessionKinds.${k}`)}
              </MenuItem>
            ))}
          </TextField>
          <Autocomplete
            freeSolo
            size="small"
            fullWidth
            options={roomOptions}
            value={room}
            onInputChange={(_, v) => setRoom(v)}
            renderInput={(params) => <TextField {...params} label={t('classTypes.room')} />}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Annuleren
        </Button>
        <Button variant="contained" onClick={() => void submit()} disabled={busy}>
          Toevoegen
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Credits toekennen aan een sporter. Een strippenkaart in de app: de trainer boekt het bij,
 * de mutatie komt in het grootboek te staan zodat later te zien is waar een saldo vandaan komt.
 */
function GrantCreditsDialog({
  open,
  onClose,
  sporters,
  onGranted,
}: {
  open: boolean;
  onClose: () => void;
  sporters: Profile[];
  onGranted: () => void;
}) {
  const notify = useNotify();
  const [userId, setUserId] = useState('');
  const [amount, setAmount] = useState('10');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const aantal = Number(amount);
      if (!userId) throw new Error('Kies een sporter.');
      if (!Number.isInteger(aantal) || aantal === 0) throw new Error('Vul een heel aantal credits in.');

      const result = await grantCredits(userId, aantal, note.trim() || undefined);
      const naam = sporters.find((p) => p.userId === userId)?.displayName ?? 'de sporter';
      notify?.success(`${naam} heeft nu ${result.balance} credits.`);
      setNote('');
      onGranted();
    } catch (e) {
      notify?.error(e instanceof Error ? e.message : 'Credits toekennen mislukt');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Credits toekennen</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, '&&': { pt: 1.5 } }}>
        <TextField label="Sporter" select value={userId} onChange={(e) => setUserId(e.target.value)} size="small">
          {sporters.map((p) => (
            <MenuItem key={p.userId} value={p.userId}>
              {p.displayName || p.email || p.userId}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label="Aantal credits"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          size="small"
          inputMode="numeric"
          helperText="Een negatief aantal boekt credits juist af."
        />
        <TextField
          label="Notitie"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          size="small"
          placeholder="Bijvoorbeeld: 10-rittenkaart betaald"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Annuleren
        </Button>
        <Button variant="contained" onClick={() => void submit()} disabled={busy}>
          Toekennen
        </Button>
      </DialogActions>
    </Dialog>
  );
}
