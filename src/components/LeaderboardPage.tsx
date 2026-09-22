import { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Typography, ToggleButton, ToggleButtonGroup, Alert } from '@mui/material';
import { PageLayout, ContentCard, EmptyState } from './layout';
import { UserAvatar } from './UserAvatar';
import {
  fetchPublicLeaderboard,
  LEADERBOARD_PUBLIC_SYNCED_EVENT,
  type PublicLeaderboardEntry,
} from '../services/leaderboardPublicService';
import { isFirebaseConfigured } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { designTokens } from '../theme/designTokens';
import { segmentedToggleSx } from '../theme/segmentedToggle';

type Period = '7d' | '30d';

const POINT_RULES: [string, string][] = [
  ['Frequentie', '10 punten per trainingsdag'],
  ['Volume', '1 punt per gelogde set'],
  ['Progressie', '5 punten per kilo boven je eerste log'],
];

/** Zwaarste lift in de periode als onderregel, zoals Figma: "Barbell Deadlift 180 kg". */
function bestLiftFor(r: PublicLeaderboardEntry, period: Period): string | null {
  const name = (period === '7d' ? r.exerciseName7d : r.exerciseName30d)?.trim();
  const kg = period === '7d' ? r.weightKg7d : r.weightKg30d;
  return name && kg > 0 ? `${name} ${kg.toLocaleString('nl-NL')} kg` : null;
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
    <PageLayout maxWidth="none">
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

      <ToggleButtonGroup
        size="small"
        exclusive
        value={period}
        onChange={(_, v: Period | null) => v && setPeriod(v)}
        sx={{ ...segmentedToggleSx, mb: 2 }}
        aria-label="Periode"
      >
        <ToggleButton value="7d">7 dagen</ToggleButton>
        <ToggleButton value="30d">30 dagen</ToggleButton>
      </ToggleButtonGroup>

      {/* Lijst links, uitleg rechts (Figma "Leaderboard"); op een telefoon staat de uitleg eronder. */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '9fr 5fr' }, gap: 2.5, alignItems: 'start' }}>
        <Box sx={{ minWidth: 0 }}>
          {loading ? (
            <Typography color="text.secondary">Laden…</Typography>
          ) : sorted.length === 0 ? (
            <ContentCard>
              <EmptyState>
                Nog geen deelnemers met data in deze periode, of iedereen heeft zich onder Profiel uitgezet. Log oefeningen
                met naam en gewicht om te verschijnen.
              </EmptyState>
            </ContentCard>
          ) : (
            <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
              {sorted.map((r, i) => {
                const pts = ptsForPeriod(r, period);
                const isYou = uid != null && r.userId === uid;
                const lift = bestLiftFor(r, period);
                const secondary = lift
                  ? lift
                  : pts.points > 0
                    ? `${pts.frequency} ${pts.frequency === 1 ? 'training' : 'trainingen'} · ${pts.volume} sets`
                    : 'Nog niet getraind in deze periode';
                return (
                  <Box
                    component="li"
                    key={r.userId}
                    aria-current={isYou ? 'true' : undefined}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: { xs: 1.5, md: 2 },
                      minHeight: 60,
                      px: { xs: 2, md: 2.5 },
                      py: 1,
                      borderRadius: 3,
                      bgcolor: isYou ? designTokens.secondaryContainer : designTokens.cardBackground,
                      color: isYou ? designTokens.onSecondaryContainer : 'text.primary',
                    }}
                  >
                    <Typography sx={{ width: 20, fontSize: 14, lineHeight: '20px', color: isYou ? 'inherit' : 'text.secondary', flexShrink: 0 }}>
                      {i + 1}
                    </Typography>
                    <UserAvatar
                      name={r.visibility === 'named' ? r.displayLabel : 'Anoniem'}
                      photoURL={r.visibility === 'named' ? r.photoURL : null}
                      size={34}
                    />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontSize: 14, fontWeight: 500, lineHeight: '20px' }} noWrap>
                        {r.displayLabel}
                        {isYou && (
                          <Box component="span" sx={{ fontWeight: 400, opacity: 0.7 }}>
                            {' '}
                            · jij
                          </Box>
                        )}
                      </Typography>
                      <Typography sx={{ fontSize: 11, lineHeight: '16px', opacity: 0.75 }} noWrap>
                        {secondary}
                      </Typography>
                    </Box>
                    <Typography sx={{ fontSize: 14, fontWeight: 600, lineHeight: '20px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {pts.points.toLocaleString('nl-NL')} pt
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          )}
        </Box>

        <Box sx={{ bgcolor: designTokens.cardBackground, borderRadius: `${designTokens.cardRadius}px`, p: { xs: 2, md: 3 } }}>
          <Typography sx={{ fontSize: 14, fontWeight: 500, lineHeight: '20px', mb: 1.5 }}>Hoe punten werken</Typography>
          {POINT_RULES.map(([label, rule]) => (
            <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 0.75 }}>
              <Typography sx={{ fontSize: 12, fontWeight: 500, lineHeight: '16px' }}>{label}</Typography>
              <Typography sx={{ fontSize: 12, lineHeight: '16px', color: 'text.secondary', textAlign: 'right' }}>{rule}</Typography>
            </Box>
          ))}
          <Typography sx={{ fontSize: 11, lineHeight: '14px', color: 'text.secondary', mt: 1.5 }}>
            Alleen totalen worden gedeeld. Je logs blijven privé; onder Profiel kies je of je met naam, anoniem of helemaal
            niet meedoet.
          </Typography>
        </Box>
      </Box>
    </PageLayout>
  );
}
