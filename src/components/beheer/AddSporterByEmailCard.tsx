/**
 * Een bestaande sporter aan jezelf koppelen op e-mailadres. Voor iemand die zelf een account heeft
 * gemaakt; een nieuw account maak je met "Nieuw account".
 */
import { useCallback, useState } from 'react';
import { Box, Button, TextField, Typography } from '@mui/material';
import EmailRoundedIcon from '@mui/icons-material/EmailRounded';
import PersonAddRoundedIcon from '@mui/icons-material/PersonAddRounded';
import { useProfile } from '../../context/ProfileContext';
import { assignTrainerToSporter, getProfileByEmail } from '../../services/profileService';

interface AddSporterByEmailCardProps {
  /** Wordt aangeroepen na een geslaagde koppeling, zodat de lijst opnieuw laadt. */
  onAdded: () => void | Promise<void>;
  onMessage: (message: { type: 'success' | 'error'; text: string }) => void;
}

export function AddSporterByEmailCard({ onAdded, onMessage }: AddSporterByEmailCardProps) {
  const profile = useProfile();
  const [email, setEmail] = useState('');
  const [adding, setAdding] = useState(false);

  const handleAdd = useCallback(async () => {
    const trainerId = profile?.profile?.userId;
    if (!profile?.isTrainer || !trainerId) return;
    const trimmed = email.trim();
    if (!trimmed) {
      onMessage({ type: 'error', text: 'Vul een e-mailadres in.' });
      return;
    }
    setAdding(true);
    try {
      const sporterProfile = await getProfileByEmail(trimmed);
      if (!sporterProfile) {
        onMessage({ type: 'error', text: 'Geen account gevonden met dit e-mailadres. De sporter moet eerst een account aanmaken.' });
        return;
      }
      if (sporterProfile.role !== 'sporter') {
        onMessage({ type: 'error', text: 'Dit account is een trainer. Je kunt alleen sporters toevoegen.' });
        return;
      }
      if (sporterProfile.trainerId === trainerId) {
        onMessage({ type: 'success', text: 'Deze sporter staat al in je lijst.' });
        return;
      }
      await assignTrainerToSporter(sporterProfile.userId, trainerId);
      await profile.refreshProfile();
      await onAdded();
      setEmail('');
      onMessage({ type: 'success', text: `${sporterProfile.displayName || sporterProfile.email || 'Sporter'} is toegevoegd.` });
    } catch (e) {
      onMessage({ type: 'error', text: e instanceof Error ? e.message : 'Toevoegen mislukt.' });
    } finally {
      setAdding(false);
    }
  }, [profile, email, onAdded, onMessage]);

  return (
    <Box sx={{ mt: 4, pt: 3, borderTop: '1px solid', borderColor: 'divider' }}>
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
        Sporter toevoegen op e-mail
      </Typography>
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <TextField
          label="E-mail sporter"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="sporter@voorbeeld.nl"
          size="small"
          sx={{ minWidth: 260 }}
          InputProps={{ startAdornment: <EmailRoundedIcon sx={{ mr: 1, color: 'action.active' }} fontSize="small" /> }}
        />
        <Button variant="contained" startIcon={<PersonAddRoundedIcon />} onClick={handleAdd} disabled={adding}>
          {adding ? 'Bezig…' : 'Sporter toevoegen'}
        </Button>
      </Box>
    </Box>
  );
}
