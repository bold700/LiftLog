/**
 * Deelnemersoverzicht bij een groepsles: wie er zijn, welke bijzonderheden ze hebben en met welk
 * gewicht ze deze oefeningen de vorige keer deden. Zo hoeft de trainer tijdens de les niet te
 * zoeken en ziet hij meteen wie een oefening moet aanpassen.
 */
import { Box, Chip, Typography } from '@mui/material';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import type { ExerciseLog, Profile, SchemaExercise } from '../../types';
import { checkExerciseAgainstLimitations, describeLimitation } from '../../utils/exerciseLimitations';
import { OutlineCard } from '../layout';

interface AttendanceOverviewProps {
  participants: Profile[];
  exercises: SchemaExercise[];
  /** Laatste log per `${userId}|${oefeningnaam}` van vóór deze les. */
  previous: Record<string, ExerciseLog | null>;
  rowKey: (userId: string, exerciseName: string) => string;
  shortName: (p: Profile) => string;
}

export function AttendanceOverview({ participants, exercises, previous, rowKey, shortName }: AttendanceOverviewProps) {
  if (participants.length === 0) return null;

  return (
    <OutlineCard sx={{ mb: 2 }}>
      <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 0.5 }}>
        Deelnemers ({participants.length})
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
        Bijzonderheden en de gewichten van de vorige keer. Bijzonderheden pas je aan op Profielen.
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {participants.map((p) => {
          const limitations = p.limitations ?? [];
          // Oefeningen van vandaag die botsen met een bijzonderheid van deze sporter.
          const conflicts = exercises
            .map((ex) => ({ ex, check: checkExerciseAgainstLimitations(ex.exerciseName, limitations) }))
            .filter((x) => x.check.level !== 'ok');
          const lastWeights = exercises
            .map((ex) => ({ name: ex.exerciseName, log: previous[rowKey(p.userId, ex.exerciseName)] ?? null }))
            .filter((x) => x.log?.weight != null);

          return (
            <Box key={p.userId} sx={{ pt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography variant="body2" fontWeight={600}>
                  {shortName(p)}
                </Typography>
                {limitations.map((l) => (
                  <Chip
                    key={l.id}
                    size="small"
                    variant="outlined"
                    color={l.severity === 'vermijden' ? 'error' : 'warning'}
                    label={describeLimitation(l)}
                  />
                ))}
              </Box>

              {conflicts.length > 0 && (
                <Box sx={{ mt: 0.75, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  {conflicts.map(({ ex, check }) => (
                    <Box key={ex.exerciseName} sx={{ display: 'flex', gap: 0.75, alignItems: 'flex-start' }}>
                      <WarningAmberRoundedIcon
                        fontSize="small"
                        sx={{ color: check.level === 'vermijden' ? 'error.main' : 'warning.main', mt: '2px' }}
                      />
                      <Typography variant="caption" sx={{ color: 'text.primary' }}>
                        <strong>{ex.exerciseName}</strong> {check.level === 'vermijden' ? 'liever niet' : 'let op'}
                        {check.hits.map((h) => (
                          <Box component="span" key={h.id} sx={{ display: 'block' }}>
                            {describeLimitation(h)}
                            {h.alternative ? ` → ${h.alternative}` : ''}
                          </Box>
                        ))}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )}

              {lastWeights.length > 0 ? (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                  Vorige keer:{' '}
                  {lastWeights
                    .map((x) => `${x.name} ${x.log?.weight} kg${x.log?.reps != null ? ` × ${x.log.reps}` : ''}`)
                    .join(' · ')}
                </Typography>
              ) : (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                  Nog geen gewichten van deze oefeningen.
                </Typography>
              )}
            </Box>
          );
        })}
      </Box>
    </OutlineCard>
  );
}
