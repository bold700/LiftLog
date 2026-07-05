import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  IconButton,
  Card,
  CardContent,
  CircularProgress,
} from '@mui/material';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingFlatIcon from '@mui/icons-material/TrendingFlat';
import { PageLayout, ContentCard } from './layout';
import type { ExerciseLog, GroupSession, Profile, Schema } from '../types';
import { getLogsForSession, getLogsForUser, saveExerciseLog } from '../services/logService';

interface GroupSessionViewProps {
  schema: Schema;
  session: GroupSession;
  participants: Profile[];
  currentUserId: string;
  onBack: () => void;
}

const rowKey = (userId: string, exerciseName: string) => `${userId}::${exerciseName}`;

function shortName(p: Profile): string {
  return p.displayName?.trim() || p.email?.split('@')[0] || 'Deelnemer';
}

export function GroupSessionView({ schema, session, participants, currentUserId, onBack }: GroupSessionViewProps) {
  const day = schema.days[session.dayIndex];
  const exercises = useMemo(() => day?.exercises ?? [], [day]);

  const [loading, setLoading] = useState(true);
  /** vorige keer per persoon+oefening (exclusief deze sessie) */
  const [previous, setPrevious] = useState<Record<string, ExerciseLog | null>>({});
  /** al gelogd in deze sessie */
  const [current, setCurrent] = useState<Record<string, ExerciseLog>>({});
  const [drafts, setDrafts] = useState<Record<string, { weight: string; reps: string }>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [sessionLogs, ...perUser] = await Promise.all([
          getLogsForSession(session.id),
          ...participants.map((p) => getLogsForUser(p.userId)),
        ]);
        if (cancelled) return;

        const cur: Record<string, ExerciseLog> = {};
        for (const log of sessionLogs) {
          const k = rowKey(log.userId, log.exerciseName);
          if (!cur[k] || log.date > cur[k].date) cur[k] = log;
        }

        const prev: Record<string, ExerciseLog | null> = {};
        participants.forEach((p, i) => {
          const logs = perUser[i] || [];
          for (const ex of exercises) {
            const k = rowKey(p.userId, ex.exerciseName);
            const last = logs.find((l) => l.exerciseName === ex.exerciseName && l.sessionId !== session.id);
            prev[k] = last ?? null;
          }
        });

        const initDrafts: Record<string, { weight: string; reps: string }> = {};
        participants.forEach((p) => {
          for (const ex of exercises) {
            const k = rowKey(p.userId, ex.exerciseName);
            const c = cur[k];
            const pr = prev[k];
            initDrafts[k] = {
              weight: c?.weight != null ? String(c.weight) : pr?.weight != null ? String(pr.weight) : '',
              reps: c?.reps != null ? String(c.reps) : ex.repsTarget != null ? String(ex.repsTarget) : '',
            };
          }
        });

        setCurrent(cur);
        setPrevious(prev);
        setDrafts(initDrafts);
      } catch {
        // Leesfout (bv. rechten): toon de oefeningen alsnog, zonder vorige-keer-data.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session.id, participants, exercises]);

  const setDraft = (k: string, field: 'weight' | 'reps', value: string) => {
    setDrafts((d) => ({ ...d, [k]: { ...(d[k] ?? { weight: '', reps: '' }), [field]: value } }));
  };

  const handleSave = async (participant: Profile, ex: Schema['days'][number]['exercises'][number]) => {
    const k = rowKey(participant.userId, ex.exerciseName);
    const draft = drafts[k] ?? { weight: '', reps: '' };
    const weight = draft.weight.trim() !== '' ? Number(draft.weight) : null;
    if (weight == null || Number.isNaN(weight)) {
      setErrorKey(k);
      return;
    }
    const reps = draft.reps.trim() !== '' ? Number(draft.reps) : ex.repsTarget ?? null;
    setSavingKey(k);
    setErrorKey(null);
    try {
      const existing = current[k];
      const saved = await saveExerciseLog({
        id: existing?.id,
        userId: participant.userId,
        loggedBy: currentUserId,
        trainerId: participant.trainerId ?? null,
        exerciseName: ex.exerciseName,
        exerciseId: ex.exerciseId ?? null,
        weight,
        sets: ex.setsTarget ?? null,
        reps,
        date: existing?.date ?? new Date().toISOString(),
        schemaId: schema.id,
        schemaDayIndex: session.dayIndex,
        sessionId: session.id,
      });
      setCurrent((c) => ({ ...c, [k]: saved }));
    } catch {
      setErrorKey(k);
    } finally {
      setSavingKey(null);
    }
  };

  const dateLabel = new Date(session.date).toLocaleDateString('nl-NL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  return (
    <PageLayout>
      <ContentCard>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <IconButton size="small" onClick={onBack} sx={{ p: 0.5 }} aria-label="Terug">
            <ArrowBackIosNewIcon fontSize="small" />
          </IconButton>
          <Typography variant="h6" fontWeight={600} sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {schema.name}
          </Typography>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, ml: 0.5 }}>
          Groepsles · {day?.dayLabel ?? `Dag ${session.dayIndex + 1}`} · {dateLabel} · {participants.length}{' '}
          {participants.length === 1 ? 'deelnemer' : 'deelnemers'}
        </Typography>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress size={28} />
          </Box>
        ) : exercises.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Deze dag heeft geen oefeningen.
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {exercises.map((ex, exIndex) => (
              <Card
                key={exIndex}
                sx={{ backgroundColor: 'transparent', border: '1px solid', borderColor: 'divider', boxShadow: 'none', borderRadius: 2 }}
              >
                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                  <Typography variant="subtitle1" fontWeight={600}>
                    {ex.exerciseName}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 1.5, display: 'block' }}>
                    Doel: {ex.setsTarget} × {ex.repsTarget} reps
                    {ex.targetWeight != null ? ` · ${ex.targetWeight} kg` : ''}
                  </Typography>

                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {participants.map((p) => {
                      const k = rowKey(p.userId, ex.exerciseName);
                      const prev = previous[k];
                      const cur = current[k];
                      const draft = drafts[k] ?? { weight: '', reps: '' };
                      const draftWeight = draft.weight.trim() !== '' ? Number(draft.weight) : null;
                      const hint =
                        prev?.weight != null && draftWeight != null
                          ? draftWeight >= prev.weight
                            ? 'up'
                            : 'flat'
                          : null;
                      return (
                        <Box
                          key={p.userId}
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            flexWrap: 'wrap',
                            py: 0.5,
                            borderTop: '1px solid',
                            borderColor: 'divider',
                            pt: 1,
                          }}
                        >
                          <Box sx={{ minWidth: 110, flex: '1 1 110px' }}>
                            <Typography variant="body2" fontWeight={600} noWrap>
                              {shortName(p)}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {prev?.weight != null
                                ? `vorige: ${prev.weight} kg${prev.reps != null ? ` × ${prev.reps}` : ''}`
                                : 'vorige: —'}
                            </Typography>
                          </Box>
                          <TextField
                            size="small"
                            type="number"
                            label="kg"
                            value={draft.weight}
                            onChange={(e) => setDraft(k, 'weight', e.target.value)}
                            sx={{ width: 80 }}
                            inputProps={{ inputMode: 'decimal', step: '0.5' }}
                            error={errorKey === k}
                          />
                          <TextField
                            size="small"
                            type="number"
                            label="reps"
                            value={draft.reps}
                            onChange={(e) => setDraft(k, 'reps', e.target.value)}
                            sx={{ width: 72 }}
                            inputProps={{ inputMode: 'numeric' }}
                          />
                          {hint === 'up' && <TrendingUpIcon fontSize="small" sx={{ color: 'success.main' }} />}
                          {hint === 'flat' && <TrendingFlatIcon fontSize="small" sx={{ color: 'warning.main' }} />}
                          <IconButton
                            size="small"
                            onClick={() => handleSave(p, ex)}
                            disabled={savingKey === k}
                            aria-label={`Log opslaan voor ${shortName(p)}`}
                            sx={{ color: cur ? 'success.main' : 'text.secondary' }}
                          >
                            {savingKey === k ? <CircularProgress size={18} /> : <CheckCircleIcon fontSize="small" />}
                          </IconButton>
                        </Box>
                      );
                    })}
                  </Box>
                </CardContent>
              </Card>
            ))}
          </Box>
        )}
      </ContentCard>
    </PageLayout>
  );
}
