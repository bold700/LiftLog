/**
 * Print-vriendelijke variant van de workout-detailweergave: eenvoudige header + tabel per dag.
 * Op het scherm verborgen (display: none); de print-stylesheet toont `.workout-detail-print` en
 * verbergt `.workout-detail-screen`.
 */
import { Box, Typography } from '@mui/material';
import type { Schema } from '../../types';

interface SchemaPrintViewProps {
  schema: Schema;
}

export const SchemaPrintView = ({ schema }: SchemaPrintViewProps) => (
  <Box className="workout-detail-print" sx={{ display: 'none' }}>
    <Typography variant="h5" fontWeight={600} gutterBottom>
      {schema.name}
    </Typography>
    <Typography variant="body2" gutterBottom>
      Periode:{' '}
      {schema.startDate && schema.endDate
        ? `${schema.startDate} t/m ${schema.endDate}`
        : 'geen periode ingesteld'}
    </Typography>
    {schema.clientId && (
      <Typography variant="body2" gutterBottom>
        Cliënt-ID: {schema.clientId}
      </Typography>
    )}
    {schema.days.map((day, dayIndex) => (
      <Box key={dayIndex} sx={{ mt: 3 }}>
        <Typography variant="subtitle1" fontWeight={600} gutterBottom>
          {day.dayLabel}
          {day.notes ? ` · ${day.notes}` : ''}
        </Typography>
        {day.exercises.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Geen oefeningen
          </Typography>
        ) : (
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '0.9rem',
            }}
          >
            <thead>
              <tr>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '4px 0' }}>
                  Oefening
                </th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '4px 0' }}>
                  Sets
                </th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '4px 0' }}>
                  Reps
                </th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '4px 0' }}>
                  Rust (sec)
                </th>
              </tr>
            </thead>
            <tbody>
              {day.exercises.map((ex, idx) => (
                <tr key={idx}>
                  <td style={{ padding: '2px 0', borderBottom: '1px solid #eee' }}>{ex.exerciseName}</td>
                  <td style={{ padding: '2px 0', borderBottom: '1px solid #eee' }}>
                    {ex.setsTarget ?? ''}
                  </td>
                  <td style={{ padding: '2px 0', borderBottom: '1px solid #eee' }}>
                    {ex.repsTarget ?? ''}
                  </td>
                  <td style={{ padding: '2px 0', borderBottom: '1px solid #eee' }}>
                    {ex.restSeconds ?? ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Box>
    ))}
  </Box>
);
