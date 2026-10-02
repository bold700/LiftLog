/**
 * Beheer → lid → Samenvoegen: twee accounts van dezelfde persoon (bijv. een account dat de studio
 * aanmaakte en een account waarmee de persoon zelf inlogt) worden één. Eerst kiezen welk account
 * blijft (daarmee logt de persoon in), dan een overzicht van wat overgaat, dan pas samenvoegen.
 */
import { useEffect, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Radio,
  RadioGroup,
  TextField,
  Typography,
} from '@mui/material';
import { useAuth } from '../../context/AuthContext';
import { useNotify } from '../../context/NotifyContext';
import { mergeAccounts, previewMerge, type MergeResult } from '../../services/adminAccountService';
import type { Profile } from '../../types';

const LABELS: Record<string, string> = {
  logs: 'trainingen gelogd',
  checkins: 'check-ins',
  nutritionLogs: 'voedingsregistraties',
  measurements: 'metingen',
  workoutRequests: 'workoutverzoeken',
  memberships: 'abonnementen',
  charges: 'facturen',
  creditLedger: 'creditmutaties',
  rescheduleRequests: 'verzoeken',
  mollieCheckouts: 'betalingen',
  bookings: 'boekingen',
  duplicateBookings: 'dubbele boekingen (vervallen)',
  standingBookings: 'vaste afspraken',
  duplicateStanding: 'dubbele vaste afspraken (vervallen)',
  personalSlots: 'PT-momenten',
  personalClasses: 'PT-lessen op het rooster',
  groups: 'groepen',
  workouts: 'workouts',
  sessions: 'groepssessies',
  messages: 'berichten',
  payment: 'betaalgegevens (Mollie)',
  profileFields: 'profielvelden aangevuld',
};

const SINGULAR: Record<string, string> = {
  logs: 'training gelogd',
  checkins: 'check-in',
  nutritionLogs: 'voedingsregistratie',
  measurements: 'meting',
  workoutRequests: 'workoutverzoek',
  memberships: 'abonnement',
  charges: 'factuur',
  creditLedger: 'creditmutatie',
  rescheduleRequests: 'verzoek',
  mollieCheckouts: 'betaling',
  bookings: 'boeking',
  duplicateBookings: 'dubbele boeking (vervalt)',
  standingBookings: 'vaste afspraak',
  duplicateStanding: 'dubbele vaste afspraak (vervalt)',
  personalSlots: 'PT-moment',
  personalClasses: 'PT-les op het rooster',
  groups: 'groep',
  workouts: 'workout',
  sessions: 'groepssessie',
  messages: 'bericht',
  profileFields: 'profielveld aangevuld',
};

const nameOf = (p: Pick<Profile, 'displayName' | 'email'>) => p.displayName?.trim() || p.email || 'Lid';
const signInLabel = (v: string | null | undefined) =>
  v ? `laatst ingelogd ${new Date(v).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}` : 'nooit ingelogd';

