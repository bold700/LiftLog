/**
 * Onderhoud: eenmalige acties die niet over mensen gaan. Het lesrooster met groepslessen importeren
 * (trainer) en achtergebleven ranglijstdocumenten opruimen (alleen beheerder). Alles wat met
 * accounts en sporters te maken heeft staat op Beheer.
 */
import { useCallback, useState } from 'react';
import { Alert, Box, Button, Typography } from '@mui/material';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import { useAuth } from '../context/AuthContext';
import { useProfile } from '../context/ProfileContext';
import { cleanupOrphanedLeaderboard } from '../services/adminAccountService';
import { GroepslessenImportCard } from './GroepslessenImportCard';
import { PageLayout, ContentCard } from './layout';

export const OnderhoudPage = () => {
  const profile = useProfile();
  const auth = useAuth();
  const isAdmin = profile?.profile?.role === 'admin';
  const [cleaning, setCleaning] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleCleanupLeaderboard = useCallback(async () => {
    if (!auth?.user || cleaning) return;
    setCleaning(true);
    setMessage(null);
    try {
      const removed = await cleanupOrphanedLeaderboard(auth.user);
      setMessage({
        type: 'success',
        text: removed.length
          ? `${removed.length} achtergebleven ${removed.length === 1 ? 'account' : 'accounts'} van de ranglijst gehaald: ${removed
              .map((r) => r.label)
              .join(', ')}.`
          : 'Er stonden geen verwijderde accounts meer op de ranglijst.',
      });
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Opschonen mislukt.' });
    } finally {
      setCleaning(false);
    }
  }, [auth?.user, cleaning]);

  if (!profile?.isTrainer) {
    return (
      <PageLayout>
        <ContentCard>
          <Typography color="text.secondary">Alleen trainers en beheerders hebben toegang tot Onderhoud.</Typography>
        </ContentCard>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <ContentCard>
        <Typography variant="h5" sx={{ fontWeight: 600, mb: 0.5 }}>
          Onderhoud
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Eenmalige acties. Accounts en sporters beheer je op Beheer.
        </Typography>

        {message && (
          <Alert severity={message.type} sx={{ mb: 2 }} onClose={() => setMessage(null)}>
            {message.text}
          </Alert>
        )}

        <GroepslessenImportCard />

        {isAdmin && (
          <Box sx={{ mt: 4, pt: 3, borderTop: '1px solid', borderColor: 'divider' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
              Ranglijst opschonen
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Haalt accounts die al verwijderd zijn van de ranglijst. Bij nieuwe verwijderingen gebeurt dit voortaan
              automatisch.
            </Typography>
            <Button
              variant="outlined"
              startIcon={<DeleteOutlineRoundedIcon />}
              onClick={handleCleanupLeaderboard}
              disabled={cleaning}
            >
              {cleaning ? 'Bezig…' : 'Ranglijst opschonen'}
            </Button>
          </Box>
        )}
      </ContentCard>
    </PageLayout>
  );
};
