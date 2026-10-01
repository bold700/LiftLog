/**
 * Beheer: lessen zonder trainer. Komende lessen waarvan de trainer afwezig is (Profiel →
 * Afwezigheid) en die nog geen invaller hebben, met wie vrij is: de vaste invaller bovenaan, en met
 * één klik toewijzen. Wie bezet is staat er met de reden bij. Verdwijnt als er niets open staat.
 */
import { useCallback, useEffect, useState } from 'react';
import { Box, Button, MenuItem, TextField, Typography } from '@mui/material';
import { useNotify } from '../../context/NotifyContext';
import { getAbsenceOverview, setClassTrainer, type OpenClass } from '../../services/absenceService';
import { rescheduleDayLabel } from '../../services/rescheduleService';
import { designTokens } from '../../theme/designTokens';

export function SubstitutesCard() {
  const notify = useNotify();
  const [open, setOpen] = useState<OpenClass[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  /** Per les de gekozen trainer (standaard de eerste die vrij is). */
  const [picked, setPicked] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    getAbsenceOverview().then(
      (r) => setOpen(r.open),
      () => setOpen([])
    );
  }, []);
  useEffect(load, [load]);

  if (open.length === 0) return null;

  const assign = async (c: OpenClass, trainerId: string) => {
    setBusy(c.classId);
    try {
      await setClassTrainer(c.classId, trainerId);
      const name = c.options.find((o) => o.userId === trainerId)?.name ?? 'De invaller';
      notify.success(`${name} geeft ${c.title} op ${rescheduleDayLabel(c.date)} ${c.startTime}. Wie is ingeschreven krijgt een melding.`);
      load();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Toewijzen mislukt.', e);
      load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <Box sx={{ mb: 2, p: 2, borderRadius: `${designTokens.cardRadius}px`, bgcolor: designTokens.cardBackground }}>
      <Typography sx={{ fontSize: 14, fontWeight: 500, mb: 1 }}>
        {open.length === 1 ? '1 les zonder trainer' : `${open.length} lessen zonder trainer`}
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {open.map((c) => {
          const free = c.options.filter((o) => !o.busy);
          const choice = picked[c.classId] ?? free[0]?.userId ?? '';
          return (
            <Box key={c.classId} sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
              <Box sx={{ flex: 1, minWidth: 220 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {c.title}: {rescheduleDayLabel(c.date)} {c.startTime}
                  {c.endTime ? `–${c.endTime}` : ''}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {c.trainerName ?? 'Trainer'} afwezig ({c.absenceLabel}) · {c.bookedCount} ingeschreven
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <TextField
                  select
                  size="small"
                  label="Invaller"
                  value={choice}
                  onChange={(e) => setPicked({ ...picked, [c.classId]: e.target.value })}
                  sx={{ minWidth: 200 }}
                >
                  {c.options.map((o) => (
                    <MenuItem key={o.userId} value={o.userId} disabled={o.busy === 'afwezig'}>
                      {o.name}
                      {o.preferred ? ' · vaste invaller' : ''}
                      {o.busy ? ` · ${o.busy}` : ''}
                    </MenuItem>
                  ))}
                </TextField>
                <Button size="small" variant="contained" disableElevation disabled={!choice || busy === c.classId} onClick={() => void assign(c, choice)}>
                  Toewijzen
                </Button>
              </Box>
            </Box>
          );
        })}
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
        Niemand vrij? Gelast de les af in Lessen; iedereen krijgt dan de credit terug.
      </Typography>
    </Box>
  );
}
