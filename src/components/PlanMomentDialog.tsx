/**
 * Moment inplannen, zoals een afspraak in Google Agenda: datum, tijd en herhaling ("Niet herhaald"
 * of "Elke week op …"). Het abonnement geeft richting; de trainer beslist.
 *
 * - PT: alleen vrije tijden bij de trainer (binnen zijn beschikbaarheid, aansluitend op andere
 *   lessen gemarkeerd). Staf zet het meteen vast; een sporter vraagt aan en de trainer keurt goed.
 *   Niet herhaald = één losse afspraak (tot vier weken vooruit); elke week = een vast PT-moment.
 * - Groepsles: een les uit het rooster op die dag. Niet herhaald = gewoon inschrijven; elke week =
 *   vaste groepsles op dat weekmoment.
 * - Een sporter plant niet meer vaste momenten in dan zijn abonnement toestaat (de server
 *   controleert dat ook); staf ziet een waarschuwing maar beslist zelf. Een losse afspraak kost
 *   gewoon een credit, ook als het abonnement vol is.
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
import { addPersonalSlot, addStandingBooking, bookClass, moveStandingPt, type StudioClass } from '../services/classService';
import {
  bookSinglePt,
  getPlanStatus,
  getSinglePtOptions,
  getWeeklyPtOptions,
  requestStandingPt,
  type PlanStatus,
} from '../services/planMomentService';
import { rescheduleDayLabel } from '../services/rescheduleService';
import { COVERS_LABEL, isPtKind } from '../utils/planCoverage';
import { describeStandingResult } from '../utils/standingSeries';
import { todayIso } from '../utils/format';
import type { ClassType } from '../types';

const WEEKDAY_LONG = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
const DURATIONS = [30, 45, 60, 90];

type Kind = 'pt' | 'group';
type Repeat = 'once' | 'weekly';

interface TimeOption {
  startTime: string;
  endTime: string;
  adjacent: boolean;
}

const weekdayOf = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

/** Eerstvolgende datum (vanaf `from`) op deze weekdag. */
const nextDateOn = (weekday: number, from: string) => {
  const [y, m, d] = from.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + ((weekday - dt.getUTCDay() + 7) % 7));
  return dt.toISOString().slice(0, 10);
};

interface Props {
  open: boolean;
  userId: string;
  asStaff: boolean;
  /** Lessoorten van de studio (zonder privé): de weekmomenten van de groepslessen. */
  types: ClassType[];
  /** Komende lessen van het rooster: om één groepsles te kiezen. */
  classes?: StudioClass[];
  /** Staf: trainers om uit te kiezen bij een PT-moment. */
  trainers: { userId: string; name: string }[];
  defaultTrainerId: string | null;
  /** Staf: de hele reeks van een vast PT-moment wijzigen (andere dag, tijd of trainer) in plaats van iets nieuws. */
  moveSeries?: { standingBookingId: string; classTypeId: string; label: string; trainerId: string | null; duration: number } | null;
  onClose: () => void;
  /** Na vastzetten of aanvragen: opnieuw laden. */
  onDone: () => void;
}

const NO_CLASSES: StudioClass[] = [];

