/**
 * "Hoe ging het?" bij het loggen van een oefening: te licht, goed of te zwaar. Eén tik, zodat de
 * trainer bij de volgende sessie weet welk gewicht kan en waar hij op moet letten.
 */
import { Box, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import type { ExerciseEffort } from '../types';
import { EFFORT_LABELS } from '../utils/trainingFeedback';

interface EffortPickerProps {
  value: ExerciseEffort | null;
  onChange: (value: ExerciseEffort | null) => void;
  disabled?: boolean;
}

const OPTIONS: ExerciseEffort[] = ['light', 'good', 'heavy'];

export function EffortPicker({ value, onChange, disabled }: EffortPickerProps) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
        Hoe ging het?
      </Typography>
      <ToggleButtonGroup
        exclusive
        fullWidth
        size="small"
        value={value}
        disabled={disabled}
        onChange={(_, next: ExerciseEffort | null) => onChange(next)}
        aria-label="Hoe ging het"
        sx={{
          '& .MuiToggleButton-root': {
            textTransform: 'none',
            fontWeight: 500,
            borderRadius: '20px',
            py: 0.75,
          },
          '& .MuiToggleButton-root.Mui-selected': {
            bgcolor: '#000',
            color: '#F2E4D3',
            '&:hover': { bgcolor: '#1a1a1a' },
          },
        }}
      >
        {OPTIONS.map((opt) => (
          <ToggleButton key={opt} value={opt} aria-label={EFFORT_LABELS[opt]}>
            {EFFORT_LABELS[opt]}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </Box>
  );
}
