// Blok "Profiel aanvullen" op de Metingen-pagina: de trainer vult geboortedatum/geslacht van de gekozen sporter in
// als die ontbreken (nodig voor het vetpercentage uit huidplooien). Wordt alleen getoond als dat het geval is.
import { useEffect, useState } from 'react';
import { Box, Typography, TextField, MenuItem, Button } from '@mui/material';
import { useProfile } from '../../context/ProfileContext';
import { updateProfile } from '../../services/profileService';
import type { Profile } from '../../types';

interface SporterProfileFixProps {
  /** userId van de gekozen sporter. */
  targetId: string;
  targetProfile: Profile | null;
}

export function SporterProfileFix({ targetId, targetProfile }: SporterProfileFixProps) {
  const profileCtx = useProfile();
  // Trainer vult geboortedatum/geslacht van de gekozen sporter in als die ontbreken (anders wachten op de sporter).
  const [fixBirth, setFixBirth] = useState('');
  const [fixGender, setFixGender] = useState<'man' | 'vrouw' | 'anders' | ''>('');
  const [savingFix, setSavingFix] = useState(false);

  useEffect(() => {
    setFixBirth(targetProfile?.birthDate ?? '');
    setFixGender(targetProfile?.gender ?? '');
  }, [targetProfile?.userId, targetProfile?.birthDate, targetProfile?.gender]);

  const handleFixProfile = async () => {
    if (!targetId) return;
    setSavingFix(true);
    try {
      await updateProfile(targetId, { birthDate: fixBirth || null, gender: fixGender || null });
      await profileCtx?.refreshProfile();
    } catch {
      /* ignore */
    } finally {
      setSavingFix(false);
    }
  };

  return (
    <Box sx={{ mb: 1.5, p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
      <Typography variant="body2" fontWeight={500} sx={{ mb: 0.5 }}>
        Profiel aanvullen
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
        Voor het vetpercentage uit huidplooien zijn geboortedatum en geslacht van {targetProfile?.displayName?.trim() || 'deze sporter'} nodig. Je kunt ze hier direct invullen.
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 1.5 }}>
        <TextField label="Geboortedatum" type="date" size="small" fullWidth value={fixBirth} onChange={(e) => setFixBirth(e.target.value)} InputLabelProps={{ shrink: true }} />
        <TextField select label="Geslacht" size="small" fullWidth value={fixGender || 'none'} onChange={(e) => setFixGender(e.target.value === 'none' ? '' : (e.target.value as typeof fixGender))}>
          <MenuItem value="none">Niet opgegeven</MenuItem>
          <MenuItem value="man">Man</MenuItem>
          <MenuItem value="vrouw">Vrouw</MenuItem>
          <MenuItem value="anders">Anders</MenuItem>
        </TextField>
        <Button
          variant="outlined"
          fullWidth
          sx={{ height: 40, borderRadius: '24px', textTransform: 'none' }}
          onClick={handleFixProfile}
          disabled={savingFix || (!fixBirth && !fixGender)}
        >
          {savingFix ? 'Bezig…' : 'Profiel opslaan'}
        </Button>
      </Box>
    </Box>
  );
}
