/**
 * Les geven (Figma "Group session"): één oefening tegelijk, met alle ingeschreven sporters eronder.
 * Per sporter zie je wat die vorige keer deed en vul je gewicht, reps en sets in; het bolletje
 * rechts slaat op en wordt groen. Bovenaan wissel je van oefening.
 *
 * De oefeningen komen uit de lesplanning (Beheer → Lesplanning), zodat elke trainer de les kan
 * geven, ook als de workout van een collega is. Logs krijgen de sessie mee, zodat de les later
 * verder kan waar hij gebleven was.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Chip,
  CircularProgress,
  IconButton,
  Menu,
  MenuItem,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import SwapHorizRoundedIcon from '@mui/icons-material/SwapHorizRounded';
import { PageLayout, HeaderActions } from '../layout';
import { ExerciseDbDemo } from '../ExerciseDbDemo';
import { ExerciseInfoButton, useExerciseNotes } from '../exercises/ExerciseInfoButton';
import { NumberField } from '../NumberField';
import { useNotify } from '../../context/NotifyContext';
import { usePageTitle } from '../../context/PageTitleContext';
import { getLogsForSession, getLogsForUserInOrg, saveExerciseLog } from '../../services/logService';
import { checkExerciseAgainstLimitations, describeLimitation } from '../../utils/exerciseLimitations';
import { designTokens } from '../../theme/designTokens';
import { exerciseKey } from '../../utils/exerciseKey';
import { alternativeForLimitation, plannedNameOfLog } from '../../utils/exerciseAlternatives';
import { refText } from '../../data/exerciseProgressions';
import { SubstituteDialog } from './SubstituteDialog';
import type { ClassPlan, ClassPlanExercise } from '../../services/classPlanService';
import type { StudioClass } from '../../services/classService';
import type { ExerciseLog, GroupSession, Profile } from '../../types';

const rowKey = (userId: string, exerciseName: string) => `${userId}::${exerciseName}`;
const nameOf = (p: Profile) => p.displayName?.trim() || p.email?.split('@')[0] || 'Deelnemer';
const initialsOf = (p: Profile) =>
  nameOf(p)
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

/** "80 kg · 4 × 8", of wat er van de log bekend is. */
export function describeLog(log: Pick<ExerciseLog, 'weight' | 'sets' | 'reps'> | null | undefined): string | null {
  if (!log) return null;
  const parts: string[] = [];
  if (log.weight != null) parts.push(`${log.weight} kg`);
  if (log.sets != null && log.reps != null) parts.push(`${log.sets} × ${log.reps}`);
  else if (log.reps != null) parts.push(`${log.reps} reps`);
  return parts.length ? parts.join(' · ') : null;
}

interface Draft {
  weight: string;
  reps: string;
  sets: string;
}

