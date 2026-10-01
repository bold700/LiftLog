/**
 * Moment inplannen: één knop voor vaste momenten, geleid door het abonnement. Een abonnement voor
 * personal training ("3x per week") geeft vaste PT-momenten bij de trainer; een abonnement voor
 * groepslessen geeft vaste groepslessen naar keuze uit het rooster; "alle lessen" geeft allebei.
 *
 * - PT: vrije weekmomenten binnen de beschikbaarheid van de trainer, aansluitend op zijn andere
 *   lessen eerst. Staf zet het meteen vast; een sporter vraagt aan en de trainer keurt goed.
 * - Groepsles: de weekmomenten van de groepslessen; meteen vast (ook voor een sporter).
 * - Een sporter plant niet meer in dan zijn abonnement toestaat (de server controleert dat ook);
 *   staf ziet een waarschuwing maar beslist zelf.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { useNotify } from '../context/NotifyContext';
import { addPersonalSlot, addStandingBooking } from '../services/classService';
import { getPlanStatus, getWeeklyPtOptions, requestStandingPt, type PlanStatus, type WeeklySlot } from '../services/planMomentService';
import { COVERS_LABEL, isPtKind } from '../utils/planCoverage';
import { describeStandingResult } from '../utils/standingSeries';
import { todayIso } from '../utils/format';
import type { ClassType } from '../types';

const WEEKDAY_SHORT = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
const WEEKDAY_LONG = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
/** Maandag eerst. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DURATIONS = [30, 45, 60, 90];

type Mode = 'pt' | 'group';

interface Props {
  open: boolean;
  userId: string;
  asStaff: boolean;
  /** Lessoorten van de studio (zonder privé): de weekmomenten van de groepslessen. */
  types: ClassType[];
  /** Staf: trainers om uit te kiezen bij een PT-moment. */
  trainers: { userId: string; name: string }[];
  defaultTrainerId: string | null;
  onClose: () => void;
  /** Na vastzetten of aanvragen: opnieuw laden. */
  onDone: () => void;
}

