/**
 * Beheer → Lessoorten, naar het ontwerp "Class types": links de lijst (balkje, naam, "60 min ·
 * 8 personen · Kenny", creditschip), rechts het bewerkpaneel. Op de telefoon alleen de lijst;
 * tikken opent het paneel als dialoog. De knop "Nieuwe lessoort" staat in de kop van Beheer en
 * geeft via `createSignal` door dat er een lege lessoort open moet.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import { useI18n } from '../../context/I18nContext';
import { useNotify } from '../../context/NotifyContext';
import { useProfile } from '../../context/ProfileContext';
import { deleteClassType, getClassTypes, newClassTypeId, saveClassType } from '../../services/classTypeService';
import { getWorkoutsForUser } from '../../services/workoutFirestore';
import { NumberField } from '../NumberField';
import { designTokens } from '../../theme/designTokens';
import { addMinutes } from '../../utils/format';
import type { ClassScheduleSlot, ClassType, Profile, Schema } from '../../types';

/** Volgorde in de dropdown: maandag eerst, ook al is weekday 0 (zondag) in het datamodel. */
const WEEKDAY_ORDER: { weekday: number; key: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun' }[] = [
  { weekday: 1, key: 'mon' },
  { weekday: 2, key: 'tue' },
  { weekday: 3, key: 'wed' },
  { weekday: 4, key: 'thu' },
  { weekday: 5, key: 'fri' },
  { weekday: 6, key: 'sat' },
  { weekday: 0, key: 'sun' },
];

interface ClassTypesPanelProps {
  /** Trainers en beheerders van de studio, voor "Vaste trainer". */
  staff: Profile[];
  /** Telt op bij elke klik op "Nieuwe lessoort" in de kop. */
  createSignal: number;
}

interface Draft {
  id: string;
  name: string;
  durationMin: string;
  capacity: string;
  creditCost: string;
  defaultTrainerId: string;
  schemaId: string;
  schedule: ClassScheduleSlot[];
  createdAt?: string;
}

const emptyDraft = (): Draft => ({ id: newClassTypeId(), name: '', durationMin: '60', capacity: '8', creditCost: '1', defaultTrainerId: '', schemaId: '', schedule: [] });
const toDraft = (c: ClassType): Draft => ({
  id: c.id,
  name: c.name,
  durationMin: String(c.durationMin),
  capacity: c.capacity == null ? '' : String(c.capacity),
  creditCost: String(c.creditCost),
  defaultTrainerId: c.defaultTrainerId ?? '',
  schemaId: c.schemaId ?? '',
  schedule: c.schedule,
  createdAt: c.createdAt || undefined,
});

