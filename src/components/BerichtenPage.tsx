import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  IconButton,
  Badge,
  Avatar,
  List,
  ListItemButton,
  ListItemAvatar,
  ListItemText,
  CircularProgress,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  MenuItem,
} from '@mui/material';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import AssignmentTurnedInRoundedIcon from '@mui/icons-material/AssignmentTurnedInRounded';
import { PageLayout, ContentCard, PageTitle, EmptyState } from './layout';
import { useProfile } from '../context/ProfileContext';
import { useNotify } from '../context/NotifyContext';
import { getProfile } from '../services/profileService';
import {
  getThread,
  getUnreadCountsByPartner,
  markThreadRead,
  sendMessage,
  describeCheckin,
  type Message,
} from '../services/messageService';
import { saveMeasurement, newMeasurementId, emptyMeasurementFields } from '../services/measurementService';
import type { Profile } from '../types';
import { designTokens } from '../theme/designTokens';

const FEELINGS = [
  { value: 5, label: '5 — top' },
  { value: 4, label: '4 — goed' },
  { value: 3, label: '3 — gaat wel' },
  { value: 2, label: '2 — zwaar' },
  { value: 1, label: '1 — slecht' },
];

const nameOf = (p: Profile) => p.displayName || p.email || 'Naamloos';
const initials = (p: Profile) =>
  nameOf(p)
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

export function BerichtenPage() {
  const profileCtx = useProfile();
  const notify = useNotify();
  const me = profileCtx?.profile ?? null;
  const isStaff = me?.role === 'trainer' || me?.role === 'admin';

  const [partners, setPartners] = useState<Profile[]>([]);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [active, setActive] = useState<Profile | null>(null);
  const [thread, setThread] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [checkinOpen, setCheckinOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Gesprekspartners: een trainer praat met zijn sporters, een sporter met zijn trainer.
  const loadPartners = useCallback(async () => {
    if (!me) return;
    setLoading(true);
    try {
      if (isStaff) {
        const own = profileCtx?.sporters ?? [];
        const list = me.role === 'admin' ? (profileCtx?.allSporters ?? own) : own;
        setPartners(list);
      } else if (me.trainerId) {
        const trainer = await getProfile(me.trainerId);
        setPartners(trainer ? [trainer] : []);
      } else {
        setPartners([]);
      }
      setUnread(await getUnreadCountsByPartner(me.userId));
    } catch (e) {
      notify?.error(e instanceof Error ? e.message : 'Berichten laden mislukt');
    } finally {
      setLoading(false);
    }
  }, [me, isStaff, profileCtx?.sporters, profileCtx?.allSporters, notify]);

  useEffect(() => {
    void loadPartners();
  }, [loadPartners]);

  const openThread = useCallback(
    async (partner: Profile) => {
      if (!me) return;
      setActive(partner);
      setThread([]);
      try {
        setThread(await getThread(me.userId, partner.userId));
        await markThreadRead(me.userId, partner.userId);
        setUnread((prev) => ({ ...prev, [partner.userId]: 0 }));
      } catch (e) {
        notify?.error(e instanceof Error ? e.message : 'Gesprek laden mislukt');
      }
    },
    [me, notify]
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [thread]);

  const send = useCallback(async () => {
    if (!me || !active || !draft.trim() || sending) return;
    setSending(true);
    try {
      const sent = await sendMessage({ senderId: me.userId, recipientId: active.userId, text: draft });
      setThread((prev) => [...prev, sent]);
      setDraft('');
    } catch (e) {
      notify?.error(e instanceof Error ? e.message : 'Versturen mislukt');
    } finally {
      setSending(false);
    }
  }, [me, active, draft, sending, notify]);

  const totalUnread = useMemo(() => Object.values(unread).reduce((a, b) => a + b, 0), [unread]);

  if (!me) return null;

  // --- Gesprek ---
  if (active) {
    return (
      <PageLayout>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <IconButton onClick={() => setActive(null)} aria-label="Terug naar berichten">
            <ArrowBackRoundedIcon />
          </IconButton>
          <Typography variant="h6" sx={{ fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {nameOf(active)}
          </Typography>
        </Box>

        <ContentCard>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, minHeight: 240, maxHeight: '55vh', overflowY: 'auto', pr: 0.5 }}>
            {thread.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                Nog geen berichten. Stuur de eerste.
              </Typography>
            )}
            {thread.map((m) => {
              const mine = m.senderId === me.userId;
              return (
                <Box
                  key={m.id}
                  sx={{
                    alignSelf: mine ? 'flex-end' : 'flex-start',
                    maxWidth: '85%',
                    bgcolor: mine ? 'primary.main' : designTokens.cardBackground,
                    color: mine ? 'primary.contrastText' : 'text.primary',
                    border: mine ? 'none' : `1px solid ${designTokens.cardBorder}`,
                    borderRadius: 2,
                    px: 1.75,
                    py: 1.25,
                  }}
                >
                  {m.kind === 'checkin' && m.checkin && (
                    <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, mb: 0.5, opacity: 0.9 }}>
                      Check-in · {describeCheckin(m.checkin)}
                    </Typography>
                  )}
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {m.text}
                  </Typography>
                  <Typography variant="caption" sx={{ display: 'block', mt: 0.5, opacity: 0.7 }}>
                    {new Date(m.createdAt).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </Typography>
                </Box>
              );
            })}
            <div ref={bottomRef} />
          </Box>

          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end', mt: 2 }}>
            <TextField
              fullWidth
              multiline
              maxRows={4}
              size="small"
              placeholder="Bericht…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              disabled={sending}
              inputProps={{ 'aria-label': 'Bericht' }}
            />
            <IconButton color="primary" onClick={() => void send()} disabled={sending || !draft.trim()} aria-label="Versturen">
              <SendRoundedIcon />
            </IconButton>
          </Box>
        </ContentCard>

        {!isStaff && (
          <Button
            fullWidth
            variant="outlined"
            startIcon={<AssignmentTurnedInRoundedIcon />}
            onClick={() => setCheckinOpen(true)}
            sx={{ mt: 2 }}
          >
            Wekelijkse check-in sturen
          </Button>
        )}

        <CheckinDialog
          open={checkinOpen}
          onClose={() => setCheckinOpen(false)}
          onSent={(m) => {
            setThread((prev) => [...prev, m]);
            setCheckinOpen(false);
          }}
          me={me}
          trainer={active}
        />
      </PageLayout>
    );
  }

  // --- Lijst ---
  return (
    <PageLayout>
      <PageTitle>Berichten</PageTitle>
      <Typography variant="body2" color="text.secondary" sx={{ mt: -2, mb: 2, px: 0.5 }}>
        {isStaff
          ? 'Contact met je sporters, bij het dossier in plaats van in WhatsApp.'
          : 'Stel je vraag aan je trainer of stuur je wekelijkse check-in.'}
        {totalUnread > 0 ? ` ${totalUnread} ongelezen.` : ''}
      </Typography>

      <ContentCard>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={24} />
          </Box>
        ) : partners.length === 0 ? (
          <EmptyState>
            {isStaff
              ? 'Nog geen sporters aan je gekoppeld. Koppel ze via Profielen.'
              : 'Je bent nog niet aan een trainer gekoppeld. Vraag ernaar bij je studio.'}
          </EmptyState>
        ) : (
          <List disablePadding>
            {partners.map((p) => (
              <ListItemButton key={p.userId} onClick={() => void openThread(p)} sx={{ borderRadius: 2 }}>
                <ListItemAvatar>
                  <Badge color="error" badgeContent={unread[p.userId] ?? 0} overlap="circular">
                    <Avatar src={p.photoURL ?? undefined}>{initials(p)}</Avatar>
                  </Badge>
                </ListItemAvatar>
                <ListItemText primary={nameOf(p)} secondary={p.role === 'sporter' ? 'Sporter' : 'Trainer'} />
              </ListItemButton>
            ))}
          </List>
        )}
      </ContentCard>
    </PageLayout>
  );
}

