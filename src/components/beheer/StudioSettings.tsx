/**
 * Beheer → Instellingen: hoe de studio werkt, los van hoe hij eruitziet (Huisstijl) en van het geld
 * (Facturatie). Boekingsbeleid, toegang tussen trainers en inactieve accounts opruimen.
 */
import { useEffect, useState } from 'react';
import { Box, Button, CircularProgress, FormControlLabel, Switch, TextField, Typography } from '@mui/material';
import { ContentCard } from '../layout';
import { AccountRetentionSettings } from './AccountRetentionSettings';
import { useProfile } from '../../context/ProfileContext';
import { useNotify } from '../../context/NotifyContext';
import { getOrg, saveOrgBookingPolicy, saveOrgStaffAccess } from '../../services/orgService';

/** Standaard bij een studio die het nog niet heeft ingesteld: zelfde aantal uur als de server. */
const DEFAULT_FREE_CANCEL_HOURS = 12;

export function StudioSettings() {
  const profile = useProfile();
  const notify = useNotify();
  const orgId = profile?.activeOrgId ?? null;

  const [loaded, setLoaded] = useState(false);
  const [freeCancelHours, setFreeCancelHours] = useState(String(DEFAULT_FREE_CANCEL_HOURS));
  const [savedHours, setSavedHours] = useState(String(DEFAULT_FREE_CANCEL_HOURS));
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [staffAccess, setStaffAccess] = useState(false);
  const [savingAccess, setSavingAccess] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    void getOrg(orgId).then((org) => {
      if (cancelled || !org) return;
      const hours = String(org.bookingPolicy?.freeCancelHours ?? DEFAULT_FREE_CANCEL_HOURS);
      setFreeCancelHours(hours);
      setSavedHours(hours);
      setStaffAccess(org.staffFullClientAccess);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  if (!orgId) return null;
  if (!loaded) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  const hoursNum = Number(freeCancelHours);
  const hoursValid = Number.isInteger(hoursNum) && hoursNum >= 0;

  const savePolicy = async () => {
    setSavingPolicy(true);
    try {
      await saveOrgBookingPolicy(orgId, { freeCancelHours: hoursNum });
      setSavedHours(freeCancelHours);
      notify.success(hoursNum === 0 ? 'Afmelden is nu tot de start van de les gratis.' : `Afmelden is nu gratis tot ${hoursNum} uur voor de les.`);
    } catch (e) {
      notify.error('Boekingsbeleid opslaan mislukt.', e);
    } finally {
      setSavingPolicy(false);
    }
  };

  // Een schakelaar werkt meteen (Material 3): geen aparte Opslaan-knop.
  const toggleAccess = async (next: boolean) => {
    setStaffAccess(next);
    setSavingAccess(true);
    try {
      await saveOrgStaffAccess(orgId, next);
      notify.success(next ? 'Trainers kunnen nu elkaars cliënten zien.' : 'Trainers zien nu alleen hun eigen cliënten.');
    } catch (e) {
      setStaffAccess(!next);
      notify.error('Opslaan mislukt.', e);
    } finally {
      setSavingAccess(false);
    }
  };

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr) minmax(0, 1fr)' }, gap: 2, alignItems: 'start', '& .MuiCard-root': { mb: 0 } }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <ContentCard>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
            Boekingsbeleid
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Tot hoeveel uur voor de les kan iemand gratis afmelden? Wie later afmeldt, verliest de credit, behalve binnen
            een uur na het boeken (bedenktijd). Afmelden blijft altijd mogelijk: de wachtlijst krijgt dan een melding en
            heeft een uur voorrang op de vrije plek.
          </Typography>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <TextField
              label="Gratis afmelden tot (uur vooraf)"
              size="small"
              value={freeCancelHours}
              onChange={(e) => setFreeCancelHours(e.target.value)}
              error={!hoursValid}
              helperText={hoursValid ? undefined : 'Vul een heel getal in, 0 of hoger.'}
              inputProps={{ inputMode: 'numeric' }}
              sx={{ width: 240 }}
            />
            <Button variant="contained" disableElevation onClick={() => void savePolicy()} disabled={savingPolicy || !hoursValid || freeCancelHours === savedHours}>
              {savingPolicy ? 'Bezig…' : 'Opslaan'}
            </Button>
          </Box>
        </ContentCard>

        <ContentCard>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
            Toegang tussen trainers
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Uit: een trainer ziet alleen de schema's van de eigen cliënten. Aan: elke trainer in de studio ziet de schema's
            van alle cliënten. Handig als trainers elkaars lessen overnemen.
          </Typography>
          <FormControlLabel
            control={<Switch checked={staffAccess} disabled={savingAccess} onChange={(e) => void toggleAccess(e.target.checked)} />}
            label="Trainers mogen elkaars cliënten zien"
          />
        </ContentCard>
      </Box>

      <AccountRetentionSettings orgId={orgId} myUid={profile?.profile?.userId} />
    </Box>
  );
}
