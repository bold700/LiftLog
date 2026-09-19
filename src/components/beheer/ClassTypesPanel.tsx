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
  MenuItem,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { useI18n } from '../../context/I18nContext';
import { useNotify } from '../../context/NotifyContext';
import { useProfile } from '../../context/ProfileContext';
import { deleteClassType, getClassTypes, newClassTypeId, saveClassType } from '../../services/classTypeService';
import { getWorkoutsForUser } from '../../services/workoutFirestore';
import { NumberField } from '../NumberField';
import { designTokens } from '../../theme/designTokens';
import type { ClassType, Profile, Schema } from '../../types';

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
  createdAt?: string;
}

const emptyDraft = (): Draft => ({ id: newClassTypeId(), name: '', durationMin: '60', capacity: '8', creditCost: '1', defaultTrainerId: '', schemaId: '' });
const toDraft = (c: ClassType): Draft => ({
  id: c.id,
  name: c.name,
  durationMin: String(c.durationMin),
  capacity: c.capacity == null ? '' : String(c.capacity),
  creditCost: String(c.creditCost),
  defaultTrainerId: c.defaultTrainerId ?? '',
  schemaId: c.schemaId ?? '',
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
          <DialogContent sx={{ pt: 1 }}>{editor}</DialogContent>
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
