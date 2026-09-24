/**
 * Profiel-kaart: lessen als abonneerbare agenda in Google Agenda, Outlook of Apple Agenda.
 * Twee soorten (zie calendarFeedService.ts): 'sporter' (default) toont de eigen geboekte lessen,
 * 'trainer' toont de lessen die je zelf geeft. De URL bevat een geheime sleutel; hij wordt getoond
 * en op dit apparaat onthouden (niet elders terug te halen — "vernieuwen" maakt een nieuwe URL en
 * maakt de oude van hetzelfde soort ongeldig).
 */
import { useState } from 'react';
import { Alert, Box, Button, Typography } from '@mui/material';
import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import { ContentCard } from './layout';
import { createCalendarFeedUrl, getCachedCalendarFeedUrl, type CalendarFeedKind } from '../services/calendarFeedService';

interface Props {
  userId: string;
  kind?: CalendarFeedKind;
}

const COPY = {
  sporter: {
    title: 'Lessen in je eigen agenda',
    description:
      'Maak een kalenderlink en abonneer je eigen agenda (Google Agenda, Outlook of Apple Agenda) erop. Elke les waar je voor ' +
      'geboekt staat of op de wachtlijst voor staat — personal training, groepsles, small group of kickbox — verschijnt dan ' +
      'automatisch, en blijft bijwerken als er iets verandert.',
    confirmRegenerate: 'Een nieuwe link maken zet de huidige link uit — een agenda die daarop is geabonneerd, stopt met bijwerken. Doorgaan?',
  },
  trainer: {
    title: 'Lessen die ik geef, in mijn agenda',
    description:
      'Maak een kalenderlink en abonneer je eigen agenda erop. Elke les die op jouw naam staat om te geven — personal training, ' +
      'groepsles, small group of kickbox — verschijnt dan automatisch, inclusief aflastingen, en blijft bijwerken.',
    confirmRegenerate: 'Een nieuwe link maken zet de huidige link uit — een agenda die daarop is geabonneerd, stopt met bijwerken. Doorgaan?',
  },
} as const;

export function CalendarFeedCard({ userId, kind = 'sporter' }: Props) {
  const copy = COPY[kind];
  const [url, setUrl] = useState<string | null>(() => getCachedCalendarFeedUrl(kind));
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (url && !window.confirm(copy.confirmRegenerate)) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createCalendarFeedUrl(userId, kind);
      setUrl(created);
      setCopied(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kalenderlink maken mislukt.');
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Kopiëren lukte niet. Selecteer de URL en kopieer hem handmatig.');
    }
  };

  return (
    <ContentCard>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <CalendarMonthRoundedIcon sx={{ color: 'text.secondary' }} />
        <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 600 }}>
          {copy.title}
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {copy.description}
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 1.5 }}>
          {error}
        </Alert>
      )}

      {url && (
        <Box sx={{ mb: 2, p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'action.hover' }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Jouw kalenderlink
          </Typography>
          <Box component="code" sx={{ display: 'block', wordBreak: 'break-all', fontSize: 12, fontFamily: 'monospace' }}>
            {url}
          </Box>
          <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            <Button size="small" variant="outlined" onClick={handleCopy} startIcon={copied ? <CheckRoundedIcon /> : <ContentCopyRoundedIcon />}>
              {copied ? 'Gekopieerd' : 'Kopieer URL'}
            </Button>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            Behandel deze URL als een wachtwoord: wie hem heeft, kan zien welke lessen je hebt geboekt. Hij wordt alleen op dit
            apparaat onthouden.
          </Typography>
        </Box>
      )}

      <Box sx={{ mb: 2, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        <Button size="small" variant="contained" onClick={handleCreate} disabled={busy} startIcon={<CalendarMonthRoundedIcon />}>
          {busy ? 'Bezig…' : url ? 'Nieuwe kalenderlink maken' : 'Kalenderlink maken'}
        </Button>
      </Box>

      <Box component="details" sx={{ fontSize: 14 }}>
        <Box component="summary" sx={{ cursor: 'pointer', fontWeight: 500 }}>
          Zo voeg je het toe
        </Box>
        <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1.5, color: 'text.secondary' }}>
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary' }}>
              Google Agenda
            </Typography>
            <Typography variant="body2">
              Op de website: linksonder bij "Andere agenda's" op + → "Via URL". Plak de kalenderlink en klik op "Agenda
              toevoegen".
            </Typography>
          </Box>
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary' }}>
              Outlook
            </Typography>
            <Typography variant="body2">
              Agenda toevoegen → "Abonneren vanaf internet" (of "From internet"). Plak de kalenderlink en geef de agenda een naam.
            </Typography>
          </Box>
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary' }}>
              Apple Agenda (iPhone/iPad/Mac)
            </Typography>
            <Typography variant="body2">
              Instellingen → Agenda → Accounts → "Voeg account toe" → "Overig" → "Voeg agenda-abonnement toe". Plak de
              kalenderlink.
            </Typography>
          </Box>
          <Typography variant="caption">
            Agenda's werken deze feed ongeveer één keer per uur bij — dat bepaalt de agenda-app zelf, niet VORM.
          </Typography>
        </Box>
      </Box>
    </ContentCard>
  );
}
