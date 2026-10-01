/**
 * Beheer → Instellingen: het factuurritme van de studio. De eigenaar kiest of iedereen op hetzelfde
 * ritme gefactureerd wordt (elke 4 weken of elke maand, vanaf een startdatum) of ieder lid op zijn
 * eigen ritme vanaf de dag dat het begint. Op hetzelfde ritme krijgt wie halverwege instapt een
 * eerste factuur en credits op maat (api/_lib/billingCycle.mjs). Andere beheerders zien hoe het staat.
 */
import { useEffect, useState } from 'react';
import { Alert, Box, Button, MenuItem, TextField, Typography } from '@mui/material';
import { ContentCard } from '../layout';
import { useNotify } from '../../context/NotifyContext';
import { getOrg, saveBilling } from '../../services/orgService';
import { cycleAt } from '../../utils/billingCycle';
import { todayIso } from '../../utils/format';
import { canEditRetention } from './AccountRetentionSettings';

type Choice = 'own' | 'fourWeeks' | 'month';

const longDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'long' });

export function BillingCycleSettings({ orgId, myUid }: { orgId: string; myUid: string | null | undefined }) {
  const notify = useNotify();
  const [loaded, setLoaded] = useState(false);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [choice, setChoice] = useState<Choice>('own');
  const [anchorDate, setAnchorDate] = useState(todayIso());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getOrg(orgId).then((org) => {
      if (cancelled || !org) return;
      setOwnerId(org.ownerId);
      setChoice(org.billing?.period ?? 'own');
      setAnchorDate(org.billing?.anchorDate ?? todayIso());
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  // Zelfde regel als bij inactieve accounts: de eigenaar, of een beheerder zolang er geen eigenaar is.
  const canEdit = canEditRetention(ownerId, myUid);
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(anchorDate);
  const next = choice !== 'own' && validDate ? cycleAt({ period: choice, anchorDate }, todayIso()).end : null;

  const save = async () => {
    setBusy(true);
    try {
      await saveBilling(orgId, choice === 'own' ? null : { period: choice, anchorDate });
      notify.success(
        choice === 'own'
          ? 'Ieder lid wordt gefactureerd vanaf de dag dat het begint.'
          : `Iedereen op hetzelfde ritme. Eerstvolgende factuurdatum: ${next ? longDate(next) : anchorDate}.`
      );
    } catch (e) {
      notify.error('Opslaan mislukt. Alleen de eigenaar van de studio mag dit wijzigen.', e);
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return null;

  return (
    <ContentCard>
      <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
        Factuurritme
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Factureer je iedereen op dezelfde dag, dan krijgt wie halverwege instapt een eerste factuur en credits op maat tot de
        eerstvolgende factuurdatum. Daarna loopt het lid gewoon mee. Dit geldt voor abonnementen met dezelfde periode (per 4 weken of
        per maand); een strippenkaart of weekabonnement loopt vanaf de dag dat het lid begint.
      </Typography>
      {!canEdit && (
        <Alert severity="info" sx={{ mb: 1.5 }}>
          Alleen de eigenaar van de studio kan dit wijzigen.
        </Alert>
      )}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1.4fr 1fr' }, gap: 2, maxWidth: 560 }}>
        <TextField select size="small" label="Factureren" value={choice} onChange={(e) => setChoice(e.target.value as Choice)} disabled={!canEdit || busy}>
          <MenuItem value="own">Per lid, vanaf de dag dat het begint</MenuItem>
          <MenuItem value="fourWeeks">Iedereen elke 4 weken</MenuItem>
          <MenuItem value="month">Iedereen elke maand</MenuItem>
        </TextField>
        {choice !== 'own' && (
          <TextField
            size="small"
            type="date"
            label="Vanaf (eerste factuurdatum)"
            value={anchorDate}
            onChange={(e) => setAnchorDate(e.target.value)}
            disabled={!canEdit || busy}
            InputLabelProps={{ shrink: true }}
          />
        )}
      </Box>
      {next && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
          Eerstvolgende factuurdatum: {longDate(next)}. Wie vandaag begint, betaalt tot dan naar rato.
        </Typography>
      )}
      {canEdit && (
        <Box sx={{ mt: 2 }}>
          <Button variant="contained" onClick={() => void save()} disabled={busy || (choice !== 'own' && !validDate)}>
            {busy ? 'Bezig…' : 'Opslaan'}
          </Button>
        </Box>
      )}
    </ContentCard>
  );
}
