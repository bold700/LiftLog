/**
 * Beheer: wat over de studio gaat, niet over één persoon.
 *
 * Openstaande trainer-aanvragen, de ranglijst opschonen en groepslessen importeren. Accounts
 * horen hier bewust niet: die stonden ook onder Profielen, met twee verschillende editors die
 * elk andere velden konden. Wie een naam wilde wijzigen moest maar net weten waar hij binnenkwam.
 * De regel is nu: gaat het over een persoon, dan Profielen; gaat het over de studio, dan Beheer.
 */
import { useState, useCallback, useEffect } from 'react';
import { Box, Typography, Button, Alert } from '@mui/material';
import GroupRoundedIcon from '@mui/icons-material/GroupRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import { useProfile } from '../context/ProfileContext';
import { useNotify } from '../context/NotifyContext';
import { useAuth } from '../context/AuthContext';
import { cleanupOrphanedLeaderboard } from '../services/adminAccountService';
import { PageLayout, ContentCard } from './layout';
import { getPendingWorkoutRequests, resolveWorkoutRequest, type WorkoutRequest } from '../services/workoutRequestService';
import { GroepslessenImportCard } from './GroepslessenImportCard';

interface BeheerPageProps {
  /** Brengt de gebruiker naar Profielen; daar worden accounts beheerd. */
  onOpenProfielen?: () => void;
}

export function BeheerPage({ onOpenProfielen }: BeheerPageProps) {
  const profile = useProfile();
  const notify = useNotify();
  const auth = useAuth();
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [requests, setRequests] = useState<WorkoutRequest[]>([]);
  const [cleaningLeaderboard, setCleaningLeaderboard] = useState(false);

  useEffect(() => {
    getPendingWorkoutRequests()
      .then(setRequests)
      .catch((err) => notify.error('Workout-aanvragen laden mislukt.', err));
  }, [notify]);

  const handleResolveRequest = useCallback(
    async (id: string) => {
      try {
        await resolveWorkoutRequest(id);
        setRequests((r) => r.filter((x) => x.id !== id));
      } catch (err) {
        notify.error('Aanvraag afhandelen mislukt. Probeer het opnieuw.', err);
      }
    },
    [notify]
  );

  const handleCleanupLeaderboard = useCallback(async () => {
    if (!auth?.user || cleaningLeaderboard) return;
    setCleaningLeaderboard(true);
    setMessage(null);
    try {
      const removed = await cleanupOrphanedLeaderboard(auth.user);
      setMessage({
        type: 'success',
        text:
          removed.length === 0
            ? 'Ranglijst is al schoon: geen verwijderde accounts gevonden.'
            : `${removed.length} verwijderde account(s) van de ranglijst gehaald: ${removed
                .map((r) => r.label || r.uid)
                .join(', ')}.`,
      });
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Opschonen mislukt.' });
    } finally {
      setCleaningLeaderboard(false);
    }
  }, [auth?.user, cleaningLeaderboard]);

  if (!profile?.isTrainer) {
    return (
      <PageLayout>
        <ContentCard>
          <Typography color="text.secondary">Alleen trainers en beheerders hebben toegang tot Beheer.</Typography>
        </ContentCard>
      </PageLayout>
    );
  }

  const isAdmin = profile?.role === 'admin';

  return (
    <PageLayout>
      <ContentCard>
        <Typography variant="h5" sx={{ fontWeight: 600, mb: 0.5 }}>
          Beheer
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Instellingen en taken van de studio. Accounts, rollen en profielgegevens beheer je onder Profielen.
        </Typography>

        {message && (
          <Alert severity={message.type} sx={{ mb: 3 }} onClose={() => setMessage(null)}>
            {message.text}
          </Alert>
        )}

        {requests.length > 0 && (
          <Box sx={{ mb: 3, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'rgba(0,0,0,0.02)' }}>
            <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 0.5 }}>
              Workout-aanvragen ({requests.length})
            </Typography>
            {requests.map((r) => (
              <Box
                key={r.id}
                sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1, py: 1, borderTop: '1px solid', borderColor: 'divider' }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={600}>
                    {r.displayName || r.email || r.userId}
                  </Typography>
                  {r.note && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      {r.note}
                    </Typography>
                  )}
                </Box>
                <Button size="small" onClick={() => handleResolveRequest(r.id)} sx={{ flexShrink: 0 }}>
                  Afgehandeld
                </Button>
              </Box>
            ))}
          </Box>
        )}

        {onOpenProfielen && (
          <Box sx={{ mb: 4 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
              Accounts
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Aanmaken, rol wijzigen, gegevens aanvullen en verwijderen gaat allemaal onder Profielen.
            </Typography>
            <Button variant="outlined" startIcon={<GroupRoundedIcon />} onClick={onOpenProfielen}>
              Naar Profielen
            </Button>
          </Box>
        )}

        {isAdmin && (
          <Box sx={{ mb: 4 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
              Ranglijst opschonen
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Haalt accounts die al verwijderd zijn van de ranglijst. Bij nieuwe verwijderingen gebeurt dit
              voortaan automatisch.
            </Typography>
            <Button
              variant="outlined"
              startIcon={<DeleteOutlineRoundedIcon />}
              onClick={handleCleanupLeaderboard}
              disabled={cleaningLeaderboard}
            >
              {cleaningLeaderboard ? 'Bezig…' : 'Ranglijst opschonen'}
            </Button>
          </Box>
        )}

        <GroepslessenImportCard />
      </ContentCard>
    </PageLayout>
  );
}
