/**
 * Ander moment kiezen na afmelden van een PT-moment. Bovenaan de momenten die aansluiten op andere
 * lessen van de trainer (zo vult de trainer hele dagdelen), daarna per dag alle vrije tijden binnen
 * zijn beschikbaarheid. Een sporter vraagt aan en de trainer bevestigt; staf plant meteen in.
 */
import { useEffect, useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { useNotify } from '../context/NotifyContext';
import { moveOccurrence } from '../services/classService';
import {
  getRescheduleOptions,
  requestReschedule,
  rescheduleDayLabel,
  type RescheduleOptions,
  type RescheduleTime,
} from '../services/rescheduleService';

interface Props {
  /** De afgemelde les; null = dicht. */
  classId: string | null;
  /** Staf plant in voor een lid (meteen vast); anders vraagt de sporter aan. */
  staff?: boolean;
  /** Naam van het lid (bij staf). */
  memberName?: string;
  /** Staf verzet een afspraak die nog geboekt staat: credit terug, nieuw moment meteen vast. */
  moveBookingId?: string | null;
  onClose: () => void;
  onDone?: () => void;
}

const sameSlot = (a: RescheduleTime | null, b: RescheduleTime) => !!a && a.date === b.date && a.startTime === b.startTime;

export function RescheduleDialog({ classId, staff = false, memberName, moveBookingId = null, onClose, onDone }: Props) {
  const notify = useNotify();
  const [options, setOptions] = useState<RescheduleOptions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [picked, setPicked] = useState<RescheduleTime | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!classId) return;
    let cancelled = false;
    setOptions(null);
    setError(null);
    setPicked(null);
    getRescheduleOptions(classId).then(
      (r) => {
        if (cancelled) return;
        setOptions(r);
        setDay(r.days[0]?.date ?? null);
      },
      (e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Momenten laden mislukt.');
      }
    );
    return () => {
      cancelled = true;
    };
  }, [classId]);

  const submit = async () => {
    if (!classId || !picked) return;
    setSaving(true);
    try {
      const r = moveBookingId
        ? { ...(await moveOccurrence(moveBookingId, picked.date, picked.startTime)), status: 'approved' as const }
        : await requestReschedule(classId, picked.date, picked.startTime);
      const when = `${rescheduleDayLabel(picked.date)} ${picked.startTime}`;
      notify?.success(
        r.status === 'approved'
          ? `Ingepland op ${when}.`
          : `Aangevraagd voor ${when}. Je trainer bevestigt het; je krijgt een melding.`
      );
      onDone?.();
      onClose();
    } catch (e) {
      notify?.error(e instanceof Error ? e.message : 'Aanvragen mislukt.');
    } finally {
      setSaving(false);
    }
  };

  const chip = (t: RescheduleTime, showDay: boolean) => (
    <Chip
      key={`${t.date}_${t.startTime}`}
      label={`${showDay ? `${rescheduleDayLabel(t.date)} ` : ''}${t.startTime}–${t.endTime}${!showDay && t.adjacent ? ' · sluit aan' : ''}`}
      color={sameSlot(picked, t) ? 'primary' : 'default'}
      variant={sameSlot(picked, t) ? 'filled' : 'outlined'}
      onClick={() => setPicked(t)}
    />
  );

  const times = options?.days.find((d) => d.date === day)?.times ?? [];

  return (
    <Dialog open={!!classId} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{moveBookingId ? 'Afspraak verzetten' : 'Ander moment kiezen'}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {moveBookingId
            ? `Verzet deze afspraak${memberName ? ` van ${memberName}` : ''}. De credit van de oude afspraak komt terug en het nieuwe moment staat meteen vast.`
            : staff
            ? `Kies een nieuw moment${memberName ? ` voor ${memberName}` : ''}. Het staat meteen vast; de credit gaat eraf zoals bij boeken.`
            : 'Je credit staat weer op je saldo. Kies een nieuw moment bij je trainer; die bevestigt het.'}
        </Typography>
        {error && <Alert severity="error">{error}</Alert>}
        {!options && !error && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress size={24} />
          </Box>
        )}
        {options && options.days.length === 0 && (
          <Alert severity="info">Er zijn de komende twee weken geen vrije momenten bij de trainer. Neem contact op met de studio.</Alert>
        )}
        {options && options.adjacent.length > 0 && (
          <Box sx={{ mb: 2.5 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Sluit aan op andere lessen
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>{options.adjacent.map((t) => chip(t, true))}</Box>
          </Box>
        )}
        {options && options.days.length > 0 && (
          <>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Alle momenten
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 1, mb: 1.5 }}>
              {options.days.map((d) => (
                <Chip
                  key={d.date}
                  label={rescheduleDayLabel(d.date)}
                  color={d.date === day ? 'primary' : 'default'}
                  variant={d.date === day ? 'filled' : 'outlined'}
                  onClick={() => setDay(d.date)}
                  sx={{ flexShrink: 0 }}
                />
              ))}
            </Box>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>{times.map((t) => chip(t, false))}</Box>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Niet nu</Button>
        <Button variant="contained" disableElevation disabled={!picked || saving} onClick={() => void submit()}>
          {saving ? 'Bezig…' : picked ? `${staff ? 'Inplannen' : 'Aanvragen'}: ${rescheduleDayLabel(picked.date)} ${picked.startTime}` : staff ? 'Inplannen' : 'Aanvragen'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
