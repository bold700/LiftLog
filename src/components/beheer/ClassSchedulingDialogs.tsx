/**
 * Lessen inplannen en credits toekennen gebeurt vanuit Beheer (niet meer vanuit Lessen zelf):
 * een losse les op het rooster zetten, en credits bijboeken voor een sporter.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  MenuItem,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { useI18n } from '../../context/I18nContext';
import { useNotify } from '../../context/NotifyContext';
import { createClass, grantCredits, newClassId } from '../../services/classService';
import { getClassTypes } from '../../services/classTypeService';
import { segmentedToggleSx } from '../../theme/segmentedToggle';
import type { ClassType, Profile, SessionKind } from '../../types';

const SESSION_KIND_KEYS: SessionKind[] = ['1on1', 'duo', 'group', 'concept'];

const today = () => new Date().toISOString().slice(0, 10);

/** Een les op het rooster zetten. Bewust kort: titel, wanneer, hoeveel plekken, wat het kost. */
export function NewClassDialog({
  open,
  onClose,
  trainerId,
  staff,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  trainerId: string;
  staff: Profile[];
  onCreated: () => void;
}) {
  const notify = useNotify();
  const { t } = useI18n();
  const [types, setTypes] = useState<ClassType[]>([]);
  const [typeId, setTypeId] = useState('');
  const [title, setTitle] = useState('Small Group Training');
  const [date, setDate] = useState(today());
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [capacity, setCapacity] = useState('8');
  const [creditCost, setCreditCost] = useState('1');
  const [assignedTrainerId, setAssignedTrainerId] = useState(trainerId);
  const [room, setRoom] = useState('');
  const [sessionKind, setSessionKind] = useState<SessionKind>('group');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    getClassTypes().then(setTypes).catch(() => setTypes([]));
  }, [open]);

  const roomOptions = useMemo(() => Array.from(new Set(types.map((c) => c.room).filter((r): r is string => !!r))).sort(), [types]);

  // Lessoort gekozen: zelfde velden overnemen als in Beheer → Lessoorten (ook trainer en volledige
  // creditrange), zodat een losse les niet minder kan instellen dan een lessoort. Begin/eindtijd
  // blijft handmatig — die horen bij het moment, niet bij de lessoort.
  const pickType = (id: string) => {
    setTypeId(id);
    const ct = types.find((c) => c.id === id);
    if (!ct) return;
    setTitle(ct.name);
    setCapacity(ct.capacity == null ? '' : String(ct.capacity));
    setCreditCost(String(ct.creditCost));
    setAssignedTrainerId(ct.defaultTrainerId ?? trainerId);
    setRoom(ct.room ?? '');
    setSessionKind(ct.sessionKind);
  };

  const submit = async () => {
    setBusy(true);
    try {
      const chosen = types.find((c) => c.id === typeId) ?? null;
      // Geen limiet op de lessoort: het rooster vraagt toch een getal (de regels eisen dat).
      const plekken = capacity.trim() === '' && chosen?.capacity == null ? 999 : Number(capacity);
      const kosten = Number(creditCost);
      if (!Number.isInteger(plekken) || plekken < 1) throw new Error('Vul een geldig aantal plekken in.');
      if (!Number.isInteger(kosten) || kosten < 0) throw new Error('Vul een geldig aantal credits in.');

      await createClass({
        id: newClassId(),
        title: title.trim() || 'Les',
        date,
        startTime,
        endTime: endTime || null,
        trainerId: assignedTrainerId,
        capacity: plekken,
        creditCost: kosten,
        schemaId: chosen?.schemaId ?? null,
        classTypeId: chosen?.id ?? null,
        room: room.trim() || null,
        sessionKind,
      });
      notify?.success('Les staat op het rooster.');
      onCreated();
    } catch (e) {
      notify?.error(e instanceof Error ? e.message : 'Les toevoegen mislukt');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Les toevoegen</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, '&&': { pt: 1.5 } }}>
        {types.length > 0 && (
          <TextField label={t('classTypes.classType')} select value={typeId} onChange={(e) => pickType(e.target.value)} size="small">
            <MenuItem value="">{t('classTypes.looseClass')}</MenuItem>
            {types.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
              </MenuItem>
            ))}
          </TextField>
        )}
        <TextField label="Naam" value={title} onChange={(e) => setTitle(e.target.value)} size="small" />
        <TextField
          label="Datum"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          size="small"
          InputLabelProps={{ shrink: true }}
        />
        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField
            label="Van"
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            size="small"
            fullWidth
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Tot"
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            size="small"
            fullWidth
            InputLabelProps={{ shrink: true }}
          />
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField
            label="Plekken"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            size="small"
            fullWidth
            inputMode="numeric"
          />
          <TextField
            label="Credits"
            select
            value={creditCost}
            onChange={(e) => setCreditCost(e.target.value)}
            size="small"
            fullWidth
          >
            {['0', '1', '2', '3', '4'].map((v) => (
              <MenuItem key={v} value={v}>
                {v === '0' ? 'Gratis' : v}
              </MenuItem>
            ))}
          </TextField>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField label={t('classTypes.sessionKind')} select value={sessionKind} onChange={(e) => setSessionKind(e.target.value as SessionKind)} size="small" fullWidth>
            {SESSION_KIND_KEYS.map((k) => (
              <MenuItem key={k} value={k}>
                {t(`classTypes.sessionKinds.${k}`)}
              </MenuItem>
            ))}
          </TextField>
          <Autocomplete
            freeSolo
            size="small"
            fullWidth
            options={roomOptions}
            value={room}
            onInputChange={(_, v) => setRoom(v)}
            renderInput={(params) => <TextField {...params} label={t('classTypes.room')} />}
          />
        </Box>
        {staff.length > 0 && (
          <TextField label="Trainer" select value={assignedTrainerId} onChange={(e) => setAssignedTrainerId(e.target.value)} size="small" fullWidth>
            {staff.map((p) => (
              <MenuItem key={p.userId} value={p.userId}>
                {p.displayName?.trim() || p.email || p.userId}
              </MenuItem>
            ))}
          </TextField>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Annuleren
        </Button>
        <Button variant="contained" onClick={() => void submit()} disabled={busy}>
          Toevoegen
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Credits toekennen aan een sporter. Een strippenkaart in de app: de trainer boekt het bij,
 * de mutatie komt in het grootboek te staan zodat later te zien is waar een saldo vandaan komt.
 */
export function GrantCreditsDialog({
  open,
  onClose,
  sporters,
  onGranted,
}: {
  open: boolean;
  onClose: () => void;
  sporters: Profile[];
  onGranted: () => void;
}) {
  const notify = useNotify();
  const [userId, setUserId] = useState('');
  const [direction, setDirection] = useState<'toekennen' | 'aftrekken'>('toekennen');
  const [amount, setAmount] = useState('10');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const aantal = Number(amount);
      if (!userId) throw new Error('Kies een sporter.');
      if (!Number.isInteger(aantal) || aantal <= 0) throw new Error('Vul een heel, positief aantal credits in.');
      const delta = direction === 'aftrekken' ? -aantal : aantal;

      const result = await grantCredits(userId, delta, note.trim() || undefined);
      const naam = sporters.find((p) => p.userId === userId)?.displayName ?? 'de sporter';
      notify?.success(`${naam} heeft nu ${result.balance} credits.`);
      setNote('');
      onGranted();
    } catch (e) {
      notify?.error(e instanceof Error ? e.message : 'Credits aanpassen mislukt');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Credits aanpassen</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, '&&': { pt: 1.5 } }}>
        <TextField label="Sporter" select value={userId} onChange={(e) => setUserId(e.target.value)} size="small">
          {sporters.map((p) => (
            <MenuItem key={p.userId} value={p.userId}>
              {p.displayName || p.email || p.userId}
            </MenuItem>
          ))}
        </TextField>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={direction}
          onChange={(_, v: 'toekennen' | 'aftrekken' | null) => v && setDirection(v)}
          sx={segmentedToggleSx}
        >
          <ToggleButton value="toekennen">Toekennen</ToggleButton>
          <ToggleButton value="aftrekken">Aftrekken</ToggleButton>
        </ToggleButtonGroup>
        <TextField
          label="Aantal credits"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          size="small"
          inputMode="numeric"
          helperText={
            direction === 'aftrekken'
              ? 'Dit aantal wordt van het saldo afgehaald, bijvoorbeeld om een foutje recht te zetten.'
              : 'Dit aantal wordt bij het saldo opgeteld.'
          }
        />
        <TextField
          label="Notitie"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          size="small"
          placeholder="Bijvoorbeeld: 10-rittenkaart betaald"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Annuleren
        </Button>
        <Button variant="contained" color={direction === 'aftrekken' ? 'error' : 'primary'} onClick={() => void submit()} disabled={busy}>
          {direction === 'aftrekken' ? 'Aftrekken' : 'Toekennen'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
