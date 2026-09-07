// Dialoog "Oefening Bewerken" op de Log-pagina: velden voor naam, gewicht, sets, reps en notitie.
// De veldwaarden blijven in LogsPage; dit bestand koppelt alleen de md-* knoppen (annuleren/opslaan) aan de DOM.
import { useEffect, useRef } from 'react';
import { Dialog, DialogTitle, DialogContent, Box, TextField, Autocomplete } from '@mui/material';
import { useExerciseSuggestions } from '../../hooks/useExerciseSuggestions';

// Import Material Web Components buttons
import '@material/web/button/filled-button.js';
import '@material/web/button/text-button.js';
import '@material/web/icon/icon.js';

interface ExerciseEditDialogProps {
  open: boolean;
  isMobile: boolean;
  exerciseName: string;
  weight: string;
  sets: string;
  reps: string;
  notes: string;
  onExerciseNameChange: (value: string) => void;
  onWeightChange: (value: string) => void;
  onSetsChange: (value: string) => void;
  onRepsChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onClose: () => void;
  onSave: () => Promise<void>;
}

export function ExerciseEditDialog({
  open,
  isMobile,
  exerciseName,
  weight,
  sets,
  reps,
  notes,
  onExerciseNameChange,
  onWeightChange,
  onSetsChange,
  onRepsChange,
  onNotesChange,
  onClose,
  onSave,
}: ExerciseEditDialogProps) {
  const exerciseSuggestions = useExerciseSuggestions();
  const editCancelButtonRef = useRef<any>(null);
  const editSaveButtonRef = useRef<any>(null);

  // Event listeners voor edit dialog
  useEffect(() => {
    if (!open) return;

    requestAnimationFrame(() => {
      const cancelButton = editCancelButtonRef.current;
      const saveButton = editSaveButtonRef.current;

      if (saveButton) {
        const isDisabled = !exerciseName.trim() || !weight.trim();
        saveButton.disabled = isDisabled;

        const updateDisabled = () => {
          const isDisabled = !exerciseName.trim() || !weight.trim();
          saveButton.disabled = isDisabled;
        };

        const intervalId = setInterval(updateDisabled, 100);
        (saveButton as any)._intervalId = intervalId;
      }

      if (cancelButton) {
        const cancelClickHandler = () => onClose();
        cancelButton.addEventListener('click', cancelClickHandler);
        (cancelButton as any)._clickHandler = cancelClickHandler;
      }
      if (saveButton) {
        const saveClickHandler = async () => {
          if (!saveButton?.disabled) {
            await onSave();
          }
        };
        saveButton.addEventListener('click', saveClickHandler);
        (saveButton as any)._clickHandler = saveClickHandler;
      }
    });

    return () => {
      requestAnimationFrame(() => {
        const cancelButton = editCancelButtonRef.current;
        const saveButton = editSaveButtonRef.current;

        if (cancelButton && (cancelButton as any)._clickHandler) {
          cancelButton.removeEventListener('click', (cancelButton as any)._clickHandler);
          delete (cancelButton as any)._clickHandler;
        }
        if (saveButton) {
          if ((saveButton as any)._clickHandler) {
            saveButton.removeEventListener('click', (saveButton as any)._clickHandler);
            delete (saveButton as any)._clickHandler;
          }
          if ((saveButton as any)._intervalId) {
            clearInterval((saveButton as any)._intervalId);
            delete (saveButton as any)._intervalId;
          }
        }
      });
    };
  }, [open, exerciseName, weight, onClose, onSave]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      fullScreen={isMobile}
    >
      <DialogTitle>Oefening Bewerken</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <Autocomplete
            freeSolo
            options={exerciseSuggestions}
            value={exerciseName}
            onChange={(_, newValue) => {
              if (typeof newValue === 'string') {
                onExerciseNameChange(newValue);
              } else if (newValue) {
                onExerciseNameChange(newValue);
              }
            }}
            onInputChange={(_, newValue) => onExerciseNameChange(newValue)}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Oefening"
                placeholder="Zoek of kies een oefening..."
                autoFocus
              />
            )}
          />

          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label="Gewicht (kg)"
              type="number"
              value={weight}
              onChange={(e) => onWeightChange(e.target.value)}
              sx={{ flex: 1 }}
              inputProps={{ min: 0, step: 0.5 }}
            />

            <TextField
              label="Sets"
              type="number"
              value={sets}
              onChange={(e) => onSetsChange(e.target.value)}
              sx={{ flex: 1 }}
              inputProps={{ min: 1 }}
            />

            <TextField
              label="Reps"
              type="number"
              value={reps}
              onChange={(e) => onRepsChange(e.target.value)}
              sx={{ flex: 1 }}
              inputProps={{ min: 1 }}
            />
          </Box>

          <TextField
            label="Notitie (optioneel)"
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="Bijv. last van mn schouder, ging goed, was te zwaar"
            multiline
            rows={2}
          />

          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2, pt: 2 }}>
            {/* @ts-ignore - Material Web Components are web components */}
            <md-text-button ref={editCancelButtonRef}>
              Annuleren
            </md-text-button>
            {/* @ts-ignore - Material Web Components are web components */}
            <md-filled-button ref={editSaveButtonRef}>
              {/* @ts-ignore */}
              <md-icon slot="start">save</md-icon>
              Opslaan
            </md-filled-button>
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