export function PlanMomentDialog({ open, userId, asStaff, types, trainers, defaultTrainerId, onClose, onDone }: Props) {
  const notify = useNotify();
  const [status, setStatus] = useState<PlanStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('pt');
  const [trainerId, setTrainerId] = useState('');
  const [duration, setDuration] = useState(60);
  const [days, setDays] = useState<{ weekday: number; times: WeeklySlot[] }[] | null>(null);
  const [daysError, setDaysError] = useState<string | null>(null);
  const [weekday, setWeekday] = useState<number | null>(null);
  const [slot, setSlot] = useState<WeeklySlot | null>(null);
  const [groupKey, setGroupKey] = useState('');
  const [startDate, setStartDate] = useState(todayIso());
  const [saving, setSaving] = useState(false);

  // Bij openen: abonnement en wat er al staat.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setStatus(null);
    setStatusError(null);
    setSlot(null);
    setGroupKey('');
    setStartDate(todayIso());
    getPlanStatus(asStaff ? userId : undefined).then(
      (s) => {
        if (!alive) return;
        setStatus(s);
        setMode(s.plan?.covers === 'group' ? 'group' : 'pt');
        setTrainerId(defaultTrainerId || s.trainerId || trainers[0]?.userId || '');
      },
      (e) => alive && setStatusError(e instanceof Error ? e.message : 'Abonnement laden mislukt.')
    );
    return () => {
      alive = false;
    };
  }, [open, userId, asStaff, defaultTrainerId, trainers]);

  // PT: vrije weekmomenten bij de trainer, opnieuw bij een andere trainer of duur.
  useEffect(() => {
    if (!open || !status || mode !== 'pt') return;
    if (!asStaff && !status.trainerId) return;
    let alive = true;
    setDays(null);
    setDaysError(null);
    setSlot(null);
    getWeeklyPtOptions({ ...(asStaff ? { userId, trainerId } : {}), duration }).then(
      (r) => {
        if (!alive) return;
        const sorted = [...r.days].sort((a, b) => WEEK_ORDER.indexOf(a.weekday) - WEEK_ORDER.indexOf(b.weekday));
        setDays(sorted);
        setWeekday(sorted[0]?.weekday ?? null);
      },
      (e) => alive && setDaysError(e instanceof Error ? e.message : 'Momenten laden mislukt.')
    );
    return () => {
      alive = false;
    };
  }, [open, status, mode, asStaff, userId, trainerId, duration]);

  const plan = status?.plan ?? null;
  const covers = plan?.covers ?? 'all';
  const limit = plan?.perWeek ?? null;
  const taken = (status?.used ?? 0) + (status?.pending ?? 0);
  const full = limit != null && taken >= limit;
  // Wat het abonnement toestaat; staf mag alles (met waarschuwing).
  const allowed = (m: Mode) => covers === 'all' || covers === m;
  const memberBlocked = !asStaff && (!plan || full || !allowed(mode));

  const groupOptions = useMemo(
    () =>
      types
        .filter((ct) => !isPtKind(ct.sessionKind))
        .flatMap((ct) =>
          ct.schedule.map((sl) => ({
            key: `${ct.id}|${sl.weekday}|${sl.startTime}`,
            classTypeId: ct.id,
            weekday: sl.weekday,
            startTime: sl.startTime,
            label: `${WEEKDAY_SHORT[sl.weekday]} ${sl.startTime}–${sl.endTime} · ${ct.name}`,
          }))
        )
        .sort((a, b) => WEEK_ORDER.indexOf(a.weekday) - WEEK_ORDER.indexOf(b.weekday) || a.startTime.localeCompare(b.startTime)),
    [types]
  );
  const chosenGroup = groupOptions.find((o) => o.key === groupKey) ?? null;
  const times = days?.find((d) => d.weekday === weekday)?.times ?? [];

  const submit = async () => {
    setSaving(true);
    try {
      if (mode === 'pt' && slot) {
        if (asStaff) {
          const r = await addPersonalSlot({ userId, weekday: slot.weekday, startTime: slot.startTime, endTime: slot.endTime, trainerId: trainerId || null, startDate });
          notify.success(`Vast PT-moment: elke ${WEEKDAY_LONG[slot.weekday]} ${slot.startTime}. ${describeStandingResult(r)}`);
        } else {
          await requestStandingPt({ weekday: slot.weekday, startTime: slot.startTime, endTime: slot.endTime, startDate });
          notify.success(`Aangevraagd: elke ${WEEKDAY_LONG[slot.weekday]} ${slot.startTime}. Je trainer bevestigt het; je krijgt een melding.`);
        }
      } else if (mode === 'group' && chosenGroup) {
        const r = await addStandingBooking({
          classTypeId: chosenGroup.classTypeId,
          weekday: chosenGroup.weekday,
          startTime: chosenGroup.startTime,
          startDate,
          ...(asStaff ? { userId } : {}),
        });
        notify.success(describeStandingResult(r));
      }
      onDone();
      onClose();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Inplannen mislukt.');
    } finally {
      setSaving(false);
    }
  };

  const canSubmit = !saving && !memberBlocked && !!startDate && (mode === 'pt' ? !!slot : !!chosenGroup);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Moment inplannen</DialogTitle>
      <DialogContent>
        {statusError && <Alert severity="error">{statusError}</Alert>}
        {!status && !statusError && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress size={24} />
          </Box>
        )}
        {status && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* Het abonnement bepaalt wat er kan. */}
            {plan ? (
              <Alert severity={full ? 'warning' : 'info'} icon={false}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {plan.name}
                </Typography>
                <Typography variant="body2">
                  {COVERS_LABEL[plan.covers]} · {limit == null ? 'geen limiet' : `${limit}x per week`}. Ingepland: {status.used}
                  {limit != null ? ` van ${limit}` : ''}
                  {status.pending ? ` (+${status.pending} aangevraagd)` : ''}.
                </Typography>
                {full && (
                  <Typography variant="body2" sx={{ mt: 0.5 }}>
                    {asStaff
                      ? 'Het abonnement is vol. Je kunt toch een moment inplannen; dat gaat boven het abonnement uit.'
                      : 'Je hebt alle momenten van je abonnement ingepland. Stop eerst een vast moment, of kies een groter abonnement.'}
                  </Typography>
                )}
              </Alert>
            ) : (
              <Alert severity="warning">
                {asStaff
                  ? 'Dit lid heeft geen abonnement. Je kunt toch een vast moment inplannen; kies anders eerst een abonnement.'
                  : 'Je hebt nog geen abonnement. Kies er een onder Abonnement; daarna plan je hier je vaste momenten.'}
              </Alert>
            )}

            {(asStaff || (plan && covers === 'all')) && (
              <ToggleButtonGroup size="small" exclusive value={mode} onChange={(_, v: Mode | null) => v && setMode(v)}>
                <ToggleButton value="pt">Personal training</ToggleButton>
                <ToggleButton value="group">Groepsles</ToggleButton>
              </ToggleButtonGroup>
            )}
            {asStaff && plan && !allowed(mode) && (
              <Alert severity="warning">Dit valt niet onder het abonnement ({COVERS_LABEL[plan.covers].toLowerCase()}). Je kunt het toch inplannen.</Alert>
            )}

            {mode === 'pt' && (
              <>
                {asStaff ? (
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '2fr 1fr' }, gap: 2 }}>
                    <TextField select size="small" label="Trainer" value={trainerId} onChange={(e) => setTrainerId(e.target.value)} fullWidth>
                      {trainers.map((tr) => (
                        <MenuItem key={tr.userId} value={tr.userId}>
                          {tr.name}
                        </MenuItem>
                      ))}
                    </TextField>
                    <TextField select size="small" label="Duur" value={duration} onChange={(e) => setDuration(Number(e.target.value))} fullWidth>
                      {DURATIONS.map((d) => (
                        <MenuItem key={d} value={d}>
                          {d} min
                        </MenuItem>
                      ))}
                    </TextField>
                  </Box>
                ) : (
                  !status.trainerId && <Alert severity="info">Je hebt nog geen vaste trainer. Vraag de studio om er een te koppelen.</Alert>
                )}
                {daysError && <Alert severity="error">{daysError}</Alert>}
                {!days && !daysError && (asStaff || status.trainerId) && (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                    <CircularProgress size={20} />
                  </Box>
                )}
                {days && days.length === 0 && <Alert severity="info">De trainer heeft geen vrije weekmomenten binnen zijn beschikbaarheid.</Alert>}
                {days && days.length > 0 && (
                  <>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      {days.map((d) => (
                        <Chip
                          key={d.weekday}
                          label={WEEKDAY_LONG[d.weekday]}
                          color={d.weekday === weekday ? 'primary' : 'default'}
                          variant={d.weekday === weekday ? 'filled' : 'outlined'}
                          onClick={() => setWeekday(d.weekday)}
                        />
                      ))}
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      {times.map((t) => {
                        const on = slot?.weekday === t.weekday && slot.startTime === t.startTime;
                        return (
                          <Chip
                            key={t.startTime}
                            label={`${t.startTime}–${t.endTime}${t.adjacent ? ' · sluit aan' : ''}`}
                            color={on ? 'primary' : 'default'}
                            variant={on ? 'filled' : 'outlined'}
                            onClick={() => setSlot(t)}
                          />
                        );
                      })}
                    </Box>
                  </>
                )}
              </>
            )}

            {mode === 'group' &&
              (groupOptions.length === 0 ? (
                <Alert severity="info">Er zijn nog geen groepslessen met een vast weekmoment (Beheer → Lessoorten).</Alert>
              ) : (
                <TextField select size="small" label="Groepsles" value={groupKey} onChange={(e) => setGroupKey(e.target.value)} fullWidth>
                  {groupOptions.map((o) => (
                    <MenuItem key={o.key} value={o.key}>
                      {o.label}
                    </MenuItem>
                  ))}
                </TextField>
              ))}

            <TextField
              size="small"
              label="Vanaf"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              inputProps={{ min: todayIso() }}
              sx={{ maxWidth: 220 }}
            />
            {!asStaff && mode === 'pt' && (
              <Typography variant="caption" color="text.secondary">
                Je trainer bevestigt het moment; daarna word je elke week automatisch ingeschreven.
              </Typography>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Annuleren</Button>
        <Button variant="contained" disableElevation disabled={!canSubmit} onClick={() => void submit()}>
          {saving ? 'Bezig…' : asStaff || mode === 'group' ? 'Vastzetten' : 'Aanvragen'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
