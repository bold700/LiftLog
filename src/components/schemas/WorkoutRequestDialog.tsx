/**
 * Dialoog "Workout aanvragen" voor sporters zonder workouts: optionele toelichting invullen en de
 * aanvraag naar de trainer sturen (workoutRequestService). De toelichting en de verzend-status leven
 * hier; SchemasPage onthoudt alleen of de dialoog open is en of er al een aanvraag uitstaat.
 */
import { useCallback, useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Typography, TextField, Button } from '@mui/material';
import type { Profile } from '../../types';
import { createWorkoutRequest } from '../../services/workoutRequestService';

interface WorkoutRequestDialogProps {
  open: boolean;
  /** Profiel van de ingelogde sporter (afzender van de aanvraag). */
  profile: Profile | null;
  onClose: () => void;
  /** Na een geslaagde verzending: SchemasPage markeert "aanvraag verstuurd" en sluit de dialoog. */
  onSent: () => void;
}

export const WorkoutRequestDialog = ({ open, profile, onClose, onSent }: WorkoutRequestDialogProps) => {
  const [requestNote, setRequestNote] = useState('');
  const [requestSending, setRequestSending] = useState(false);

  const handleSendRequest = useCallback(async () => {
    const p = profile;
    if (!p) return;
    setRequestSending(true);
    try {
      await createWorkoutRequest({
        userId: p.userId,
        displayName: p.displayName,
        email: p.email,
        trainerId: p.trainerId ?? null,
        note: requestNote.trim(),
      });
      onSent();
      setRequestNote('');
    } catch {
      /* ignore */
    } finally {
      setRequestSending(false);
    }
  }, [profile, requestNote, onSent]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Workout aanvragen</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Je trainer krijgt je aanvraag te zien. Vertel eventueel wat je wilt trainen of je doel.
        </Typography>
        <TextField
          label="Toelichting (optioneel)"
          value={requestNote}
          onChange={(e) => setRequestNote(e.target.value)}
          fullWidth
          multiline
          minRows={3}
          placeholder="Bijv. focus op kracht bovenlichaam, 3x per week"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Annuleren</Button>
        <Button
          variant="contained"
          onClick={handleSendRequest}
          disabled={requestSending}
          sx={{ bgcolor: '#000', color: '#F2E4D3', '&:hover': { bgcolor: '#1a1a1a' } }}
        >
          {requestSending ? 'Versturen…' : 'Aanvraag versturen'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
