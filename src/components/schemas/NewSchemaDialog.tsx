/**
 * Dialoog "Nieuwe workout aanmaken" in de workout-lijst: keuze tussen een vrije workout en een
 * Formule 7-workout die de AI-assistent invult. Het aanmaken zelf gebeurt in SchemasPage.
 */
import { Dialog, DialogTitle, DialogContent, DialogActions, Typography, Stack, Button } from '@mui/material';

interface NewSchemaDialogProps {
  open: boolean;
  onClose: () => void;
  /** Vrije (lege) workout aanmaken en naar de editor gaan. */
  onCreateFree: () => void;
  /** Formule 7-workout met AI-assistent aanmaken en naar de editor gaan. */
  onCreateAi: () => void;
}

export const NewSchemaDialog = ({ open, onClose, onCreateFree, onCreateAi }: NewSchemaDialogProps) => (
  <Dialog
    open={open}
    onClose={onClose}
    maxWidth="sm"
    fullWidth
  >
    <DialogTitle>Nieuwe workout aanmaken</DialogTitle>
    <DialogContent>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Kies hoe je wilt starten. Bij AI stelt de app eerst vragen om alles te vullen.
      </Typography>
      <Stack spacing={1.25}>
        <Button variant="outlined" fullWidth onClick={onCreateFree} sx={{ py: 1.25 }}>
          Vrij
        </Button>
        <Button variant="contained" fullWidth onClick={onCreateAi} sx={{ py: 1.25 }}>
          AI
        </Button>
      </Stack>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose}>Annuleren</Button>
    </DialogActions>
  </Dialog>
);
