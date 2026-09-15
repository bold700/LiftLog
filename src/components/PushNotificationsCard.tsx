import { useCallback, useEffect, useState } from 'react';
import { Box, Typography, Switch, FormControlLabel, CircularProgress, Alert } from '@mui/material';
import NotificationsActiveRoundedIcon from '@mui/icons-material/NotificationsActiveRounded';
import { ContentCard } from './layout';
import { useNotify } from '../context/NotifyContext';
import { enablePush, disablePush, isPushEnabled } from '../services/pushService';

/**
 * Meldingen aan- of uitzetten voor dit toestel.
 *
 * Bewust per toestel en niet per account: iemand wil meldingen op zijn telefoon, niet op de
 * werklaptop waar de app ook openstaat.
 */
export function PushNotificationsCard({ userId }: { userId: string }) {
  const notify = useNotify();
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const on = await isPushEnabled().catch(() => false);
      if (!cancelled) {
        setEnabled(on);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = useCallback(
    async (next: boolean) => {
      setBusy(true);
      setDenied(false);
      try {
        if (next) {
          const ok = await enablePush(userId);
          setEnabled(ok);
          if (ok) notify?.success('Meldingen staan aan op dit toestel.');
          else setDenied(true);
        } else {
          await disablePush(userId);
          setEnabled(false);
          notify?.success('Meldingen staan uit op dit toestel.');
        }
      } catch (e) {
        notify?.error(e instanceof Error ? e.message : 'Meldingen instellen mislukt');
      } finally {
        setBusy(false);
      }
    },
    [userId, notify]
  );

  return (
    <ContentCard>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <NotificationsActiveRoundedIcon fontSize="small" />
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Meldingen
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Een seintje bij een nieuw schema, een bericht van je trainer of een check-in. Geldt voor dit toestel.
      </Typography>

      {loading ? (
        <CircularProgress size={20} />
      ) : (
        <FormControlLabel
          control={<Switch checked={enabled} onChange={(e) => void toggle(e.target.checked)} disabled={busy} />}
          label={enabled ? 'Meldingen staan aan' : 'Meldingen staan uit'}
        />
      )}

      {denied && (
        <Alert severity="info" sx={{ mt: 1 }}>
          Meldingen zijn geblokkeerd of nog niet beschikbaar op dit toestel. Zet ze aan in de instellingen van je
          telefoon of browser en probeer het opnieuw.
        </Alert>
      )}
    </ContentCard>
  );
}
