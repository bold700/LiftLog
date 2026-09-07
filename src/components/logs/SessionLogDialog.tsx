// Dialoog "Training log toevoegen/bewerken" op de Log-pagina: datum, workout (schema), trainingsdag en notitie.
// De veldwaarden blijven in LogsPage; hier alleen de weergave en de MUI-knoppen.
import { Dialog, DialogTitle, DialogContent, Box, TextField, FormControl, InputLabel, Select, MenuItem, Button } from '@mui/material';
import { getSchemaById } from '../../utils/schemaStorage';
import type { Schema } from '../../types';

interface SessionLogDialogProps {
  /** 'add' of 'edit' als de dialoog open is, anders null. */
  mode: 'add' | 'edit' | null;
  schemas: Schema[];
  date: string;
  schemaId: string;
  dayIndex: number;
  notes: string;
  onDateChange: (value: string) => void;
  onSchemaIdChange: (value: string) => void;
  onDayIndexChange: (value: number) => void;
  onNotesChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
}

export function SessionLogDialog({
  mode,
  schemas,
  date,
  schemaId,
  dayIndex,
  notes,
  onDateChange,
  onSchemaIdChange,
  onDayIndexChange,
  onNotesChange,
  onClose,
  onSave,
}: SessionLogDialogProps) {
  const selectedSchemaForSessionLog = schemaId ? getSchemaById(schemaId) : null;

  return (
    <Dialog
      open={mode !== null}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>{mode === 'edit' ? 'Training log bewerken' : 'Training log toevoegen'}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <TextField
            label="Datum"
            type="date"
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
            size="small"
            fullWidth
            InputLabelProps={{ shrink: true }}
          />
          <FormControl size="small" fullWidth>
            <InputLabel id="session-log-schema-label">Workout</InputLabel>
            <Select
              labelId="session-log-schema-label"
              label="Workout"
              value={schemaId}
              onChange={(e) => {
                onSchemaIdChange(e.target.value);
                onDayIndexChange(0);
              }}
            >
              {schemas.map((s) => (
                <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          {selectedSchemaForSessionLog && selectedSchemaForSessionLog.days.length > 0 && (
            <FormControl size="small" fullWidth>
              <InputLabel id="session-log-day-label">Trainingsdag</InputLabel>
              <Select
                labelId="session-log-day-label"
                label="Trainingsdag"
                value={dayIndex}
                onChange={(e) => onDayIndexChange(Number(e.target.value))}
              >
                {selectedSchemaForSessionLog.days.map((d, idx) => (
                  <MenuItem key={idx} value={idx}>{d.dayLabel}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
          <TextField
            label="Notitie (optioneel)"
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="Bijv. goede sessie, moe aan het eind"
            multiline
            rows={3}
            size="small"
            fullWidth
          />
          <Box sx={{ display: 'flex', gap: 2, mt: 3, justifyContent: 'flex-end' }}>
            <Button
              variant="text"
              onClick={onClose}
              disableElevation
              sx={{
                color: '#000000',
                borderRadius: '20px',
                textTransform: 'none',
                fontWeight: 500,
                minHeight: 40,
                px: 2,
                '&:hover': { bgcolor: 'rgba(0,0,0,0.04)' },
              }}
            >
              Annuleren
            </Button>
            <Button
              variant="contained"
              onClick={onSave}
              disabled={!schemaId}
              disableElevation
              sx={{
                bgcolor: '#000000',
                color: '#F2E4D3',
                borderRadius: '20px',
                textTransform: 'none',
                fontWeight: 500,
                minHeight: 40,
                px: 2,
                '&:hover': { bgcolor: '#1a1a1a' },
                '&.Mui-disabled': {
                  bgcolor: 'rgba(0,0,0,0.12)',
                  color: 'rgba(29,27,26,0.38)',
                },
              }}
            >
              Opslaan
            </Button>
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
