// Bevestigingsdialoog "Training log verwijderen" op de Log-pagina (md-* knoppen met directe onClick).
import { Dialog, DialogTitle, DialogContent, DialogActions, Typography } from '@mui/material';

// Import Material Web Components buttons
import '@material/web/button/filled-button.js';
import '@material/web/button/text-button.js';
import '@material/web/icon/icon.js';

interface DeleteSessionDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteSessionDialog({ open, onClose, onConfirm }: DeleteSessionDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
    >
      <DialogTitle>Training log verwijderen</DialogTitle>
      <DialogContent>
        <Typography variant="body1">
          Weet je zeker dat je deze training log wilt verwijderen?
        </Typography>
      </DialogContent>
      <DialogActions>
        <md-text-button onClick={onClose}>
          Annuleren
        </md-text-button>
        <md-filled-button
          onClick={onConfirm}
          style={{ '--md-filled-button-container-color': '#BA1A1A' } as any}
        >
          <md-icon slot="start">delete</md-icon>
          Verwijderen
        </md-filled-button>
      </DialogActions>
    </Dialog>
  );
}
