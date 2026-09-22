import { useState, useCallback } from 'react';
import {
  Alert,
  Box,
  Button,
  Divider,
  IconButton,
  InputAdornment,
  TextField,
  Typography,
} from '@mui/material';
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

  // Geen sterretje achter het label (Figma); de velden blijven wel verplicht via `required`.
  const fieldSx = { '& .MuiOutlinedInput-root': { borderRadius: '4px', minHeight: 56 }, '& .MuiFormLabel-asterisk': { display: 'none' } } as const;
  const bigButtonSx = { height: 56, borderRadius: '28px', textTransform: 'none', fontWeight: 500, fontSize: 15 } as const;

  return (
    <Box sx={{ minHeight: '100dvh', display: 'flex', bgcolor: 'background.default' }}>
      {/* Desktop (Figma "Sign in"): links een merkpaneel in Primary met logo en slogan. */}
      <Box
        sx={{
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: { md: 440, lg: 580 },
          flexShrink: 0,
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          px: { md: 6, lg: 9 },
          py: 9,
        }}
      >
        <Box sx={{ color: 'primary.contrastText', '& svg': { color: 'inherit' } }}>
          <VaLogo height={40} />
        </Box>
        <Box>
          <Typography component="p" sx={{ fontSize: { md: 36, lg: 44 }, fontWeight: 500, lineHeight: 1.18, letterSpacing: '-0.01em' }}>
            Je training, voeding en voortgang op één plek.
          </Typography>
          <Typography sx={{ mt: 2.5, fontSize: 14, lineHeight: '22px', opacity: 0.85, maxWidth: 440 }}>
            Schema&apos;s, lessen, voeding en lichaamssamenstelling, samen met je trainer.
          </Typography>
        </Box>
      </Box>

      <Box
        sx={{
          flex: 1,
          display: 'flex',
          alignItems: { xs: 'flex-start', md: 'center' },
          justifyContent: 'center',
          px: 3,
          pt: { xs: 'calc(56px + env(safe-area-inset-top, 0px))', md: 4 },
          pb: 4,
        }}
      >
        <Box sx={{ width: '100%', maxWidth: 400 }}>
          {/* Telefoon: logo bovenaan, zoals Figma. */}
          <Box sx={{ display: { xs: 'block', md: 'none' }, mb: 5 }}>
            <VaLogo height={36} />
          </Box>
          <Typography component="h1" sx={{ fontSize: { xs: 32, md: 36 }, fontWeight: 500, lineHeight: 1.2 }}>
            {isRegister ? 'Account aanmaken' : 'Welkom terug'}
          </Typography>
          <Typography sx={{ fontSize: 14, color: 'text.secondary', mt: 1, mb: { xs: 5, md: 5.5 } }}>
            {isRegister ? 'Maak een account aan om je training te loggen.' : 'Log in om je training te loggen en je voortgang te volgen.'}
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
                sx={fieldSx}
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
              sx={fieldSx}
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
              sx={fieldSx}
              InputProps={{
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
            {!isRegister && (
              <Button
                type="button"
                variant="text"
                size="small"
                onClick={handleForgotPassword}
                sx={{ alignSelf: 'flex-end', textTransform: 'none', fontWeight: 500, mt: -0.5 }}
              >
                Wachtwoord vergeten?
              </Button>
            )}
            <Button type="submit" variant="contained" disableElevation disabled={submitting} fullWidth sx={{ ...bigButtonSx, mt: isRegister ? 1 : 1.5 }}>
              {submitting ? 'Even geduld…' : isRegister ? 'Account aanmaken' : 'Inloggen'}
            </Button>
          </Box>

          <Divider sx={{ my: 3, fontSize: 12, color: 'text.secondary' }}>of</Divider>

          <Button type="button" variant="outlined" disabled={submitting} onClick={handleGoogle} fullWidth sx={{ ...bigButtonSx, borderColor: 'divider' }}>
            Doorgaan met Google
          </Button>

          <Button
            type="button"
            variant="text"
            size="small"
            fullWidth
            sx={{ mt: 2, textTransform: 'none' }}
            onClick={() => {
              auth.clearError();
              setIsRegister((v) => !v);
            }}
          >
            {isRegister ? 'Al een account? Inloggen' : 'Geen account? Account aanmaken'}
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
