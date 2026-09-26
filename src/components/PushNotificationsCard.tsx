import { useCallback, useEffect, useState } from 'react';
import { Box, Typography, Switch, FormControlLabel, CircularProgress, Alert } from '@mui/material';
import NotificationsActiveRoundedIcon from '@mui/icons-material/NotificationsActiveRounded';
import { ContentCard } from './layout';
import { useNotify } from '../context/NotifyContext';
import { enablePush, disablePush, isPushEnabled, needsHomeScreenForPush, type PushEnableResult } from '../services/pushService';

/** Uitleg per reden dat aanmelden niet lukte, in gewone taal. */
const PROBLEM_TEXT: Record<Exclude<PushEnableResult, 'ok'>, string> = {
  denied: 'Meldingen zijn geblokkeerd. Zet ze aan in de instellingen van je telefoon of browser en probeer het opnieuw.',
  unsupported: 'Deze browser ondersteunt geen meldingen. Probeer Chrome, Edge of Safari (vanaf het beginscherm).',
  'ios-home-screen':
    'Op een iPhone werken meldingen alleen als de app op je beginscherm staat: tik in Safari op Deel en kies "Zet op beginscherm". Open de app daarna vanaf het beginscherm en zet meldingen hier aan.',
  'not-configured': 'Meldingen zijn voor de webversie nog niet ingesteld door de studio. Probeer het later opnieuw.',
  failed: 'Aanmelden voor meldingen is mislukt. Probeer het later opnieuw; lukt het niet, stuur dan de melding hieronder door aan de studio.',
};

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
  const [problem, setProblem] = useState<Exclude<PushEnableResult, 'ok'> | null>(null);
  const [problemDetail, setProblemDetail] = useState<string | null>(null);
  const homeScreenFirst = needsHomeScreenForPush();

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
      setProblem(null);
      setProblemDetail(null);
      try {
        if (next) {
          const { status, detail } = await enablePush(userId);
          setEnabled(status === 'ok');
          if (status === 'ok') notify?.success('Meldingen staan aan op dit toestel.');
          else {
            setProblem(status);
            setProblemDetail(detail ?? null);
          }
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
        <Typography component="h2" sx={{ fontSize: 14, fontWeight: 500, lineHeight: '20px' }}>
          Meldingen
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Een seintje bij een nieuw schema, de avond voor een les die je hebt geboekt, en voor trainers bij een check-in van een sporter. Geldt voor dit toestel.
      </Typography>

      {loading ? (
        <CircularProgress size={20} />
      ) : (
        <FormControlLabel
          control={<Switch checked={enabled} onChange={(e) => void toggle(e.target.checked)} disabled={busy} />}
          label={enabled ? 'Meldingen staan aan' : 'Meldingen staan uit'}
        />
      )}

      {(problem || (homeScreenFirst && !enabled)) && (
        <Alert severity="info" sx={{ mt: 1 }}>
          {PROBLEM_TEXT[problem ?? 'ios-home-screen']}
          {problemDetail && (
            <Typography component="div" variant="caption" sx={{ mt: 0.75, fontFamily: 'monospace', wordBreak: 'break-word' }}>
              {problemDetail}
            </Typography>
          )}
        </Alert>
      )}
    </ContentCard>
  );
}
