/**
 * Openstaande workout-aanvragen van sporters, met een knop om er een af te handelen.
 * Verdwijnt zodra er geen aanvragen meer zijn.
 */
import { useCallback, useEffect, useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { useNotify } from '../../context/NotifyContext';
import { getPendingWorkoutRequests, resolveWorkoutRequest, type WorkoutRequest } from '../../services/workoutRequestService';

export function WorkoutRequestsCard() {
  const notify = useNotify();
  const [requests, setRequests] = useState<WorkoutRequest[]>([]);

  useEffect(() => {
    getPendingWorkoutRequests()
      .then(setRequests)
      .catch((err) => notify.error('Workout-aanvragen laden mislukt.', err));
  }, [notify]);

  const handleResolve = useCallback(
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

  if (requests.length === 0) return null;

  return (
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
          <Button size="small" onClick={() => handleResolve(r.id)} sx={{ flexShrink: 0 }}>
            Afgehandeld
          </Button>
        </Box>
      ))}
    </Box>
  );
}
