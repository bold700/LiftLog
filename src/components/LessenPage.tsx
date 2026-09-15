import { useCallback, useEffect, useMemo, useState } from 'react';
import {
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
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import ConfirmationNumberRoundedIcon from '@mui/icons-material/ConfirmationNumberRounded';
import { PageLayout, ContentCard, PageTitle, EmptyState } from './layout';
import { useProfile } from '../context/ProfileContext';
import { useNotify } from '../context/NotifyContext';
import {
  getUpcomingClasses,
  getMyBookings,
  getCreditBalance,
  bookClass,
  cancelBooking,
  createClass,
  deleteClass,
  grantCredits,
  newClassId,
  type StudioClass,
  type Booking,
} from '../services/classService';
import { designTokens } from '../theme/designTokens';
import type { Profile } from '../types';

const today = () => new Date().toISOString().slice(0, 10);

const dayLabel = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });

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
        await deleteClass(cls.id);
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

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={24} />
        </Box>
      ) : classes.length === 0 ? (
        <ContentCard>
          <EmptyState>
            {isStaff
              ? 'Nog geen lessen op het rooster. Voeg de eerste toe.'
              : 'Er staan nog geen lessen gepland. Je trainer zet ze hier neer.'}
          </EmptyState>
        </ContentCard>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {classes.map((cls) => {
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
                <Box sx={{ flex: '1 1 auto', minWidth: 0 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    {cls.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {dayLabel(cls.date)} · {cls.startTime}
                    {cls.endTime ? `–${cls.endTime}` : ''}
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
                  {isStaff && (
                    <IconButton size="small" onClick={() => void handleDelete(cls)} disabled={busy} aria-label="Les verwijderen">
                      <DeleteOutlineRoundedIcon fontSize="small" />
                    </IconButton>
                  )}
                </Box>
              </Box>
            );
          })}
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
  const [title, setTitle] = useState('Small Group Training');
  const [date, setDate] = useState(today());
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [capacity, setCapacity] = useState('8');
  const [creditCost, setCreditCost] = useState('1');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const plekken = Number(capacity);
      const kosten = Number(creditCost);
      if (!Number.isInteger(plekken) || plekken < 1) throw new Error('Vul een geldig aantal plekken in.');
      if (!Number.isInteger(kosten) || kosten < 0) throw new Error('Vul een geldig aantal credits in.');

      await createClass({
        id: newClassId(),
        title: title.trim() || 'Les',
        date,
        startTime,
        endTime: endTime || null,
        trainerId,
        capacity: plekken,
        creditCost: kosten,
        schemaId: null,
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
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
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
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
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
