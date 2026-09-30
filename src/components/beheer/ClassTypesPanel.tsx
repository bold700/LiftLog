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
  Divider,
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
import { FullScreenDialogTitle } from './FullScreenDialogTitle';
import { useNotify } from '../../context/NotifyContext';
import { useProfile } from '../../context/ProfileContext';
import {
  checkSchedule,
  deleteClassType,
  generateClassOccurrencesNow,
  getClassTypes,
  newClassTypeId,
  pruneStaleClasses,
  saveClassType,
  type ScheduleCheck,
  type StaleClass,
} from '../../services/classTypeService';
import { ScheduleConflictNotice } from './ScheduleConflictNotice';
import { ScheduleConflictsOverview } from './ScheduleConflictsOverview';
import { getWorkoutsForUser } from '../../services/workoutFirestore';
import { getOrg, saveOrgRooms } from '../../services/orgService';
import { sortClassTypesByWeek } from '../../utils/classTypeOrder';
import { NumberField } from '../NumberField';
import { designTokens } from '../../theme/designTokens';
import type { ClassScheduleSlot, ClassType, Profile, Schema, SessionKind } from '../../types';

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

/** Vorm van de sessie (Figma-legenda "05 · Schedule"), voor filtering/kleur op het rooster. */
const SESSION_KINDS: SessionKind[] = ['1on1', 'duo', 'group', 'concept'];

interface ClassTypesPanelProps {
  /** Trainers en beheerders van de studio, voor "Vaste trainer". */
  staff: Profile[];
  /** Alle profielen van de studio: een vaste trainer die geen trainer meer is, houdt zo zijn naam. */
  profiles: Profile[];
  /** Profielen worden nog geladen: dan nog geen naam (en zeker geen gebruikers-id) tonen. */
  profilesLoading: boolean;
  /** Telt op bij elke klik op "Nieuwe lessoort" in de kop. */
  createSignal: number;
}

interface Draft {
  id: string;
  name: string;
  capacity: string;
  creditCost: string;
  defaultTrainerId: string;
  schemaId: string;
  schedule: ClassScheduleSlot[];
  room: string;
  sessionKind: SessionKind;
  description: string;
  createdAt?: string;
}

const emptyDraft = (): Draft => ({
  id: newClassTypeId(),
  name: '',
  capacity: '8',
  creditCost: '1',
  defaultTrainerId: '',
  schemaId: '',
  schedule: [],
  room: '',
  sessionKind: 'group',
  description: '',
});
const toDraft = (c: ClassType): Draft => ({
  id: c.id,
  name: c.name,
  capacity: c.capacity == null ? '' : String(c.capacity),
  creditCost: String(c.creditCost),
  defaultTrainerId: c.defaultTrainerId ?? '',
  schemaId: c.schemaId ?? '',
  schedule: c.schedule,
  room: c.room ?? '',
  sessionKind: c.sessionKind,
  description: c.description ?? '',
  createdAt: c.createdAt || undefined,
});

/** Waarde van de keuze "+ Nieuwe ruimte…" in de ruimtelijst. */
const NEW_ROOM = '__new_room__';

