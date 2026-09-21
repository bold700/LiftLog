/**
 * Een losse les op het rooster zetten vanuit Beheer (niet meer vanuit Lessen zelf).
 */
import { useEffect, useState } from 'react';
import { Box, Button, Dialog, DialogTitle, DialogContent, DialogActions, MenuItem, TextField } from '@mui/material';
import { useI18n } from '../../context/I18nContext';
import { useNotify } from '../../context/NotifyContext';
import { useProfile } from '../../context/ProfileContext';
import { createClass, newClassId } from '../../services/classService';
import { getClassTypes } from '../../services/classTypeService';
import { getOrg } from '../../services/orgService';
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
  const profile = useProfile();
  const [types, setTypes] = useState<ClassType[]>([]);
  const [rooms, setRooms] = useState<string[]>([]);
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
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    getClassTypes().then(setTypes).catch(() => setTypes([]));
    const orgId = profile?.activeOrgId;
    if (orgId) getOrg(orgId).then((org) => setRooms(org?.rooms ?? [])).catch(() => setRooms([]));
  }, [open, profile?.activeOrgId]);

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
    setDescription(ct.description ?? '');
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
        description: description.trim() || null,
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
          <TextField label={t('classTypes.room')} select value={room} onChange={(e) => setRoom(e.target.value)} size="small" fullWidth>
            <MenuItem value="">{t('classTypes.noRoom')}</MenuItem>
            {rooms.map((r) => (
              <MenuItem key={r} value={r}>
                {r}
              </MenuItem>
            ))}
          </TextField>
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
        <TextField
          label={t('classTypes.description')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          size="small"
          fullWidth
          multiline
          minRows={2}
          maxRows={4}
        />
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
