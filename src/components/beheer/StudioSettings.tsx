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
import {
  getOrg,
  saveOrgBookingPolicy,
  saveOrgShowTrainerNames,
  saveOrgStaffAccess,
  saveOrgStudioCancelRefund,
} from '../../services/orgService';

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
  const [showNames, setShowNames] = useState(false);
  const [studioRefund, setStudioRefund] = useState(false);
  const [savingRefund, setSavingRefund] = useState(false);
  const [savingNames, setSavingNames] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    void getOrg(orgId).then((org) => {
      if (cancelled || !org) return;
      const hours = String(org.bookingPolicy?.freeCancelHours ?? DEFAULT_FREE_CANCEL_HOURS);
      setFreeCancelHours(hours);
      setSavedHours(hours);
      setStaffAccess(org.staffFullClientAccess);
      setShowNames(org.showTrainerNames);
      setStudioRefund(org.studioCancelRefund);
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

  const toggleRefund = async (next: boolean) => {
    setStudioRefund(next);
    setSavingRefund(true);
    try {
      await saveOrgStudioCancelRefund(orgId, next);
      notify.success(
        next
          ? 'Meldt de studio iemand af, dan krijgt die altijd de credit terug.'
          : 'Meldt de studio iemand te laat af, dan vervalt de credit, net als bij zelf afmelden.'
      );
    } catch (e) {
      setStudioRefund(!next);
      notify.error('Opslaan mislukt.', e);
    } finally {
      setSavingRefund(false);
    }
  };

  const toggleNames = async (next: boolean) => {
    setShowNames(next);
    setSavingNames(true);
    try {
      await saveOrgShowTrainerNames(orgId, next);
      notify.success(next ? 'Sporters zien nu de naam van de trainer.' : 'Sporters zien de naam van de trainer niet meer.');
    } catch (e) {
      setShowNames(!next);
      notify.error('Opslaan mislukt.', e);
    } finally {
      setSavingNames(false);
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
            een uur na het boeken (bedenktijd). Afmelden blijft altijd mogelijk: de eerste op de wachtlijst schuift dan
            meteen door en heeft een uur om gratis af te melden. Heeft die geen credits, dan houden we de plek een uur
            vast en krijg je een melding, zodat je zelf kunt beslissen.
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
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2.5, mb: 0.5 }}>
            Meldt een trainer iemand af (via Deelnemers → Verwijderen)? Uit: dezelfde regel als hierboven, dus binnen de
            termijn vervalt de credit. Aan: de sporter krijgt de credit altijd terug. Een hele les afgelasten geeft altijd
            alle credits terug.
          </Typography>
          <FormControlLabel
            control={<Switch checked={studioRefund} disabled={savingRefund} onChange={(e) => void toggleRefund(e.target.checked)} />}
            label="Credit terug als de studio iemand afmeldt"
          />
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

        <ContentCard>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
            Naam van de trainer
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Aan: sporters zien bij de lessen en bij hun PT-moment wie de trainer is. Uit: sporters zien geen trainersnaam.
            Trainers en beheerders zien de naam altijd.
          </Typography>
          <FormControlLabel
            control={<Switch checked={showNames} disabled={savingNames} onChange={(e) => void toggleNames(e.target.checked)} />}
            label="Naam van de trainer tonen aan sporters"
          />
        </ContentCard>
      </Box>

      <AccountRetentionSettings orgId={orgId} myUid={profile?.profile?.userId} />
    </Box>
  );
}
