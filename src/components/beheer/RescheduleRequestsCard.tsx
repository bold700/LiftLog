/**
 * Beheer: verzoeken van sporters om in te plannen. Een verzet PT-moment (op tijd afgemeld, nieuw
 * moment gekozen) of een vast PT-moment (elke week, binnen het abonnement); de trainer (of een
 * beheerder) keurt goed of wijst af. Goedkeuren zet de les op het
 * rooster en schrijft de sporter in (credit eraf zoals bij boeken). Verdwijnt zonder verzoeken.
 */
import { useCallback, useEffect, useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { useNotify } from '../../context/NotifyContext';
import { useProfile } from '../../context/ProfileContext';
import { answerReschedule, getRescheduleRequests, requestWhen, rescheduleDayLabel as rescheduleDayLabelSafe, type RescheduleRequest } from '../../services/rescheduleService';
import { designTokens } from '../../theme/designTokens';

export function RescheduleRequestsCard({ onChanged }: { onChanged?: () => void }) {
  const notify = useNotify();
  const profileCtx = useProfile();
  const myId = profileCtx?.profile?.userId ?? null;
  const isAdmin = profileCtx?.role === 'admin';
  const [requests, setRequests] = useState<RescheduleRequest[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    getRescheduleRequests().then(
      (list) => setRequests(list.filter((r) => r.status === 'pending')),
      () => setRequests([])
    );
  }, []);
  useEffect(load, [load]);

  const answer = async (r: RescheduleRequest, approve: boolean) => {
    setBusy(r.id);
    try {
      await answerReschedule(r.id, approve);
      notify.success(approve ? `Ingepland: ${requestWhen(r)}.` : 'Afgewezen. De sporter krijgt een melding en kan een ander moment kiezen.');
      load();
      onChanged?.();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Beantwoorden mislukt.', e);
      load();
    } finally {
      setBusy(null);
    }
  };

  if (requests.length === 0) return null;

  return (
    <Box sx={{ mb: 2, p: 2, borderRadius: `${designTokens.cardRadius}px`, bgcolor: designTokens.cardBackground }}>
      <Typography sx={{ fontSize: 14, fontWeight: 500, mb: 1 }}>
        {requests.length === 1 ? '1 verzoek om in te plannen' : `${requests.length} verzoeken om in te plannen`}
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {requests.map((r) => {
          const mayAnswer = r.trainerId === myId || isAdmin;
          return (
            <Box key={r.id} sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
              <Box sx={{ flex: 1, minWidth: 220 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {r.userName || 'Sporter'}: {requestWhen(r)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {r.kind === 'standing'
                    ? `Vast PT-moment${r.startDate ? `, vanaf ${rescheduleDayLabelSafe(r.startDate)}` : ''}`
                    : `${r.title || 'PT-moment'} · verzet, in plaats van ${rescheduleDayLabelSafe(r.fromDate)} ${r.fromStartTime}`}
                  {r.trainerId !== myId && r.trainerName ? ` · trainer ${r.trainerName}` : ''}
                </Typography>
              </Box>
              {mayAnswer && (
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button size="small" disabled={busy === r.id} onClick={() => void answer(r, false)}>
                    Afwijzen
                  </Button>
                  <Button size="small" variant="contained" disableElevation disabled={busy === r.id} onClick={() => void answer(r, true)}>
                    Goedkeuren
                  </Button>
                </Box>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
