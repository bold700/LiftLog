import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  List,
  ListItem,
  ListItemText,
  Alert,
  Chip,
  IconButton,
  Popover,
} from '@mui/material';
import EmojiEventsRoundedIcon from '@mui/icons-material/EmojiEventsRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { PageLayout, ContentCard } from './layout';
import type { BestLift } from '../utils/leaderboardLocalStats';
import {
  fetchPublicLeaderboard,
  LEADERBOARD_PUBLIC_SYNCED_EVENT,
  type PublicLeaderboardEntry,
} from '../services/leaderboardPublicService';
import { isFirebaseConfigured } from '../firebase/config';
import { useAuth } from '../context/AuthContext';

type Period = '7d' | '30d';

function medalForRank(i: number): string | null {
  if (i === 0) return '🥇';
  if (i === 1) return '🥈';
  if (i === 2) return '🥉';
  return null;
}

function pickLift(r: PublicLeaderboardEntry, period: Period): { name: string; kg: number } {
  if (period === '7d') {
    return { name: r.exerciseName7d, kg: r.weightKg7d };
  }
  return { name: r.exerciseName30d, kg: r.weightKg30d };
}

function liftsForPeriod(r: PublicLeaderboardEntry, period: Period): BestLift[] {
  return period === '7d' ? r.lifts7d : r.lifts30d;
}

/** Sortering tussen personen: op zwaarste lift in de periode. */
function topKgForSort(r: PublicLeaderboardEntry, period: Period): number {
  const lifts = liftsForPeriod(r, period);
  if (lifts.length > 0) return lifts[0].weightKg;
  const p = pickLift(r, period);
  return p.kg > 0 && p.name ? p.kg : -1;
}

