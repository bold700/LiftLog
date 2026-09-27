/**
 * Beheer → Wachtlijsten: per les wie er wacht, voor wie een plek wordt vastgehouden en wie geen
 * credits heeft. Zodat de trainer dat niet uit de groepsapp hoeft te halen.
 *
 * De app regelt het doorschuiven zelf (zie api/_lib/bookingRules.mjs); de trainer beslist als het
 * anders moet: iemand toch inschrijven (ook boven het maximum), een credit geven, de plek doorgeven
 * of iemand van de wachtlijst halen.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Menu,
  MenuItem,
  Typography,
} from '@mui/material';
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import { ContentCard, EmptyState, LoadingBlock } from '../layout';
import { useNotify } from '../../context/NotifyContext';
import {
  activeHoldUntil,
  bookClass,
  cancelBooking,
  classHasStarted,
  getBookingsForClass,
  getUpcomingClasses,
  grantCredits,
  releaseHold,
  settleWaitlists,
  type Booking,
  type StudioClass,
} from '../../services/classService';
import { todayIso } from '../../utils/format';
import { designTokens } from '../../theme/designTokens';
import type { Membership, Plan, Profile } from '../../types';

interface WaitlistClass {
  cls: StudioClass;
  /** Wachtenden op volgorde (1 = eerste), zoals de server ze doorschuift. */
  waiting: Booking[];
}

type Pending = { kind: 'book' | 'remove'; cls: StudioClass; booking: Booking } | null;

const clockOf = (ms: number) => new Date(ms).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
const dayOf = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });
const sinceOf = (iso: string) => {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return `${d.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })} ${clockOf(d.getTime())}`;
};

/** Zelfde volgorde als de server: eerst aangemeld, bij gelijke tijd op id. */
const byQueue = (a: Booking, b: Booking) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

/** Lessen met iemand op de wachtlijst of een vastgehouden plek, nog niet begonnen of afgelast. */
export async function loadWaitlists(): Promise<WaitlistClass[]> {
  // Eerst verlopen vastgehouden plekken laten doorgaan, anders toont het overzicht een oude stand.
  await settleWaitlists().catch(() => 0);
  const classes = (await getUpcomingClasses(todayIso())).filter(
    (c) => !c.cancelledAt && !classHasStarted(c) && (c.waitlistCount > 0 || activeHoldUntil(c) !== null)
  );
  const rows = await Promise.all(
    classes.map(async (cls) => {
      const bookings = await getBookingsForClass(cls.id).catch(() => [] as Booking[]);
      return { cls, waiting: bookings.filter((b) => b.status === 'waitlist').sort(byQueue) };
    })
  );
  return rows.filter((r) => r.waiting.length > 0 || activeHoldUntil(r.cls) !== null);
}

