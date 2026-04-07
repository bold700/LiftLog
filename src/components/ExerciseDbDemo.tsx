import { useEffect, useState, useMemo } from 'react';
import { Box, Typography, Collapse, IconButton, Skeleton, Link } from '@mui/material';
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
  /** RapidAPI: niet geabonneerd, ongeldige key, of 401/403 */
  | { status: 'rapidApiAuth'; detail?: string }
  /** RapidAPI: te veel requests (Basic heeft lage limiet) */
  | { status: 'rapidApiRate'; detail?: string }
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

        if (data && data.rateLimited === true) {
          const detail =
            typeof data.rapidApiMessage === 'string' ? data.rapidApiMessage.slice(0, 280) : undefined;
          setState({ status: 'rapidApiRate', detail });
          return;
        }

        if (data && data.authIssue === true) {
          const detail =
            typeof data.rapidApiMessage === 'string' ? data.rapidApiMessage.slice(0, 280) : undefined;
          setState({ status: 'rapidApiAuth', detail });
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

  if (state.status === 'rapidApiRate') {
    return (
      <Box
        sx={{
          flexShrink: 0,
          maxWidth: { xs: '100%', sm: 280 },
          alignSelf: { xs: 'center', sm: 'flex-start' },
          p: 1.25,
          borderRadius: 1,
          bgcolor: 'warning.light',
          opacity: 0.95,
        }}
      >
        <Typography variant="caption" component="div" sx={{ fontWeight: 700, color: 'warning.dark' }}>
          RapidAPI-limiet bereikt
        </Typography>
        <Typography variant="caption" component="div" sx={{ mt: 0.75, display: 'block', color: 'text.primary' }}>
          Basic-plannen hebben weinig requests per dag/uur. Wacht even of upgrade je RapidAPI-plan. Elke oefening in
          LiftLog doet meerdere zoekpogingen; dat telt snel op.
        </Typography>
        {import.meta.env.DEV && state.detail ? (
          <Typography
            variant="caption"
            component="pre"
            sx={{
              mt: 1,
              p: 0.75,
              borderRadius: 0.5,
              bgcolor: 'rgba(0,0,0,0.06)',
              fontSize: '0.65rem',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {state.detail}
          </Typography>
        ) : null}
      </Box>
    );
  }

  if (state.status === 'rapidApiAuth') {
    return (
      <Box
        sx={{
          flexShrink: 0,
          maxWidth: { xs: '100%', sm: 280 },
          alignSelf: { xs: 'center', sm: 'flex-start' },
          p: 1.25,
          borderRadius: 1,
          bgcolor: 'error.light',
          opacity: 0.95,
        }}
      >
        <Typography variant="caption" component="div" sx={{ fontWeight: 700, color: 'error.dark' }}>
          ExerciseDB / RapidAPI
        </Typography>
        <Typography variant="caption" component="div" sx={{ mt: 0.75, display: 'block', color: 'text.primary' }}>
          Een <strong>Basic</strong>-abonnement is genoeg, maar de key moet bij <strong>deze exacte API</strong> horen
          (host <strong>exercisedb.p.rapidapi.com</strong>). Elke RapidAPI-app heeft een eigen key — een key van een
          andere fitness-API werkt niet. Zie de{' '}
          <Link
            href="https://edb-docs.up.railway.app/docs/authentication"
            target="_blank"
            rel="noopener noreferrer"
            underline="hover"
          >
            authenticatie-docs
          </Link>
          .
        </Typography>
        <Link
          href="https://rapidapi.com/justin-WFnsXH_t6/api/exercisedb"
          target="_blank"
          rel="noopener noreferrer"
          variant="caption"
          sx={{ mt: 1, fontWeight: 600, display: 'block' }}
        >
          Abonneren op ExerciseDB (RapidAPI)
        </Link>
        <Typography variant="caption" component="div" sx={{ mt: 1, display: 'block', color: 'text.secondary' }}>
          Zet <strong>EXERCISEDB_RAPIDAPI_KEY</strong> in <strong>.env</strong> (LiftLog-map), zonder spaties aan begin/einde.
          Herstart daarna <strong>node scripts/local-api-server.mjs</strong>.
        </Typography>
        {import.meta.env.DEV && state.detail ? (
          <Typography
            variant="caption"
            component="pre"
            sx={{
              mt: 1,
              p: 0.75,
              borderRadius: 0.5,
              bgcolor: 'rgba(0,0,0,0.06)',
              fontSize: '0.65rem',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {state.detail}
          </Typography>
        ) : null}
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
