/**
 * Kaart per trainingsdag op de workout-detailweergave: daglabel (+ "Deze week"), notities, laatst
 * getraind, warming-up/cardio, krachtoefeningen met voortgang binnen de periode, cooling-down,
 * stretching en de knop "Training starten". Wat die knop doet, bepaalt SchemasPage (onStart).
 */
import { Card, CardContent, Box, Typography, Button } from '@mui/material';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import type { Schema } from '../../types';
import { getLastSessionDateForDay } from '../../utils/schemaSessionUtils';
import { getExerciseProgressInPeriod } from '../../utils/schemaProgressUtils';
import { formatWarmupSummary, formatCardioSummary, formatCooldownSummary, formatStretchingSummary } from '../../utils/format';
import { ExerciseDbDemo } from '../ExerciseDbDemo';
import { designTokens } from '../../theme/designTokens';

interface SchemaDayCardProps {
  schema: Schema;
  dayIndex: number;
  /** Toont het label "Deze week" achter het daglabel. */
  isCurrentWeek: boolean;
  /** Start de training voor deze dag (of, voor trainers bij een groepsles, de deelnemers-dialoog). */
  onStart: () => void;
}

export const SchemaDayCard = ({ schema, dayIndex, isCurrentWeek, onStart }: SchemaDayCardProps) => {
  const day = schema.days[dayIndex];
  return (
    <Card
      sx={{
        backgroundColor: 'transparent',
        borderRadius: `${designTokens.cardRadius}px`,
        border: `1px solid ${designTokens.cardBorder}`,
        boxShadow: 'none',
      }}
    >
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25 }}>
          <Typography variant="subtitle1" fontWeight={600}>
            {day.dayLabel}
          </Typography>
          {isCurrentWeek && (
            <Box
              component="span"
              sx={{
                px: 1,
                py: 0.25,
                borderRadius: '12px',
                bgcolor: '#000000',
                color: '#F2E4D3',
                fontSize: 12,
                fontWeight: 600,
                lineHeight: 1.4,
              }}
            >
              Deze week
            </Box>
          )}
        </Box>
        {day.notes && (
          <Typography variant="body2" sx={{ mb: 0.5, fontStyle: 'italic' }}>
            {day.notes}
          </Typography>
        )}
        {(() => {
          const last = getLastSessionDateForDay(schema.id, dayIndex);
          return (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
              {last
                ? `Laatst getraind: ${new Date(last).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}`
                : 'Nog niet getraind'}
            </Typography>
          );
        })()}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 0 }}>
          {formatWarmupSummary(day.warmup ?? schema.formule7?.warmup) && (
            <Box sx={{ py: 0.5, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>
                Warming-up
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {formatWarmupSummary(day.warmup ?? schema.formule7?.warmup)}
              </Typography>
            </Box>
          )}
          {formatCardioSummary(day.cardio ?? schema.formule7?.cardio) && (
            <Box sx={{ py: 0.5, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>
                Cardio
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {formatCardioSummary(day.cardio ?? schema.formule7?.cardio)}
              </Typography>
            </Box>
          )}
          {day.exercises.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Geen oefeningen
            </Typography>
          ) : (
            <>
              <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ display: 'block', mb: 0.25 }}>
                Krachtoefeningen
              </Typography>
              {day.exercises.map((ex, exIndex) => {
                const prog =
                  schema.startDate && schema.endDate
                    ? getExerciseProgressInPeriod(
                        schema,
                        ex.exerciseName,
                        schema.startDate,
                        schema.endDate
                      )
                    : null;
                const hasProg =
                  prog &&
                  (prog.firstWeight != null ||
                    prog.lastWeight != null ||
                    prog.targetWeight != null);
                const hasTarget =
                  hasProg &&
                  prog!.targetWeight != null &&
                  prog!.firstWeight != null &&
                  prog!.targetWeight > prog!.firstWeight;
                const hasStartAndLast =
                  hasProg &&
                  prog!.firstWeight != null &&
                  prog!.lastWeight != null;
                const barPercent =
                  hasProg && (hasTarget || (hasStartAndLast && prog!.lastWeight! > prog!.firstWeight!))
                    ? hasTarget
                      ? prog!.lastWeight != null
                        ? Math.min(
                            100,
                            ((prog!.lastWeight - prog!.firstWeight!) /
                              (prog!.targetWeight! - prog!.firstWeight!)) *
                              100
                          )
                        : 0
                      : 100
                    : null;
                return (
                  <Box
                    key={exIndex}
                    sx={{
                      display: 'flex',
                      gap: 1.5,
                      alignItems: 'flex-start',
                      py: 1,
                      borderBottom: exIndex < day.exercises.length - 1 ? '1px solid rgba(0,0,0,0.06)' : 'none',
                    }}
                  >
                    <ExerciseDbDemo exerciseName={ex.exerciseName} variant="thumb" />
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={500}>
                        {ex.exerciseName}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {ex.setsTarget} × {ex.repsTarget} reps
                        {ex.restSeconds != null && ex.restSeconds > 0 && ` · ${ex.restSeconds}s rust`}
                      </Typography>
                      {ex.notes && (
                        <Typography variant="caption" color="text.secondary" fontStyle="italic">
                          {ex.notes}
                        </Typography>
                      )}
                      {hasProg && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
                          <Typography variant="caption" color="text.secondary">
                            {prog!.firstWeight != null ? `${prog!.firstWeight} kg` : '–'} →{' '}
                            {prog!.lastWeight != null ? `${prog!.lastWeight} kg` : '–'}
                            {prog!.targetWeight != null ? ` → ${prog!.targetWeight} kg doel` : ''}
                          </Typography>
                          {barPercent != null && (
                            <Box
                              sx={{
                                height: 5,
                                borderRadius: 1,
                                bgcolor: 'rgba(0,0,0,0.08)',
                                overflow: 'hidden',
                                minWidth: 60,
                                maxWidth: 100,
                              }}
                            >
                              <Box
                                sx={{
                                  height: '100%',
                                  width: `${hasTarget ? barPercent : 100}%`,
                                  bgcolor: 'success.main',
                                  borderRadius: 1,
                                }}
                              />
                            </Box>
                          )}
                        </Box>
                      )}
                    </Box>
                  </Box>
                );
              })}
            </>
          )}
          {formatCooldownSummary(day.cooldown ?? schema.formule7?.cooldown) && (
            <Box sx={{ py: 0.5, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>
                Cooling-down
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {formatCooldownSummary(day.cooldown ?? schema.formule7?.cooldown)}
              </Typography>
            </Box>
          )}
          {formatStretchingSummary(day.stretching ?? schema.formule7?.stretching) && (
            <Box sx={{ py: 0.5 }}>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>
                Stretching
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {formatStretchingSummary(day.stretching ?? schema.formule7?.stretching)}
              </Typography>
            </Box>
          )}
        </Box>
        <Button
          fullWidth
          variant="contained"
          startIcon={<PlayArrowRoundedIcon />}
          onClick={onStart}
          disabled={day.exercises.length === 0}
          aria-label={`Training starten voor ${day.dayLabel}`}
          sx={{
            mt: 2,
            bgcolor: '#000000',
            color: '#F2E4D3',
            borderRadius: '24px',
            py: 1.25,
            textTransform: 'none',
            fontWeight: 600,
            '&:hover': { bgcolor: '#1a1a1a' },
            '&.Mui-disabled': { bgcolor: 'rgba(0,0,0,0.12)', color: 'rgba(29,27,26,0.38)' },
          }}
        >
          Training starten
        </Button>
      </CardContent>
    </Card>
  );
};
