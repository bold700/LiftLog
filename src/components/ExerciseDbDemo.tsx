import { useEffect, useState, useMemo } from 'react';
import { Box, Typography, Collapse, IconButton, Skeleton } from '@mui/material';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { apiUrl } from '../utils/apiOrigin';

type DemoState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'off' }
  | { status: 'empty' }
  /** Oude Node-server op 3001 zonder /api/exercise-demo-routes */
  | { status: 'devStaleApiServer' }
  /** 404 zonder JSON: Vite-proxy actief? Of verkeerde URL */
  | { status: 'devViteProxy' }
  | { status: 'ready'; exerciseId: string; videoUrl: string | null; displayName: string };

export type ExerciseDbDemoVariant = 'aside' | 'collapsible';

interface ExerciseDbDemoProps {
  exerciseName: string;
  /** aside = thumbnail naast tekst (training); collapsible = uitklapbaar onder de tekst */
  variant?: ExerciseDbDemoVariant;
}

export function ExerciseDbDemo({ exerciseName, variant = 'aside' }: ExerciseDbDemoProps) {
  const [state, setState] = useState<DemoState>({ status: 'idle' });
  const [open, setOpen] = useState(false);

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
    setState({ status: 'loading' });

    (async () => {
      try {
        const r = await fetch(demoUrl);
        const data = (await r.json().catch(() => null)) as Record<string, unknown> | null;

        if (cancelled) return;

        if (r.status === 503 && data && data.configured === false) {
          setState({ status: 'off' });
          return;
        }

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

        const exIdRaw = data && typeof data === 'object' ? data.exerciseId : null;
        const exerciseIdOk = typeof exIdRaw === 'string' && exIdRaw.trim() ? exIdRaw.trim() : null;

        if (data && data.found === true && exerciseIdOk) {
          const videoUrl =
            typeof data.videoUrl === 'string' &&
            (data.videoUrl.startsWith('https://') || data.videoUrl.startsWith('http://'))
              ? data.videoUrl
              : null;
          const displayName = typeof data.displayName === 'string' ? data.displayName : nameKey;

          setState({
            status: 'ready',
            exerciseId: exerciseIdOk,
            videoUrl,
            displayName,
          });
          return;
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

  if (state.status === 'off' || state.status === 'idle' || state.status === 'empty') {
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

  const gifSrc = apiUrl(
    `/api/exercise-gif?exerciseId=${encodeURIComponent(state.exerciseId)}&resolution=180`
  );

  const mediaBlock = (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'center' }}>
      <Box
        component="img"
        src={gifSrc}
        alt={`Animatie: ${state.displayName}`}
        loading="lazy"
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
      {state.videoUrl && (
        <Box
          component="video"
          controls
          playsInline
          preload="metadata"
          sx={{
            width: '100%',
            maxWidth: variant === 'aside' ? 200 : 480,
            borderRadius: 1,
          }}
        >
          <source src={state.videoUrl} />
        </Box>
      )}
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
