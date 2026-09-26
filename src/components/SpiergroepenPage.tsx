import { useMemo } from 'react';
import { Alert, Box, Typography, useTheme } from '@mui/material';
import { useViewedExercises } from '../hooks/useViewedExercises';
import { getExerciseMuscleMapping } from '../utils/muscleMappingResolver';
import { countMuscleSessions } from '../utils/muscleSessions';
import { MuscleFrequencyBody } from './MuscleFrequencyBody';
import { muscleTints } from '../theme/muscleTints';
import { PageLayout } from './layout';
import { designTokens } from '../theme/designTokens';

const cardSx = () => ({
  backgroundColor: designTokens.cardBackground,
  borderRadius: `${designTokens.cardRadius}px`,
});

/** Figma "Insights · Muscles": links het lichaam met legenda, rechts "Meest getraind" als balken. */
export const SpiergroepenPage = () => {
  const { exercises, error } = useViewedExercises();
  const theme = useTheme();

  const muscles = useMemo(
    () => countMuscleSessions(exercises, (name) => getExerciseMuscleMapping(name)?.primary ?? []),
    [exercises]
  );
  const max = muscles[0]?.sessions ?? 0;

  return (
    <PageLayout maxWidth="none">
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 5fr) minmax(0, 3fr)' },
          gap: { xs: 2, md: 2.5 },
        }}
      >
        <Box sx={{ ...cardSx(), p: { xs: 2, md: 3 }, minWidth: 0 }}>
          <MuscleFrequencyBody size="calc(50% - 12px)" aspectRatio="1 / 1.8" exercises={exercises} />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mt: 2 }} aria-label="Legenda: van minder naar meer getraind">
            <Typography variant="caption" color="text.secondary">
              Minder
            </Typography>
            {muscleTints(theme.palette.mode).map((color) => (
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
