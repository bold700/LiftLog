// Bevestigingsdialoog "Oefening Verwijderen" op de Log-pagina.
// Koppelt de md-* knoppen (annuleren/verwijderen) via refs aan de DOM, zoals voorheen in LogsPage.
import { useEffect, useRef } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Typography } from '@mui/material';

// Import Material Web Components buttons
import '@material/web/button/filled-button.js';
import '@material/web/button/text-button.js';
import '@material/web/icon/icon.js';

interface DeleteExerciseDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function DeleteExerciseDialog({ open, onClose, onConfirm }: DeleteExerciseDialogProps) {
  const deleteCancelButtonRef = useRef<any>(null);
  const deleteConfirmButtonRef = useRef<any>(null);

  // Event listeners voor delete dialog
  useEffect(() => {
    if (!open) return;

    requestAnimationFrame(() => {
      const cancelButton = deleteCancelButtonRef.current;
      const confirmButton = deleteConfirmButtonRef.current;

      if (cancelButton) {
        const cancelClickHandler = () => onClose();
        cancelButton.addEventListener('click', cancelClickHandler);
        (cancelButton as any)._clickHandler = cancelClickHandler;
      }
      if (confirmButton) {
        const confirmClickHandler = async () => {
          await onConfirm();
        };
        confirmButton.addEventListener('click', confirmClickHandler);
        (confirmButton as any)._clickHandler = confirmClickHandler;
      }
    });

    return () => {
      requestAnimationFrame(() => {
        const cancelButton = deleteCancelButtonRef.current;
        const confirmButton = deleteConfirmButtonRef.current;

        if (cancelButton && (cancelButton as any)._clickHandler) {
          cancelButton.removeEventListener('click', (cancelButton as any)._clickHandler);
          delete (cancelButton as any)._clickHandler;
        }
        if (confirmButton && (confirmButton as any)._clickHandler) {
          confirmButton.removeEventListener('click', (confirmButton as any)._clickHandler);
          delete (confirmButton as any)._clickHandler;
        }
      });
    };
  }, [open, onClose, onConfirm]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
    >
      <DialogTitle>Oefening Verwijderen</DialogTitle>
      <DialogContent>
        <Typography variant="body1">
          Weet je zeker dat je deze oefening wilt verwijderen? Deze actie kan niet ongedaan worden gemaakt.
        </Typography>
      </DialogContent>
      <DialogActions>
        {/* @ts-ignore - Material Web Components are web components */}
        <md-text-button ref={deleteCancelButtonRef}>
          Annuleren
        </md-text-button>
        {/* @ts-ignore - Material Web Components are web components */}
        <md-filled-button
          ref={deleteConfirmButtonRef}
          style={{ '--md-filled-button-container-color': '#BA1A1A' } as any}
        >
          {/* @ts-ignore */}
          <md-icon slot="start">delete</md-icon>
          Verwijderen
        </md-filled-button>
      </DialogActions>
    </Dialog>
  );
}