export function ClassTypesPanel({ staff, createSignal }: ClassTypesPanelProps) {
  const { t } = useI18n();
  const notify = useNotify();
  const profile = useProfile();
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up('md'));

  const [types, setTypes] = useState<ClassType[]>([]);
  const [schemas, setSchemas] = useState<Schema[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const uid = profile?.profile?.userId;
      const role = profile?.profile?.role ?? 'sporter';
      const [list, mine] = await Promise.all([getClassTypes(), uid ? getWorkoutsForUser(uid, role).catch(() => []) : Promise.resolve([])]);
      setTypes(list);
      setSchemas(mine);
    } catch (e) {
      notify.error(t('classTypes.saveFailed'), e);
    } finally {
      setLoading(false);
    }
  }, [notify, profile?.profile?.userId, profile?.profile?.role, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // Kop-knop "Nieuwe lessoort": een lege lessoort openen.
  useEffect(() => {
    if (createSignal > 0) {
      setError(null);
      setDraft(emptyDraft());
    }
  }, [createSignal]);

  const staffName = useCallback(
    (id: string | null) => {
      if (!id) return t('classTypes.anyTrainer');
      const p = staff.find((s) => s.userId === id);
      return p ? p.displayName?.trim() || p.email || id : id;
    },
    [staff, t]
  );

  const summary = useCallback(
    (c: ClassType) =>
      [
        `${c.durationMin} min`,
        c.capacity == null ? t('classTypes.noLimit') : t('classTypes.people', { count: c.capacity }),
        staffName(c.defaultTrainerId),
      ].join(' · '),
    [staffName, t]
  );

  const isNew = useMemo(() => !!draft && !types.some((c) => c.id === draft.id), [draft, types]);

  const save = async () => {
    if (!draft) return;
    const name = draft.name.trim();
    const durationMin = Number(draft.durationMin);
    const capacity = draft.capacity.trim() === '' ? null : Number(draft.capacity);
    const creditCost = Number(draft.creditCost);
    if (!name) return setError(t('classTypes.nameRequired'));
    if (!Number.isInteger(durationMin) || durationMin <= 0) return setError(t('classTypes.durationInvalid'));
    if (draft.schedule.length > 0 && !draft.defaultTrainerId) return setError(t('classTypes.schedule.needsTrainer'));
    setSaving(true);
    setError(null);
    try {
      await saveClassType({
        id: draft.id,
        name,
        durationMin,
        capacity: capacity && Number.isInteger(capacity) && capacity > 0 ? capacity : null,
        creditCost: Number.isInteger(creditCost) && creditCost >= 0 ? creditCost : 0,
        defaultTrainerId: draft.defaultTrainerId || null,
        schemaId: draft.schemaId || null,
        schedule: draft.schedule,
        createdAt: draft.createdAt,
      });
      notify.success(t('classTypes.saved'));
      await load();
      if (!wide) setDraft(null);
    } catch (e) {
      notify.error(t('classTypes.saveFailed'), e);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await deleteClassType(draft.id);
      notify.success(t('classTypes.deleted'));
      setConfirmDelete(false);
      setDraft(null);
      await load();
    } catch (e) {
      notify.error(t('classTypes.saveFailed'), e);
    } finally {
      setSaving(false);
    }
  };

  const list = (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minWidth: 0 }}>
      {!loading && types.length === 0 && (
        <Box sx={{ p: 3, borderRadius: `${designTokens.cardRadius}px`, bgcolor: designTokens.cardBackground }}>
          <Typography color="text.secondary">{t('classTypes.empty')}</Typography>
        </Box>
      )}
      {types.map((c) => {
        const active = draft?.id === c.id;
        return (
          <Box
            key={c.id}
            role="button"
            tabIndex={0}
            onClick={() => {
              setError(null);
              setDraft(toDraft(c));
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') setDraft(toDraft(c));
            }}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              p: 1.5,
              pl: 2,
              borderRadius: `${designTokens.cardRadius}px`,
              bgcolor: active ? designTokens.cardBackgroundHigh : designTokens.cardBackground,
              cursor: 'pointer',
              '&:hover': { bgcolor: designTokens.cardBackgroundHigh },
            }}
          >
            <Box sx={{ width: 6, alignSelf: 'stretch', minHeight: 28, borderRadius: 3, bgcolor: designTokens.primary }} />
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="body2" fontWeight={600} noWrap>
                {c.name}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                {summary(c)}
              </Typography>
            </Box>
            <Chip
              size="small"
              label={c.creditCost === 0 ? t('classTypes.free') : t('classTypes.credits', { count: c.creditCost })}
              sx={{
                height: 22,
                fontSize: 12,
                bgcolor: c.creditCost === 0 ? designTokens.cardBackgroundHigh : designTokens.primaryContainer,
                color: c.creditCost === 0 ? 'text.primary' : designTokens.onPrimaryContainer,
              }}
            />
          </Box>
        );
      })}
    </Box>
  );

  const editor = draft && (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {error && (
        <Typography variant="body2" color="error">
          {error}
        </Typography>
      )}
      <TextField label={t('classTypes.name')} size="small" fullWidth autoFocus={isNew} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
        <NumberField label={t('classTypes.duration')} size="small" fullWidth value={draft.durationMin} onChange={(v) => setDraft({ ...draft, durationMin: v })} />
        <NumberField label={t('classTypes.capacity')} size="small" fullWidth value={draft.capacity} onChange={(v) => setDraft({ ...draft, capacity: v })} helperText={t('classTypes.capacityHelp')} />
      </Box>
      <TextField select label={t('classTypes.creditCost')} size="small" fullWidth value={draft.creditCost} onChange={(e) => setDraft({ ...draft, creditCost: e.target.value })}>
        {['0', '1', '2', '3', '4'].map((v) => (
          <MenuItem key={v} value={v}>
            {v === '0' ? t('classTypes.free') : t('classTypes.credits', { count: Number(v) })}
          </MenuItem>
        ))}
      </TextField>
      <TextField select label={t('classTypes.defaultTrainer')} size="small" fullWidth value={draft.defaultTrainerId} onChange={(e) => setDraft({ ...draft, defaultTrainerId: e.target.value })}>
        <MenuItem value="">{t('classTypes.anyTrainer')}</MenuItem>
        {staff.map((p) => (
          <MenuItem key={p.userId} value={p.userId}>
            {p.displayName?.trim() || p.email || p.userId}
          </MenuItem>
        ))}
      </TextField>
      <TextField select label={t('classTypes.linkedWorkout')} size="small" fullWidth value={draft.schemaId} onChange={(e) => setDraft({ ...draft, schemaId: e.target.value })}>
        <MenuItem value="">{t('classTypes.noWorkout')}</MenuItem>
        {schemas.map((s) => (
          <MenuItem key={s.id} value={s.id}>
            {s.name}
          </MenuItem>
        ))}
      </TextField>

      <Box sx={{ pt: 1, borderTop: `1px solid ${designTokens.cardBorder}` }}>
        <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.5 }}>
          {t('classTypes.schedule.title')}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
          {t('classTypes.schedule.help')}
        </Typography>
        {!draft.defaultTrainerId && (
          <Typography variant="caption" color="warning.main" sx={{ display: 'block', mb: 1.5 }}>
            {t('classTypes.schedule.needsTrainer')}
          </Typography>
        )}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 1.5 }}>
          {draft.schedule.map((slot, i) => (
            <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <TextField
                select
                size="small"
                value={slot.weekday}
                onChange={(e) => {
                  const schedule = draft.schedule.map((s, j) => (j === i ? { ...s, weekday: Number(e.target.value) } : s));
                  setDraft({ ...draft, schedule });
                }}
                sx={{ flex: 1 }}
              >
                {WEEKDAY_ORDER.map((w) => (
                  <MenuItem key={w.weekday} value={w.weekday}>
                    {t(`classTypes.schedule.weekdayLabels.${w.key}`)}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                type="time"
                size="small"
                label={t('classTypes.schedule.time')}
                value={slot.startTime}
                onChange={(e) => {
                  const schedule = draft.schedule.map((s, j) => (j === i ? { ...s, startTime: e.target.value } : s));
                  setDraft({ ...draft, schedule });
                }}
                InputLabelProps={{ shrink: true }}
                sx={{ width: 120 }}
              />
              <Typography variant="body2" color="text.secondary" sx={{ minWidth: 70 }}>
                {t('classTypes.schedule.endsAt', { time: addMinutes(slot.startTime, Number(draft.durationMin) || 60) })}
              </Typography>
              <IconButton
                size="small"
                aria-label={t('classTypes.schedule.removeSlot')}
                onClick={() => setDraft({ ...draft, schedule: draft.schedule.filter((_, j) => j !== i) })}
              >
                <DeleteOutlineRoundedIcon fontSize="small" />
              </IconButton>
            </Box>
          ))}
        </Box>
        <Button
          size="small"
          startIcon={<AddRoundedIcon />}
          disabled={!draft.defaultTrainerId}
          onClick={() => setDraft({ ...draft, schedule: [...draft.schedule, { weekday: 1, startTime: '19:00' }] })}
        >
          {t('classTypes.schedule.add')}
        </Button>
      </Box>

      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', pt: 0.5 }}>
        <Button variant="contained" disableElevation onClick={() => void save()} disabled={saving}>
          {saving ? t('common.saving') : t('common.save')}
        </Button>
        {!isNew && (
          <Button color="error" onClick={() => setConfirmDelete(true)} disabled={saving}>
            {t('classTypes.delete')}
          </Button>
        )}
      </Box>
    </Box>
  );

  const confirm = (
    <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} maxWidth="xs" fullWidth>
      <DialogTitle>{t('classTypes.delete')}</DialogTitle>
      <DialogContent>
        <Typography variant="body2">{t('classTypes.deleteConfirm', { name: draft?.name ?? '' })}</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setConfirmDelete(false)} disabled={saving}>
          {t('common.cancel')}
        </Button>
        <Button color="error" variant="contained" onClick={() => void remove()} disabled={saving}>
          {t('classTypes.delete')}
        </Button>
      </DialogActions>
    </Dialog>
  );

  if (!wide) {
    return (
      <>
        {list}
        <Dialog open={!!draft} onClose={() => setDraft(null)} fullScreen>
          <DialogTitle>{isNew ? t('classTypes.newType') : draft?.name}</DialogTitle>
          {/* Eigen Box voor de ruimte: MUI zet padding-top van DialogContent na een titel op 0, en dan
              valt het label van het eerste veld half weg. */}
          <DialogContent>
            <Box sx={{ pt: 1.5 }}>{editor}</Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDraft(null)}>{t('common.cancel')}</Button>
          </DialogActions>
        </Dialog>
        {confirm}
      </>
    );
  }

  return (
    <Box sx={{ display: 'flex', gap: 2.5, alignItems: 'flex-start' }}>
      {list}
      <Box sx={{ width: 400, flexShrink: 0, p: 3, borderRadius: `${designTokens.cardRadius}px`, bgcolor: designTokens.cardBackground, position: 'sticky', top: 24 }}>
        {draft ? (
          <>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
              {isNew ? t('classTypes.newType') : draft.name || t('classTypes.classType')}
            </Typography>
            {editor}
          </>
        ) : (
          <Typography color="text.secondary">{t('classTypes.pickToEdit')}</Typography>
        )}
      </Box>
      {confirm}
    </Box>
  );
}
