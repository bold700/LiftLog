/**
 * Boekingen op Profiel, naast Abonnement: creditsaldo en de aankomende lessen. Vaste lessen
 * ("elke week") staan in hun eigen kaart eronder (StandingBookingsCard).
 */
import { useEffect, useState } from 'react';
import { Box, Chip, Typography } from '@mui/material';
import ConfirmationNumberRoundedIcon from '@mui/icons-material/ConfirmationNumberRounded';
import {
  getCreditBalance,
  getMyBookings,
  getUpcomingClasses,
  type Booking,
  type StudioClass,
} from '../services/classService';
import { designTokens } from '../theme/designTokens';
import { todayIso } from '../utils/format';

const dayLabel = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });

export function BookingsCard({ userId }: { userId: string }) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [classes, setClasses] = useState<StudioClass[]>([]);
  const [credits, setCredits] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    void Promise.all([
      getMyBookings(userId),
      getUpcomingClasses(todayIso()).catch(() => []),
      getCreditBalance(userId).catch(() => 0),
    ]).then(([b, cls, balance]) => {
      if (!alive) return;
      setBookings(b);
      setClasses(cls);
      setCredits(balance);
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  const classById = new Map(classes.map((c) => [c.id, c]));
  const upcoming = bookings
    .filter((b) => b.status === 'booked' || b.status === 'waitlist')
    .map((b) => ({ booking: b, cls: classById.get(b.classId) }))
    .filter((row): row is { booking: Booking; cls: StudioClass } => !!row.cls)
    .sort((a, b) => `${a.cls.date}${a.cls.startTime}`.localeCompare(`${b.cls.date}${b.cls.startTime}`))
    .slice(0, 5);

  if (credits == null) return null;

  return (
    <Box sx={{ p: 2, mb: 0, borderRadius: `${designTokens.cardRadius}px`, bgcolor: designTokens.cardBackground }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: upcoming.length > 0 ? 1.5 : 0 }}>
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
        <Box>
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

    </Box>
  );
}
