/**
 * Toestemming voor gezondheidsgegevens (AVG artikel 9).
 *
 * Gewicht, lichaamssamenstelling, omtrek, voortgangsfoto's, hartslag en blessures zijn bijzondere
 * persoonsgegevens: daarvoor is uitdrukkelijke toestemming van de sporter zelf nodig. Een sporter
 * die nog niets heeft gekozen (of een oudere versie van de tekst zag) krijgt deze vraag één keer;
 * daarna kan hij het altijd wijzigen in Profiel → Account (zie PrivacyCard).
 *
 * Toestemming is vrijwillig (AVG art. 7 lid 4): wie nee zegt, houdt zijn account en kan boeken en
 * trainen. We zeggen wel eerlijk wat het gevolg is: zonder metingen is goede begeleiding lastig.
 * Geen vooraf aangevinkt vakje (telt niet als toestemming); het is een bewuste keuze met twee knoppen.
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

/** Wat er gebeurt zonder toestemming. Staat overal waar de sporter kiest of de keuze terugziet. */
export const HEALTH_CONSENT_WHY =
  'Zonder toestemming voor gezondheidsgegevens kan je trainer je gewicht, metingen en voortgang niet bijhouden, en is goede begeleiding lastig. Wil je goed begeleid worden? Zet het dan aan.';

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
      <Typography variant="body2" sx={{ fontWeight: 500 }}>
        {HEALTH_CONSENT_WHY}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Lessen boeken, trainen en je voeding bijhouden kan ook zonder. Je kunt dit altijd wijzigen in Profiel → Account. Trek je je toestemming in, dan worden je metingen en voortgangsfoto's
        verwijderd.
      </Typography>
    </Box>
  );
}

/**
 * "Toestemming geven" achteraf: vanaf de privacykaart of vanuit Metingen, voor wie eerder nee zei.
 */
export function GiveHealthConsentDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const profileCtx = useProfile();
  const notify = useNotify();
  const me = profileCtx?.profile ?? null;
  const [busy, setBusy] = useState(false);

  const give = async () => {
    if (!me) return;
    setBusy(true);
    try {
      await recordHealthConsent(me.userId, true);
      await profileCtx?.refreshProfile();
      onClose();
      notify.success('Toestemming gegeven. Je trainer kan je voortgang nu bijhouden.');
    } catch (e) {
      notify.error('Opslaan mislukt. Probeer het opnieuw.', e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => !busy && onClose()} fullWidth maxWidth="xs">
      <DialogTitle>Toestemming voor gezondheidsgegevens</DialogTitle>
      <DialogContent>
        <HealthConsentExplanation />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button color="inherit" disabled={busy} onClick={onClose}>
          Annuleren
        </Button>
        <Button variant="contained" disableElevation disabled={busy} onClick={() => void give()}>
          Ik geef toestemming
        </Button>
      </DialogActions>
    </Dialog>
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
      <DialogTitle id="health-consent-title">Mag je trainer je voortgang bijhouden?</DialogTitle>
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