export function ClassSessionView({
  cls,
  plan,
  session,
  participants,
  currentUserId,
  onFinish,
}: {
  cls: StudioClass;
  plan: ClassPlan;
  session: GroupSession;
  participants: Profile[];
  currentUserId: string;
  onFinish: () => void;
}) {
  const notify = useNotify();
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up('md'));
  const exercises: ClassPlanExercise[] = plan.exercises;
  const [exIndex, setExIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  // Alle logs per deelnemer, voor "vorige keer" (ook van een alternatief dat in de les gekozen wordt).
  const [history, setHistory] = useState<Record<string, ExerciseLog[]>>({});
  // Per deelnemer en geplande oefening: de oefening die de deelnemer in plaats daarvan doet.
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [substituteFor, setSubstituteFor] = useState<Profile | null>(null);
  const [current, setCurrent] = useState<Record<string, ExerciseLog>>({});
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  // Bibliotheek van de studio: voor het alternatief bij een beperking van een sporter.
  const notes = useExerciseNotes();

  const weekday = new Date(`${cls.date}T12:00:00`).toLocaleDateString('nl-NL', { weekday: 'short' });
  usePageTitle(`${cls.title} · ${weekday} ${cls.startTime}`);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [sessionLogs, ...perUser] = await Promise.all([
        getLogsForSession(session.id).catch(() => [] as ExerciseLog[]),
        ...participants.map((p) => getLogsForUserInOrg(p.userId).catch(() => [] as ExerciseLog[])),
      ]);
      if (cancelled) return;
      // Een log van een alternatief hoort bij de geplande oefening waarvoor het gedaan werd.
      const cur: Record<string, ExerciseLog> = {};
      const subs: Record<string, string> = {};
      for (const log of sessionLogs) {
        const k = rowKey(log.userId, plannedNameOfLog(log));
        if (!cur[k] || log.date > cur[k].date) {
          cur[k] = log;
          if (log.substituteFor) subs[k] = log.exerciseName;
          else delete subs[k];
        }
      }
      const hist: Record<string, ExerciseLog[]> = {};
      participants.forEach((p, i) => {
        hist[p.userId] = perUser[i].filter((l) => l.sessionId !== session.id);
      });
      setCurrent(cur);
      setOverrides(subs);
      setHistory(hist);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [session.id, participants, exercises]);

  const ex = exercises[exIndex];
  /** Welke oefening doet deze deelnemer nu: de geplande, of het gekozen alternatief. */
  const doingOf = (userId: string) => overrides[rowKey(userId, ex.name)] ?? ex.name;
  /** Laatste log van deze deelnemer op deze oefening, buiten deze les (logs staan nieuwste eerst). */
  const previousOf = (userId: string, name: string) =>
    history[userId]?.find((l) => exerciseKey(l.exerciseName) === exerciseKey(name)) ?? null;
  const loggedCount = useCallback(
    (e: ClassPlanExercise) => participants.filter((p) => current[rowKey(p.userId, e.name)]).length,
    [participants, current]
  );

  /** Wat er in de vakjes staat: eerst wat nu gelogd is, anders vorige keer (gewicht) en het doel (sets, reps). */
  const draftOf = (userId: string): Draft => {
    const k = rowKey(userId, ex.name);
    if (drafts[k]) return drafts[k];
    const doing = doingOf(userId);
    // Een log die nog onder een andere oefening staat, telt niet mee voor de vakjes.
    const c = current[k]?.exerciseName === doing ? current[k] : undefined;
    const pr = previousOf(userId, doing);
    return {
      weight: c?.weight != null ? String(c.weight) : pr?.weight != null ? String(pr.weight) : '',
      reps: c?.reps != null ? String(c.reps) : ex.reps > 0 ? String(ex.reps) : '',
      sets: c?.sets != null ? String(c.sets) : ex.sets > 0 ? String(ex.sets) : '',
    };
  };
  const setDraft = (userId: string, patch: Partial<Draft>) => {
    const k = rowKey(userId, ex.name);
    setDrafts((d) => ({ ...d, [k]: { ...draftOf(userId), ...patch } }));
  };

  const save = async (p: Profile) => {
    const k = rowKey(p.userId, ex.name);
    const d = draftOf(p.userId);
    const num = (v: string) =>
      v.trim() !== '' && Number.isFinite(Number(v.replace(',', '.'))) ? Number(v.replace(',', '.')) : null;
    setSavingKey(k);
    try {
      const existing = current[k];
      const saved = await saveExerciseLog({
        id: existing?.id,
        userId: p.userId,
        loggedBy: currentUserId,
        trainerId: p.trainerId ?? null,
        exerciseName: doingOf(p.userId),
        substituteFor: overrides[k] ? ex.name : null,
        exerciseId: null,
        weight: num(d.weight),
        sets: num(d.sets) ?? (ex.sets || null),
        reps: num(d.reps) ?? (ex.reps || null),
        notes: null,
        date: existing?.date ?? new Date().toISOString(),
        schemaId: plan.schemaId ?? session.schemaId,
        schemaDayIndex: plan.dayIndex ?? session.dayIndex,
        sessionId: session.id,
      });
      const next = { ...current, [k]: saved };
      setCurrent(next);
      setDrafts((all) => {
        const copy = { ...all };
        delete copy[k];
        return copy;
      });
      // Door naar de volgende die nog niet gelogd is.
      const nextP = participants.find((x) => !next[rowKey(x.userId, ex.name)]);
      setSelected(nextP?.userId ?? null);
    } catch (e) {
      notify?.error(e instanceof Error ? e.message : 'Opslaan mislukt');
    } finally {
      setSavingKey(null);
    }
  };

  /** Alternatief kiezen (of terug naar de geplande oefening met null). */
  const chooseSubstitute = (p: Profile, name: string | null) => {
    const k = rowKey(p.userId, ex.name);
    setOverrides((o) => {
      const copy = { ...o };
      if (name) copy[k] = name;
      else delete copy[k];
      return copy;
    });
    // Het gewicht van de oude oefening past niet meer: opnieuw invullen vanaf vorige keer.
    setDrafts((all) => {
      const copy = { ...all };
      delete copy[k];
      return copy;
    });
    setSelected(p.userId);
    setSubstituteFor(null);
  };

  const totalLogged = useMemo(() => Object.keys(current).length, [current]);
  const finishButton = (
    <Button variant="contained" disableElevation onClick={onFinish}>
      Les afronden
    </Button>
  );

  const gotoExercise = (i: number) => {
    setExIndex(i);
    setSelected(null);
  };

  if (!ex) {
    return (
      <PageLayout maxWidth="none">
        <Alert severity="info">Deze voorbereiding heeft geen oefeningen. Kies eerst een workout bij Voorbereiden.</Alert>
      </PageLayout>
    );
  }

  const done = loggedCount(ex);
  const inputSx = {
    '& input': { textAlign: 'center' },
    '& .MuiOutlinedInput-root': { bgcolor: designTokens.cardBackgroundHigh },
  };

  return (
    <PageLayout maxWidth="none">
      <HeaderActions>
        <Box sx={{ display: { xs: 'none', md: 'flex' } }}>{finishButton}</Box>
      </HeaderActions>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        <Box component="span" sx={{ color: designTokens.primary, fontWeight: 500 }}>
          Lessen
        </Box>
        {` › ${weekday} ${cls.startTime} ${cls.title} › Sessie`}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5, mt: -1 }}>
        Wat je hier opslaat, komt in de logs van de sporter (Inzichten) en is volgende keer "vorige keer".
      </Typography>

      {/* Oefening wisselen: pijltjes of tikken voor de lijst. */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          p: 0.75,
          mb: 1.5,
          borderRadius: 999,
          bgcolor: designTokens.cardBackground,
        }}
      >
        <IconButton aria-label="Vorige oefening" size="small" disabled={exIndex === 0} onClick={() => gotoExercise(exIndex - 1)}>
          <ChevronLeftRoundedIcon />
        </IconButton>
        <ButtonBase
          onClick={(e) => setMenuAnchor(e.currentTarget)}
          sx={{ flex: 1, minWidth: 0, flexDirection: 'column', borderRadius: 2, py: 0.25 }}
        >
          <Typography variant="body2" fontWeight={600} noWrap sx={{ maxWidth: '100%' }}>
            {ex.name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Oefening {exIndex + 1} van {exercises.length} · tik om te wisselen
          </Typography>
        </ButtonBase>
        <IconButton
          aria-label="Volgende oefening"
          size="small"
          disabled={exIndex >= exercises.length - 1}
          onClick={() => gotoExercise(exIndex + 1)}
        >
          <ChevronRightRoundedIcon />
        </IconButton>
      </Box>
      <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}>
        {exercises.map((e, i) => (
          <MenuItem
            key={`${e.name}-${i}`}
            selected={i === exIndex}
            onClick={() => {
              gotoExercise(i);
              setMenuAnchor(null);
            }}
          >
            <Box sx={{ flex: 1 }}>
              {i + 1}. {e.name}
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>
              {loggedCount(e)}/{participants.length}
            </Typography>
          </MenuItem>
        ))}
      </Menu>

      {/* De oefening zelf, zoals op de workoutdag. */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          bgcolor: designTokens.cardBackground,
          borderRadius: 3,
          p: 1.5,
          mb: 2,
        }}
      >
        <ExerciseDbDemo exerciseName={ex.name} variant="aside" />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontSize: 16, fontWeight: 600, lineHeight: '22px' }}>{ex.name}</Typography>
          <Typography variant="body2" color="text.secondary">
            {ex.sets > 0 && ex.reps > 0 ? `${ex.sets} × ${ex.reps} · ` : ''}
            {done} van {participants.length} gelogd
          </Typography>
          {ex.notes && (
            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
              {ex.notes}
            </Typography>
          )}
        </Box>
        <ExerciseInfoButton exerciseName={ex.name} size="medium" />
      </Box>

      {plan.note && exIndex === 0 && (
        <Alert severity="info" icon={false} sx={{ mb: 2, whiteSpace: 'pre-line' }}>
          {plan.note}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress size={28} />
        </Box>
      ) : participants.length === 0 ? (
        <Typography color="text.secondary">Nog niemand ingeschreven voor deze les.</Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {wide && (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 2.4fr) minmax(0, 1.2fr) 110px 110px 110px 48px',
                columnGap: 2,
                px: 2,
                typography: 'caption',
                color: 'text.secondary',
              }}
            >
              <span>Deelnemer</span>
              <span>Vorige keer</span>
              <span>Gewicht</span>
              <span>Reps</span>
              <span>Sets</span>
              <span />
            </Box>
          )}
          {participants.map((p) => {
            const k = rowKey(p.userId, ex.name);
            const logged = !!current[k];
            const isSel = selected === p.userId;
            const doing = doingOf(p.userId);
            const swapped = doing !== ex.name;
            // Opgeslagen onder een andere oefening dan nu gekozen: nog een keer ✓ om bij te werken.
            const stale = logged && current[k].exerciseName !== doing;
            const prevLog = previousOf(p.userId, doing);
            const prevDate = prevLog?.date
              ? new Date(prevLog.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
              : null;
            const prev = describeLog(prevLog);
            const prevText = prev
              ? `${prev}${prevDate ? ` · ${prevDate}` : ''}`
              : prevLog
                ? `gelogd${prevDate ? ` ${prevDate}` : ''}`
                : null;
            const check = checkExerciseAgainstLimitations(ex.name, p.limitations);
            const swapButton = (
              <Button
                size="small"
                startIcon={<SwapHorizRoundedIcon fontSize="small" />}
                onClick={(e) => {
                  e.stopPropagation();
                  setSubstituteFor(p);
                }}
                sx={{ px: 1, minWidth: 0, color: 'text.secondary' }}
              >
                Andere oefening
              </Button>
            );
            const swapChip = swapped ? (
              <Chip
                size="small"
                icon={<SwapHorizRoundedIcon />}
                label={`Doet: ${doing}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setSubstituteFor(p);
                }}
                onDelete={() => chooseSubstitute(p, null)}
                sx={{ mt: 0.5, maxWidth: '100%', bgcolor: designTokens.cardBackgroundHigh }}
              />
            ) : null;
            const d = draftOf(p.userId);
            const saving = savingKey === k;
            const doneButton = (
              <IconButton
                aria-label={logged ? `${nameOf(p)} bijwerken` : `${nameOf(p)} opslaan`}
                onClick={(e) => {
                  e.stopPropagation();
                  void save(p);
                }}
                disabled={saving}
                sx={{
                  width: 36,
                  height: 36,
                  bgcolor: logged && !stale ? designTokens.primary : designTokens.cardBackgroundHigh,
                  color: logged && !stale ? designTokens.onPrimary : 'text.secondary',
                  '&:hover': { bgcolor: logged && !stale ? designTokens.primary : designTokens.secondaryContainer },
                }}
              >
                {saving ? <CircularProgress size={16} color="inherit" /> : <CheckRoundedIcon fontSize="small" />}
              </IconButton>
            );
            const fields = (
              <>
                <NumberField
                  aria-label="Gewicht"
                  placeholder="kg"
                  decimal
                  size="small"
                  value={d.weight}
                  onChange={(v) => setDraft(p.userId, { weight: v })}
                  onFocus={() => setSelected(p.userId)}
                  sx={inputSx}
                />
                <NumberField
                  aria-label="Reps"
                  placeholder="reps"
                  size="small"
                  value={d.reps}
                  onChange={(v) => setDraft(p.userId, { reps: v })}
                  onFocus={() => setSelected(p.userId)}
                  sx={inputSx}
                />
                <NumberField
                  aria-label="Sets"
                  placeholder="sets"
                  size="small"
                  value={d.sets}
                  onChange={(v) => setDraft(p.userId, { sets: v })}
                  onFocus={() => setSelected(p.userId)}
                  sx={inputSx}
                />
              </>
            );
            const warning =
              check.level !== 'ok' ? (
                <Typography
                  variant="caption"
                  sx={{ display: 'block', color: check.level === 'vermijden' ? 'error.main' : 'warning.main' }}
                >
                  {check.level === 'vermijden' ? 'Liever niet: ' : 'Let op: '}
                  {check.hits
                    .map((h) => {
                      const alt = alternativeForLimitation(ex.name, h, notes?.get(exerciseKey(ex.name)) ?? null);
                      return `${describeLimitation(h)}${alt ? ` → ${refText(alt)}` : ''}`;
                    })
                    .join('; ')}
                </Typography>
              ) : null;
            const avatar = (
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  flexShrink: 0,
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  typography: 'caption',
                  fontWeight: 600,
                  bgcolor: isSel ? designTokens.primary : designTokens.cardBackgroundHigh,
                  color: isSel ? designTokens.onPrimary : 'text.secondary',
                }}
              >
                {initialsOf(p)}
              </Box>
            );
            const rowSx = {
              borderRadius: 3,
              bgcolor: isSel ? designTokens.secondaryContainer : designTokens.cardBackground,
              color: isSel ? designTokens.onSecondaryContainer : 'text.primary',
            };

            if (wide) {
              return (
                <Box
                  key={p.userId}
                  onClick={() => setSelected(p.userId)}
                  sx={{
                    ...rowSx,
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 2.4fr) minmax(0, 1.2fr) 110px 110px 110px 48px',
                    columnGap: 2,
                    alignItems: 'center',
                    px: 2,
                    py: 1,
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
                    {avatar}
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={500} noWrap>
                        {nameOf(p)}
                      </Typography>
                      {warning}
                      {swapChip ?? swapButton}
                    </Box>
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    {prevText ?? (swapped ? 'Eerste keer deze oefening' : 'Eerste keer')}
                  </Typography>
                  {fields}
                  {doneButton}
                </Box>
              );
            }

            return (
              <Box key={p.userId} sx={{ ...rowSx, p: 1.5 }}>
                <Box
                  onClick={() => setSelected(isSel ? null : p.userId)}
                  sx={{ display: 'flex', alignItems: 'center', gap: 1.5, cursor: 'pointer' }}
                >
                  {avatar}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={500} noWrap>
                      {nameOf(p)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" component="div">
                      {logged && !stale
                        ? `Nu ${describeLog(current[k]) ?? 'gelogd'}`
                        : prevText
                          ? `Vorige keer ${prevText}`
                          : 'Eerste keer deze oefening'}
                    </Typography>
                    {warning}
                    {swapChip}
                  </Box>
                  {doneButton}
                </Box>
                {isSel && (
                  <>
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1, mt: 1.5 }}>
                      {fields}
                    </Box>
                    {!swapped && <Box sx={{ mt: 1 }}>{swapButton}</Box>}
                  </>
                )}
              </Box>
            );
          })}
        </Box>
      )}

      {substituteFor && (
        <SubstituteDialog
          participantName={nameOf(substituteFor)}
          planned={ex.name}
          current={overrides[rowKey(substituteFor.userId, ex.name)] ?? null}
          limitations={substituteFor.limitations ?? []}
          note={notes?.get(exerciseKey(ex.name)) ?? null}
          onPick={(name) => chooseSubstitute(substituteFor, name)}
          onClose={() => setSubstituteFor(null)}
        />
      )}

      <Box sx={{ display: { xs: 'flex', md: 'none' }, flexDirection: 'column', gap: 1, mt: 3, mb: 12 }}>
        <Typography variant="caption" color="text.secondary" align="center">
          {totalLogged} {totalLogged === 1 ? 'log' : 'logs'} in deze les
        </Typography>
        {finishButton}
      </Box>
    </PageLayout>
  );
}
