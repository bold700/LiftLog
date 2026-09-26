/**
 * Beheer → Meldingen. Drie blokken:
 * - Bericht versturen: een trainer of beheerder stuurt een pushbericht aan één lid, de deelnemers
 *   van een les, een lessoort of de hele studio. Meteen, of op een dag (gaat dan mee met de
 *   avondronde, rond 18:00).
 * - Berichten: wat er verstuurd en gepland is; een gepland bericht kun je nog intrekken.
 * - Automatische meldingen: per soort aan of uit. Alleen de eigenaar kan dit wijzigen; een
 *   trainer ziet wat er aan staat.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  MenuItem,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import ScheduleRoundedIcon from '@mui/icons-material/ScheduleRounded';
import { ContentCard } from '../layout';
import { useProfile } from '../../context/ProfileContext';
import { useNotify } from '../../context/NotifyContext';
import { getOrg, saveOrgNotification } from '../../services/orgService';
import { getUpcomingClasses, type StudioClass } from '../../services/classService';
import { getClassTypes } from '../../services/classTypeService';
import {
  BROADCAST_BODY_MAX,
  BROADCAST_TITLE_MAX,
  cancelBroadcast,
  listBroadcasts,
  sendBroadcast,
} from '../../services/broadcastService';
import { NOTIFICATION_KIND_INFO, isNotificationEnabled } from '../../utils/notificationKinds';
import { toIsoDate, todayIso } from '../../utils/format';
import type { Broadcast, BroadcastAudience, ClassType, NotificationKind, OrgNotificationSettings, Profile } from '../../types';

type AudienceType = BroadcastAudience['type'];

const AUDIENCE_OPTIONS: Array<{ value: AudienceType; label: string }> = [
  { value: 'all', label: 'Iedereen in de studio' },
  { value: 'class', label: 'Deelnemers van een les' },
  { value: 'classType', label: 'Iedereen van een lessoort' },
  { value: 'member', label: 'Eén lid' },
];

/** Snelle start: vult titel en tekst, daarna pas je aan wat nodig is. `{les}` wordt de gekozen les of lessoort. */
const TEMPLATES: Array<{ label: string; title: string; body: string }> = [
  { label: 'Les gaat niet door', title: '{les} gaat niet door', body: 'Helaas gaat {les} niet door. Excuses voor het ongemak!' },
  { label: 'Andere zaal', title: '{les}: andere zaal', body: '{les} is deze keer in een andere zaal: ' },
  { label: 'Vakantierooster', title: 'Vakantierooster', body: 'Tijdens de vakantie geldt een aangepast rooster. Kijk in de app bij Lessen welke lessen doorgaan.' },
  { label: 'Nieuwe les', title: 'Nieuw op het rooster', body: 'Er staat een nieuwe les op het rooster: ' },
];

const DAY_FMT = new Intl.DateTimeFormat('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });
/** "2026-09-26" → "za 26 sep". */
function dayLabel(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return DAY_FMT.format(new Date(`${iso}T12:00:00`)).replace(/\./g, '');
}
const shortTime = (hhmm: string) => hhmm.replace(/^0(\d)/, '$1');
const classLabel = (c: StudioClass) => `${c.title} ${dayLabel(c.date)} ${shortTime(c.startTime)}`;
const personName = (p: Profile) => p.displayName || p.email || 'Lid';
const people = (n: number) => (n === 1 ? '1 persoon' : `${n} mensen`);

function tomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toIsoDate(d);
}

interface NotificationsPanelProps {
  /** Alleen de eigenaar mag automatische meldingen aan- of uitzetten (orgs is admin-only in de regels). */
  canEditSettings: boolean;
}

export function NotificationsPanel({ canEditSettings }: NotificationsPanelProps) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) minmax(0, 1fr)' },
        columnGap: 3,
        alignItems: 'start',
      }}
    >
      <BroadcastsColumn />
      <AutomaticNotifications canEdit={canEditSettings} />
    </Box>
  );
}

// --- Bericht versturen + geschiedenis -----------------------------------------------------------

