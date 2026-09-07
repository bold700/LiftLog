// Keuze van de trainingsdag bij per-dag weergave van de Formule 7-routekaart (tussen sectie 1 en 2).
import { Box, Typography, FormControl, InputLabel, Select, MenuItem } from '@mui/material';
import type { SchemaDay } from '../../types';
import { SECTION_STYLE } from './sectionShared';

interface TrainingsdagSelectProps {
  days: SchemaDay[];
  selectedDayIndex: number;
  onChange: (dayIndex: number) => void;
}

export function TrainingsdagSelect({ days, selectedDayIndex, onChange }: TrainingsdagSelectProps) {
  return (
    <Box sx={{ ...SECTION_STYLE, minWidth: 0, width: '100%' }}>
      <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 600 }}>
        Per trainingsdag
      </Typography>
      <FormControl
        size="small"
        fullWidth
        sx={{
          minWidth: 0,
          '& .MuiSelect-select': {
            minHeight: 40,
            boxSizing: 'border-box',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          },
        }}
      >
        <InputLabel id="formule7-day-select-label">Trainingsdag</InputLabel>
        <Select
          labelId="formule7-day-select-label"
          value={selectedDayIndex}
          label="Trainingsdag"
          onChange={(e) => onChange(Number(e.target.value))}
          MenuProps={{
            disableScrollLock: true,
            PaperProps: { sx: { maxHeight: 'min(60vh, 400px)' } },
          }}
          renderValue={(v) => {
            const d = days[Number(v)];
            return d ? `Dag ${Number(v) + 1}${d.dayLabel ? `: ${d.dayLabel}` : ''}` : '';
          }}
        >
          {days.map((d, idx) => (
            <MenuItem key={idx} value={idx}>
              Dag {idx + 1}{d.dayLabel ? `: ${d.dayLabel}` : ''}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    </Box>
  );
}
