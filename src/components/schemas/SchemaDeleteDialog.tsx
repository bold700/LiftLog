/**
 * Bevestigingsdialoog "Workout verwijderen" op de detail-weergave van SchemasPage.
 * De knoppen zijn Material Web-elementen (md-*): die krijgen hun click-handlers via refs en
 * addEventListener zodra de dialoog open is (React-onClick werkt niet op deze web components).
 */
import { useEffect, useRef } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Typography } from '@mui/material';
import '@material/web/button/filled-button.js';
import '@material/web/button/text-button.js';
import '@material/web/icon/icon.js';

interface SchemaDeleteDialogProps {
  open: boolean;
  /** Naam van de workout die verwijderd wordt (voor de tekst in de dialoog). */
  schemaName: string;
  onClose: () => void;
  onConfirm: () => void;
}

export const SchemaDeleteDialog = ({ open, schemaName, onClose, onConfirm }: SchemaDeleteDialogProps) => {
  const deleteCancelButtonRef = useRef<any>(null);
  const deleteConfirmButtonRef = useRef<any>(null);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      const cancelBtn = deleteCancelButtonRef.current;
      const confirmBtn = deleteConfirmButtonRef.current;
      if (cancelBtn) {
        const h = () => onClose();
        cancelBtn.addEventListener('click', h);
        (cancelBtn as any)._clickHandler = h;
      }
      if (confirmBtn) {
        const h = () => onConfirm();
        confirmBtn.addEventListener('click', h);
        (confirmBtn as any)._clickHandler = h;
      }
    });
    return () => {
      requestAnimationFrame(() => {
        const cancelBtn = deleteCancelButtonRef.current;
        const confirmBtn = deleteConfirmButtonRef.current;
        if (cancelBtn && (cancelBtn as any)._clickHandler) {
          cancelBtn.removeEventListener('click', (cancelBtn as any)._clickHandler);
          delete (cancelBtn as any)._clickHandler;
        }
        if (confirmBtn && (confirmBtn as any)._clickHandler) {
          confirmBtn.removeEventListener('click', (confirmBtn as any)._clickHandler);
          delete (confirmBtn as any)._clickHandler;
        }
      });
    };
  }, [open, onClose, onConfirm]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Workout verwijderen</DialogTitle>
      <DialogContent>
        <Typography variant="body1">
          Weet je zeker dat je de workout &quot;{schemaName}&quot; wilt verwijderen? Deze actie kan niet ongedaan worden gemaakt.
        </Typography>
      </DialogContent>
      <DialogActions>
        {/* @ts-ignore */}
        <md-text-button ref={deleteCancelButtonRef}>Annuleren</md-text-button>
        {/* @ts-ignore */}
        <md-filled-button
          ref={deleteConfirmButtonRef}
          style={{ '--md-filled-button-container-color': '#BA1A1A' } as any}
        >
          <md-icon slot="start">delete</md-icon>
          Verwijderen
        </md-filled-button>
      </DialogActions>
    </Dialog>
  );
};