function BroadcastsColumn() {
  const profileCtx = useProfile();
  const notify = useNotify();
  const members = useMemo(
    () => [...(profileCtx?.members ?? [])].sort((a, b) => personName(a).localeCompare(personName(b), 'nl', { sensitivity: 'base' })),
    [profileCtx?.members]
  );

  const [classes, setClasses] = useState<StudioClass[]>([]);
  const [classTypes, setClassTypes] = useState<ClassType[]>([]);
  const [history, setHistory] = useState<Broadcast[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [audienceType, setAudienceType] = useState<AudienceType>('all');
  const [memberId, setMemberId] = useState<string | null>(null);
  const [classId, setClassId] = useState('');
  const [classTypeId, setClassTypeId] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [when, setWhen] = useState<'now' | 'later'>('now');
  const [date, setDate] = useState(tomorrowIso);
  const [sending, setSending] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await listBroadcasts());
      setHistoryError(null);
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : 'Berichten laden mislukt.');
      // Niet op [] zetten: dan staat er naast de fout ook "Nog geen berichten verstuurd".
      setHistory((h) => h ?? []);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
    const today = todayIso();
    const until = new Date();
    until.setDate(until.getDate() + 21);
    const last = toIsoDate(until);
    void getUpcomingClasses(today)
      .then((list) => setClasses(list.filter((c) => !c.cancelledAt && c.date <= last)))
      .catch(() => setClasses([]));
    void getClassTypes()
      .then((list) => setClassTypes(list.filter((t) => !t.privateFor).sort((a, b) => a.name.localeCompare(b.name, 'nl'))))
      .catch(() => setClassTypes([]));
  }, [loadHistory]);

  const selectedMember = members.find((m) => m.userId === memberId) ?? null;
  const selectedClass = classes.find((c) => c.id === classId) ?? null;
  const selectedType = classTypes.find((t) => t.id === classTypeId) ?? null;

  const audience: BroadcastAudience | null = useMemo(() => {
    if (audienceType === 'all') return { type: 'all', id: null, label: 'iedereen' };
    if (audienceType === 'member') return selectedMember ? { type: 'member', id: selectedMember.userId, label: personName(selectedMember) } : null;
    if (audienceType === 'class') return selectedClass ? { type: 'class', id: selectedClass.id, label: classLabel(selectedClass) } : null;
    return selectedType ? { type: 'classType', id: selectedType.id, label: selectedType.name } : null;
  }, [audienceType, selectedMember, selectedClass, selectedType]);

  /** Wat er op de plek van {les} in een sjabloon komt: in de titel kort, in de tekst met dag en tijd. */
  const lesShort = selectedClass ? selectedClass.title : selectedType ? selectedType.name : 'de les';
  const lesName = selectedClass ? classLabel(selectedClass) : lesShort;

  const applyTemplate = (tpl: (typeof TEMPLATES)[number]) => {
    const fill = (s: string, les: string) => s.replace(/\{les\}/g, les);
    const t = fill(tpl.title, lesShort);
    setTitle(t.charAt(0).toUpperCase() + t.slice(1));
    setBody(fill(tpl.body, lesName).replace(/^./, (c) => c.toUpperCase()));
  };

  const titleTrim = title.replace(/\s+/g, ' ').trim();
  const bodyTrim = body.trim();
  const minDate = tomorrowIso();
  const dateOk = when === 'now' || (/^\d{4}-\d{2}-\d{2}$/.test(date) && date >= minDate);
  const canSend =
    !!audience && !!titleTrim && titleTrim.length <= BROADCAST_TITLE_MAX && !!bodyTrim && bodyTrim.length <= BROADCAST_BODY_MAX && dateOk && !sending;

  const doSend = async () => {
    if (!audience) return;
    setConfirmAll(false);
    setSending(true);
    try {
      const result = await sendBroadcast({ title: titleTrim, body: bodyTrim, audience, scheduledFor: when === 'later' ? date : null });
      if (result.status === 'scheduled') {
        notify.success(`Gepland voor ${dayLabel(date)}, rond 18:00.`);
      } else if (!result.recipients) {
        notify.error('Niemand gevonden om dit naar te sturen.');
      } else {
        notify.success(`Verstuurd naar ${people(result.recipients)}.`);
      }
      setTitle('');
      setBody('');
      await loadHistory();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Versturen mislukt.', e);
    } finally {
      setSending(false);
    }
  };

  const handleSend = () => {
    if (audienceType === 'all' && when === 'now') setConfirmAll(true);
    else void doSend();
  };

  const handleCancel = async (b: Broadcast) => {
    setCancellingId(b.id);
    try {
      await cancelBroadcast(b.id);
      notify.success('Bericht ingetrokken.');
      await loadHistory();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Intrekken mislukt.', e);
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <Box sx={{ minWidth: 0 }}>
      <ContentCard>
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
          Bericht versturen
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Komt binnen als pushmelding bij wie meldingen aan heeft staan (Profiel → Koppelingen).
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField select size="small" label="Naar" value={audienceType} onChange={(e) => setAudienceType(e.target.value as AudienceType)}>
            {AUDIENCE_OPTIONS.map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </TextField>

          {audienceType === 'member' && (
            <Autocomplete
              size="small"
              options={members}
              value={selectedMember}
              onChange={(_, v) => setMemberId(v?.userId ?? null)}
              getOptionLabel={personName}
              isOptionEqualToValue={(a, b) => a.userId === b.userId}
              renderInput={(params) => <TextField {...params} label="Lid" placeholder="Zoek op naam" />}
              noOptionsText="Geen leden gevonden"
            />
          )}
          {audienceType === 'class' && (
            <TextField
              select
              size="small"
              label="Les"
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              helperText="Ingeschreven en op de wachtlijst, komende drie weken."
            >
              {classes.length === 0 && (
                <MenuItem value="" disabled>
                  Geen lessen gepland
                </MenuItem>
              )}
              {classes.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {classLabel(c)}
                  {c.bookedCount > 0 ? ` · ${c.bookedCount} ingeschreven` : ''}
                </MenuItem>
              ))}
            </TextField>
          )}
          {audienceType === 'classType' && (
            <TextField
              select
              size="small"
              label="Lessoort"
              value={classTypeId}
              onChange={(e) => setClassTypeId(e.target.value)}
              helperText="Iedereen die voor een komende les is ingeschreven, plus de vaste deelnemers."
            >
              {classTypes.length === 0 && (
                <MenuItem value="" disabled>
                  Geen lessoorten
                </MenuItem>
              )}
              {classTypes.map((t) => (
                <MenuItem key={t.id} value={t.id}>
                  {t.name}
                </MenuItem>
              ))}
            </TextField>
          )}

          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
              Begin met een voorbeeld
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {TEMPLATES.map((tpl) => (
                <Chip key={tpl.label} label={tpl.label} variant="outlined" onClick={() => applyTemplate(tpl)} />
              ))}
            </Box>
          </Box>

          <TextField
            size="small"
            label="Titel"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            error={titleTrim.length > BROADCAST_TITLE_MAX}
            helperText={`${titleTrim.length}/${BROADCAST_TITLE_MAX}`}
            FormHelperTextProps={{ sx: { textAlign: 'right', mx: 0 } }}
          />
          <TextField
            size="small"
            label="Bericht"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            multiline
            minRows={3}
            error={bodyTrim.length > BROADCAST_BODY_MAX}
            helperText={`${bodyTrim.length}/${BROADCAST_BODY_MAX}`}
            FormHelperTextProps={{ sx: { textAlign: 'right', mx: 0 } }}
          />

          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5 }}>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={when}
              onChange={(_, v: 'now' | 'later' | null) => v && setWhen(v)}
              aria-label="Wanneer"
            >
              <ToggleButton value="now" sx={{ textTransform: 'none', px: 2 }}>
                Nu
              </ToggleButton>
              <ToggleButton value="later" sx={{ textTransform: 'none', px: 2 }}>
                Op een dag
              </ToggleButton>
            </ToggleButtonGroup>
            {when === 'later' && (
              <TextField
                type="date"
                size="small"
                label="Datum"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                inputProps={{ min: minDate }}
                InputLabelProps={{ shrink: true }}
                error={!dateOk}
                sx={{ width: 170 }}
              />
            )}
          </Box>
          {when === 'later' && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: -1 }}>
              Gaat die dag rond 18:00 de deur uit.
            </Typography>
          )}

          <Box>
            <Button
              variant="contained"
              disableElevation
              startIcon={sending ? <CircularProgress size={16} color="inherit" /> : when === 'now' ? <SendRoundedIcon /> : <ScheduleRoundedIcon />}
              disabled={!canSend}
              onClick={handleSend}
            >
              {when === 'now' ? 'Versturen' : 'Inplannen'}
            </Button>
          </Box>
        </Box>
      </ContentCard>

      <ContentCard>
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 1.5 }}>
          Berichten
        </Typography>
        {historyError && (
          <Alert
            severity="error"
            sx={{ mb: 1.5 }}
            action={
              <Button color="inherit" size="small" onClick={() => void loadHistory()}>
                Opnieuw proberen
              </Button>
            }
          >
            {historyError}
          </Alert>
        )}
        {history === null ? (
          <CircularProgress size={20} />
        ) : history.length === 0 ? (
          historyError ? null : (
            <Typography variant="body2" color="text.secondary">
              Nog geen berichten verstuurd.
            </Typography>
          )
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            {history.map((b, i) => (
              <BroadcastRow key={b.id} b={b} divider={i > 0} cancelling={cancellingId === b.id} onCancel={() => void handleCancel(b)} />
            ))}
          </Box>
        )}
      </ContentCard>

      <Dialog open={confirmAll} onClose={() => setConfirmAll(false)}>
        <DialogTitle>Naar iedereen versturen?</DialogTitle>
        <DialogContent>
          <DialogContentText>“{titleTrim}” gaat nu naar alle leden en trainers van de studio. Terughalen kan niet.</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setConfirmAll(false)}>
            Annuleren
          </Button>
          <Button variant="contained" disableElevation onClick={() => void doSend()}>
            Versturen
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function BroadcastRow({ b, divider, cancelling, onCancel }: { b: Broadcast; divider: boolean; cancelling: boolean; onCancel: () => void }) {
  const created = b.createdAt ? dayLabel(b.createdAt.slice(0, 10)) : '';
  let status: { label: string; color: 'default' | 'primary' | 'success' };
  if (b.status === 'scheduled') status = { label: `Gepland · ${dayLabel(b.scheduledFor ?? '')}`, color: 'primary' };
  else if (b.status === 'cancelled') status = { label: 'Ingetrokken', color: 'default' };
  else if (b.status === 'sending') status = { label: 'Bezig…', color: 'default' };
  else status = { label: `Verstuurd · ${people(b.recipients ?? 0)}`, color: 'success' };

  return (
    <Box sx={{ py: 1.5, borderTop: divider ? '1px solid' : 'none', borderColor: 'divider', opacity: b.status === 'cancelled' ? 0.6 : 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, justifyContent: 'space-between' }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            {b.title}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {b.body}
          </Typography>
        </Box>
        <Chip size="small" label={status.label} color={status.color} variant={status.color === 'default' ? 'outlined' : 'filled'} sx={{ flexShrink: 0 }} />
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
        <Typography variant="caption" color="text.secondary">
          Naar {b.audience?.label || 'iedereen'} · {b.createdByName || 'onbekend'} · {created}
        </Typography>
        {b.status === 'scheduled' && (
          <Button size="small" color="inherit" onClick={onCancel} disabled={cancelling} sx={{ ml: 'auto', minWidth: 0 }}>
            {cancelling ? 'Bezig…' : 'Intrekken'}
          </Button>
        )}
      </Box>
    </Box>
  );
}

// --- Automatische meldingen ---------------------------------------------------------------------

function AutomaticNotifications({ canEdit }: { canEdit: boolean }) {
  const profileCtx = useProfile();
  const notify = useNotify();
  const orgId = profileCtx?.activeOrgId ?? null;
  const [settings, setSettings] = useState<OrgNotificationSettings | null>(null);
  const [savingKind, setSavingKind] = useState<NotificationKind | null>(null);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    void getOrg(orgId)
      .then((org) => !cancelled && setSettings(org?.notifications ?? {}))
      .catch(() => !cancelled && setSettings({}));
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const toggle = async (kind: NotificationKind, enabled: boolean) => {
    if (!orgId || !settings) return;
    const before = settings;
    setSettings({ ...settings, [kind]: enabled });
    setSavingKind(kind);
    try {
      await saveOrgNotification(orgId, kind, enabled);
    } catch (e) {
      setSettings(before);
      notify.error('Opslaan mislukt.', e);
    } finally {
      setSavingKind(null);
    }
  };

  const groups: Array<{ to: 'Sporter' | 'Trainer'; title: string }> = [
    { to: 'Sporter', title: 'Naar sporters' },
    { to: 'Trainer', title: 'Naar trainers' },
  ];

  return (
    <ContentCard>
      <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
        Automatische meldingen
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {canEdit
          ? 'Deze gaan vanzelf. Zet uit wat je studio niet wil versturen.'
          : 'Deze gaan vanzelf. Alleen de eigenaar van de studio kan ze aan- of uitzetten.'}
      </Typography>
      {settings === null ? (
        <CircularProgress size={20} />
      ) : (
        groups.map((g) => (
          <Box key={g.to} sx={{ mb: 1.5 }}>
            <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 2 }}>
              {g.title}
            </Typography>
            {NOTIFICATION_KIND_INFO.filter((k) => k.to === g.to).map((k) => {
              const on = isNotificationEnabled(settings, k.kind);
              return (
                <Box
                  key={k.kind}
                  component="label"
                  sx={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 1.5,
                    py: 1.25,
                    borderTop: '1px solid',
                    borderColor: 'divider',
                    cursor: canEdit ? 'pointer' : 'default',
                  }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      {k.label}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {k.description}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {k.when}
                    </Typography>
                  </Box>
                  <Switch
                    checked={on}
                    disabled={!canEdit || savingKind === k.kind}
                    onChange={(e) => void toggle(k.kind, e.target.checked)}
                    inputProps={{ 'aria-label': k.label }}
                  />
                </Box>
              );
            })}
          </Box>
        ))
      )}
    </ContentCard>
  );
}
