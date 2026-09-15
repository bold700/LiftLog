/**
 * "Sinds de vorige keer" voor de trainer: per oefening het laatste resultaat van de sporter met het
 * signaal (te licht / goed / te zwaar), de notitie en een voorstel, plus de laatste check-in.
 * Leest de cloud-logs en check-ins van de sporter (Firestore-regels: trainer mag lezen).
 */
import { useEffect, useState } from 'react';
import { Box, Chip, Typography } from '@mui/material';
import type { ExerciseEffort } from '../../types';
import { getLogsForUser } from '../../services/logService';
import { getCheckinsForUser } from '../../services/checkinService';
import { buildSporterFeedback, EFFORT_LABELS, FEELING_LABELS, type SporterFeedback } from '../../utils/trainingFeedback';
import { OutlineCard, LoadingBlock } from '../layout';

interface SporterFeedbackCardProps {
  userId: string;
  sporterName: string;
  schemaId: string;
}

const EFFORT_COLOR: Record<ExerciseEffort, 'default' | 'success' | 'error' | 'warning'> = {
  light: 'warning',
  good: 'success',
  heavy: 'error',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function SporterFeedbackCard({ userId, sporterName, schemaId }: SporterFeedbackCardProps) {
  const [feedback, setFeedback] = useState<SporterFeedback | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setFeedback(null);
    setError(null);

    // Logs en check-ins los van elkaar ophalen. Met Promise.all verdween álles zodra één van de
    // twee faalde — dan zag de trainer geen enkel gewicht meer, ook al stonden de logs er gewoon.
    Promise.allSettled([getLogsForUser(userId), getCheckinsForUser(userId)]).then(([logResult, checkinResult]) => {
      if (cancelled) return;

      const logs = logResult.status === 'fulfilled' ? logResult.value : [];
      const checkins = checkinResult.status === 'fulfilled' ? checkinResult.value : [];

      // Eerst alleen deze workout; als de sporter daar niets voor heeft gelogd, alles van de laatste 60 dagen.
      const forSchema = buildSporterFeedback(logs, checkins, { schemaId });
      setFeedback(forSchema.lastActivity ? forSchema : buildSporterFeedback(logs, checkins));

      const failed = [logResult, checkinResult].filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
      if (failed.length === 0) return;
      for (const f of failed) console.error('Terugkoppeling van de sporter laden mislukt', f.reason);

      // "Geen rechten" betekent hier vrijwel altijd dat de Firestore-regels voor een nieuwe
      // collectie nog niet zijn uitgerold; die gaan niet mee met een app-deploy. Dat is iets
      // anders dan een storing, dus zeg het ook anders.
      const denied = failed.some((f) => {
        const code = f.reason && typeof f.reason === 'object' && 'code' in f.reason ? String((f.reason as { code: unknown }).code) : '';
        return code.includes('permission-denied');
      });
      if (logResult.status === 'rejected' && checkinResult.status === 'rejected') {
        setError(denied ? 'Geen toegang tot de gegevens van deze sporter.' : 'Terugkoppeling laden mislukt.');
      } else if (checkinResult.status === 'rejected') {
        setError(denied ? 'Check-ins zijn niet beschikbaar (regels nog niet uitgerold).' : 'Check-ins laden mislukt.');
      } else {
        setError(denied ? 'Oefeningen zijn niet beschikbaar (geen toegang).' : 'Oefeningen laden mislukt.');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [userId, schemaId]);

  return (
    <OutlineCard sx={{ mb: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
        <Typography variant="subtitle1" fontWeight={600}>
          Sinds de vorige keer · {sporterName}
        </Typography>
        {feedback?.lastActivity && (
          <Typography variant="caption" color="text.secondary">
            laatst {formatDate(feedback.lastActivity)}
          </Typography>
        )}
      </Box>

      {error && (
        <Typography variant="body2" color="error">
          {error}
        </Typography>
      )}
      {!error && !feedback && <LoadingBlock minHeight={80} />}
      {feedback && !feedback.lastActivity && (
        <Typography variant="body2" color="text.secondary">
          Nog niets gelogd. Zodra {sporterName} een training logt of afrondt, zie je hier de gewichten, wat te licht of te
          zwaar was en waar je op moet letten.
        </Typography>
      )}

      {feedback?.checkin && (
        <Box sx={{ mb: 1.5, p: 1.5, borderRadius: 2, bgcolor: 'rgba(0,0,0,0.04)' }}>
          <Typography variant="body2" fontWeight={600}>
            Check-in {feedback.checkin.dayLabel ? `· ${feedback.checkin.dayLabel}` : ''}: {feedback.checkin.feeling}/5{' '}
            <Box component="span" sx={{ fontWeight: 400, color: 'text.secondary' }}>
              ({FEELING_LABELS[feedback.checkin.feeling]}, {formatDate(feedback.checkin.date)})
            </Box>
          </Typography>
          {feedback.checkin.note && (
            <Typography variant="body2" sx={{ mt: 0.5, fontStyle: 'italic' }}>
              “{feedback.checkin.note}”
            </Typography>
          )}
        </Box>
      )}

      {feedback && feedback.exercises.length > 0 && (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {feedback.exercises.map((ex) => {
            const parts: string[] = [];
            if (ex.weight != null && ex.weight > 0) parts.push(`${ex.weight} kg`);
            if (ex.sets != null && ex.reps != null) parts.push(`${ex.sets} × ${ex.reps}`);
            else if (ex.reps != null) parts.push(`${ex.reps} reps`);
            return (
              <Box
                component="li"
                key={ex.exerciseName}
                sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, py: 1, borderTop: '1px solid', borderColor: 'divider' }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
                  <Typography variant="body2" fontWeight={600}>
                    {ex.exerciseName}
                    {parts.length > 0 && (
                      <Box component="span" sx={{ fontWeight: 400, color: 'text.secondary' }}>
                        {' '}
                        · {parts.join(' · ')}
                      </Box>
                    )}
                  </Typography>
                  {ex.effort && <Chip size="small" label={EFFORT_LABELS[ex.effort]} color={EFFORT_COLOR[ex.effort]} variant="outlined" />}
                </Box>
                {ex.notes && (
                  <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
                    “{ex.notes}”
                  </Typography>
                )}
                <Typography variant="caption" color="text.secondary">
                  {formatDate(ex.date)} · Volgende keer: {ex.suggestion}
                </Typography>
              </Box>
            );
          })}
        </Box>
      )}
    </OutlineCard>
  );
}
