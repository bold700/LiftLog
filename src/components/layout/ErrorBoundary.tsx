// Vangt een fout in een pagina op, zodat je een melding met "Herladen" ziet in plaats van een zwart
// scherm. Komt de fout door een nieuwe versie van de app (oude bestanden weg), dan herladen we meteen.
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { isChunkLoadError, reloadForNewVersion } from '../../utils/staleChunk';

interface Props {
  children: ReactNode;
  /** Wisselt deze waarde (bijv. ander tabblad), dan proberen we het opnieuw. */
  resetKey?: unknown;
  /** Hele scherm vullen (buiten de app-schil, waar nog geen thema is). */
  fullPage?: boolean;
}

interface State {
  error: unknown;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('[pagina-fout]', error, info.componentStack);
    if (isChunkLoadError(error)) reloadForNewVersion();
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    const newVersion = isChunkLoadError(this.state.error);
    return (
      <Box
        role="alert"
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          gap: 1.5,
          px: 2,
          py: 6,
          ...(this.props.fullPage ? { minHeight: '100vh', bgcolor: 'background.default', color: 'text.primary' } : {}),
        }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          {newVersion ? 'Er is een nieuwe versie van de app' : 'Er ging iets mis op deze pagina'}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 360 }}>
          {newVersion
            ? 'Herlaad de pagina om verder te gaan met de nieuwste versie.'
            : 'Herlaad de pagina. Gebeurt het vaker, laat het ons dan weten.'}
        </Typography>
        <Button variant="contained" disableElevation onClick={() => window.location.reload()}>
          Herladen
        </Button>
      </Box>
    );
  }
}