export function ClassTypesPanel({ staff, profiles, profilesLoading, createSignal }: ClassTypesPanelProps) {
  const { t, lang } = useI18n();
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
  const isAdmin = profile?.profile?.role === 'admin';
  const orgId = profile?.activeOrgId ?? null;
  const [rooms, setRooms] = useState<string[]>([]);
  /** Een nieuwe ruimte typen in plaats van er een uit de lijst te kiezen. */
  const [typingRoom, setTypingRoom] = useState(false);
  /** Botsing met een andere lessoort bij de laatste poging om op te slaan, met voorstellen. */
  const [check, setCheck] = useState<ScheduleCheck | null>(null);
  /** Telt op na elke opslag, zodat het overzicht "dubbel ingepland" opnieuw kijkt. */
  const [conflictsKey, setConflictsKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const uid = profile?.profile?.userId;
      const role = profile?.profile?.role ?? 'sporter';
      const [list, mine] = await Promise.all([getClassTypes(), uid ? getWorkoutsForUser(uid, role).catch(() => []) : Promise.resolve([])]);
      // Vaste PT-momenten van één lid beheer je op diens profiel, niet hier.
      setTypes(sortClassTypesByWeek(list.filter((t) => !t.privateFor && !t.privateForGroup)));
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

  // Bij openen het rooster stil laten opruimen: lessen van verwijderde lessoorten of oude
  // weekmomenten (bijv. van voor deze opruimregel bestond) hoeven niet op de nachtelijke cron te wachten.
  useEffect(() => {
    void pruneStaleClasses().catch(() => null);
  }, []);

  useEffect(() => {
    if (!orgId) return;
    void getOrg(orgId).then((org) => setRooms(org?.rooms ?? []));
  }, [orgId]);

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
      const p = staff.find((s) => s.userId === id) ?? profiles.find((s) => s.userId === id);
      if (p) return p.displayName?.trim() || p.email || t('classTypes.unknownTrainer');
      return profilesLoading ? null : t('classTypes.unknownTrainer');
    },
    [staff, profiles, profilesLoading, t]
  );

  const summary = useCallback(
    (c: ClassType) =>
      [
        c.capacity == null ? t('classTypes.noLimit') : t('classTypes.people', { count: c.capacity }),
        staffName(c.defaultTrainerId),
        c.room,
      ]
        .filter(Boolean)
        .join(' · '),
    [staffName, t]
  );

  /** Vaste weekmomenten kort, maandag eerst: "Do 19:00–20:00 · Za 10:00–11:00". */
  const scheduleSummary = useCallback(
    (c: ClassType) =>
      [...c.schedule]
        .sort(
          (a, b) =>
            WEEKDAY_ORDER.findIndex((w) => w.weekday === a.weekday) - WEEKDAY_ORDER.findIndex((w) => w.weekday === b.weekday) ||
            a.startTime.localeCompare(b.startTime)
        )
        .map((slot) => {
          const key = WEEKDAY_ORDER.find((w) => w.weekday === slot.weekday)?.key;
          const day = key ? t(`classTypes.schedule.weekdayLabels.${key}`).slice(0, 2) : '';
          return `${day} ${slot.startTime}–${slot.endTime}`;
        })
        .join(' · '),
    [t]
  );

  const isNew = useMemo(() => !!draft && !types.some((c) => c.id === draft.id), [draft, types]);

  // Ook een ruimte die (nog) niet in de lijst staat tonen, bijv. door een trainer ingevuld.
  const roomOptions = draft?.room.trim() && !rooms.some((r) => r.toLowerCase() === draft.room.trim().toLowerCase()) && !typingRoom ? [...rooms, draft.room.trim()] : rooms;
  useEffect(() => {
    setTypingRoom(false);
    setCheck(null);
  }, [draft?.id]);

  const save = async () => {
    if (!draft) return;
    const name = draft.name.trim();
    const capacity = draft.capacity.trim() === '' ? null : Number(draft.capacity);
    const creditCost = Number(draft.creditCost);
    if (!name) return setError(t('classTypes.nameRequired'));
    if (draft.schedule.some((s) => s.endTime <= s.startTime)) return setError(t('classTypes.schedule.timeInvalid'));
    // Bestaat de ruimte al (andere hoofdletters)? Dan die schrijfwijze, zodat "boven" geen tweede ruimte wordt.
    const typedRoom = draft.room.trim();
    const roomName = rooms.find((r) => r.toLowerCase() === typedRoom.toLowerCase()) ?? typedRoom;
    setSaving(true);
    setError(null);
    // Dubbel plannen: botst een weekmoment met een andere les (zelfde trainer of ruimte)? Met de
    // instelling aan wordt er dan niet opgeslagen en staan er voorstellen klaar. Lukt de controle
    // zelf niet (geen verbinding), dan niet tegenhouden.
    const checked = await checkSchedule({
      id: draft.id,
      name,
      defaultTrainerId: draft.defaultTrainerId || null,
      room: roomName || null,
      schedule: draft.schedule,
    }).catch(() => null);
    if (checked?.block && checked.conflicts.length > 0) {
      setCheck(checked);
      setSaving(false);
      return;
    }
    setCheck(null);
    try {
      await saveClassType({
        id: draft.id,
        name,
        capacity: capacity && Number.isInteger(capacity) && capacity > 0 ? capacity : null,
        creditCost: Number.isInteger(creditCost) && creditCost >= 0 ? creditCost : 0,
        defaultTrainerId: draft.defaultTrainerId || null,
        schemaId: draft.schemaId || null,
        schedule: draft.schedule,
        room: roomName || null,
        sessionKind: draft.sessionKind,
        description: draft.description.trim() || null,
        createdAt: draft.createdAt,
      });
      // Meteen het rooster laten kloppen in plaats van tot de volgende dagelijkse cron te wachten:
      // nieuwe weekmomenten erop, verschoven of weggehaalde eraf, naam/tijd/ruimte bijgewerkt. Ook
      // zonder schema, zodat oude lessen van een weggehaald moment verdwijnen. Mislukt dit, dan is
      // de lessoort zelf al wel opgeslagen; de cron haalt het de volgende dag alsnog in.
      const synced = await generateClassOccurrencesNow(draft.id).catch((e) => {
        notify.error(t('classTypes.schedule.generateFailed'), e);
        return null;
      });
      // Een nieuw getypte ruimte komt in de lijst van de studio (alleen een beheerder mag die lijst wijzigen).
      if (roomName && orgId && isAdmin && !rooms.includes(roomName)) {
        const updated = [...rooms, roomName].sort((a, b) => a.localeCompare(b));
        await saveOrgRooms(orgId, updated)
          .then(() => setRooms(updated))
          .catch((e) => notify.error(t('classTypes.saveFailed'), e));
      }
      setTypingRoom(false);
      if (checked && checked.conflicts.length > 0) notify.info(t('classTypes.schedule.conflict.warned', { count: new Set(checked.conflicts.map((c) => c.slotIndex)).size }));
      else notify.success(t('classTypes.saved'));
      setConflictsKey((k) => k + 1);
      warnStaleKept(synced?.staleWithBookings);
      await load();
      if (!wide) setDraft(null);
    } catch (e) {
      notify.error(t('classTypes.saveFailed'), e);
    } finally {
      setSaving(false);
    }
  };

  /** Oude lessen met inschrijvingen blijven staan; noem ze, zodat de trainer ze bewust afmeldt. */
  const warnStaleKept = (stale: StaleClass[] | undefined) => {
    if (!stale?.length) return;
    const list = stale
      .slice(0, 3)
      .map((c) => `${new Date(`${c.date}T12:00:00`).toLocaleDateString(lang === 'en' ? 'en-GB' : 'nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })} ${c.startTime}`)
      .join(', ');
    notify.info(t('classTypes.schedule.staleKept', { count: stale.length, list: stale.length > 3 ? `${list} …` : list }));
  };

  const remove = async () => {
    if (!draft) return;
    const removed = types.find((c) => c.id === draft.id) ?? null;
    setSaving(true);
    try {
      await deleteClassType(draft.id);
      // Daarna de geplande lessen zonder inschrijvingen van het rooster, anders blijven ze als
      // "spooklessen" staan zonder lessoort.
      const pruned = await pruneStaleClasses().catch(() => null);
      if (removed) {
        // Terugzetten: de lessoort opnieuw opslaan en het rooster opnieuw vullen (de weekmomenten
        // komen dan vanzelf terug; lessen met inschrijvingen waren al blijven staan).
        notify.undo(t('classTypes.deletedNamed', { name: removed.name }), async () => {
          try {
            await saveClassType({
              id: removed.id,
              name: removed.name,
              capacity: removed.capacity,
              creditCost: removed.creditCost,
              defaultTrainerId: removed.defaultTrainerId,
              schemaId: removed.schemaId,
              schedule: removed.schedule,
              room: removed.room,
              sessionKind: removed.sessionKind,
              description: removed.description,
              createdAt: removed.createdAt,
            });
            await generateClassOccurrencesNow(removed.id).catch(() => null);
            notify.success(t('classTypes.restored', { name: removed.name }));
          } catch (e) {
            notify.error(t('classTypes.saveFailed'), e);
          }
          await load();
        });
      } else {
        notify.success(t('classTypes.deleted'));
      }
      warnStaleKept(pruned?.staleWithBookings);
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
      <ScheduleConflictsOverview refreshKey={conflictsKey} />
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
              {c.schedule.length > 0 && (
                <Typography variant="caption" noWrap sx={{ display: 'block', color: 'primary.main', fontWeight: 500 }}>
                  {scheduleSummary(c)}
                </Typography>
              )}
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
      <NumberField label={t('classTypes.capacity')} size="small" fullWidth value={draft.capacity} onChange={(v) => setDraft({ ...draft, capacity: v })} helperText={t('classTypes.capacityHelp')} />
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
        <TextField select label={t('classTypes.sessionKind')} size="small" fullWidth value={draft.sessionKind} onChange={(e) => setDraft({ ...draft, sessionKind: e.target.value as SessionKind })}>
          {SESSION_KINDS.map((k) => (
            <MenuItem key={k} value={k}>
              {t(`classTypes.sessionKinds.${k}`)}
            </MenuItem>
          ))}
        </TextField>
        {typingRoom ? (
          <TextField
            label={t('classTypes.rooms.newLabel')}
            placeholder={t('classTypes.rooms.placeholder')}
            size="small"
            fullWidth
            autoFocus
            value={draft.room}
            onChange={(e) => setDraft({ ...draft, room: e.target.value })}
            onBlur={() => !draft.room.trim() && setTypingRoom(false)}
            helperText={t('classTypes.rooms.newHelp')}
          />
        ) : (
          <TextField
            select
            label={t('classTypes.room')}
            size="small"
            fullWidth
            value={draft.room}
            onChange={(e) => {
              // Nieuwe ruimte: typen in plaats van kiezen; bij Opslaan komt hij in de lijst van de studio.
              if (e.target.value === NEW_ROOM) {
                setTypingRoom(true);
                setDraft({ ...draft, room: '' });
              } else setDraft({ ...draft, room: e.target.value });
            }}
          >
            <MenuItem value="">{t('classTypes.noRoom')}</MenuItem>
            {roomOptions.map((r) => (
              <MenuItem key={r} value={r}>
                {r}
              </MenuItem>
            ))}
            <MenuItem value={NEW_ROOM} sx={{ color: 'primary.main', fontWeight: 500 }}>
              {t('classTypes.rooms.addNew')}
            </MenuItem>
          </TextField>
        )}
      </Box>
      <TextField
        label={t('classTypes.description')}
        size="small"
        fullWidth
        multiline
        minRows={2}
        maxRows={4}
        value={draft.description}
        onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        helperText={t('classTypes.descriptionHelp')}
      />
      <TextField select label={t('classTypes.creditCost')} size="small" fullWidth value={draft.creditCost} onChange={(e) => setDraft({ ...draft, creditCost: e.target.value })}>
        {['0', '1', '2', '3', '4'].map((v) => (
          <MenuItem key={v} value={v}>
            {v === '0' ? t('classTypes.free') : t('classTypes.credits', { count: Number(v) })}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        select
        label={t('classTypes.defaultTrainer')}
        size="small"
        fullWidth
        value={draft.defaultTrainerId}
        onChange={(e) => setDraft({ ...draft, defaultTrainerId: e.target.value })}
        // Zonder vaste trainer is de lege waarde een echte keuze: toon hem ook als tekst in het veld.
        SelectProps={{ displayEmpty: true }}
        InputLabelProps={{ shrink: true }}
      >
        <MenuItem value="">{t('classTypes.anyTrainer')}</MenuItem>
        {staff.map((p) => (
          <MenuItem key={p.userId} value={p.userId}>
            {p.displayName?.trim() || p.email || t('classTypes.unknownTrainer')}
          </MenuItem>
        ))}
        {/* Vaste trainer die geen trainer meer is (of niet meer bij de studio): blijft zichtbaar tot je een ander kiest. */}
        {draft.defaultTrainerId && !staff.some((p) => p.userId === draft.defaultTrainerId) && (
          <MenuItem value={draft.defaultTrainerId}>{staffName(draft.defaultTrainerId) ?? '…'}</MenuItem>
        )}
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
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 1.5 }}>
          {draft.schedule.map((slot, i) => (
            <Box key={i} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {/* Lijn tussen twee weekmomenten, zodat duidelijk is welke tijden bij welke dag horen. */}
              {i > 0 && <Divider sx={{ mb: 0.5 }} />}
              <TextField
                select
                size="small"
                fullWidth
                value={slot.weekday}
                onChange={(e) => {
                  const schedule = draft.schedule.map((s, j) => (j === i ? { ...s, weekday: Number(e.target.value) } : s));
                  setDraft({ ...draft, schedule });
                }}
              >
                {WEEKDAY_ORDER.map((w) => (
                  <MenuItem key={w.weekday} value={w.weekday}>
                    {t(`classTypes.schedule.weekdayLabels.${w.key}`)}
                  </MenuItem>
                ))}
              </TextField>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <TextField
                  type="time"
                  size="small"
                  label={t('classTypes.schedule.start')}
                  value={slot.startTime}
                  onChange={(e) => {
                    const schedule = draft.schedule.map((s, j) => (j === i ? { ...s, startTime: e.target.value } : s));
                    setDraft({ ...draft, schedule });
                  }}
                  InputLabelProps={{ shrink: true }}
                  sx={{ flex: 1 }}
                />
                <TextField
                  type="time"
                  size="small"
                  label={t('classTypes.schedule.end')}
                  value={slot.endTime}
                  onChange={(e) => {
                    const schedule = draft.schedule.map((s, j) => (j === i ? { ...s, endTime: e.target.value } : s));
                    setDraft({ ...draft, schedule });
                  }}
                  InputLabelProps={{ shrink: true }}
                  sx={{ flex: 1 }}
                />
                <IconButton
                  size="small"
                  aria-label={t('classTypes.schedule.removeSlot')}
                  onClick={() => setDraft({ ...draft, schedule: draft.schedule.filter((_, j) => j !== i) })}
                >
                  <DeleteOutlineRoundedIcon fontSize="small" />
                </IconButton>
              </Box>
            </Box>
          ))}
        </Box>
        <Button
          size="small"
          startIcon={<AddRoundedIcon />}
          onClick={() => setDraft({ ...draft, schedule: [...draft.schedule, { weekday: 1, startTime: '19:00', endTime: '20:00' }] })}
        >
          {t('classTypes.schedule.add')}
        </Button>
      </Box>

      {check && (
        <ScheduleConflictNotice
          check={check}
          onPickRoom={(room) => {
            setDraft({ ...draft, room });
            setCheck(null);
          }}
          onPickTime={(i, slot) => {
            setDraft({ ...draft, schedule: draft.schedule.map((s, j) => (j === i ? { ...s, startTime: slot.startTime, endTime: slot.endTime } : s)) });
            setCheck(null);
          }}
        />
      )}
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
          <FullScreenDialogTitle title={isNew ? t('classTypes.newType') : draft?.name ?? ''} onClose={() => setDraft(null)} />
          {/* Eigen Box voor de ruimte: MUI zet padding-top van DialogContent na een titel op 0, en dan
              valt het label van het eerste veld half weg. */}
          <DialogContent>
            <Box sx={{ pt: 1.5 }}>{editor}</Box>
          </DialogContent>
        </Dialog>
        {confirm}
      </>
    );
  }

  return (
    <>
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
    </>
  );
}
