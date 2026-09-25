/**
 * Wekelijkse check-in van de sporter: gewicht, hoe het ging, hoeveel je hebt getraind en een
 * toelichting. Eén formulier, tien seconden werk.
 *
 * Het gewicht wordt ook als meting vastgelegd, zodat de grafiek klopt zonder dubbel invoeren. De
 * rest komt als check-in bij het dossier, waar de trainer hem tegenkomt bij "Sinds de vorige keer".
 * Dit ging vroeger als bericht naar de trainer; dat postvak bestaat niet meer, want de app is geen
 * chat-app en dit zijn geen berichten maar cijfers.
 */
import { useState } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField } from '@mui/material';
import { NumberField } from './NumberField';
import { useNotify } from '../context/NotifyContext';
import { saveCheckin } from '../services/checkinService';
import { notifyUser } from '../services/pushService';
import { checkinRecipient } from '../utils/pushTargets';
import { emptyMeasurementFields, newMeasurementId, saveMeasurement } from '../services/measurementService';
import { FEELING_LABELS } from '../utils/trainingFeedback';
import type { Profile } from '../types';

const FEELINGS = [5, 4, 3, 2, 1] as const;

export function WeeklyCheckinDialog({
  open,
  onClose,
  onSaved,
  me,
}: {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  me: Profile;
}) {
  const notify = useNotify();
  const [weight, setWeight] = useState('');
  const [feeling, setFeeling] = useState('');
  const [sessions, setSessions] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const weightKg = weight.trim() ? Number(weight) : null;
      if (weightKg != null && !Number.isFinite(weightKg)) throw new Error('Vul een geldig gewicht in.');
      if (!feeling) throw new Error('Geef even aan hoe het ging.');

      // Gewicht ook als meting vastleggen: één invoer, op beide plekken bruikbaar.
      if (weightKg != null) {
        await saveMeasurement({
          ...emptyMeasurementFields(),
          id: newMeasurementId(),
          userId: me.userId,
          loggedBy: me.userId,
          trainerId: me.trainerId ?? null,
          date: new Date().toISOString().slice(0, 10),
          weightKg,
          note: 'Wekelijkse check-in',
        });
      }

      // Het aantal trainingen heeft geen eigen veld; bij de toelichting blijft het leesbaar en
      // gaat het niet verloren.
      const count = sessions.trim() ? Number(sessions) : null;
      const lines = [note.trim(), count != null && Number.isFinite(count) ? `${count}× getraind deze week.` : '']
        .filter(Boolean)
        .join('\n');

      const saved = await saveCheckin({
        userId: me.userId,
        loggedBy: me.userId,
        trainerId: me.trainerId ?? null,
        schemaId: null,
        schemaDayIndex: null,
        dayLabel: 'Wekelijkse check-in',
        feeling: Number(feeling) as 1 | 2 | 3 | 4 | 5,
        note: lines || null,
        handover: null,
        date: new Date().toISOString(),
      });
      const recipient = checkinRecipient(saved);
      if (recipient) void notifyUser('checkin', recipient, 'Wekelijkse check-in ingevuld');

      notify?.success('Check-in opgeslagen');
      setWeight('');
      setFeeling('');
      setSessions('');
      setNote('');
      onSaved?.();
      onClose();
    } catch (e) {
      notify?.error(e instanceof Error ? e.message : 'Check-in opslaan mislukt');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Wekelijkse check-in</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, '&&': { pt: 1.5 } }}>
        <NumberField
          label="Gewicht (kg)"
          decimal
          value={weight}
          onChange={setWeight}
          size="small"
          helperText="Wordt ook als meting opgeslagen."
        />
        <TextField label="Hoe ging het?" select value={feeling} onChange={(e) => setFeeling(e.target.value)} size="small">
          {FEELINGS.map((f) => (
            <MenuItem key={f} value={String(f)}>
              {f} — {FEELING_LABELS[f].toLowerCase()}
            </MenuItem>
          ))}
        </TextField>
        <NumberField
          label="Aantal trainingen deze week"
          value={sessions}
          onChange={setSessions}
          size="small"
        />
        <TextField
          label="Toelichting"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          multiline
          minRows={2}
          size="small"
          placeholder="Wat ging goed, waar liep je tegenaan?"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy} sx={{ textTransform: 'none', borderRadius: '24px' }}>
          Annuleren
        </Button>
        <Button
          variant="contained"
          onClick={() => void submit()}
          disabled={busy}
          sx={{ textTransform: 'none', borderRadius: '24px' }}
        >
          {busy ? 'Opslaan…' : 'Opslaan'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
