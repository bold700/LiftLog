import { useEffect, useMemo, useState } from 'react';
import { Box, Typography, useMediaQuery, useTheme } from '@mui/material';
import { SESSION_KIND_COLORS, classHasStarted, type StudioClass, type Booking } from '../../services/classService';
import { designTokens } from '../../theme/designTokens';
import { hourRange, layoutDay, type Placed } from '../../utils/weekGrid';

const WEEKDAY_LETTER = ['Z', 'M', 'D', 'W', 'D', 'V', 'Z'];
const WEEKDAY_SHORT = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];

/** Hoogte van één uur in het rooster (px). */
const HOUR_PX = 48;
const AXIS_PX = { xs: 32, md: 48 };

interface Props {
  /** Maandag t/m zondag, "YYYY-MM-DD". */
  days: string[];
  classesByDate: Map<string, StudioClass[]>;
  bookingByClass: Map<string, Booking>;
  trainerNames: Record<string, string>;
  today: string;
  onOpenClass: (cls: StudioClass) => void;
  /** Tik op een datum in de kop: naar die dag in de Dag-weergave. */
  onSelectDay: (date: string) => void;
}

/** Minuten sinds middernacht nu, elke minuut bijgewerkt (voor de lijn "nu"). */
function useNowMinutes(): number {
  const read = () => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  };
  const [now, setNow] = useState(read);
  useEffect(() => {
    const id = window.setInterval(() => setNow(read()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

/**
 * Weekrooster zoals Google Agenda: kolommen ma–zo, uren links, lessen als blokken op hun tijd en duur.
 * Lessen die tegelijk vallen staan naast elkaar. Kleuren volgen Figma "Book a class": open = Primary
 * Container, ingeschreven = Tertiary Container, vol/afgelast = Surface Container High.
 */
export function WeekTimeGrid({ days, classesByDate, bookingByClass, trainerNames, today, onOpenClass, onSelectDay }: Props) {
  const nowMin = useNowMinutes();
  const theme = useTheme();
  // Op de telefoon is een dagkolom ~40px: lessen die tegelijk vallen passen niet naast elkaar.
  const compact = useMediaQuery(theme.breakpoints.down('md'));
  const weekClasses = useMemo(() => days.flatMap((d) => classesByDate.get(d) ?? []), [days, classesByDate]);
  const [startHour, endHour] = useMemo(() => hourRange(weekClasses), [weekClasses]);
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const gridHeight = (endHour - startHour) * HOUR_PX;
  const pxPerMin = HOUR_PX / 60;
  const cols = { xs: `${AXIS_PX.xs}px repeat(7, minmax(0, 1fr))`, md: `${AXIS_PX.md}px repeat(7, minmax(0, 1fr))` };
  const showNow = days.includes(today) && nowMin >= startHour * 60 && nowMin <= endHour * 60;

  return (
    <Box sx={{ bgcolor: designTokens.cardBackground, borderRadius: `${designTokens.cardRadius}px`, pb: 1.5, overflow: 'hidden' }}>
      {/* Kop: dagletter en datum; vandaag in een cirkel. */}
      <Box sx={{ display: 'grid', gridTemplateColumns: cols, pt: 1.5, pb: 1, borderBottom: `1px solid ${designTokens.cardBorder}` }}>
        <Box />
        {days.map((d) => {
          const dt = new Date(`${d}T12:00:00`);
          const isToday = d === today;
          const isPast = d < today;
          return (
            <Box
              key={d}
              role="button"
              tabIndex={isPast ? -1 : 0}
              aria-label={`Bekijk ${dt.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}`}
              onClick={() => !isPast && onSelectDay(d)}
              onKeyDown={(e) => {
                if (!isPast && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  onSelectDay(d);
                }
              }}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 0.25,
                cursor: isPast ? 'default' : 'pointer',
                opacity: isPast ? 0.45 : 1,
                minWidth: 0,
              }}
            >
              <Typography
                variant="caption"
                sx={{ fontSize: 11, fontWeight: 500, lineHeight: '16px', color: isToday ? designTokens.primary : 'text.secondary' }}
              >
                <Box component="span" sx={{ display: { xs: 'inline', md: 'none' } }}>
                  {WEEKDAY_LETTER[dt.getDay()]}
                </Box>
                <Box component="span" sx={{ display: { xs: 'none', md: 'inline' }, textTransform: 'uppercase' }}>
                  {WEEKDAY_SHORT[dt.getDay()]}
                </Box>
              </Typography>
              <Box
                sx={{
                  width: { xs: 28, md: 36 },
                  height: { xs: 28, md: 36 },
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: isToday ? designTokens.primary : 'transparent',
                  color: isToday ? designTokens.onPrimary : 'text.primary',
                  fontSize: { xs: 14, md: 20 },
                  lineHeight: 1,
                  transition: 'background-color 0.15s ease',
                  '&:hover': isPast || isToday ? undefined : { bgcolor: designTokens.cardBackgroundHigh },
                }}
              >
                {dt.getDate()}
              </Box>
            </Box>
          );
        })}
      </Box>

      {/* Uren en dagkolommen. */}
      <Box sx={{ display: 'grid', gridTemplateColumns: cols, pt: 1 }}>
        <Box sx={{ position: 'relative', height: gridHeight }}>
          {hours.map((h, i) =>
            i === 0 ? null : (
              <Typography
                key={h}
                variant="caption"
                sx={{
                  position: 'absolute',
                  top: i * HOUR_PX - 8,
                  right: { xs: 4, md: 8 },
                  fontSize: 10,
                  lineHeight: '16px',
                  color: 'text.secondary',
                }}
              >
                {String(h).padStart(2, '0')}:00
              </Typography>
            )
          )}
        </Box>
        {days.map((d) => {
          const placed = layoutDay(classesByDate.get(d) ?? []);
          // Telefoon: een groep lessen die tegelijk vallen wordt één blok "3 lessen" dat naar die dag gaat.
          const stacks: Placed<StudioClass>[][] = [];
          for (const p of placed) {
            if (!compact || p.lanes === 1) continue;
            (stacks[p.group] ??= []).push(p);
          }
          const singles = placed.filter((p) => !compact || p.lanes === 1);
          return (
            <Box
              key={d}
              sx={{
                position: 'relative',
                height: gridHeight,
                borderLeft: `1px solid ${designTokens.cardBorder}`,
                // Uurlijnen als achtergrond, zodat ze niet over de blokken heen vallen.
                backgroundImage: `repeating-linear-gradient(to bottom, ${designTokens.cardBorder} 0, ${designTokens.cardBorder} 1px, transparent 1px, transparent ${HOUR_PX}px)`,
                minWidth: 0,
              }}
            >
              {stacks.map((group) => {
                if (!group?.length) return null;
                const startMin = Math.min(...group.map((p) => p.startMin));
                const endMin = Math.max(...group.map((p) => p.endMin));
                const top = (startMin - startHour * 60) * pxPerMin;
                const height = Math.max((endMin - startMin) * pxPerMin - 2, 18);
                const first = group.reduce((a, b) => (b.startMin < a.startMin ? b : a)).item;
                return (
                  <Box
                    key={`stack-${first.id}`}
                    role="button"
                    tabIndex={0}
                    aria-label={`${group.length} lessen vanaf ${first.startTime}, bekijk de dag`}
                    onClick={() => onSelectDay(d)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectDay(d);
                      }
                    }}
                    sx={{
                      position: 'absolute',
                      top: top + 1,
                      height,
                      left: 2,
                      right: 2,
                      borderRadius: 1,
                      px: 0.5,
                      py: 0.25,
                      overflow: 'hidden',
                      cursor: 'pointer',
                      bgcolor: designTokens.secondaryContainer,
                      color: designTokens.onSecondaryContainer,
                    }}
                  >
                    <Typography sx={{ fontSize: 10, fontWeight: 700, lineHeight: '13px' }}>{group.length}</Typography>
                    <Typography sx={{ fontSize: 10, lineHeight: '13px' }}>lessen</Typography>
                  </Box>
                );
              })}
              {singles.map(({ item: cls, startMin, endMin, lane, lanes }) => {
                const mine = bookingByClass.get(cls.id);
                const full = cls.bookedCount >= cls.capacity;
                const booked = mine?.status === 'booked';
                const started = classHasStarted(cls);
                const muted = !!cls.cancelledAt || started || (full && !mine) || mine?.status === 'waitlist';
                const top = (startMin - startHour * 60) * pxPerMin;
                const height = Math.max((endMin - startMin) * pxPerMin - 2, 18);
                const short = height < 40;
                // Naast elkaar is er geen ruimte om woorden te breken: één regel met puntjes.
                const oneLine = short || lanes > 1;
                return (
                  <Box
                    key={cls.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${cls.title} ${cls.startTime}${cls.endTime ? `–${cls.endTime}` : ''}`}
                    onClick={() => onOpenClass(cls)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onOpenClass(cls);
                      }
                    }}
                    sx={{
                      position: 'absolute',
                      top: top + 1,
                      height,
                      left: `calc(${(lane / lanes) * 100}% + 2px)`,
                      width: `calc(${100 / lanes}% - 4px)`,
                      borderRadius: 1,
                      px: { xs: 0.5, md: 0.75 },
                      py: 0.25,
                      overflow: 'hidden',
                      cursor: 'pointer',
                      bgcolor: booked ? designTokens.tertiaryContainer : muted ? designTokens.cardBackgroundHigh : designTokens.primaryContainer,
                      color: booked ? designTokens.onTertiaryContainer : muted ? 'text.secondary' : designTokens.onPrimaryContainer,
                      border: cls.sessionKind === 'concept' ? `1px dashed ${designTokens.outline}` : 'none',
                      borderLeft: `3px solid ${SESSION_KIND_COLORS[cls.sessionKind]}`,
                      opacity: cls.cancelledAt ? 0.6 : 1,
                      textDecoration: cls.cancelledAt ? 'line-through' : 'none',
                      boxShadow: lanes > 1 ? `0 0 0 1px ${designTokens.cardBackground}` : 'none',
                      '&:hover': { filter: 'brightness(0.97)' },
                    }}
                  >
                    <Typography
                      sx={{
                        fontSize: { xs: 10, md: 12 },
                        fontWeight: 600,
                        lineHeight: { xs: '13px', md: '16px' },
                        overflow: 'hidden',
                        // Nooit midden in een woord afbreken ("Kettl / ebell"): op de telefoon één regel met puntjes.
                        ...(oneLine || compact
                          ? { display: 'block', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }
                          : { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 3, overflowWrap: 'break-word' }),
                      }}
                    >
                      {cls.title}
                    </Typography>
                    {!short && (
                      <Typography sx={{ fontSize: { xs: 10, md: 11 }, lineHeight: { xs: '13px', md: '15px' }, opacity: 0.85 }} noWrap>
                        {cls.startTime}
                        <Box component="span" sx={{ display: { xs: 'none', md: 'inline' } }}>
                          {cls.endTime ? `–${cls.endTime}` : ''}
                        </Box>
                      </Typography>
                    )}
                    {!short && height >= 64 && (
                      <Typography
                        sx={{ display: { xs: 'none', md: 'block' }, fontSize: 11, lineHeight: '15px', opacity: 0.85 }}
                        noWrap
                      >
                        {cls.cancelledAt
                          ? 'Afgelast'
                          : started
                            ? d < today || nowMin >= endMin
                              ? 'Afgelopen'
                              : 'Bezig'
                            : booked
                            ? 'Ingeschreven'
                            : mine?.status === 'waitlist'
                              ? 'Op wachtlijst'
                              : full
                                ? 'Vol'
                                : `${Math.max(0, cls.capacity - cls.bookedCount)} vrij`}
                        {trainerNames[cls.trainerId] ? ` · ${trainerNames[cls.trainerId]}` : ''}
                      </Typography>
                    )}
                  </Box>
                );
              })}
              {showNow && d === today && (
                <Box
                  aria-hidden
                  sx={{
                    position: 'absolute',
                    left: -4,
                    right: 0,
                    top: (nowMin - startHour * 60) * pxPerMin - 1,
                    height: 2,
                    bgcolor: 'error.main',
                    zIndex: 1,
                    pointerEvents: 'none',
                    '&::before': {
                      content: '""',
                      position: 'absolute',
                      left: 0,
                      top: -4,
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      bgcolor: 'error.main',
                    },
                  }}
                />
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
