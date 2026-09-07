// Dialoog "Doelgewicht" op de Metingen-pagina. De invoerwaarde en het opslaan blijven in MetingenPage.
import { Dialog, DialogTitle, DialogContent, DialogActions, Typography, Box, TextField, Button } from '@mui/material';
import { PRIMARY_BUTTON_SX } from './styles';

interface WeightGoalDialogProps {
  open: boolean;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onSave: () => Promise<void>;
}

export function WeightGoalDialog({ open, value, onChange, onClose, onSave }: WeightGoalDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pb: 0.5 }}>Doelgewicht</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Vul je streefgewicht in. Laat leeg om geen doel te gebruiken.
        </Typography>
        <Box sx={{ py: 1 }}>
          <TextField
            label="Doelgewicht (kg)"
            type="number"
            size="small"
            fullWidth
            autoFocus
            inputProps={{ step: 0.1, min: 0, inputMode: 'decimal' }}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button variant="text" onClick={onClose} sx={{ textTransform: 'none' }}>
          Annuleren
        </Button>
        <Button variant="contained" onClick={onSave} sx={PRIMARY_BUTTON_SX}>
          Opslaan
        </Button>
      </DialogActions>
    </Dialog>
  );
}
