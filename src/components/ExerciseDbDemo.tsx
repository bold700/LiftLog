import { useEffect, useState, useMemo } from 'react';
import { Box, Typography, Collapse, IconButton, Skeleton } from '@mui/material';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { apiUrl } from '../utils/apiOrigin';

const SESSION_DEMO_PREFIX = 'liftlog:v4:exercise-demo:';

type DemoState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'empty' }
  /** Oude Node-server op 3001 zonder /api/exercise-demo-routes */
  | { status: 'devStaleApiServer' }
  /** 404 zonder JSON: Vite-proxy actief? Of verkeerde URL */
  | { status: 'devViteProxy' }
  | { status: 'ready'; exerciseId: string; displayName: string; gifUrl: string };

function parseReadyPayload(
  data: Record<string, unknown>,
  fallbackName: string
): Extract<DemoState, { status: 'ready' }> | null {
  const exIdRaw = data.exerciseId;
  const exerciseIdOk = typeof exIdRaw === 'string' && exIdRaw.trim() ? exIdRaw.trim() : null;
  if (data.found !== true || !exerciseIdOk) return null;
  const gifUrl =
    typeof data.gifUrl === 'string' &&
    (data.gifUrl.startsWith('https://') || data.gifUrl.startsWith('http://'))
      ? data.gifUrl
      : null;
  if (!gifUrl) return null;
  const displayName = typeof data.displayName === 'string' ? data.displayName : fallbackName;
  return {
    status: 'ready',
    exerciseId: exerciseIdOk,
    gifUrl,
    displayName,
  };
}

export type ExerciseDbDemoVariant = 'aside' | 'collapsible';

interface ExerciseDbDemoProps {
  exerciseName: string;
  /** aside = thumbnail naast tekst (training); collapsible = uitklapbaar onder de tekst */
  variant?: ExerciseDbDemoVariant;
}

