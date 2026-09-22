import { useEffect, useMemo, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { getAllExercises } from '../utils/storage';
import { getExerciseMuscleMapping } from '../utils/muscleMappingResolver';
import { countMuscleSessions } from '../utils/muscleSessions';
import { MuscleFrequencyBody, GREEN_TINTS } from './MuscleFrequencyBody';
import { PageLayout } from './layout';
import { designTokens } from '../theme/designTokens';

const cardSx = () => ({
  backgroundColor: designTokens.cardBackground,
  borderRadius: `${designTokens.cardRadius}px`,
});

/** Figma "Insights · Muscles": links het lichaam met legenda, rechts "Meest getraind" als balken. */
export const SpiergroepenPage = () => {
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const refresh = () => setRefreshKey((k) => k + 1);
    window.addEventListener('storage', refresh);
    window.addEventListener('workoutUpdated', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('workoutUpdated', refresh);
    };
  }, []);

  const muscles = useMemo(
    () => countMuscleSessions(getAllExercises(), (name) => getExerciseMuscleMapping(name)?.primary ?? []),
    // refreshKey: opnieuw tellen zodra er iets gelogd is.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [refreshKey]
  );
  const max = muscles[0]?.sessions ?? 0;

  return (
    <PageLayout maxWidth="none">
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '5fr 3fr' },
          gap: { xs: 2, md: 2.5 },
        }}
      >
        <Box sx={{ ...cardSx(), p: { xs: 2, md: 3 }, minWidth: 0 }}>
          <MuscleFrequencyBody size="calc(50% - 12px)" aspectRatio="1 / 1.8" />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mt: 2 }} aria-label="Legenda: van minder naar meer getraind">
            <Typography variant="caption" color="text.secondary">
              Minder
            </Typography>
            {GREEN_TINTS.map((color) => (
              <Box key={color} sx={{ width: 30, height: 12, borderRadius: '4px', backgroundColor: color }} />
            ))}
            <Typography variant="caption" color="text.secondary">
              Meer
            </Typography>
          </Box>
        </Box>

        {/* Op mobiel staat de lijst los onder het lichaam (geen kaart), zoals in Figma. */}
        <Box
          sx={{
            ...cardSx(),
            backgroundColor: { xs: 'transparent', md: designTokens.cardBackground },
            p: { xs: 0, md: 3 },
            minWidth: 0,
          }}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.25 }}>
            Meest getraind
          </Typography>
          {muscles.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Nog geen oefeningen gelogd.
            </Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
              {muscles.map(({ label, sessions }) => (
                <Box key={label}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, mb: 0.625 }}>
                    <Typography variant="body2" noWrap>
                      {label}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                      {sessions} {sessions === 1 ? 'sessie' : 'sessies'}
                    </Typography>
                  </Box>
                  <Box sx={{ height: 6, borderRadius: 3, backgroundColor: designTokens.cardBackgroundHigh, overflow: 'hidden' }}>
                    <Box
                      sx={{
                        height: '100%',
                        width: `${(sessions / max) * 100}%`,
                        borderRadius: 3,
                        backgroundColor: 'primary.main',
                      }}
                    />
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </Box>
    </PageLayout>
  );
};
