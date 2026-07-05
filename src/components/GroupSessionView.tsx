import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  MenuItem,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
} from '@mui/material';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import { PageLayout, ContentCard } from './layout';
import { ExerciseDbDemo } from './ExerciseDbDemo';
import type { ExerciseLog, GroupSession, Profile, Schema } from '../types';
import { getLogsForSession, getLogsForUser, saveExerciseLog } from '../services/logService';

interface GroupSessionViewProps {
  schema: Schema;
  session: GroupSession;
  participants: Profile[];
  currentUserId: string;
  onBack: () => void;
}

type SchemaEx = Schema['days'][number]['exercises'][number];

const rowKey = (userId: string, exerciseName: string) => `${userId}::${exerciseName}`;

function shortName(p: Profile): string {
  return p.displayName?.trim() || p.email?.split('@')[0] || 'Deelnemer';
}

export function GroupSessionView({ schema, session, participants, currentUserId, onBack }: GroupSessionViewProps) {
  const day = schema.days[session.dayIndex];
  const exercises = useMemo(() => day?.exercises ?? [], [day]);

  const [loading, setLoading] = useState(true);
  const [previous, setPrevious] = useState<Record<string, ExerciseLog | null>>({});
  const [current, setCurrent] = useState<Record<string, ExerciseLog>>({});

  // Modal-state voor "Log toevoegen"
  const [modalExIndex, setModalExIndex] = useState<number | null>(null);
  const [selPid, setSelPid] = useState<string>('');
  const [draft, setDraft] = useState<{ weight: string; sets: string; reps: string; notes: string }>({
    weight: '',
    sets: '',
    reps: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);

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
            prev[k] = logs.find((l) => l.exerciseName === ex.exerciseName && l.sessionId !== session.id) ?? null;
          }
        });
        setCurrent(cur);
        setPrevious(prev);
      } catch {
        // rechten/offline: toon oefeningen alsnog
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session.id, participants, exercises]);

  const loggedCount = (ex: SchemaEx) =>
    participants.filter((p) => current[rowKey(p.userId, ex.exerciseName)]).length;

  function draftFor(pid: string, ex: SchemaEx) {
    const c = current[rowKey(pid, ex.exerciseName)];
    const pr = previous[rowKey(pid, ex.exerciseName)];
    return {
      weight: c?.weight != null ? String(c.weight) : pr?.weight != null ? String(pr.weight) : '',
      sets: c?.sets != null ? String(c.sets) : ex.setsTarget != null ? String(ex.setsTarget) : '',
      reps: c?.reps != null ? String(c.reps) : ex.repsTarget != null ? String(ex.repsTarget) : '',
      notes: c?.notes ?? '',
    };
  }

  const openModal = (exIndex: number) => {
    const ex = exercises[exIndex];
    const firstUnlogged = participants.find((p) => !current[rowKey(p.userId, ex.exerciseName)]) ?? participants[0];
    const pid = firstUnlogged?.userId ?? '';
    setModalExIndex(exIndex);
    setSelPid(pid);
    if (pid) setDraft(draftFor(pid, ex));
  };

  const changeParticipant = (pid: string) => {
    setSelPid(pid);
    if (modalExIndex != null) setDraft(draftFor(pid, exercises[modalExIndex]));
  };

  const handleSave = async () => {
    if (modalExIndex == null || !selPid) return;
    const ex = exercises[modalExIndex];
    const participant = participants.find((p) => p.userId === selPid);
    if (!participant) return;
    const weight = draft.weight.trim() !== '' ? Number(draft.weight) : null;
    setSaving(true);
    try {
      const k = rowKey(participant.userId, ex.exerciseName);
      const existing = current[k];
      const saved = await saveExerciseLog({
        id: existing?.id,
        userId: participant.userId,
        loggedBy: currentUserId,
        trainerId: participant.trainerId ?? null,
        exerciseName: ex.exerciseName,
        exerciseId: ex.exerciseId ?? null,
        weight,
        sets: draft.sets.trim() !== '' ? Number(draft.sets) : ex.setsTarget ?? null,
        reps: draft.reps.trim() !== '' ? Number(draft.reps) : ex.repsTarget ?? null,
        notes: draft.notes.trim() || null,
        date: existing?.date ?? new Date().toISOString(),
        schemaId: schema.id,
        schemaDayIndex: session.dayIndex,
        sessionId: session.id,
      });
      const nextCurrent = { ...current, [k]: saved };
      setCurrent(nextCurrent);
      // Ga door naar de volgende nog-niet-gelogde deelnemer, of sluit
      const nextP = participants.find((p) => !nextCurrent[rowKey(p.userId, ex.exerciseName)]);
      if (nextP) {
        setSelPid(nextP.userId);
        setDraft(draftForWith(nextP.userId, ex, nextCurrent));
      } else {
        setModalExIndex(null);
      }
    } catch {
      // laat de modal open zodat de trainer opnieuw kan proberen
    } finally {
      setSaving(false);
    }
  };

  // draftFor met een expliciete current-map (voor na opslaan)
  function draftForWith(pid: string, ex: SchemaEx, cur: Record<string, ExerciseLog>) {
    const c = cur[rowKey(pid, ex.exerciseName)];
    const pr = previous[rowKey(pid, ex.exerciseName)];
    return {
      weight: c?.weight != null ? String(c.weight) : pr?.weight != null ? String(pr.weight) : '',
      sets: c?.sets != null ? String(c.sets) : ex.setsTarget != null ? String(ex.setsTarget) : '',
      reps: c?.reps != null ? String(c.reps) : ex.repsTarget != null ? String(ex.repsTarget) : '',
      notes: c?.notes ?? '',
    };
  }

  const dateLabel = new Date(session.date).toLocaleDateString('nl-NL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  const modalEx = modalExIndex != null ? exercises[modalExIndex] : null;
  const selPrev = modalEx && selPid ? previous[rowKey(selPid, modalEx.exerciseName)] : null;
  const selCurrent = modalEx && selPid ? current[rowKey(selPid, modalEx.exerciseName)] : null;

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
            {exercises.map((ex, exIndex) => {
              const done = loggedCount(ex);
              return (
                <Card
                  key={exIndex}
                  sx={{ backgroundColor: 'transparent', border: '1px solid', borderColor: 'divider', boxShadow: 'none', borderRadius: 2 }}
                >
                  <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                    <Box
                      sx={{
                        display: 'flex',
                        gap: 2,
                        flexWrap: 'wrap',
                        flexDirection: { xs: 'column', sm: 'row' },
                        alignItems: 'flex-start',
                      }}
                    >
                      <Box sx={{ flex: 1, minWidth: { xs: '100%', sm: 160 } }}>
                        <Typography variant="subtitle1" fontWeight={600}>
                          {ex.exerciseName}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" display="block">
                          Doel: {ex.setsTarget} × {ex.repsTarget} reps
                          {ex.restSeconds != null && ex.restSeconds > 0 ? ` · ${ex.restSeconds}s rust` : ''}
                        </Typography>
                        {ex.notes ? (
                          <Typography variant="caption" color="text.secondary" display="block" fontStyle="italic" sx={{ mt: 0.5 }}>
                            {ex.notes}
                          </Typography>
                        ) : null}
                        <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Box
                            sx={{ cursor: 'pointer', display: 'inline-flex', bgcolor: '#000', color: '#F2E4D3', borderRadius: '20px', px: 2, py: 1 }}
                            onClick={() => openModal(exIndex)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => e.key === 'Enter' && openModal(exIndex)}
                          >
                            <Typography variant="body2" fontWeight={500}>
                              Log toevoegen
                            </Typography>
                          </Box>
                          <Typography variant="caption" color={done > 0 ? 'success.main' : 'text.secondary'}>
                            {done}/{participants.length} gelogd
                          </Typography>
                        </Box>
                      </Box>
                      <ExerciseDbDemo exerciseName={ex.exerciseName} variant="aside" />
                    </Box>
                  </CardContent>
                </Card>
              );
            })}
          </Box>
        )}
      </ContentCard>

      <Dialog open={modalExIndex != null} onClose={() => setModalExIndex(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ pb: 0.5 }}>Log toevoegen</DialogTitle>
        <DialogContent>
          {modalEx && (
            <>
              <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1.5 }}>
                {modalEx.exerciseName}
              </Typography>
              <TextField
                select
                fullWidth
                size="small"
                label="Voor wie?"
                value={selPid}
                onChange={(e) => changeParticipant(e.target.value)}
                sx={{ mb: 2 }}
              >
                {participants.map((p) => (
                  <MenuItem key={p.userId} value={p.userId}>
                    {shortName(p)}
                    {current[rowKey(p.userId, modalEx.exerciseName)] ? ' ✓' : ''}
                  </MenuItem>
                ))}
              </TextField>

              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  mb: 2,
                  p: 1,
                  borderRadius: 1,
                  bgcolor: 'rgba(0,0,0,0.04)',
                }}
              >
                <TrendingUpIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                <Typography variant="body2" color="text.secondary">
                  Vorige keer:{' '}
                  {selPrev?.weight != null
                    ? `${selPrev.weight} kg${selPrev.reps != null ? ` × ${selPrev.reps}` : ''}`
                    : '—'}
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                <TextField
                  label="Gewicht (kg)"
                  type="number"
                  size="small"
                  value={draft.weight}
                  onChange={(e) => setDraft((d) => ({ ...d, weight: e.target.value }))}
                  inputProps={{ inputMode: 'decimal', step: '0.5' }}
                  sx={{ flex: 1 }}
                />
                <TextField
                  label="Sets"
                  type="number"
                  size="small"
                  value={draft.sets}
                  onChange={(e) => setDraft((d) => ({ ...d, sets: e.target.value }))}
                  sx={{ width: 80 }}
                />
                <TextField
                  label="Reps"
                  type="number"
                  size="small"
                  value={draft.reps}
                  onChange={(e) => setDraft((d) => ({ ...d, reps: e.target.value }))}
                  sx={{ width: 80 }}
                />
              </Box>
              <TextField
                label="Notitie (optioneel)"
                fullWidth
                multiline
                minRows={2}
                size="small"
                value={draft.notes}
                onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
              />
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setModalExIndex(null)}>Sluiten</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving || !selPid}
            startIcon={selCurrent ? <CheckCircleIcon /> : undefined}
            sx={{ bgcolor: '#000000', color: '#F2E4D3', '&:hover': { bgcolor: '#1a1a1a' } }}
          >
            {saving ? 'Bezig…' : selCurrent ? 'Bijwerken' : 'Opslaan'}
          </Button>
        </DialogActions>
      </Dialog>
    </PageLayout>
  );
}