export function MergeMembersDialog({
  target,
  members,
  onClose,
  onMerged,
}: {
  target: Profile | null;
  members: Profile[];
  onClose: () => void;
  /** Na samenvoegen: het account dat bleef. */
  onMerged: (keepUid: string) => void;
}) {
  const auth = useAuth();
  const notify = useNotify();
  const [other, setOther] = useState<Profile | null>(null);
  const [keepUid, setKeepUid] = useState('');
  const [preview, setPreview] = useState<MergeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setOther(null);
    setKeepUid('');
    setPreview(null);
    setError(null);
    setSure(false);
  }, [target]);

  const fromUid = other && keepUid ? (keepUid === target?.userId ? other.userId : target?.userId ?? '') : '';

  // Voorbeeld ophalen zodra beide accounts en de keuze er zijn (alleen opnieuw bij een andere keuze).
  const caller = auth?.user ?? null;
  const callerId = caller?.uid ?? '';
  useEffect(() => {
    if (!caller || !other || !keepUid || !fromUid) return;
    let alive = true;
    setPreview(null);
    setError(null);
    setSure(false);
    previewMerge(caller, keepUid, fromUid).then(
      (r) => alive && setPreview(r),
      (e) => alive && setError(e instanceof Error ? e.message : 'Voorbeeld ophalen mislukt.')
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callerId, other, keepUid, fromUid]);

  if (!target) return null;
  const candidates = members.filter((m) => m.userId !== target.userId);
  const keepName = keepUid === target.userId ? nameOf(target) : other ? nameOf(other) : '';

  const submit = async () => {
    if (!auth?.user || !fromUid) return;
    setBusy(true);
    try {
      await mergeAccounts(auth.user, keepUid, fromUid);
      notify.success(`Samengevoegd. ${keepName} heeft nu alles; het andere account is weg.`);
      onMerged(keepUid);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Samenvoegen mislukt.');
    } finally {
      setBusy(false);
    }
  };

  const counts = preview ? Object.entries(preview.counts).filter(([k, n]) => k !== 'credits' && n > 0) : [];

  return (
    <Dialog open onClose={() => !busy && onClose()} maxWidth="sm" fullWidth>
      <DialogTitle>Accounts samenvoegen</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, '&&': { pt: 1 } }}>
        <Typography variant="body2" color="text.secondary">
          Heeft {nameOf(target)} twee accounts? Kies het andere account. Alles komt bij één account: trainingen, metingen, boekingen, vaste afspraken,
          abonnement, facturen en credits.
        </Typography>
        <Autocomplete
          options={candidates}
          value={other}
          onChange={(_, v) => {
            setOther(v);
            setKeepUid(v ? target.userId : '');
          }}
          getOptionLabel={(m) => `${nameOf(m)}${m.email ? ` · ${m.email}` : ''}`}
          isOptionEqualToValue={(a, b) => a.userId === b.userId}
          renderInput={(params) => <TextField {...params} size="small" label="Ander account" />}
          noOptionsText="Geen lid gevonden"
        />

        {other && (
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
              Welk account blijft? Daarmee logt {nameOf(target).split(' ')[0]} voortaan in.
            </Typography>
            <RadioGroup value={keepUid} onChange={(e) => setKeepUid(e.target.value)}>
              {[target, other].map((p) => {
                const info = preview ? (preview.keep?.uid === p.userId ? preview.keep : preview.from) : null;
                return (
                  <FormControlLabel
                    key={p.userId}
                    value={p.userId}
                    control={<Radio size="small" />}
                    label={
                      <Box>
                        <Typography variant="body2">
                          {nameOf(p)} · {p.email || 'geen e-mail'}
                        </Typography>
                        {info && (
                          <Typography variant="caption" color="text.secondary">
                            {signInLabel(info.lastSignIn)}
                          </Typography>
                        )}
                      </Box>
                    }
                  />
                );
              })}
            </RadioGroup>
          </Box>
        )}

        {error && <Alert severity="error">{error}</Alert>}
        {other && !preview && !error && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}>
            <CircularProgress size={22} />
          </Box>
        )}
        {preview && (
          <Alert severity="info" icon={false}>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
              Gaat over naar {keepName}:
            </Typography>
            {counts.length === 0 && !preview.counts.credits ? (
              <Typography variant="body2">Geen gegevens; alleen het lege account verdwijnt.</Typography>
            ) : (
              <Typography variant="body2" component="div">
                {counts.map(([k, n]) => (
                  <div key={k}>
                    {n} {n === 1 ? (SINGULAR[k] ?? LABELS[k] ?? k) : (LABELS[k] ?? k)}
                  </div>
                ))}
                {preview.counts.credits ? <div>{preview.counts.credits} credits (opgeteld bij het saldo)</div> : null}
              </Typography>
            )}
          </Alert>
        )}
        {preview?.warnings.map((w) => (
          <Alert key={w} severity="warning">
            {w}
          </Alert>
        ))}
        {preview && (
          <FormControlLabel
            control={<Checkbox checked={sure} onChange={(e) => setSure(e.target.checked)} />}
            label={`Ik begrijp dat het andere account (${preview.from?.email || 'zonder e-mail'}) daarna weg is. Dit kan niet terug.`}
          />
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Annuleren
        </Button>
        <Button variant="contained" color="error" disableElevation disabled={!preview || !sure || busy} onClick={() => void submit()}>
          {busy ? 'Bezig…' : 'Samenvoegen'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
