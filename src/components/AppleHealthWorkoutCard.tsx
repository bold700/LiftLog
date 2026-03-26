import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Button,
  FormControlLabel,
  Switch,
  CircularProgress,
  Alert,
} from '@mui/material';
import { designTokens } from '../theme/designTokens';
import {
  HealthWorkout,
  isIosNativeHealthAvailable,
  type AppleHealthWorkoutSummary,
} from '../plugins/healthWorkout';

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}m ${s}s`;
}

function formatSummaryText(s: AppleHealthWorkoutSummary): string {
  const parts: string[] = [];
  if (s.heartRateAvgBpm != null) {
    parts.push(`Hartslag gem. ${Math.round(s.heartRateAvgBpm)} bpm`);
  }
  if (s.heartRateMinBpm != null && s.heartRateMaxBpm != null) {
    parts.push(`min–max ${Math.round(s.heartRateMinBpm)}–${Math.round(s.heartRateMaxBpm)}`);
  }
  if (s.activeEnergyKcal != null && s.activeEnergyKcal > 0) {
    parts.push(`Actieve energie ${s.activeEnergyKcal.toFixed(0)} kcal`);
  }
  if (s.stepCount != null && s.stepCount > 0) {
    parts.push(`Stappen ${Math.round(s.stepCount)}`);
  }
  if (s.distanceMeters != null && s.distanceMeters > 0) {
    parts.push(`Afstand ${(s.distanceMeters / 1000).toFixed(2)} km`);
  }
  if (s.oxygenSaturationAvgFraction != null) {
    const v = s.oxygenSaturationAvgFraction;
    const pct = v <= 1 ? Math.round(v * 100) : Math.round(v);
    parts.push(`Zuurstof ~${pct}%`);
  }
  return parts.length ? parts.join(' · ') : 'Geen extra metingen in dit tijdvak (controleer toestemmingen in Gezondheid).';
}

interface AppleHealthWorkoutCardProps {
  /** Huidige opgeslagen samenvatting (indien aanwezig). */
  storedSummary: AppleHealthWorkoutSummary | null;
  onSummarySaved: (summary: AppleHealthWorkoutSummary) => void;
  onSummaryCleared: () => void;
}

export function AppleHealthWorkoutCard({
  storedSummary,
  onSummarySaved,
  onSummaryCleared,
}: AppleHealthWorkoutCardProps) {
  const [sessionActive, setSessionActive] = useState(false);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveToApple, setSaveToApple] = useState(false);

  const refreshSession = useCallback(async () => {
    if (!isIosNativeHealthAvailable()) return;
    try {
      const s = await HealthWorkout.getSession();
      setSessionActive(s.active);
      setStartDate(s.startDate ?? null);
    } catch {
      setSessionActive(false);
      setStartDate(null);
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    const onHealth = () => void refreshSession();
    window.addEventListener('healthWorkoutUpdated', onHealth);
    return () => window.removeEventListener('healthWorkoutUpdated', onHealth);
  }, [refreshSession]);

  useEffect(() => {
    if (!sessionActive || !startDate) {
      setElapsed(0);
      return;
    }
    const tick = () => {
      const start = Date.parse(startDate);
      if (Number.isNaN(start)) return;
      setElapsed(Math.max(0, (Date.now() - start) / 1000));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [sessionActive, startDate]);

  if (!isIosNativeHealthAvailable()) {
    return null;
  }

  const handleStart = async () => {
    setError(null);
    setLoading(true);
    try {
      await HealthWorkout.requestAuthorization();
      const r = await HealthWorkout.startSession();
      setSessionActive(true);
      setStartDate(r.startDate);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Start mislukt.');
    } finally {
      setLoading(false);
    }
  };

  const handleEnd = async () => {
    setError(null);
    setLoading(true);
    try {
      const summary = await HealthWorkout.endSession({
        saveWorkoutToAppleHealth: saveToApple,
      });
      onSummarySaved(summary);
      setSessionActive(false);
      setStartDate(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Afronden mislukt.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    setError(null);
    try {
      await HealthWorkout.cancelSession();
      setSessionActive(false);
      setStartDate(null);
    } catch {
      /* ignore */
    }
  };

  const handleClearStored = () => {
    onSummaryCleared();
  };

  return (
    <Box
      sx={{
        mb: 2,
        p: 2,
        borderRadius: `${designTokens.cardRadius}px`,
        border: `1px solid ${designTokens.cardBorder}`,
        bgcolor: 'action.hover',
      }}
    >
      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5 }}>
        Apple Gezondheid &amp; Watch
      </Typography>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
        Start hier je workout: we lezen hartslag, energie, stappen en meer uit Gezondheid voor het
        tijdvak van deze sessie (data van je iPhone en Apple Watch verschijnen in Gezondheid).
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {storedSummary && !sessionActive && (
        <Box sx={{ mb: 1.5 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
            Laatste sessie ({formatDuration(storedSummary.durationSeconds)}):{' '}
            {formatSummaryText(storedSummary)}
          </Typography>
          <Button size="small" onClick={handleClearStored} sx={{ textTransform: 'none' }}>
            Verwijder gekoppelde metingen
          </Button>
        </Box>
      )}

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
        {!sessionActive ? (
          <Button
            variant="contained"
            size="small"
            disabled={loading}
            onClick={() => void handleStart()}
            sx={{
              borderRadius: '20px',
              textTransform: 'none',
              bgcolor: '#000',
              color: '#F2E4D3',
              '&:hover': { bgcolor: '#1a1a1a' },
            }}
          >
            Start workout (Gezondheid)
          </Button>
        ) : (
          <>
            <Typography variant="body2" fontWeight={600}>
              Bezig · {formatDuration(elapsed)}
            </Typography>
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={saveToApple}
                  onChange={(_, c) => setSaveToApple(c)}
                />
              }
              label="Ook opslaan in Gezondheid als krachttraining"
            />
            <Button
              variant="contained"
              size="small"
              disabled={loading}
              onClick={() => void handleEnd()}
              sx={{
                borderRadius: '20px',
                textTransform: 'none',
                bgcolor: '#2e7d32',
                '&:hover': { bgcolor: '#1b5e20' },
              }}
            >
              Einde workout
            </Button>
            <Button
              variant="text"
              size="small"
              disabled={loading}
              onClick={() => void handleCancel()}
              sx={{ textTransform: 'none' }}
            >
              Annuleer sessie
            </Button>
          </>
        )}

        {loading && <CircularProgress size={22} sx={{ ml: 0.5 }} />}
      </Box>
    </Box>
  );
}
