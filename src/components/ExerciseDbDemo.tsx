import { useEffect, useState, useMemo } from 'react';
import { Box, Typography, Collapse, IconButton, Skeleton, Link } from '@mui/material';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { apiUrl } from '../utils/apiOrigin';

const SESSION_DEMO_PREFIX = 'liftlog:v3:exercise-demo:';

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
  | { status: 'ready'; exerciseId: string; videoUrl: string | null; displayName: string; gifUrl: string | null };

function parseReadyPayload(
  data: Record<string, unknown>,
  fallbackName: string
): Extract<DemoState, { status: 'ready' }> | null {
  const exIdRaw = data.exerciseId;
  const exerciseIdOk = typeof exIdRaw === 'string' && exIdRaw.trim() ? exIdRaw.trim() : null;
  if (data.found !== true || !exerciseIdOk) return null;
  const videoUrl =
    typeof data.videoUrl === 'string' &&
    (data.videoUrl.startsWith('https://') || data.videoUrl.startsWith('http://'))
      ? data.videoUrl
      : null;
  const gifUrl =
    typeof data.gifUrl === 'string' &&
    (data.gifUrl.startsWith('https://') || data.gifUrl.startsWith('http://'))
      ? data.gifUrl
      : null;
  const displayName = typeof data.displayName === 'string' ? data.displayName : fallbackName;
  return {
    status: 'ready',
    exerciseId: exerciseIdOk,
    videoUrl,
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
  /** Directe RapidAPI-URL eerst; bij onError overschakelen naar lokale /api/exercise-gif-proxy. */
  const [gifProxyFallback, setGifProxyFallback] = useState(false);
  const [gifLoadFailed, setGifLoadFailed] = useState(false);
  const [videoLoadFailed, setVideoLoadFailed] = useState(false);

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

  useEffect(() => {
    setGifProxyFallback(false);
    setGifLoadFailed(false);
    setVideoLoadFailed(false);
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
          Je RapidAPI-quota voor deze periode is op (vaak reset per uur of per dag). Wacht even, of upgrade het
          ExerciseDB-plan. LiftLog cachet nu zoekresultaten en GIF’s om minder calls te doen; na reset zou het weer
          moeten werken zonder alles dubbel op te halen.
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
  const effectiveGifSrc = state.gifUrl && !gifProxyFallback ? state.gifUrl : gifSrc;
  const showVideo = Boolean(state.videoUrl) && !videoLoadFailed;

  const mediaBlock = (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'center' }}>
      {showVideo ? (
        <Box
          component="video"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          onError={() => {
            setVideoLoadFailed(true);
            try {
              if (typeof sessionStorage !== 'undefined') {
                sessionStorage.removeItem(SESSION_DEMO_PREFIX + nameKey);
              }
            } catch {
              // negeer storage-fouten
            }
          }}
          sx={{
            width: '100%',
            maxWidth: variant === 'aside' ? 200 : 480,
            borderRadius: 1,
          }}
        >
          <source src={state.videoUrl || undefined} />
        </Box>
      ) : (
        <Box
          component="img"
          key={effectiveGifSrc}
          src={effectiveGifSrc}
          alt={`Animatie: ${state.displayName}`}
          loading="lazy"
          onError={() => {
            if (state.gifUrl && !gifProxyFallback) {
              setGifProxyFallback(true);
              return;
            }
            setGifLoadFailed(true);
          }}
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
      )}
      {gifLoadFailed ? (
        <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', maxWidth: 280 }}>
          Animatie laadt niet (proxy of RapidAPI). Controleer het ExerciseDB-abonnement en herstart de lokale API-server
          na een key-wijziging.
        </Typography>
      ) : null}
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
