/**
 * Check-in bij "Training afronden": hoe voelde de training (1–5) en waar moet je trainer op letten.
 * Tien seconden werk voor de sporter; de trainer ziet het bij "Sinds de vorige keer".
 */
import { useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { FEELING_LABELS } from '../utils/trainingFeedback';
import { segmentedToggleItemSx, segmentedToggleSx } from '../theme/segmentedToggle';

export type Feeling = 1 | 2 | 3 | 4 | 5;

interface CheckinDialogProps {
  open: boolean;
  dayLabel: string;
  saving?: boolean;
  onSkip: () => void;
  onSave: (feeling: Feeling, note: string) => void;
}

const FEELINGS: Feeling[] = [1, 2, 3, 4, 5];

export function CheckinDialog({ open, dayLabel, saving, onSkip, onSave }: CheckinDialogProps) {
  const [feeling, setFeeling] = useState<Feeling | null>(null);
  const [note, setNote] = useState('');

  return (
    <Dialog open={open} onClose={onSkip} maxWidth="xs" fullWidth>
      <DialogTitle>Hoe ging {dayLabel}?</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Je trainer ziet dit bij de volgende sessie.
        </Typography>
        <ToggleButtonGroup
          exclusive
          fullWidth
          value={feeling}
          onChange={(_, next: Feeling | null) => setFeeling(next)}
          aria-label="Hoe voelde de training"
          sx={{
            ...segmentedToggleSx,
            mb: 2,
            '& .MuiToggleButtonGroup-grouped': { ...segmentedToggleItemSx, flexDirection: 'column', py: 1, lineHeight: 1.2 },
          }}
        >
          {FEELINGS.map((f) => (
            <ToggleButton key={f} value={f} aria-label={`${f} ${FEELING_LABELS[f]}`}>
              <Box component="span" sx={{ fontWeight: 700, fontSize: 18 }}>
                {f}
              </Box>
              <Box component="span" sx={{ fontSize: 11 }}>
                {FEELING_LABELS[f]}
              </Box>
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <TextField
          label="Waar moet je trainer op letten?"
          placeholder="Bijv. Arnold press was lastig, lunges zonder gewicht gedaan"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          multiline
          rows={3}
          fullWidth
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onSkip} disabled={saving} sx={{ textTransform: 'none', borderRadius: '24px' }}>
          Overslaan
        </Button>
        <Button
          variant="contained"
          disabled={saving || feeling === null}
          onClick={() => feeling !== null && onSave(feeling, note.trim())}
          sx={{ textTransform: 'none', borderRadius: '24px', bgcolor: '#000', color: '#F2E4D3', '&:hover': { bgcolor: '#1a1a1a' } }}
        >
          {saving ? 'Opslaan…' : 'Opslaan'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