export function PlanMomentDialog({ open, userId, asStaff, types, classes = NO_CLASSES, trainers, defaultTrainerId, moveSeries = null, onClose, onDone }: Props) {
  const notify = useNotify();
  const [status, setStatus] = useState<PlanStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>('pt');
  const [repeat, setRepeat] = useState<Repeat>('weekly');
  const [trainerId, setTrainerId] = useState('');
  const [duration, setDuration] = useState(60);
  const [date, setDate] = useState(todayIso());
  /** Zelf een datum gekozen: dan springen we niet meer vanzelf naar de eerste vrije dag. */
  const [dateTouched, setDateTouched] = useState(false);
  const [startTime, setStartTime] = useState('');
  const [classId, setClassId] = useState('');
  const [weekly, setWeekly] = useState<{ weekday: number; times: TimeOption[] }[] | null>(null);
  const [single, setSingle] = useState<{ date: string; times: TimeOption[] }[] | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const today = todayIso();

  // Bij openen: abonnement en wat er al staat.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setStatus(null);
    setStatusError(null);
    setStartTime('');
    setClassId('');
    setDate(todayIso());
    setDateTouched(false);
    getPlanStatus(asStaff ? userId : undefined).then(
      (s) => {
        if (!alive) return;
        setStatus(s);
        setKind(moveSeries || s.plan?.covers !== 'group' ? 'pt' : 'group');
        // Ruimte in het abonnement: standaard elke week. Vol of geen abonnement: één keer.
        const full = s.plan?.perWeek != null && s.used + s.pending >= s.plan.perWeek;
        setRepeat(moveSeries || (s.plan && !full) ? 'weekly' : 'once');
        setTrainerId(moveSeries?.trainerId || defaultTrainerId || s.trainerId || trainers[0]?.userId || '');
        if (moveSeries) setDuration(moveSeries.duration);
      },
      (e) => alive && setStatusError(e instanceof Error ? e.message : 'Abonnement laden mislukt.')
    );
    return () => {
      alive = false;
    };
  }, [open, userId, asStaff, defaultTrainerId, trainers, moveSeries]);

  // PT: vrije tijden bij de trainer; per weekdag (elke week) of per datum (één keer).
  const needsTrainer = kind === 'pt' && !!status && (asStaff || !!status.trainerId);
  useEffect(() => {
    if (!open || !needsTrainer) return;
    let alive = true;
    setOptionsError(null);
    const who = asStaff ? { userId, trainerId } : {};
    const fail = (e: unknown) => alive && setOptionsError(e instanceof Error ? e.message : 'Momenten laden mislukt.');
    if (repeat === 'weekly') {
      setWeekly(null);
      getWeeklyPtOptions({ ...who, duration, ...(moveSeries ? { ignoreClassTypeId: moveSeries.classTypeId } : {}) }).then(
        (r) => alive && setWeekly(r.days),
        fail
      );
    } else {
      setSingle(null);
      getSinglePtOptions({ ...who, duration }).then((r) => alive && setSingle(r.days), fail);
    }
    return () => {
      alive = false;
    };
  }, [open, needsTrainer, repeat, asStaff, userId, trainerId, duration, moveSeries]);

  const plan = status?.plan ?? null;
  const covers = plan?.covers ?? 'all';
  const limit = plan?.perWeek ?? null;
  const taken = (status?.used ?? 0) + (status?.pending ?? 0);
  const full = limit != null && taken >= limit;
  const allowed = (k: Kind) => covers === 'all' || covers === k;
  const weekday = weekdayOf(date);

  // Groepslessen uit het rooster (geen PT, geen privé, niet afgelast, nog niet begonnen).
  const groupClasses = useMemo(() => {
    const now = new Date();
    const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    return classes
      .filter((c) => !c.privateFor && !c.privateForGroup && !c.cancelledAt && !isPtKind(c.sessionKind))
      .filter((c) => c.date > today || (c.date === today && c.startTime > nowTime))
      .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));
  }, [classes, today]);
  const groupDates = useMemo(() => [...new Set(groupClasses.map((c) => c.date))], [groupClasses]);

  // Wat er op de gekozen dag kan.
  const ptTimes: TimeOption[] =
    repeat === 'weekly' ? (weekly?.find((d) => d.weekday === weekday)?.times ?? []) : (single?.find((d) => d.date === date)?.times ?? []);
  const groupOnDate = groupClasses.filter((c) => c.date === date);
  const chosenClass = groupOnDate.find((c) => c.id === classId) ?? null;
  const typeById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);
  const classHasWeekly = (c: StudioClass | null) =>
    !!c?.classTypeId && !!typeById.get(c.classTypeId)?.schedule.some((sl) => sl.weekday === weekdayOf(c.date) && sl.startTime === c.startTime);

  // Andere dagen met plek, als op deze dag niets kan (of om snel te springen).
  const freeDates = useMemo(
    () =>
      kind === 'group'
        ? groupDates
        : repeat === 'weekly'
          ? (weekly ?? []).map((d) => nextDateOn(d.weekday, today)).sort()
          : (single ?? []).map((d) => d.date),
    [kind, repeat, groupDates, weekly, single, today]
  );
  const loading = kind === 'pt' && needsTrainer && (repeat === 'weekly' ? !weekly : !single) && !optionsError;

  // Nog niet zelf gekozen en vandaag kan niets: naar de eerste dag met plek.
  useEffect(() => {
    if (dateTouched || loading || !freeDates.length) return;
    const has = kind === 'group' ? groupDates.includes(date) : ptTimes.length > 0;
    if (!has) setDate(freeDates[0]);
  }, [dateTouched, loading, freeDates, groupDates, kind, date, ptTimes.length]);

  // Tijd: de eerste die aansluit, anders de eerste vrije. Groepsles: de eerste van die dag.
  const timesKey = ptTimes.map((t) => t.startTime).join(',');
  useEffect(() => {
    if (kind !== 'pt') return;
    if (ptTimes.some((t) => t.startTime === startTime)) return;
    setStartTime((ptTimes.find((t) => t.adjacent) ?? ptTimes[0])?.startTime ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, timesKey]);
  const groupKey = groupOnDate.map((c) => c.id).join(',');
  useEffect(() => {
    if (kind !== 'group') return;
    if (groupOnDate.some((c) => c.id === classId)) return;
    setClassId(groupOnDate[0]?.id ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, groupKey]);

  const chosenTime = ptTimes.find((t) => t.startTime === startTime) ?? null;
  const weeklyPossible = moveSeries ? true : kind === 'pt' || classHasWeekly(chosenClass);
  const effectiveRepeat: Repeat = moveSeries ? 'weekly' : kind === 'group' && !weeklyPossible ? 'once' : repeat;
  // Een sporter plant geen vaste momenten buiten zijn abonnement; een losse afspraak kan altijd.
  const memberBlocked = !moveSeries && !asStaff && effectiveRepeat === 'weekly' && (!plan || full || !allowed(kind));
  const lastSingleDate = single?.length ? single[single.length - 1].date : undefined;

  const pickDate = (d: string) => {
    setDate(d);
    setDateTouched(true);
  };

  const submit = async () => {
    setSaving(true);
    try {
      const when = `${rescheduleDayLabel(date)} ${chosenTime ? `${chosenTime.startTime}–${chosenTime.endTime}` : ''}`.trim();
      if (moveSeries && chosenTime) {
        const r = await moveStandingPt({
          standingBookingId: moveSeries.standingBookingId,
          weekday,
          startTime: chosenTime.startTime,
          endTime: chosenTime.endTime,
          trainerId: trainerId || null,
          fromDate: date,
        });
        notify.success(
          `Reeks gewijzigd: elke ${WEEKDAY_LONG[weekday]} ${chosenTime.startTime}.${r.refunded ? ` ${r.refunded} oude afspra${r.refunded === 1 ? 'ak' : 'ken'} afgemeld, credit terug.` : ''}`
        );
      } else if (kind === 'pt' && chosenTime && effectiveRepeat === 'weekly') {
        if (asStaff) {
          const r = await addPersonalSlot({ userId, weekday, startTime: chosenTime.startTime, endTime: chosenTime.endTime, trainerId: trainerId || null, startDate: date });
          notify.success(`Vast PT-moment: elke ${WEEKDAY_LONG[weekday]} ${chosenTime.startTime}. ${describeStandingResult(r)}`);
        } else {
          await requestStandingPt({ weekday, startTime: chosenTime.startTime, endTime: chosenTime.endTime, startDate: date });
          notify.success(`Aangevraagd: elke ${WEEKDAY_LONG[weekday]} ${chosenTime.startTime}. Je trainer bevestigt het; je krijgt een melding.`);
        }
      } else if (kind === 'pt' && chosenTime) {
        const r = await bookSinglePt({ ...(asStaff ? { userId, trainerId } : {}), duration, date, startTime: chosenTime.startTime });
        notify.success(r.status === 'approved' ? `Ingepland: ${when}.` : `Aangevraagd: ${when}. Je trainer bevestigt het; je krijgt een melding.`);
      } else if (kind === 'group' && chosenClass && effectiveRepeat === 'weekly' && chosenClass.classTypeId) {
        const r = await addStandingBooking({
          classTypeId: chosenClass.classTypeId,
          weekday,
          startTime: chosenClass.startTime,
          startDate: date,
          ...(asStaff ? { userId } : {}),
        });
        notify.success(describeStandingResult(r));
      } else if (kind === 'group' && chosenClass) {
        const r = await bookClass(chosenClass.id, false, asStaff ? userId : undefined);
        notify.success(
          r.status === 'waitlist'
            ? `${chosenClass.title} zit vol: op de wachtlijst gezet.`
            : `Ingeschreven: ${chosenClass.title}, ${rescheduleDayLabel(chosenClass.date)} ${chosenClass.startTime}.`
        );
      }
      onDone();
      onClose();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Inplannen mislukt.');
    } finally {
      setSaving(false);
    }
  };

  const canSubmit = !saving && !memberBlocked && !!date && (kind === 'pt' ? !!chosenTime : !!chosenClass);
  const submitLabel = saving
    ? 'Bezig…'
    : moveSeries
      ? 'Wijzigen'
      : kind === 'pt' && !asStaff
        ? 'Aanvragen'
        : effectiveRepeat === 'weekly'
          ? 'Vastzetten'
          : kind === 'group'
            ? 'Inschrijven'
            : 'Inplannen';
  const otherDates = freeDates.filter((d) => d !== date).slice(0, 5);
  const nothingThisDay = !loading && (kind === 'pt' ? needsTrainer && ptTimes.length === 0 : groupOnDate.length === 0);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{moveSeries ? 'Reeks wijzigen' : 'Moment inplannen'}</DialogTitle>
      <DialogContent>
        {statusError && <Alert severity="error">{statusError}</Alert>}
        {!status && !statusError && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress size={24} />
          </Box>
        )}
        {status && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 0.5 }}>
            {moveSeries && (
              <Alert severity="info" icon={false}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {moveSeries.label}
                </Typography>
                <Typography variant="body2">
                  Kies de nieuwe dag en tijd. Vanaf de gekozen datum geldt het nieuwe moment; afspraken van de oude reeks vanaf die datum worden afgemeld
                  met de credit terug.
                </Typography>
              </Alert>
            )}
            {/* Het abonnement geeft richting. */}
            {moveSeries ? null : plan ? (
              <Alert severity={full && effectiveRepeat === 'weekly' ? 'warning' : 'info'} icon={false}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {plan.name}
                </Typography>
                <Typography variant="body2">
                  {COVERS_LABEL[plan.covers]} · {limit == null ? 'geen limiet' : `${limit}x per week`}. Vast ingepland: {status.used}
                  {limit != null ? ` van ${limit}` : ''}
                  {status.pending ? ` (+${status.pending} aangevraagd)` : ''}.
                </Typography>
                {full && effectiveRepeat === 'weekly' && (
                  <Typography variant="body2" sx={{ mt: 0.5 }}>
                    {asStaff
                      ? 'Het abonnement is vol. Kies "Niet herhaald" voor een losse afspraak, of zet het toch elke week vast (boven het abonnement uit).'
                      : 'Je vaste momenten zitten vol. Kies "Niet herhaald" voor een losse afspraak; die kost een credit.'}
                  </Typography>
                )}
              </Alert>
            ) : (
              <Alert severity={effectiveRepeat === 'weekly' ? 'warning' : 'info'}>
                {asStaff
                  ? 'Dit lid heeft geen abonnement. Een losse afspraak kost een credit; elke week kan ook, kies anders eerst een abonnement.'
                  : 'Je hebt nog geen abonnement. Een losse afspraak kost een credit; voor elke week kies je eerst een abonnement.'}
              </Alert>
            )}

            {!moveSeries && (
              <ToggleButtonGroup size="small" exclusive value={kind} onChange={(_, v: Kind | null) => v && setKind(v)}>
                <ToggleButton value="pt">Personal training</ToggleButton>
                <ToggleButton value="group">Groepsles</ToggleButton>
              </ToggleButtonGroup>
            )}
            {!moveSeries && asStaff && plan && effectiveRepeat === 'weekly' && !allowed(kind) && (
              <Alert severity="warning">Dit valt niet onder het abonnement ({COVERS_LABEL[plan.covers].toLowerCase()}). Je kunt het toch inplannen.</Alert>
            )}

            {kind === 'pt' &&
              (asStaff ? (
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
              ))}

            {/* Zoals Google Agenda: datum, tijd, herhaling op één regel. */}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1.3fr 1fr', sm: '1fr 1fr 1.4fr' }, gap: 2 }}>
              <TextField
                size="small"
                label={moveSeries ? 'Vanaf' : 'Datum'}
                type="date"
                value={date}
                onChange={(e) => e.target.value && pickDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                inputProps={{ min: today, ...(kind === 'pt' && effectiveRepeat === 'once' && lastSingleDate ? { max: lastSingleDate } : {}) }}
              />
              {kind === 'pt' ? (
                <TextField
                  select
                  size="small"
                  label="Tijd"
                  value={chosenTime ? startTime : ''}
                  onChange={(e) => setStartTime(e.target.value)}
                  disabled={loading || ptTimes.length === 0}
                  InputProps={loading ? { endAdornment: <CircularProgress size={16} sx={{ mr: 3 }} /> } : undefined}
                  SelectProps={{
                    // In het veld alleen de tijd (op de telefoon alleen de begintijd); "sluit aan" staat in de lijst.
                    renderValue: (v) => {
                      const t = ptTimes.find((x) => x.startTime === v);
                      return t ? (
                        <>
                          {t.startTime}
                          <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
                            –{t.endTime}
                          </Box>
                        </>
                      ) : null;
                    },
                  }}
                >
                  {ptTimes.map((t) => (
                    <MenuItem key={t.startTime} value={t.startTime}>
                      {t.startTime}–{t.endTime}
                      {t.adjacent ? ' · sluit aan' : ''}
                    </MenuItem>
                  ))}
                </TextField>
              ) : (
                <TextField
                  select
                  size="small"
                  label="Les"
                  value={chosenClass ? classId : ''}
                  onChange={(e) => setClassId(e.target.value)}
                  disabled={groupOnDate.length === 0}
                >
                  {groupOnDate.map((c) => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.startTime} · {c.title} ({c.bookedCount}/{c.capacity}){c.bookedCount >= c.capacity ? ' · vol' : ''}
                    </MenuItem>
                  ))}
                </TextField>
              )}
              <TextField
                select
                size="small"
                label="Herhaling"
                value={effectiveRepeat}
                onChange={(e) => setRepeat(e.target.value as Repeat)}
                disabled={!!moveSeries || !weeklyPossible}
                sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' } }}
              >
                <MenuItem value="once">Niet herhaald</MenuItem>
                <MenuItem value="weekly">Elke week op {WEEKDAY_LONG[weekday]}</MenuItem>
              </TextField>
            </Box>

            {optionsError && <Alert severity="error">{optionsError}</Alert>}
            {nothingThisDay && (
              <Typography variant="body2" color="text.secondary">
                {kind === 'pt'
                  ? effectiveRepeat === 'weekly'
                    ? `Op ${WEEKDAY_LONG[weekday]} is de trainer niet vrij.`
                    : 'Op deze dag is de trainer niet vrij.'
                  : 'Op deze dag is er geen groepsles.'}
                {otherDates.length === 0 && kind === 'pt' && effectiveRepeat === 'once' ? ' Losse afspraken kun je tot vier weken vooruit plannen.' : ''}
              </Typography>
            )}
            {otherDates.length > 0 && (nothingThisDay || kind === 'group') && (
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                <Typography variant="caption" color="text.secondary">
                  {kind === 'pt' ? 'Vrij op' : 'Ook lessen op'}
                </Typography>
                {otherDates.map((d) => (
                  <Chip
                    key={d}
                    size="small"
                    variant="outlined"
                    label={effectiveRepeat === 'weekly' && kind === 'pt' ? WEEKDAY_LONG[weekdayOf(d)] : rescheduleDayLabel(d)}
                    onClick={() => pickDate(d)}
                  />
                ))}
              </Box>
            )}
            {kind === 'group' && !moveSeries && chosenClass && !weeklyPossible && (
              <Typography variant="caption" color="text.secondary">
                Deze les heeft geen vast weekmoment; je schrijft je voor deze ene keer in.
              </Typography>
            )}
            {!asStaff && kind === 'pt' && (
              <Typography variant="caption" color="text.secondary">
                {effectiveRepeat === 'weekly'
                  ? 'Je trainer bevestigt het moment; daarna word je elke week automatisch ingeschreven.'
                  : 'Je trainer bevestigt de afspraak; de credit gaat eraf als hij bevestigt.'}
              </Typography>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Annuleren</Button>
        <Button variant="contained" disableElevation disabled={!canSubmit} onClick={() => void submit()}>
          {submitLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
