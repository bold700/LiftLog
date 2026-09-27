/**
 * Beheer → Lesplanning: per week alle lessen met de training die er gegeven wordt. Zo kan een
 * trainer vooruit plannen in plaats van last minute, en weet iedereen in het team wat er zondag
 * op het programma staat. Alleen voor staf; sporters zien dit niet.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, ButtonBase, Chip, IconButton, Typography } from '@mui/material';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import { ContentCard, LoadingBlock } from '../layout';
import { useNotify } from '../../context/NotifyContext';
import { getUpcomingClasses, type StudioClass } from '../../services/classService';
import { getClassPlans, type ClassPlan } from '../../services/classPlanService';
import { getPlannableWorkouts } from '../../services/workoutFirestore';
import { toIsoDate, todayIso } from '../../utils/format';
import { getCurrentScheduleWeek, getIsoWeek } from '../../utils/workoutFilter';
import { designTokens } from '../../theme/designTokens';
import { ClassPlanDialog } from './ClassPlanDialog';
import type { Profile, Schema } from '../../types';

/** Maandag van de week waarin `date` valt. */
function mondayOf(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);
const shortDay = (d: Date) => d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
const dayHeading = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });

export function ClassPlanningPanel({ profiles, selfId }: { profiles: Profile[]; selfId: string | null }) {
  const notify = useNotify();
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [classes, setClasses] = useState<StudioClass[] | null>(null);
  const [plans, setPlans] = useState<Record<string, ClassPlan>>({});
  const [workouts, setWorkouts] = useState<Schema[]>([]);
  const [onlyMine, setOnlyMine] = useState(false);
  const [editing, setEditing] = useState<StudioClass | null>(null);

  const load = useCallback(() => {
    const from = todayIso();
    Promise.all([
      getUpcomingClasses(from),
      getClassPlans(from).catch(() => ({})),
      selfId ? getPlannableWorkouts(selfId).catch(() => []) : Promise.resolve([]),
    ])
      .then(([cls, pl, wo]) => {
        setClasses(cls.filter((c) => !c.cancelledAt));
        setPlans(pl);
        setWorkouts(wo);
      })
      .catch((e) => {
        setClasses([]);
        notify?.error(e instanceof Error ? e.message : 'Lesplanning laden mislukt');
      });
  }, [notify, selfId]);

  useEffect(() => {
    load();
  }, [load]);

  const thisMonday = mondayOf(new Date());
  const from = toIsoDate(weekStart);
  const to = toIsoDate(addDays(weekStart, 6));
  const week = useMemo(
    () =>
      (classes ?? []).filter(
        (c) => c.date >= from && c.date <= to && (!onlyMine || c.trainerId === selfId) && c.date >= todayIso()
      ),
    [classes, from, to, onlyMine, selfId]
  );
  const byDay = useMemo(() => {
    const out = new Map<string, StudioClass[]>();
    for (const c of week) out.set(c.date, [...(out.get(c.date) ?? []), c]);
    return Array.from(out.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, list]) => [date, [...list].sort((a, b) => a.startTime.localeCompare(b.startTime))] as const);
  }, [week]);
  const planned = week.filter((c) => plans[c.id]).length;

  const nameOf = (userId: string | null | undefined) => {
    if (!userId) return null;
    const p = profiles.find((x) => x.userId === userId);
    return p ? p.displayName?.trim() || p.email : null;
  };

  if (classes === null) return <LoadingBlock />;

  // Lessen staan WEEKS_AHEAD (8) weken vooruit op het rooster; verder terug dan deze week heeft geen zin.
  const canPrev = weekStart.getTime() > thisMonday.getTime();

  return (
    <ContentCard>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <IconButton aria-label="Vorige week" disabled={!canPrev} onClick={() => setWeekStart((d) => addDays(d, -7))} size="small">
          <ChevronLeftRoundedIcon />
        </IconButton>
        <Box sx={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
            Week {getIsoWeek(weekStart)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {shortDay(weekStart)} – {shortDay(addDays(weekStart, 6))} · schemaweek {getCurrentScheduleWeek(weekStart)}
          </Typography>
        </Box>
        <IconButton aria-label="Volgende week" onClick={() => setWeekStart((d) => addDays(d, 7))} size="small">
          <ChevronRightRoundedIcon />
        </IconButton>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1, minWidth: 200 }}>
          {week.length === 0
            ? 'Geen lessen in deze week.'
            : `${planned} van ${week.length} lessen voorbereid. Alleen trainers zien welke training er komt.`}
        </Typography>
        <Chip
          label="Alleen mijn lessen"
          variant={onlyMine ? 'filled' : 'outlined'}
          color={onlyMine ? 'primary' : 'default'}
          onClick={() => setOnlyMine((v) => !v)}
          size="small"
        />
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {byDay.map(([date, list]) => (
          <Box key={date}>
            <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 2 }}>
              {dayHeading(date)}
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {list.map((c) => {
                const plan = plans[c.id];
                const trainer = nameOf(c.trainerId);
                return (
                  <ButtonBase
                    key={c.id}
                    onClick={() => setEditing(c)}
                    sx={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'flex-start',
                      textAlign: 'left',
                      gap: 1.5,
                      p: 1.5,
                      borderRadius: 2,
                      border: `1px solid ${designTokens.cardBorder}`,
                      width: '100%',
                    }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 600, width: 44, flexShrink: 0 }}>
                      {c.startTime}
                    </Typography>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {c.title}
                        {trainer ? (
                          <Typography component="span" variant="body2" color="text.secondary">
                            {` · ${trainer}`}
                          </Typography>
                        ) : null}
                      </Typography>
                      {plan ? (
                        <>
                          {plan.schemaName && (
                            <Typography variant="body2" sx={{ color: designTokens.primary }}>
                              {plan.schemaName}
                              {plan.dayLabel ? ` · ${plan.dayLabel}` : ''}
                            </Typography>
                          )}
                          {plan.note && (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                            >
                              {plan.note}
                            </Typography>
                          )}
                        </>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          Nog niet voorbereid
                        </Typography>
                      )}
                    </Box>
                    {!plan && <AddRoundedIcon fontSize="small" sx={{ color: 'text.secondary', mt: 0.25 }} />}
                  </ButtonBase>
                );
              })}
            </Box>
          </Box>
        ))}
      </Box>

      {editing && (
        <ClassPlanDialog
          cls={editing}
          plan={plans[editing.id] ?? null}
          workouts={workouts}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            const id = editing.id;
            setPlans((prev) => {
              const next = { ...prev };
              if (saved) next[id] = saved;
              else delete next[id];
              return next;
            });
            setEditing(null);
          }}
        />
      )}
    </ContentCard>
  );
}
