/**
 * Pagina om eigen profielgegevens te beheren (naam, e-mail tonen).
 */
import { useState, useCallback, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Alert,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
} from '@mui/material';
import PersonRoundedIcon from '@mui/icons-material/PersonRounded';
import EmailRoundedIcon from '@mui/icons-material/EmailRounded';
import VisibilityOffRoundedIcon from '@mui/icons-material/VisibilityOffRounded';
import { useProfile } from '../context/ProfileContext';
import { useAuth } from '../context/AuthContext';
import { updateProfile } from '../services/profileService';
import type { LeaderboardVisibility } from '../types';
import { PageLayout, ContentCard } from './layout';

export function ProfielPage() {
  const profile = useProfile();
  const auth = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [leaderboardVisibility, setLeaderboardVisibility] = useState<LeaderboardVisibility>('named');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const p = profile?.profile;
  const uid = auth?.user?.uid ?? p?.userId;

  useEffect(() => {
    if (p?.displayName != null) setDisplayName(p.displayName);
    else if (p !== undefined) setDisplayName('');
    setLeaderboardVisibility(p?.leaderboardVisibility ?? 'named');
  }, [p?.displayName, p?.leaderboardVisibility, p]);

  const handleSave = useCallback(async () => {
    if (!uid || !profile) return;
    setSaving(true);
    setMessage(null);
    try {
      await updateProfile(uid, {
        displayName: displayName.trim() || null,
        leaderboardVisibility,
      });
      await profile.refreshProfile();
      setMessage({ type: 'success', text: 'Profiel opgeslagen.' });
    } catch (e) {
      setMessage({
        type: 'error',
        text: e instanceof Error ? e.message : 'Opslaan mislukt.',
      });
    } finally {
      setSaving(false);
    }
  }, [uid, profile, displayName, leaderboardVisibility]);

  const email = auth?.user?.email ?? p?.email ?? '';

  return (
    <PageLayout>
      <ContentCard>
        <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
          Mijn profiel
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Beheer je gegevens. Je naam wordt gebruikt in de app en in beheeroverzichten.
        </Typography>

        <FormControl component="fieldset" sx={{ mb: 3, width: '100%' }}>
          <FormLabel component="legend" sx={{ fontWeight: 600, color: 'text.primary', mb: 1 }}>
            Ranglijst (privacy)
          </FormLabel>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Standaard tonen we je <strong>profielnaam</strong> op de ranglijst. Van dit apparaat delen we ook de{' '}
            <strong>oefening</strong> met het <strong>zwaarste gelogde gewicht</strong> (7 en 30 dagen). Geen sets of
            reps. Je kunt anoniem gaan of jezelf uitzetten via de opties hieronder.
          </Typography>
          <RadioGroup
            value={leaderboardVisibility}
            onChange={(e) => setLeaderboardVisibility(e.target.value as LeaderboardVisibility)}
          >
            <FormControlLabel
              value="named"
              control={<Radio />}
              label="Met mijn profielnaam op de ranglijst (standaard)"
            />
            <FormControlLabel
              value="anonymous"
              control={<Radio />}
              label="Anoniem op de ranglijst"
            />
            <FormControlLabel
              value="hidden"
              control={<Radio />}
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <VisibilityOffRoundedIcon fontSize="small" color="action" />
                  <span>Niet op de ranglijst</span>
                </Box>
              }
            />
          </RadioGroup>
        </FormControl>

        {message && (
          <Alert severity={message.type} sx={{ mb: 2 }} onClose={() => setMessage(null)}>
            {message.text}
          </Alert>
        )}

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, width: '100%' }}>
          <TextField
            label="Profielnaam"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Bijv. Jan Jansen"
            size="medium"
            fullWidth
            InputProps={{
              startAdornment: <PersonRoundedIcon sx={{ mr: 1, color: 'action.active' }} fontSize="small" />,
            }}
          />
          <TextField
            label="E-mail"
            value={email}
            disabled
            size="medium"
            fullWidth
            helperText="E-mail wijzigen kan via je accountinstellingen bij de aanbieder (Google, etc.)."
            InputProps={{
              startAdornment: <EmailRoundedIcon sx={{ mr: 1, color: 'action.disabled' }} fontSize="small" />,
            }}
          />
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving}
            sx={{ alignSelf: 'flex-start' }}
          >
            {saving ? 'Bezig…' : 'Opslaan'}
          </Button>
        </Box>
      </ContentCard>
    </PageLayout>
  );
}
