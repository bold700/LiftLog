import { useCallback, useState } from 'react';
import { Box, Card, CardContent, Typography, Button, Alert } from '@mui/material';
import MarkEmailReadRoundedIcon from '@mui/icons-material/MarkEmailReadRounded';
import { useAuth } from '../context/AuthContext';

/** Blokkeert de app tot een e-mail/wachtwoord-account zijn e-mailadres heeft bevestigd. */
export function VerifyEmailScreen() {
  const auth = useAuth();
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const email = auth?.user?.email ?? '';

  const handleReload = useCallback(async () => {
    if (!auth) return;
    setBusy(true);
    setMsg(null);
    try {
      await auth.reloadUser();
      if (!auth.user?.emailVerified) {
        setMsg({ type: 'error', text: 'Nog niet bevestigd. Klik de link in de e-mail en probeer opnieuw.' });
      }
    } finally {
      setBusy(false);
    }
  }, [auth]);

  const handleResend = useCallback(async () => {
    if (!auth) return;
    setBusy(true);
    setMsg(null);
    try {
      await auth.resendVerification();
      setMsg({ type: 'success', text: 'Nieuwe verificatiemail verstuurd. Check ook je spam.' });
    } catch {
      setMsg({ type: 'error', text: 'Versturen mislukt. Probeer het straks opnieuw.' });
    } finally {
      setBusy(false);
    }
  }, [auth]);

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', px: 2, py: 3, bgcolor: '#0d0d0d' }}>
      <Card sx={{ maxWidth: 420, width: '100%', borderRadius: 3, bgcolor: '#1a1a1a', border: '1px solid rgba(242, 228, 211, 0.12)' }}>
        <CardContent sx={{ p: 3, textAlign: 'center' }}>
          <MarkEmailReadRoundedIcon sx={{ fontSize: 48, color: '#F2E4D3', mb: 1 }} />
          <Typography variant="h5" sx={{ fontWeight: 600, color: '#F2E4D3', mb: 1 }}>
            Bevestig je e-mail
          </Typography>
          <Typography variant="body2" sx={{ color: 'rgba(242, 228, 211, 0.7)', mb: 2 }}>
            We hebben een verificatielink gestuurd naar <strong>{email}</strong>. Klik die link om je account te activeren.
          </Typography>

          {msg && (
            <Alert severity={msg.type} sx={{ mb: 2, textAlign: 'left' }} onClose={() => setMsg(null)}>
              {msg.text}
            </Alert>
          )}

          <Button
            fullWidth
            variant="contained"
            disabled={busy}
            onClick={handleReload}
            sx={{ bgcolor: '#F2E4D3', color: '#000', py: 1.25, mb: 1.5, '&:hover': { bgcolor: '#e5d4c0' } }}
          >
            Ik heb mijn e-mail bevestigd
          </Button>
          <Button fullWidth variant="outlined" disabled={busy} onClick={handleResend} sx={{ color: '#F2E4D3', borderColor: 'rgba(242,228,211,0.4)', py: 1.25, mb: 1.5, '&:hover': { borderColor: '#F2E4D3' } }}>
            Verstuur opnieuw
          </Button>
          <Button fullWidth onClick={() => auth?.logout()} sx={{ color: 'rgba(242,228,211,0.7)', py: 1.25 }}>
            Uitloggen
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
}
