import { useState, useCallback } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  IconButton,
  InputAdornment,
  TextField,
  Typography,
} from '@mui/material';
import MailOutlineRoundedIcon from '@mui/icons-material/MailOutlineRounded';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import VisibilityOffRoundedIcon from '@mui/icons-material/VisibilityOffRounded';
import { useAuth } from '../context/AuthContext';

/** VA-logo als inline SVG, zodat het via `currentColor` de tekstkleur van het thema volgt. */
function VaLogo({ height = 56 }: { height?: number }) {
  return (
    <Box
      component="svg"
      viewBox="0 0 1260.31 837.16"
      role="img"
      aria-label="Van As Personal Training"
      sx={{ height, width: 'auto', color: 'text.primary', display: 'block' }}
    >
      <path
        fill="currentColor"
        d="M1260.31,837.16,887,0H746L445.75,673.28,145.49,0H0L373,836.4l-.34.76H518.84l-.34-.76,85.21-195,423.83,4,87.27,191.81ZM665.08,507.72l151.41-339.5,151.4,339.5Z"
      />
    </Box>
  );
}

export function LoginPage() {
  const auth = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  const emailValid = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!auth) return;
      setLocalError(null);
      setResetMsg(null);
      if (!emailValid(email)) {
        setLocalError('Vul een geldig e-mailadres in.');
        return;
      }
      if (password.length < 6) {
        setLocalError('Wachtwoord moet minstens 6 tekens zijn.');
        return;
      }
      setSubmitting(true);
      auth.clearError();
      try {
        if (isRegister) {
          await auth.register(email.trim(), password, 'sporter', displayName || null);
        } else {
          await auth.login(email.trim(), password);
        }
      } catch {
        // error staat in auth.error
      } finally {
        setSubmitting(false);
      }
    },
    [auth, email, password, displayName, isRegister]
  );

  const handleForgotPassword = useCallback(async () => {
    if (!auth) return;
    setLocalError(null);
    setResetMsg(null);
    auth.clearError();
    if (!emailValid(email)) {
      setLocalError('Vul eerst je e-mailadres in om je wachtwoord te resetten.');
      return;
    }
    try {
      await auth.resetPassword(email.trim());
      setResetMsg('Reset-link verstuurd. Check je e-mail (ook je spam-map).');
    } catch {
      setLocalError('Reset-mail versturen mislukt. Controleer het e-mailadres.');
    }
  }, [auth, email]);

  const handleGoogle = useCallback(async () => {
    if (!auth) return;
    setSubmitting(true);
    auth.clearError();
    try {
      await auth.signInWithGoogle();
    } catch {
      // error in auth.error
    } finally {
      setSubmitting(false);
    }
  }, [auth]);

  if (!auth) return null;

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
          maxWidth: 400,
          borderRadius: 6,
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <CardContent sx={{ p: { xs: 3, sm: 4 }, '&:last-child': { pb: { xs: 3, sm: 4 } } }}>
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
            <VaLogo />
          </Box>
          <Typography variant="h5" component="h1" align="center" sx={{ fontWeight: 600 }}>
            {isRegister ? 'Account aanmaken' : 'Inloggen'}
          </Typography>
          <Typography variant="body2" color="text.secondary" align="center" sx={{ mt: 0.5, mb: 3 }}>
            Van As Personal Training Logs
          </Typography>

          {(auth.error || localError) && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {localError || auth.error}
            </Alert>
          )}
          {resetMsg && (
            <Alert severity="success" sx={{ mb: 2 }}>
              {resetMsg}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {isRegister && (
              <TextField
                id="login-name"
                label="Naam"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoComplete="name"
                placeholder="Voor je profiel"
                fullWidth
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <PersonOutlineRoundedIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }}
              />
            )}
            <TextField
              id="login-email"
              type="email"
              label="E-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="jij@voorbeeld.nl"
              fullWidth
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <MailOutlineRoundedIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
            <TextField
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              label="Wachtwoord"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              fullWidth
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <LockOutlinedIcon fontSize="small" />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label={showPassword ? 'Wachtwoord verbergen' : 'Wachtwoord tonen'}
                      onClick={() => setShowPassword((v) => !v)}
                      edge="end"
                      size="small"
                    >
                      {showPassword ? <VisibilityOffRoundedIcon fontSize="small" /> : <VisibilityRoundedIcon fontSize="small" />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={submitting}
              fullWidth
              sx={{ mt: 0.5, borderRadius: '24px', textTransform: 'none', fontWeight: 600, py: 1.25 }}
            >
              {submitting ? 'Even geduld…' : isRegister ? 'Account aanmaken' : 'Inloggen'}
            </Button>
            {!isRegister && (
              <Button
                type="button"
                variant="text"
                size="small"
                onClick={handleForgotPassword}
                sx={{ alignSelf: 'center', textTransform: 'none' }}
              >
                Wachtwoord vergeten?
              </Button>
            )}
          </Box>

          <Divider sx={{ my: 2.5 }} />

          <Button
            type="button"
            variant="outlined"
            size="large"
            disabled={submitting}
            onClick={handleGoogle}
            fullWidth
            sx={{ borderRadius: '24px', textTransform: 'none', fontWeight: 600, py: 1.25 }}
          >
            Doorgaan met Google
          </Button>

          <Button
            type="button"
            variant="text"
            size="small"
            fullWidth
            sx={{ mt: 1.5, textTransform: 'none' }}
            onClick={() => {
              auth.clearError();
              setIsRegister((v) => !v);
            }}
          >
            {isRegister ? 'Al een account? Inloggen' : 'Geen account? Account aanmaken'}
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
}
