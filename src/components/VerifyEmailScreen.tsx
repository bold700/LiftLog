import { useCallback, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Stack, Typography } from '@mui/material';
import MarkEmailReadRoundedIcon from '@mui/icons-material/MarkEmailReadRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
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
    <Box
      sx={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        px: 2,
        py: 3,
        bgcolor: 'background.default',
      }}
    >
      <Card
        elevation={0}
        sx={{
          width: '100%',
          maxWidth: 448,
          borderRadius: 6,
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <CardContent sx={{ p: { xs: 3, sm: 4 }, '&:last-child': { pb: { xs: 3, sm: 4 } }, textAlign: 'center' }}>
          <MarkEmailReadRoundedIcon sx={{ fontSize: 48, mb: 1.5, color: 'text.primary' }} />
          <Typography variant="h5" component="h1" sx={{ fontWeight: 600, mb: 1 }}>
            Bevestig je e-mail
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5, lineHeight: 1.625 }}>
            We hebben een verificatielink gestuurd naar{' '}
            <Box component="strong" sx={{ fontWeight: 600, color: 'text.primary' }}>
              {email}
            </Box>
            . Klik die link om je account te activeren.
          </Typography>

          {msg && (
            <Alert
              severity={msg.type}
              icon={msg.type === 'success' ? <CheckCircleRoundedIcon fontSize="inherit" /> : <ErrorOutlineRoundedIcon fontSize="inherit" />}
              sx={{ mb: 2.5, textAlign: 'left' }}
            >
              {msg.text}
            </Alert>
          )}

          <Stack spacing={1.5}>
            <Button
              variant="contained"
              size="large"
              disabled={busy}
              onClick={handleReload}
              fullWidth
              sx={{ borderRadius: '24px', textTransform: 'none', fontWeight: 600, py: 1.25 }}
            >
              Ik heb mijn e-mail bevestigd
            </Button>
            <Button
              variant="outlined"
              size="large"
              disabled={busy}
              onClick={handleResend}
              fullWidth
              sx={{ borderRadius: '24px', textTransform: 'none', fontWeight: 600, py: 1.25 }}
            >
              Verstuur opnieuw
            </Button>
            <Button
              variant="text"
              size="large"
              onClick={() => auth?.logout()}
              fullWidth
              sx={{ borderRadius: '24px', textTransform: 'none', fontWeight: 600, py: 1.25 }}
            >
              Uitloggen
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
