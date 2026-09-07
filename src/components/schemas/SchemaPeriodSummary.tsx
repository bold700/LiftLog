/**
 * Blok "Periode" op de workout-detailweergave: start t/m einddatum, resterende dagen en het aantal
 * voltooide sessies in die periode. Alleen getoond als de workout een start- én einddatum heeft.
 */
import { Box, Typography } from '@mui/material';
import type { Schema } from '../../types';
import { getCompletedSessionsInPeriod, getDaysRemaining } from '../../utils/schemaProgressUtils';

interface SchemaPeriodSummaryProps {
  schema: Schema;
  /** ISO-datum (yyyy-mm-dd). */
  startDate: string;
  /** ISO-datum (yyyy-mm-dd). */
  endDate: string;
}

export const SchemaPeriodSummary = ({ schema, startDate, endDate }: SchemaPeriodSummaryProps) => (
  <Box
    sx={{
      py: 1.5,
      px: 2,
      mb: 2,
      borderRadius: 2,
      bgcolor: 'rgba(0,0,0,0.04)',
      border: '1px solid rgba(0,0,0,0.08)',
    }}
  >
    <Typography variant="subtitle2" fontWeight={600} gutterBottom>
      Periode
    </Typography>
    <Typography variant="body2" color="text.secondary">
      {new Date(startDate).toLocaleDateString('nl-NL', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })}{' '}
      t/m{' '}
      {new Date(endDate).toLocaleDateString('nl-NL', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })}
    </Typography>
    {(() => {
      const remaining = getDaysRemaining(endDate);
      if (remaining !== null) {
        return (
          <Typography variant="body2" sx={{ mt: 0.5 }} fontWeight={500}>
            Nog {remaining} {remaining === 1 ? 'dag' : 'dagen'} te gaan
          </Typography>
        );
      }
      return null;
    })()}
    {(() => {
      const sessions = getCompletedSessionsInPeriod(schema, startDate, endDate);
      return (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {sessions} {sessions === 1 ? 'sessie' : 'sessies'} voltooid in deze periode
        </Typography>
      );
    })()}
  </Box>
);
