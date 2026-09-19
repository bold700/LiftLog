/**
 * De laatste overdracht over deze sporter, bovenin de training.
 *
 * Stond eerst in een grote kaart boven het schema, samen met een lijst van alle oefeningen van de
 * vorige keer. Die lijst is overbodig sinds je per oefening ziet wat er toen is gepakt, dus is de
 * kaart weg — maar de overdracht zelf is juist het stukje dat je wél wil lezen vóórdat je begint.
 */
import { useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import { getCheckinsForUser } from '../services/checkinService';
import { OutlineCard } from './layout';

interface LastHandover {
  text: string;
  date: string;
  dayLabel: string | null;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}

export function LastHandoverNote({ userId }: { userId: string }) {
  const [note, setNote] = useState<LastHandover | null>(null);

  useEffect(() => {
    let cancelled = false;
    setNote(null);
    getCheckinsForUser(userId)
      .then((checkins) => {
        if (cancelled) return;
        // Check-ins komen nieuwste eerst binnen; de eerste met een overdracht is de laatste.
        const latest = checkins.find((c) => c.handover?.trim());
        setNote(latest ? { text: latest.handover!.trim(), date: latest.date, dayLabel: latest.dayLabel } : null);
      })
      // Geen overdracht kunnen laden mag de training niet in de weg zitten.
      .catch((e) => console.error('Laatste overdracht laden mislukt', e));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!note) return null;

  return (
    <OutlineCard sx={{ mb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
        <ForumOutlinedIcon fontSize="small" color="action" />
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Laatste overdracht
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {note.dayLabel ? `${note.dayLabel} · ` : ''}
          {formatDate(note.date)}
        </Typography>
      </Box>
      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
        {note.text}
      </Typography>
    </OutlineCard>
  );
}
