import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Alert,
  Chip,
  IconButton,
  Popover,
} from '@mui/material';
import EmojiEventsRoundedIcon from '@mui/icons-material/EmojiEventsRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { PageLayout, ContentCard } from './layout';
import { UserAvatar } from './UserAvatar';
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

function ptsForPeriod(r: PublicLeaderboardEntry, period: Period) {
  return period === '7d' ? r.pts7d : r.pts30d;
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
      const pa = ptsForPeriod(a, period).points;
      const pb = ptsForPeriod(b, period).points;
      if (pb !== pa) return pb - pa;
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
              Je <strong>score</strong> combineert drie dingen in de gekozen periode:
              <br />• <strong>Frequentie</strong> — 10 punten per trainingsdag
              <br />• <strong>Volume</strong> — 1 punt per gelogde set
              <br />• <strong>Progressie</strong> — 5 punten per kg dat je zwaarder tilt dan je eerste log
              <br />
              Zo tellen consistentie en vooruitgang mee, niet alleen brute kracht. Naam of Anoniem: aanpassen onder{' '}
              <strong>Profiel</strong>.
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
              const pts = ptsForPeriod(r, period);
              const medal = medalForRank(i);
              const isYou = uid != null && r.userId === uid;
              const secondary =
                pts.points > 0
                  ? `${pts.frequency} ${pts.frequency === 1 ? 'training' : 'trainingen'} · ${pts.volume} sets${pts.progressionKg > 0 ? ` · +${pts.progressionKg.toLocaleString('nl-NL')} kg progressie` : ''}`
                  : 'Nog niet getraind in deze periode';
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
                  <ListItemAvatar sx={{ minWidth: 52 }}>
                    <UserAvatar
                      name={r.visibility === 'named' ? r.displayLabel : 'Anoniem'}
                      photoURL={r.visibility === 'named' ? r.photoURL : null}
                      size={40}
                    />
                  </ListItemAvatar>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'nowrap' }}>
                        <Typography component="span" variant="body1" fontWeight={600} sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {medal ? `${medal} ` : `${i + 1}. `}
                          {r.displayLabel}
                        </Typography>
                        {isYou && <Chip size="small" label="Jij" color="primary" variant="outlined" />}
                        <Box sx={{ ml: 'auto', flexShrink: 0 }}>
                          <Typography component="span" variant="body1" fontWeight={700}>
                            {pts.points} pt
                          </Typography>
                        </Box>
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
