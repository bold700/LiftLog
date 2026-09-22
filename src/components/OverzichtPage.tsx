import { useEffect, useMemo, useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { getAllExercises } from '../utils/storage';
import { getCompletions } from '../utils/dayCompletionStorage';
import { useWorkouts } from '../hooks/useWorkouts';
import {
  OVERVIEW_PERIOD_DAYS,
  computeOverviewStats,
  computePlanCompletion,
  formatVolume,
  getRecentLogs,
  isWithinLastDays,
} from '../utils/insightsOverview';
import { MuscleFrequencyBody } from './MuscleFrequencyBody';
import { PageLayout } from './layout';
import { designTokens } from '../theme/designTokens';

// Functie i.p.v. constante: de tokens zijn getters en volgen zo de huisstijl van de actieve studio.
const tileSx = () => ({
  backgroundColor: designTokens.cardBackground,
  borderRadius: `${designTokens.cardRadius}px`,
});

interface StatTileProps {
  value: string;
  label: string;
  /** Alleen op desktop achter het label; op mobiel is daar geen ruimte voor (Figma: drie smalle tegels). */
  period?: string;
  desktopOnly?: boolean;
}

function StatTile({ value, label, period, desktopOnly }: StatTileProps) {
  return (
    <Box
      sx={{
        ...tileSx(),
        px: 2,
        py: 1.75,
        minWidth: 0,
        display: desktopOnly ? { xs: 'none', md: 'block' } : 'block',
      }}
    >
      <Typography sx={{ fontSize: 28, lineHeight: '36px', fontWeight: 500 }}>{value}</Typography>
      <Typography variant="body2" color="text.secondary" noWrap>
        {label}
        {period && (
          <Box component="span" sx={{ display: { xs: 'none', md: 'inline' } }}>
            {` · ${period}`}
          </Box>
        )}
      </Typography>
    </Box>
  );
}

function SectionHeader({ title, action, onAction }: { title: string; action: string; onAction: () => void }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 40, mb: 1 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 500 }}>
        {title}
      </Typography>
      <Button size="small" onClick={onAction} sx={{ textTransform: 'none', fontWeight: 600 }}>
        {action}
      </Button>
    </Box>
  );
}

export interface OverzichtPageProps {
  onOpenMuscles: () => void;
  onOpenLogs: () => void;
}

export function OverzichtPage({ onOpenMuscles, onOpenLogs }: OverzichtPageProps) {
  const { schemas } = useWorkouts();
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const refresh = () => setRefreshKey((k) => k + 1);
    window.addEventListener('storage', refresh);
    window.addEventListener('workoutUpdated', refresh);
    window.addEventListener('dayCompletionUpdated', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('workoutUpdated', refresh);
      window.removeEventListener('dayCompletionUpdated', refresh);
    };
  }, []);

  const data = useMemo(() => {
    const now = new Date();
    const exercises = getAllExercises();
    return {
      stats: computeOverviewStats(exercises, now),
      plan: computePlanCompletion(exercises, schemas, getCompletions(), now),
      recent: getRecentLogs(exercises, 5, now),
      hasRecentMuscles: exercises.some((ex) => ex.name && isWithinLastDays(ex.date, OVERVIEW_PERIOD_DAYS, now)),
    };
    // refreshKey: opnieuw uitrekenen zodra er iets gelogd of aangevinkt is.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schemas, refreshKey]);

  const { stats, plan, recent } = data;

  return (
    <PageLayout maxWidth="none">
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(3, 1fr)', md: 'repeat(4, 1fr)' },
          gap: { xs: 1.25, md: 2 },
          mb: 3,
        }}
      >
        <StatTile value={String(stats.sessions)} label="Trainingen" period={`${OVERVIEW_PERIOD_DAYS} d`} />
        <StatTile value={formatVolume(stats.volumeKg)} label="Volume" period={`${OVERVIEW_PERIOD_DAYS} d`} />
        <StatTile value={`${stats.streakWeeks}w`} label="Reeks" />
        <StatTile value={plan == null ? '–' : `${plan}%`} label="Schema deze week" desktopOnly />
      </Box>

      {/* Twee kolommen op desktop (Figma "Overview"): spierfocus links, recente logs rechts. */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
          gap: 3,
          alignItems: 'start',
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <SectionHeader title="Spierfocus" action="Details" onAction={onOpenMuscles} />
          <Box sx={{ ...tileSx(), p: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 500, mb: 1 }}>
              Afgelopen {OVERVIEW_PERIOD_DAYS} dagen
            </Typography>
            <MuscleFrequencyBody sinceDays={OVERVIEW_PERIOD_DAYS} size="calc(50% - 12px)" />
            {!data.hasRecentMuscles && (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mt: 1 }}>
                Nog niets gelogd in de afgelopen {OVERVIEW_PERIOD_DAYS} dagen.
              </Typography>
            )}
          </Box>
        </Box>

        <Box sx={{ minWidth: 0 }}>
          <SectionHeader title="Recente activiteit" action="Alle logs" onAction={onOpenLogs} />
          {recent.length === 0 ? (
            <Box sx={{ ...tileSx(), px: 2.5, py: 2 }}>
              <Typography variant="body2" color="text.secondary">
                Nog geen oefeningen gelogd.
              </Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {recent.map((log) => (
                <Box
                  key={log.id}
                  sx={{
                    ...tileSx(),
                    minHeight: 60,
                    px: 2.5,
                    py: 1.25,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                  }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>
                      {log.name}
                    </Typography>
                    {log.details && (
                      <Typography variant="caption" color="text.secondary" noWrap component="div">
                        {log.details}
                      </Typography>
                    )}
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                    {log.day}
                    {log.time && (
                      <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
                        {` ${log.time}`}
                      </Box>
                    )}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </Box>
    </PageLayout>
  );
}