export function LeaderboardPage() {
  const auth = useAuth();
  const [period, setPeriod] = useState<Period>('7d');
  const [rows, setRows] = useState<PublicLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [infoAnchor, setInfoAnchor] = useState<HTMLElement | null>(null);
  const infoOpen = Boolean(infoAnchor);

  const load = useCallback(async (quiet = false) => {
    if (!isFirebaseConfigured()) {
      setRows([]);
      setLoading(false);
      return;
    }
    if (!quiet) {
      setLoading(true);
      setError(null);
    }
    try {
      const list = await fetchPublicLeaderboard();
      setRows(list);
      setError(null);
    } catch (e) {
      const raw = e instanceof Error ? e.message : 'Laden mislukt.';
      const permission =
        raw.toLowerCase().includes('permission') || raw.toLowerCase().includes('missing or insufficient');
      const msg = permission
        ? `${raw} Publiceer de regels uit firestore.rules in Firebase Console (Firestore → Rules), of voer uit: npm run deploy:firestore — de collectie leaderboardPublic moet daar in staan.`
        : raw;
      if (!quiet) {
        setError(msg);
        setRows([]);
      }
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  /** Opnieuw laden na sync of logs — zonder volledig scherm “Laden…” */
  useEffect(() => {
    const reloadQuiet = () => {
      void load(true);
    };
    const debounceMs = 2000;
    let t: ReturnType<typeof setTimeout> | null = null;
    const scheduleBackupReload = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        t = null;
        void load(true);
      }, debounceMs);
    };
    window.addEventListener(LEADERBOARD_PUBLIC_SYNCED_EVENT, reloadQuiet);
    window.addEventListener('workoutUpdated', scheduleBackupReload);
    window.addEventListener('dayCompletionUpdated', scheduleBackupReload);
    return () => {
      window.removeEventListener(LEADERBOARD_PUBLIC_SYNCED_EVENT, reloadQuiet);
      window.removeEventListener('workoutUpdated', scheduleBackupReload);
      window.removeEventListener('dayCompletionUpdated', scheduleBackupReload);
      if (t) clearTimeout(t);
    };
  }, [load]);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const wa = topKgForSort(a, period);
      const wb = topKgForSort(b, period);
      if (wb !== wa) return wb - wa;
      return a.displayLabel.localeCompare(b.displayLabel, 'nl', { sensitivity: 'base' });
    });
    return copy;
  }, [rows, period]);

  const firebaseOk = isFirebaseConfigured();
  const uid = auth?.user?.uid;

  return (
    <PageLayout>
      <ContentCard>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 2 }}>
          <EmojiEventsRoundedIcon color="primary" />
          <Typography variant="h5" component="h2" sx={{ fontWeight: 600, flex: 1 }}>
            Ranglijst
          </Typography>
          <IconButton
            size="small"
            aria-label="Uitleg ranglijst"
            aria-describedby={infoOpen ? 'leaderboard-info-popover' : undefined}
            aria-expanded={infoOpen}
            onClick={(e) => setInfoAnchor(infoOpen ? null : e.currentTarget)}
            sx={{ color: 'text.secondary' }}
          >
            <InfoOutlinedIcon fontSize="small" />
          </IconButton>
          <Popover
            id="leaderboard-info-popover"
            open={infoOpen}
            anchorEl={infoAnchor}
            onClose={() => setInfoAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            slotProps={{
              paper: {
                sx: { maxWidth: 320, p: 2 },
              },
            }}
          >
            <Typography variant="body2" color="text.secondary" component="div">
              Per deelnemer zie je <strong>alle oefeningen met gewicht</strong> uit de gekozen periode (zwaar bovenaan).
              De <strong>plek in de ranglijst</strong> is gebaseerd op je zwaarste lift. Profielnaam of Anoniem, aanpassen
              onder <strong>Profiel</strong>.
            </Typography>
          </Popover>
        </Box>

        {!firebaseOk && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Firebase is niet geconfigureerd — de ranglijst is dan niet beschikbaar.
          </Alert>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            Periode
          </Typography>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={period}
            onChange={(_, v: Period | null) => v && setPeriod(v)}
          >
            <ToggleButton value="7d">7 dagen</ToggleButton>
            <ToggleButton value="30d">30 dagen</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {loading ? (
          <Typography color="text.secondary">Laden…</Typography>
        ) : sorted.length === 0 ? (
          <Typography color="text.secondary">
            Nog geen deelnemers met data in deze periode, of iedereen heeft zich onder <strong>Profiel</strong> uitgezet.
            Log oefeningen met naam en gewicht om te verschijnen.
          </Typography>
        ) : (
          <List disablePadding>
            {sorted.map((r, i) => {
              const lifts = liftsForPeriod(r, period);
              const medal = medalForRank(i);
              const isYou = uid != null && r.userId === uid;
              const secondary =
                lifts.length > 0 ? (
                  <Box component="span" sx={{ display: 'flex', flexDirection: 'column', gap: 0.35, mt: 0.25 }}>
                    {lifts.map((lift, li) => (
                      <Typography
                        key={`${lift.exerciseName}-${lift.weightKg}-${li}`}
                        component="span"
                        variant="body2"
                        color="text.secondary"
                      >
                        {lift.exerciseName} · {lift.weightKg.toLocaleString('nl-NL')} kg
                      </Typography>
                    ))}
                  </Box>
                ) : (
                  'Nog geen oefening met gewicht in deze periode'
                );
              return (
                <ListItem
                  key={r.userId}
                  sx={{
                    borderRadius: 1,
                    mb: 0.5,
                    alignItems: 'flex-start',
                    bgcolor: isYou ? 'action.selected' : 'transparent',
                  }}
                >
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Typography component="span" variant="body1" fontWeight={600}>
                          {medal ? `${medal} ` : `${i + 1}. `}
                          {r.displayLabel}
                        </Typography>
                        {isYou && <Chip size="small" label="Jij" color="primary" variant="outlined" />}
                      </Box>
                    }
                    secondary={secondary}
                    secondaryTypographyProps={{ component: 'div' }}
                  />
                </ListItem>
              );
            })}
          </List>
        )}
      </ContentCard>
    </PageLayout>
  );
}
