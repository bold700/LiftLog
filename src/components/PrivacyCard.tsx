/**
 * Profiel → Account: privacy van de ingelogde gebruiker zelf.
 *
 * - Toestemming voor gezondheidsgegevens geven of intrekken (AVG art. 9). Intrekken verwijdert de
 *   metingen en voortgangsfoto's; zonder toestemming legt VORM geen nieuwe metingen vast.
 * - Account verwijderen. Apple en Google eisen dat dit in de app zelf kan. Facturen, betalingen en
 *   lidmaatschappen blijven bij de studio (fiscale bewaarplicht); de rest gaat weg.
 *
 * Niet bij "Bekijk als": dit gaat altijd over je eigen account, nooit over dat van een ander.
 */
import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
  Typography,
} from '@mui/material';
import DeleteForeverRoundedIcon from '@mui/icons-material/DeleteForeverRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import { apiUrl } from '../utils/apiOrigin';
import { useAuth } from '../context/AuthContext';
import { useProfile } from '../context/ProfileContext';
import { useNotify } from '../context/NotifyContext';
import { downloadOwnData, withdrawHealthConsent } from '../services/privacyService';
import { designTokens } from '../theme/designTokens';
import { GiveHealthConsentDialog, HEALTH_CONSENT_WHY } from './HealthConsentDialog';

const CONFIRM_WORD = 'VERWIJDER';

const cardSx = {
  bgcolor: designTokens.cardBackground,
  borderRadius: `${designTokens.cardRadius}px`,
  px: 3,
  py: 2.5,
} as const;

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function PrivacyCard() {
  const auth = useAuth();
  const profileCtx = useProfile();
  const notify = useNotify();
  const me = profileCtx?.profile ?? null;
  const consent = me?.healthConsent ?? null;

  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [giveOpen, setGiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (!me || !auth?.user) return null;

  const withdraw = async () => {
    if (!auth.user) return;
    setBusy(true);
    try {
      await withdrawHealthConsent(auth.user);
      await profileCtx?.refreshProfile();
      setWithdrawOpen(false);
      notify.success('Toestemming ingetrokken. Je metingen en voortgangsfoto’s zijn verwijderd.');
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Intrekken mislukt.', e);
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    if (!auth.user) return;
    setDownloading(true);
    try {
      await downloadOwnData(auth.user);
    } catch (e) {
      // Delen geannuleerd op de telefoon is geen fout.
      if (e instanceof Error && e.name === 'AbortError') return;
      notify.error(e instanceof Error ? e.message : 'Downloaden mislukt.', e);
    } finally {
      setDownloading(false);
    }
  };

  const removeAccount = async () => {
    setBusy(true);
    setDeleteError(null);
    try {
      await auth.deleteAccount();
      // Na het uitloggen toont de app vanzelf het inlogscherm.
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Account verwijderen mislukt.');
      setBusy(false);
    }
  };

  const status = consent?.given
    ? `Gegeven${consent.at ? ` op ${formatDate(consent.at)}` : ''}`
    : consent
      ? 'Niet gegeven'
      : 'Nog niet gevraagd';

  return (
    <Box sx={cardSx}>
      <Typography component="h2" sx={{ fontSize: 14, fontWeight: 500, lineHeight: '20px', mb: 1 }}>
        Privacy
      </Typography>

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, minHeight: 34 }}>
        <Typography sx={{ fontSize: 14 }}>Gezondheidsgegevens</Typography>
        <Typography sx={{ fontSize: 14, color: 'text.secondary', textAlign: 'right' }}>{status}</Typography>
      </Box>
      {!consent?.given && (
        <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 0.5 }}>{HEALTH_CONSENT_WHY}</Typography>
      )}
      <Box sx={{ mt: 0.5 }}>
        {consent?.given ? (
          <Button size="small" color="inherit" onClick={() => setWithdrawOpen(true)} sx={{ px: 0, textTransform: 'none' }}>
            Toestemming intrekken
          </Button>
        ) : (
          <Button size="small" onClick={() => setGiveOpen(true)} sx={{ px: 0, textTransform: 'none' }}>
            Toestemming geven
          </Button>
        )}
      </Box>

      <Box sx={{ borderTop: '1px solid', borderColor: 'divider', mt: 1.5, pt: 1.5, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.5 }}>
        <Button
          size="small"
          startIcon={<DownloadRoundedIcon />}
          disabled={downloading}
          onClick={() => void download()}
          sx={{ px: 0, textTransform: 'none' }}
        >
          {downloading ? 'Bezig met ophalen…' : 'Download mijn gegevens'}
        </Button>
        <Button
          size="small"
          component="a"
          href={apiUrl('/privacy')}
          target="_blank"
          rel="noopener"
          sx={{ px: 0, textTransform: 'none' }}
        >
          Privacyverklaring
        </Button>
        <Button
          size="small"
          color="error"
          startIcon={<DeleteForeverRoundedIcon />}
          onClick={() => {
            setConfirmText('');
            setDeleteError(null);
            setDeleteOpen(true);
          }}
          sx={{ px: 0, textTransform: 'none' }}
        >
          Account verwijderen
        </Button>
      </Box>

      <GiveHealthConsentDialog open={giveOpen} onClose={() => setGiveOpen(false)} />

      {/* Toestemming intrekken */}
      <Dialog open={withdrawOpen} onClose={() => !busy && setWithdrawOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Toestemming intrekken?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Je metingen (gewicht, lichaamssamenstelling, omtrek), voortgangsfoto's, rusthartslag en blessures worden verwijderd, ook
            bij je trainer. Dit kun je niet ongedaan maken, en je trainer kan je voortgang daarna niet meer bijhouden. Je trainingen, voeding en lessen blijven gewoon staan.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="inherit" disabled={busy} onClick={() => setWithdrawOpen(false)}>
            Annuleren
          </Button>
          <Button color="error" variant="contained" disableElevation disabled={busy} onClick={() => void withdraw()}>
            {busy ? 'Bezig…' : 'Intrekken en verwijderen'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Account verwijderen */}
      <Dialog open={deleteOpen} onClose={() => !busy && setDeleteOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Account verwijderen?</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <DialogContentText>
            Je account en je gegevens worden definitief verwijderd: je profiel, trainingen, voeding, metingen, foto's, berichten en
            je koppelingen. Lessen die je nog had geboekt worden afgemeld; credits vervallen.
          </DialogContentText>
          <DialogContentText>
            Facturen en betalingen blijven bij je studio voor hun administratie, omdat de wet dat vraagt.
          </DialogContentText>
          <TextField
            label={`Typ ${CONFIRM_WORD} om te bevestigen`}
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            size="small"
            autoComplete="off"
            inputProps={{ autoCapitalize: 'characters' }}
            sx={{ mt: 1 }}
          />
          {deleteError && <Alert severity="error">{deleteError}</Alert>}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="inherit" disabled={busy} onClick={() => setDeleteOpen(false)}>
            Annuleren
          </Button>
          <Button
            color="error"
            variant="contained"
            disableElevation
            disabled={busy || confirmText.trim().toUpperCase() !== CONFIRM_WORD}
            onClick={() => void removeAccount()}
          >
            {busy ? 'Bezig…' : 'Definitief verwijderen'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
