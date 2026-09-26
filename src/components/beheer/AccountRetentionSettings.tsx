/**
 * Beheer → Huisstijl: accounts die lang niet zijn gebruikt automatisch verwijderen.
 *
 * Alleen de eigenaar van de studio mag dit aan- of uitzetten en de termijn kiezen (Firestore-regels);
 * andere beheerders zien hoe het staat. Het werk zelf doet de dagelijkse ronde op de server
 * (api/_lib/accountRetention.mjs): 30 dagen vooraf een waarschuwing, daarna verwijderen.
 */
import { useEffect, useState } from 'react';
import { Alert, Box, Button, FormControlLabel, Switch, TextField, Typography } from '@mui/material';
import { ContentCard } from '../layout';
import { useNotify } from '../../context/NotifyContext';
import { getOrg, RETENTION_MAX_MONTHS, RETENTION_MIN_MONTHS, saveAccountRetention } from '../../services/orgService';

const DEFAULT_MONTHS = 24;

/** Mag deze persoon de instelling wijzigen? De eigenaar; heeft de studio (nog) geen eigenaar, dan elke beheerder. */
export function canEditRetention(ownerId: string | null, myUid: string | null | undefined): boolean {
  return !!myUid && (ownerId == null || ownerId === myUid);
}

export function AccountRetentionSettings({ orgId, myUid }: { orgId: string; myUid: string | null | undefined }) {
  const notify = useNotify();
  const [loaded, setLoaded] = useState(false);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [months, setMonths] = useState(String(DEFAULT_MONTHS));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getOrg(orgId).then((org) => {
      if (cancelled || !org) return;
      setOwnerId(org.ownerId);
      setEnabled(org.accountRetention?.enabled ?? false);
      setMonths(String(org.accountRetention?.months ?? DEFAULT_MONTHS));
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const canEdit = canEditRetention(ownerId, myUid);
  const monthsNum = Number(months);
  const monthsValid = Number.isInteger(monthsNum) && monthsNum >= RETENTION_MIN_MONTHS && monthsNum <= RETENTION_MAX_MONTHS;

  const save = async () => {
    setBusy(true);
    try {
      await saveAccountRetention(orgId, { enabled, months: monthsNum });
      notify.success(enabled ? `Accounts worden na ${monthsNum} maanden zonder inloggen verwijderd.` : 'Automatisch verwijderen staat uit.');
    } catch (e) {
      notify.error('Opslaan mislukt. Alleen de eigenaar van de studio mag dit wijzigen.', e);
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return null;

  return (
    <ContentCard>
      <Typography variant="h5" sx={{ fontWeight: 600, mb: 0.5 }}>
        Inactieve accounts
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Leden die lange tijd niet inloggen, automatisch verwijderen. Zo bewaar je geen gegevens langer dan nodig. Het lid krijgt
        30 dagen van tevoren een melding en kan het account houden door in te loggen. Leden met een lopend abonnement of een
        geboekte les worden nooit verwijderd, en trainers en beheerders ook niet. Facturen en betalingen blijven bewaard.
      </Typography>
      {!canEdit && (
        <Alert severity="info" sx={{ mb: 1.5 }}>
          Alleen de eigenaar van de studio kan dit wijzigen.
        </Alert>
      )}
      <FormControlLabel
        control={<Switch checked={enabled} onChange={(e) => setEnabled(e.target.checked)} disabled={!canEdit || busy} />}
        label="Inactieve accounts automatisch verwijderen"
      />
      {enabled && (
        <Box sx={{ mt: 1.5 }}>
          <TextField
            label="Na hoeveel maanden zonder inloggen"
            size="small"
            value={months}
            onChange={(e) => setMonths(e.target.value.replace(/[^\d]/g, ''))}
            disabled={!canEdit || busy}
            error={!monthsValid}
            helperText={monthsValid ? undefined : `Kies ${RETENTION_MIN_MONTHS} tot ${RETENTION_MAX_MONTHS} maanden.`}
            inputProps={{ inputMode: 'numeric' }}
            sx={{ maxWidth: 260 }}
          />
        </Box>
      )}
      {canEdit && (
        <Box sx={{ mt: 2 }}>
          <Button variant="contained" onClick={() => void save()} disabled={busy || (enabled && !monthsValid)}>
            {busy ? 'Bezig…' : 'Opslaan'}
          </Button>
        </Box>
      )}
    </ContentCard>
  );
}
