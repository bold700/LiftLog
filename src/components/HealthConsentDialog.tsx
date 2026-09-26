/**
 * Toestemming voor gezondheidsgegevens (AVG artikel 9).
 *
 * Gewicht, lichaamssamenstelling, omtrek, voortgangsfoto's, hartslag en blessures zijn bijzondere
 * persoonsgegevens: daarvoor is uitdrukkelijke toestemming van de sporter zelf nodig. Een sporter
 * die nog niets heeft gekozen (of een oudere versie van de tekst zag) krijgt deze vraag één keer;
 * daarna kan hij het altijd wijzigen in Profiel → Account (zie PrivacyCard).
 */
import { useState } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { useProfile } from '../context/ProfileContext';
import { useNotify } from '../context/NotifyContext';
import { HEALTH_CONSENT_VERSION, recordHealthConsent } from '../services/privacyService';
import type { Profile } from '../types';

/** Moet deze persoon de vraag (nog) krijgen? Alleen sporters; trainers en beheerders vullen dit niet voor zichzelf in. */
export function needsHealthConsentQuestion(profile: Pick<Profile, 'role' | 'healthConsent'> | null | undefined): boolean {
  if (!profile || profile.role !== 'sporter') return false;
  const c = profile.healthConsent;
  return !c || c.version < HEALTH_CONSENT_VERSION;
}

/** Uitleg die zowel in de vraag als op de privacykaart staat. */
export function HealthConsentExplanation() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
      <Typography variant="body2">
        In VORM kun jij of je trainer <strong>gezondheidsgegevens</strong> bijhouden: gewicht, lichaamssamenstelling (zoals uit een
        bodyscan), omtrekmaten, voortgangsfoto's, hartslag en blessures.
      </Typography>
      <Typography variant="body2">
        Die zijn alleen zichtbaar voor jou, je trainer en je studio, en worden gebruikt om je training te begeleiden. We delen ze niet
        met anderen en gebruiken ze niet voor reclame.
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Je kunt dit altijd wijzigen in Profiel → Account. Trek je je toestemming in, dan worden je metingen en voortgangsfoto's
        verwijderd.
      </Typography>
    </Box>
  );
}

export function HealthConsentDialog() {
  const profileCtx = useProfile();
  const notify = useNotify();
  const me = profileCtx?.profile ?? null;
  const [busy, setBusy] = useState(false);
  const [answered, setAnswered] = useState(false);

  if (answered || !needsHealthConsentQuestion(me)) return null;

  const choose = async (given: boolean) => {
    if (!me) return;
    setBusy(true);
    try {
      await recordHealthConsent(me.userId, given);
      setAnswered(true);
      await profileCtx?.refreshProfile();
    } catch (e) {
      notify.error('Opslaan mislukt. Probeer het opnieuw.', e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open fullWidth maxWidth="xs" disableEscapeKeyDown aria-labelledby="health-consent-title">
      <DialogTitle id="health-consent-title">Mogen we je gezondheidsgegevens bewaren?</DialogTitle>
      <DialogContent>
        <HealthConsentExplanation />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Button color="inherit" disabled={busy} onClick={() => void choose(false)}>
          Liever niet
        </Button>
        <Button variant="contained" disableElevation disabled={busy} onClick={() => void choose(true)}>
          Ik geef toestemming
        </Button>
      </DialogActions>
    </Dialog>
  );
}
