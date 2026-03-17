import { useState, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Alert,
  InputAdornment,
  IconButton,
} from '@mui/material';
import EmailRoundedIcon from '@mui/icons-material/EmailRounded';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded';
import VisibilityOffRoundedIcon from '@mui/icons-material/VisibilityOffRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import { useAuth } from '../context/AuthContext';

export function LoginPage() {
  const auth = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!auth) return;
      setSubmitting(true);
      auth.clearError();
      try {
        if (isRegister) {
          await auth.register(email, password, 'sporter', displayName || null);
        } else {
          await auth.login(email, password);
        }
      } catch {
        // error staat in auth.error
      } finally {
        setSubmitting(false);
      }
    },
    [auth, email, password, displayName, isRegister]
  );

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
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        px: 2,
        py: 3,
        bgcolor: '#0d0d0d',
      }}
    >
      <Card
        sx={{
          maxWidth: 400,
          width: '100%',
          borderRadius: 3,
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          bgcolor: '#1a1a1a',
          border: '1px solid rgba(242, 228, 211, 0.12)',
        }}
      >
        <CardContent
          sx={{
            p: 3,
            '& .MuiTextField-root .MuiOutlinedInput-root': {
              color: '#F2E4D3',
              '& fieldset': { borderColor: 'rgba(242, 228, 211, 0.23)' },
              '&:hover fieldset': { borderColor: 'rgba(242, 228, 211, 0.4)' },
              '&.Mui-focused fieldset': { borderColor: '#F2E4D3' },
            },
            '& .MuiTextField-root .MuiInputLabel-root': { color: 'rgba(242, 228, 211, 0.7)' },
            '& .MuiFormLabel-root.Mui-focused': { color: '#F2E4D3' },
            '& .MuiButton-root:not(.MuiButton-contained)': { color: '#F2E4D3' },
            '& .MuiInputAdornment-root .MuiSvgIcon-root': { color: '#F2E4D3' },
            '& .MuiIconButton-root': { color: '#F2E4D3' },
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
            <Box
              component="img"
              src="/va-logo.svg"
              alt="Van As Personal Training"
              sx={{
                height: 56,
                width: 'auto',
                display: 'block',
                filter: 'brightness(0) saturate(100%) invert(94%) sepia(6%) saturate(800%) hue-rotate(340deg) brightness(98%) contrast(94%)',
              }}
            />
          </Box>
          <Typography variant="h5" fontWeight={600} gutterBottom align="center" sx={{ color: '#F2E4D3' }}>
            {isRegister ? 'Account aanmaken' : 'Inloggen'}
          </Typography>
          <Typography variant="body2" sx={{ mb: 2 }} align="center" color="rgba(242, 228, 211, 0.7)">
            Van As Personal Training Logs
          </Typography>

          {auth.error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={auth.clearError}>
              {auth.error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {isRegister && (
              <TextField
                label="Naam"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                fullWidth
                autoComplete="name"
                placeholder="Voor je profiel"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <PersonOutlineRoundedIcon sx={{ color: '#F2E4D3' }} fontSize="small" />
                    </InputAdornment>
                  ),
                }}
              />
            )}
            <TextField
              label="E-mail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              fullWidth
              autoComplete="email"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <EmailRoundedIcon sx={{ color: '#F2E4D3' }} fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
            <TextField
              label="Wachtwoord"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              fullWidth
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <LockRoundedIcon sx={{ color: '#F2E4D3' }} fontSize="small" />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label={showPassword ? 'Wachtwoord verbergen' : 'Wachtwoord tonen'}
                      onClick={() => setShowPassword((v) => !v)}
                      edge="end"
                      size="small"
                      sx={{ color: '#F2E4D3' }}
                    >
                      {showPassword ? <VisibilityOffRoundedIcon /> : <VisibilityRoundedIcon />}
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
              sx={{
                bgcolor: '#F2E4D3',
                color: '#000',
                py: 1.5,
                '&:hover': { bgcolor: '#e5d4c0', color: '#000' },
              }}
            >
              {submitting ? 'Even geduld…' : isRegister ? 'Account aanmaken' : 'Inloggen'}
            </Button>
          </Box>

          <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: 'rgba(242, 228, 211, 0.12)' }}>
            <Button
              fullWidth
              variant="outlined"
              size="large"
              disabled={submitting}
              onClick={handleGoogle}
              sx={{
                py: 1.25,
                borderColor: 'rgba(242, 228, 211, 0.4)',
                color: '#F2E4D3',
                '&:hover': { borderColor: '#F2E4D3', bgcolor: 'rgba(242, 228, 211, 0.08)' },
              }}
            >
              Doorgaan met Google
            </Button>
          </Box>

          <Button
            fullWidth
            size="small"
            sx={{ mt: 2, color: 'rgba(242, 228, 211, 0.7)' }}
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