export function ExerciseDbDemo({ exerciseName, variant = 'aside' }: ExerciseDbDemoProps) {
  const [state, setState] = useState<DemoState>({ status: 'idle' });
  const [open, setOpen] = useState(false);
  const [gifLoadFailed, setGifLoadFailed] = useState(false);

  const nameKey = exerciseName.trim();

  const demoUrl = useMemo(() => {
    if (!nameKey) return null;
    const p = new URLSearchParams({ name: nameKey });
    return apiUrl(`/api/exercise-demo?${p.toString()}`);
  }, [nameKey]);

  useEffect(() => {
    if (!demoUrl) {
      setState({ status: 'empty' });
      return;
    }

    let cancelled = false;

    try {
      if (typeof sessionStorage !== 'undefined') {
        const raw = sessionStorage.getItem(SESSION_DEMO_PREFIX + nameKey);
        if (raw) {
          const parsed = JSON.parse(raw) as Record<string, unknown>;
          const ready = parseReadyPayload(parsed, nameKey);
          if (ready) {
            setState(ready);
            return;
          }
        }
      }
    } catch {
      // negeer corrupte cache
    }

    setState({ status: 'loading' });

    (async () => {
      try {
        const r = await fetch(demoUrl);
        const data = (await r.json().catch(() => null)) as Record<string, unknown> | null;

        if (cancelled) return;

        if (
          import.meta.env.DEV &&
          r.status === 404 &&
          data &&
          typeof data === 'object' &&
          data.error === 'Not found'
        ) {
          setState({ status: 'devStaleApiServer' });
          return;
        }

        if (import.meta.env.DEV && r.status === 404 && data == null) {
          setState({ status: 'devViteProxy' });
          return;
        }

        if (data && typeof data === 'object') {
          const ready = parseReadyPayload(data, nameKey);
          if (ready) {
            try {
              if (typeof sessionStorage !== 'undefined') {
                sessionStorage.setItem(SESSION_DEMO_PREFIX + nameKey, JSON.stringify(data));
              }
            } catch {
              // quota of private mode
            }
            setState(ready);
            return;
          }
        }

        setState({ status: 'empty' });
      } catch {
        if (!cancelled) setState({ status: 'empty' });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [demoUrl, nameKey]);

  useEffect(() => {
    setGifLoadFailed(false);
  }, [demoUrl]);

  if (state.status === 'devStaleApiServer') {
    if (!import.meta.env.DEV) return null;
    return (
      <Box
        sx={{
          flexShrink: 0,
          maxWidth: { xs: '100%', sm: 220 },
          alignSelf: { xs: 'center', sm: 'flex-start' },
          p: 1,
          borderRadius: 1,
          bgcolor: 'warning.light',
          opacity: 0.95,
        }}
      >
        <Typography variant="caption" component="div" color="warning.contrastText" sx={{ fontWeight: 600 }}>
          Oude API-server
        </Typography>
        <Typography variant="caption" component="div" color="warning.contrastText" sx={{ mt: 0.5, display: 'block' }}>
          Stop Node op poort 3001 en start opnieuw in de LiftLog-map:{' '}
          <strong>node scripts/local-api-server.mjs</strong>
        </Typography>
      </Box>
    );
  }

  if (state.status === 'devViteProxy') {
    if (!import.meta.env.DEV) return null;
    return (
      <Box
        sx={{
          flexShrink: 0,
          maxWidth: { xs: '100%', sm: 240 },
          alignSelf: { xs: 'center', sm: 'flex-start' },
          p: 1,
          borderRadius: 1,
          bgcolor: 'warning.light',
          opacity: 0.95,
        }}
      >
        <Typography variant="caption" component="div" color="warning.contrastText" sx={{ fontWeight: 600 }}>
          /api niet bereikbaar
        </Typography>
        <Typography variant="caption" component="div" color="warning.contrastText" sx={{ mt: 0.5, display: 'block' }}>
          Stop Vite (Ctrl+C), ga naar de LiftLog-map en start opnieuw <strong>npm run dev</strong>. Laat{' '}
          <strong>node scripts/local-api-server.mjs</strong> op 3001 draaien.
        </Typography>
      </Box>
    );
  }

  if (state.status === 'idle' || state.status === 'empty') {
    return null;
  }

  if (state.status === 'loading') {
    if (variant === 'aside') {
      return (
        <Box
          sx={{
            flexShrink: 0,
            width: { xs: '100%', sm: 132 },
            maxWidth: { xs: 160, sm: 132 },
            alignSelf: { xs: 'center', sm: 'flex-start' },
          }}
        >
          <Skeleton variant="rounded" height={120} sx={{ borderRadius: 1 }} />
        </Box>
      );
    }
    return (
      <Box sx={{ mt: 1.5 }}>
        <Skeleton variant="rounded" height={120} sx={{ borderRadius: 1 }} />
      </Box>
    );
  }

  if (gifLoadFailed) {
    return null;
  }

  const mediaBlock = (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'center' }}>
      <Box
        component="img"
        src={state.gifUrl}
        alt={`Animatie: ${state.displayName}`}
        loading="lazy"
        onError={() => setGifLoadFailed(true)}
        sx={{
          width: '100%',
          maxWidth: variant === 'aside' ? 140 : 360,
          maxHeight: variant === 'aside' ? 120 : 'none',
          height: 'auto',
          objectFit: 'contain',
          borderRadius: 1,
          border: '1px solid',
          borderColor: 'divider',
          display: 'block',
        }}
      />
    </Box>
  );

  if (variant === 'aside') {
    return (
      <Box
        sx={{
          flexShrink: 0,
          width: { xs: '100%', sm: 'auto' },
          minWidth: { sm: 120 },
          maxWidth: { xs: 200, sm: 200 },
          alignSelf: { xs: 'center', sm: 'flex-start' },
          pt: { xs: 0, sm: 0.25 },
        }}
      >
        <Typography
          variant="caption"
          color="text.secondary"
          fontWeight={600}
          sx={{ display: 'block', textAlign: { xs: 'center', sm: 'left' }, mb: 0.75 }}
        >
          Uitvoering
        </Typography>
        {mediaBlock}
      </Box>
    );
  }

  return (
    <Box sx={{ mt: 1.5 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          color: 'text.secondary',
        }}
      >
        <PlayCircleOutlineIcon sx={{ fontSize: 18 }} />
        <Typography variant="caption" fontWeight={600}>
          Uitvoering
        </Typography>
        <IconButton
          size="small"
          aria-expanded={open}
          aria-label={open ? 'Demo verbergen' : 'Demo tonen'}
          onClick={() => setOpen((v) => !v)}
          sx={{ ml: -0.5, p: 0.25 }}
        >
          {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </IconButton>
      </Box>
      <Collapse in={open}>
        <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1.5 }}>{mediaBlock}</Box>
      </Collapse>
    </Box>
  );
}