/**
 * Wekelijkse check-in: één formulier dat gewicht, gevoel en aantal trainingen bundelt.
 * Het gewicht komt ook als meting in het dossier, zodat de grafiek klopt zonder dubbel invoeren.
 */
function CheckinDialog({
  open,
  onClose,
  onSent,
  me,
  trainer,
}: {
  open: boolean;
  onClose: () => void;
  onSent: (m: Message) => void;
  me: Profile;
  trainer: Profile;
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
      const weightKg = weight.trim() ? Number(weight.replace(',', '.')) : null;
      if (weightKg != null && !Number.isFinite(weightKg)) throw new Error('Vul een geldig gewicht in.');

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

      const details = {
        weightKg,
        feeling: feeling ? Number(feeling) : null,
        sessions: sessions.trim() ? Number(sessions) : null,
      };
      const sent = await sendMessage({
        senderId: me.userId,
        recipientId: trainer.userId,
        text: note.trim() || 'Check-in van deze week.',
        kind: 'checkin',
        checkin: details,
      });
      notify?.success('Check-in verstuurd');
      setWeight('');
      setFeeling('');
      setSessions('');
      setNote('');
      onSent(sent);
    } catch (e) {
      notify?.error(e instanceof Error ? e.message : 'Check-in versturen mislukt');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Wekelijkse check-in</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        <TextField
          label="Gewicht (kg)"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          inputMode="decimal"
          size="small"
          helperText="Wordt ook als meting opgeslagen."
        />
        <TextField label="Hoe ging het?" select value={feeling} onChange={(e) => setFeeling(e.target.value)} size="small">
          {FEELINGS.map((f) => (
            <MenuItem key={f.value} value={String(f.value)}>
              {f.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label="Aantal trainingen deze week"
          value={sessions}
          onChange={(e) => setSessions(e.target.value)}
          inputMode="numeric"
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
        <Button onClick={onClose} disabled={busy}>
          Annuleren
        </Button>
        <Button variant="contained" onClick={() => void submit()} disabled={busy}>
          Versturen
        </Button>
      </DialogActions>
    </Dialog>
  );
}
