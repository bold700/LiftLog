/**
 * Pagina om eigen profielgegevens te beheren (naam, e-mail tonen).
 */
import { useState, useCallback, useEffect } from 'react';
import { Box, Typography, TextField, Button, Alert } from '@mui/material';
import PersonRoundedIcon from '@mui/icons-material/PersonRounded';
import EmailRoundedIcon from '@mui/icons-material/EmailRounded';
import { useProfile } from '../context/ProfileContext';
import { useAuth } from '../context/AuthContext';
import { updateProfile } from '../services/profileService';
import { PageLayout, ContentCard } from './layout';

export function ProfielPage() {
  const profile = useProfile();
  const auth = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const p = profile?.profile;
  const uid = auth?.user?.uid ?? p?.userId;

  useEffect(() => {
    if (p?.displayName != null) setDisplayName(p.displayName);
    else if (p !== undefined) setDisplayName('');
  }, [p?.displayName, p]);

  const handleSave = useCallback(async () => {
    if (!uid || !profile) return;
    setSaving(true);
    setMessage(null);
    try {
      await updateProfile(uid, { displayName: displayName.trim() || null });
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
  }, [uid, profile, displayName]);

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