export function WaitlistsPanel({
  profiles,
  credits,
  memberships,
  plans,
  onChanged,
}: {
  profiles: Profile[];
  credits: Record<string, number>;
  memberships: Record<string, Membership>;
  plans: Plan[];
  /** Saldo's in Beheer opnieuw laden (na een gegeven credit of een boeking). */
  onChanged: () => void;
}) {
  const notify = useNotify();
  const [items, setItems] = useState<WaitlistClass[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; cls: StudioClass; booking: Booking } | null>(null);
  const [pending, setPending] = useState<Pending>(null);

  const load = useCallback(() => {
    loadWaitlists()
      .then(setItems)
      .catch((e) => {
        setItems([]);
        notify?.error(e instanceof Error ? e.message : 'Wachtlijsten laden mislukt');
      });
  }, [notify]);

  useEffect(() => {
    load();
  }, [load]);

  const profileOf = (userId: string) => profiles.find((p) => p.userId === userId);
  const nameOf = (userId: string) => {
    const p = profileOf(userId);
    return p?.displayName?.trim() || p?.email || 'Onbekend lid';
  };
  /** Wat deze les deze persoon kost: staf en een onbeperkt abonnement betalen niets (zoals de server). */
  const costFor = (cls: StudioClass, userId: string) => {
    const p = profileOf(userId);
    if (p?.role === 'trainer' || p?.role === 'admin') return 0;
    const m = memberships[userId];
    const plan = m ? plans.find((x) => x.id === m.planId) : null;
    if (plan && plan.credits == null) return 0;
    return cls.creditCost;
  };
  const shortOf = (cls: StudioClass, userId: string) => Math.max(0, costFor(cls, userId) - (credits[userId] ?? 0));
  /** Kan deze persoon op een gewone plek, of moet de trainer er een extra plek van maken? */
  const needsExtra = (cls: StudioClass, booking: Booking) =>
    cls.bookedCount >= cls.capacity || (activeHoldUntil(cls) !== null && cls.holdBookingId !== booking.id);

  const run = async (work: () => Promise<string>) => {
    setBusy(true);
    try {
      notify?.success(await work());
      load();
      onChanged();
    } catch (e) {
      notify?.error(e instanceof Error ? e.message : 'Dat lukte niet');
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  const confirm = () => {
    if (!pending) return;
    const { kind, cls, booking } = pending;
    const name = nameOf(booking.userId);
    if (kind === 'remove') {
      void run(async () => {
        await cancelBooking(booking.id);
        return `${name} staat niet meer op de wachtlijst.`;
      });
      return;
    }
    const short = shortOf(cls, booking.userId);
    const extra = needsExtra(cls, booking);
    void run(async () => {
      if (short > 0) await grantCredits(booking.userId, short, `Wachtlijst: ${cls.title} ${cls.date}`);
      await bookClass(cls.id, false, booking.userId, extra);
      return extra ? `${name} staat er extra bij.` : `${name} is ingeschreven.`;
    });
  };

  const passOn = (cls: StudioClass) =>
    run(async () => {
      const r = await releaseHold(cls.id);
      return r.promotedUserId ? `De plek is doorgegeven aan ${nameOf(r.promotedUserId)}.` : 'De plek is vrijgegeven.';
    });

  const intro = (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 2 }}>
      <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
        Per les wie er wacht. Valt er iemand af, dan schuift de eerste vanzelf door. Geen credits? Dan houdt de app de plek een
        uur vast en beslis jij.
      </Typography>
      <IconButton aria-label="Vernieuwen" onClick={() => load()} disabled={busy} size="small">
        <RefreshRoundedIcon fontSize="small" />
      </IconButton>
    </Box>
  );

  if (items === null) return <LoadingBlock />;

  const pendingText = (() => {
    if (!pending) return null;
    const { kind, cls, booking } = pending;
    const name = nameOf(booking.userId);
    if (kind === 'remove') {
      return {
        title: `${name} van de wachtlijst halen?`,
        body: `${name} staat dan niet meer op de wachtlijst voor ${cls.title} (${dayOf(cls.date)} ${cls.startTime}). Er gaat geen credit af.`,
        action: 'Van wachtlijst halen',
      };
    }
    const short = shortOf(cls, booking.userId);
    const extra = needsExtra(cls, booking);
    const lines = [
      extra
        ? `De les zit vol (${cls.bookedCount}/${cls.capacity}). ${name} komt er als extra plek bij.`
        : `${name} krijgt de vrije plek in ${cls.title} (${dayOf(cls.date)} ${cls.startTime}).`,
      short > 0
        ? `${name} heeft te weinig credits: je geeft ${short === 1 ? '1 credit' : `${short} credits`}, die meteen voor deze les wordt gebruikt.`
        : costFor(cls, booking.userId) > 0
          ? `Er gaat ${costFor(cls, booking.userId) === 1 ? '1 credit' : `${costFor(cls, booking.userId)} credits`} af van ${name}.`
          : 'Dit kost geen credit.',
    ];
    return {
      title: extra ? `${name} er extra bij zetten?` : `${name} inschrijven?`,
      body: lines.join(' '),
      action:
        short > 0
          ? extra
            ? 'Credit geven en erbij zetten'
            : 'Credit geven en inschrijven'
          : extra
            ? 'Extra erbij zetten'
            : 'Inschrijven',
    };
  })();

  return (
    <>
      <ContentCard>
        {intro}
        {items.length === 0 ? (
          <EmptyState>Niemand op een wachtlijst. Zit een les vol, dan zie je hier wie er wacht.</EmptyState>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {items.map(({ cls, waiting }) => {
              const holdUntil = activeHoldUntil(cls);
              const trainer = cls.trainerId ? profileOf(cls.trainerId) : undefined;
              const spotOpenNoHold = !holdUntil && cls.bookedCount < cls.capacity && waiting.length > 0;
              return (
                <Box
                  key={cls.id}
                  sx={{ border: `1px solid ${designTokens.cardBorder}`, borderRadius: `${designTokens.cardRadius}px`, p: 2 }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                      {cls.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {dayOf(cls.date)} · {cls.startTime}
                      {cls.endTime ? `–${cls.endTime}` : ''}
                      {trainer ? ` · ${trainer.displayName?.trim() || trainer.email}` : ''}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
                    <Chip size="small" label={`${cls.bookedCount}/${cls.capacity} bezet`} />
                    <Chip size="small" label={`${waiting.length} op wachtlijst`} />
                  </Box>

                  {holdUntil && cls.holdUserId && (
                    <Box
                      sx={{
                        p: 1.5,
                        mt: 1.5,
                        borderRadius: 2,
                        bgcolor: designTokens.tertiaryContainer,
                        color: designTokens.onTertiaryContainer,
                      }}
                    >
                      <Typography variant="body2" fontWeight={600}>
                        Plek vastgehouden voor {nameOf(cls.holdUserId)} tot {clockOf(holdUntil)}
                      </Typography>
                      <Typography variant="body2" sx={{ mb: 1 }}>
                        Eerste op de wachtlijst, maar geen credits. Daarna gaat de plek vanzelf naar de volgende.
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                        {(() => {
                          const holder = waiting.find((b) => b.id === cls.holdBookingId);
                          return holder ? (
                            <Button
                              size="small"
                              variant="contained"
                              disableElevation
                              disabled={busy}
                              onClick={() => setPending({ kind: 'book', cls, booking: holder })}
                            >
                              Credit geven en inschrijven
                            </Button>
                          ) : null;
                        })()}
                        <Button size="small" variant="outlined" disabled={busy} onClick={() => void passOn(cls)}>
                          Geef plek aan volgende
                        </Button>
                      </Box>
                    </Box>
                  )}

                  {spotOpenNoHold && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                      Er is een plek vrij, maar niemand op de wachtlijst had credits. Je kunt iemand hieronder inschrijven.
                    </Typography>
                  )}

                  <Box sx={{ display: 'flex', flexDirection: 'column', mt: 1 }}>
                    {waiting.map((b, i) => {
                      const short = shortOf(cls, b.userId);
                      const cost = costFor(cls, b.userId);
                      const creditText =
                        cost === 0 ? 'Geen credit nodig' : short > 0 ? 'Geen credits' : `${credits[b.userId] ?? 0} credits`;
                      return (
                        <Box
                          key={b.id}
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1.5,
                            py: 1,
                            borderTop: i === 0 ? 'none' : `1px solid ${designTokens.cardBackgroundHigh}`,
                          }}
                        >
                          <Box
                            aria-label={`Plek ${i + 1}`}
                            sx={{
                              width: 28,
                              height: 28,
                              flexShrink: 0,
                              borderRadius: '50%',
                              display: 'grid',
                              placeItems: 'center',
                              bgcolor: designTokens.secondaryContainer,
                              color: designTokens.onSecondaryContainer,
                              typography: 'body2',
                              fontWeight: 600,
                            }}
                          >
                            {i + 1}
                          </Box>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="body2" fontWeight={600} noWrap>
                              {nameOf(b.userId)}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" component="div">
                              <Box component="span" sx={short > 0 ? { color: 'error.main', fontWeight: 600 } : undefined}>
                                {creditText}
                              </Box>
                              {` · wacht sinds ${sinceOf(b.createdAt)}`}
                            </Typography>
                          </Box>
                          <IconButton
                            aria-label={`Acties voor ${nameOf(b.userId)}`}
                            size="small"
                            disabled={busy}
                            onClick={(e) => setMenu({ anchor: e.currentTarget, cls, booking: b })}
                          >
                            <MoreVertRoundedIcon fontSize="small" />
                          </IconButton>
                        </Box>
                      );
                    })}
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}
      </ContentCard>

      <Menu anchorEl={menu?.anchor ?? null} open={!!menu} onClose={() => setMenu(null)}>
        {menu && (
          <MenuItem
            onClick={() => {
              setPending({ kind: 'book', cls: menu.cls, booking: menu.booking });
              setMenu(null);
            }}
          >
            {needsExtra(menu.cls, menu.booking) ? 'Extra erbij zetten' : 'Inschrijven'}
            {shortOf(menu.cls, menu.booking.userId) > 0 ? ' (met credit)' : ''}
          </MenuItem>
        )}
        {menu && (
          <MenuItem
            sx={{ color: 'error.main' }}
            onClick={() => {
              setPending({ kind: 'remove', cls: menu.cls, booking: menu.booking });
              setMenu(null);
            }}
          >
            Van wachtlijst halen
          </MenuItem>
        )}
      </Menu>

      <Dialog open={!!pendingText} onClose={() => !busy && setPending(null)} fullWidth maxWidth="xs">
        <DialogTitle>{pendingText?.title}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{pendingText?.body}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPending(null)} disabled={busy}>
            Annuleren
          </Button>
          <Button
            variant="contained"
            disableElevation
            color={pending?.kind === 'remove' ? 'error' : 'primary'}
            disabled={busy}
            onClick={confirm}
          >
            {pendingText?.action}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
