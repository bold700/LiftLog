/**
 * Boekingen op Profiel, naast Abonnement: aankomende losse lessen, en de lessoorten waar "elke
 * week inschrijven" voor aanstaat — met een schakelaar om dat uit te zetten en, als de cron een
 * week heeft overgeslagen (geen credits, of de les zat vol), een melding daarover.
 */
import { useEffect, useState } from 'react';
import { Box, Chip, Switch, Typography } from '@mui/material';
import ConfirmationNumberRoundedIcon from '@mui/icons-material/ConfirmationNumberRounded';
import { useI18n } from '../context/I18nContext';
import { useNotify } from '../context/NotifyContext';
import {
  getCreditBalance,
  getMyBookings,
  getMyStandingBookings,
  getUpcomingClasses,
  setStandingBookingActive,
  type Booking,
  type StudioClass,
} from '../services/classService';
import { getClassTypes } from '../services/classTypeService';
import { designTokens } from '../theme/designTokens';
import { todayIso } from '../utils/format';
import type { ClassType, StandingBooking } from '../types';

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

const dayLabel = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });

export function BookingsCard({ userId }: { userId: string }) {
  const { t } = useI18n();
  const notify = useNotify();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [classes, setClasses] = useState<StudioClass[]>([]);
  const [standing, setStanding] = useState<StandingBooking[]>([]);
  const [types, setTypes] = useState<ClassType[]>([]);
  const [credits, setCredits] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void Promise.all([
      getMyBookings(userId),
      getMyStandingBookings(userId),
      getClassTypes().catch(() => []),
      getUpcomingClasses(todayIso()).catch(() => []),
      getCreditBalance(userId).catch(() => 0),
    ]).then(([b, s, c, cls, balance]) => {
      if (!alive) return;
      setBookings(b);
      setStanding(s);
      setTypes(c);
      setClasses(cls);
      setCredits(balance);
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  const toggle = async (s: StandingBooking) => {
    setBusyId(s.id);
    try {
      await setStandingBookingActive(s.id, !s.active);
      setStanding((prev) => prev.map((x) => (x.id === s.id ? { ...x, active: !x.active } : x)));
    } catch (e) {
      notify?.error(e instanceof Error ? e.message : 'Aanpassen mislukt');
    } finally {
      setBusyId(null);
    }
  };

  const classById = new Map(classes.map((c) => [c.id, c]));
  const upcoming = bookings
    .filter((b) => b.status === 'booked' || b.status === 'waitlist')
    .map((b) => ({ booking: b, cls: classById.get(b.classId) }))
    .filter((row): row is { booking: Booking; cls: StudioClass } => !!row.cls)
    .sort((a, b) => `${a.cls.date}${a.cls.startTime}`.localeCompare(`${b.cls.date}${b.cls.startTime}`))
    .slice(0, 5);

  if (credits == null) return null;

  return (
    <Box sx={{ p: 2, mb: 3, borderRadius: `${designTokens.cardRadius}px`, bgcolor: designTokens.cardBackground }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: upcoming.length > 0 || standing.length > 0 ? 1.5 : 0 }}>
        <Typography variant="subtitle2" fontWeight={600}>
          Boekingen
        </Typography>
        <Chip
          size="small"
          icon={<ConfirmationNumberRoundedIcon />}
          label={credits === 1 ? '1 credit' : `${credits} credits`}
          color={credits > 0 ? 'default' : 'warning'}
        />
      </Box>

      {upcoming.length > 0 && (
        <Box sx={{ mb: standing.length > 0 ? 2.5 : 0 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            Aankomende lessen
          </Typography>
          {upcoming.map(({ booking, cls }) => (
            <Box key={booking.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
              <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>
                {dayLabel(cls.date)}, {cls.startTime} · {cls.title}
              </Typography>
              {booking.status === 'waitlist' && <Chip size="small" variant="outlined" label="Wachtlijst" />}
            </Box>
          ))}
        </Box>
      )}

      {standing.length > 0 && (
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            Elke week
          </Typography>
          {standing.map((s) => {
            const ct = types.find((c) => c.id === s.classTypeId);
            const slot = ct?.schedule.find((sl) => sl.weekday === s.weekday && sl.startTime === s.startTime);
            const weekdayLabel = t(`classTypes.schedule.weekdayLabels.${WEEKDAY_KEYS[s.weekday]}`);
            const skipped = s.active && s.lastOutcome && s.lastOutcome !== 'booked';
            return (
              <Box key={s.id} sx={{ py: 1, borderTop: `1px solid ${designTokens.cardBackgroundHigh}` }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={600} noWrap>
                      {ct?.name ?? 'Lessoort'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                      {weekdayLabel}, {s.startTime}
                      {slot ? `–${slot.endTime}` : ''}
                    </Typography>
                  </Box>
                  <Switch size="small" checked={s.active} disabled={busyId === s.id} onChange={() => void toggle(s)} />
                </Box>
                {skipped && (
                  <Typography variant="caption" color="error.main" sx={{ display: 'block', mt: 0.5 }}>
                    {s.lastOutcome === 'skippedFull' ? 'Overgeslagen — de les zat vol, je staat op de wachtlijst.' : 'Overgeslagen — geen credits meer.'}
                  </Typography>
                )}
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
