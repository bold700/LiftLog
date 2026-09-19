/**
 * Balk bovenaan Beheer met alles wat op een besluit wacht: trainer-aanvragen en workout-aanvragen,
 * bij elkaar geteld. "Bekijken" opent de lijst om ze af te handelen. Verdwijnt zonder aanvragen.
 * Naar het ontwerp: tertiary container, één regel samenvatting, knop rechts.
 */
import { useCallback, useEffect, useState } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { useI18n } from '../../context/I18nContext';
import { useNotify } from '../../context/NotifyContext';
import { updateProfile } from '../../services/profileService';
import { getPendingWorkoutRequests, resolveWorkoutRequest, type WorkoutRequest } from '../../services/workoutRequestService';
import { designTokens } from '../../theme/designTokens';
import type { Profile } from '../../types';

interface RequestsBannerProps {
  profiles: Profile[];
  /** Na een besluit: de ledenlijst opnieuw laden. */
  onChanged: () => void | Promise<void>;
}

export function RequestsBanner({ profiles, onChanged }: RequestsBannerProps) {
  const { t } = useI18n();
  const notify = useNotify();
  const [workoutRequests, setWorkoutRequests] = useState<WorkoutRequest[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    getPendingWorkoutRequests()
      .then(setWorkoutRequests)
      .catch((err) => notify.error(t('admin.requests.failed'), err));
  }, [notify, t, profiles]);

  const trainerRequests = profiles.filter((p) => p.trainerRequested && p.role === 'sporter');
  const nameOf = (p: { displayName?: string | null; email?: string | null; userId: string }) => p.displayName?.trim() || p.email || p.userId;
  const lines = [
    ...trainerRequests.map((p) => t('admin.requests.trainerRights', { name: nameOf(p) })),
    ...workoutRequests.map((r) => t('admin.requests.newProgramme', { name: nameOf(r) })),
  ];
  const count = lines.length;

  const decideTrainer = useCallback(
    async (p: Profile, approve: boolean) => {
      setBusy(p.userId);
      try {
        await updateProfile(p.userId, approve ? { role: 'trainer', trainerRequested: false } : { trainerRequested: false });
        await onChanged();
      } catch (err) {
        notify.error(t('admin.requests.failed'), err);
      } finally {
        setBusy(null);
      }
    },
    [notify, onChanged, t]
  );

  const finishWorkout = useCallback(
    async (r: WorkoutRequest) => {
      setBusy(r.id);
      try {
        await resolveWorkoutRequest(r.id);
        setWorkoutRequests((list) => list.filter((x) => x.id !== r.id));
      } catch (err) {
        notify.error(t('admin.requests.failed'), err);
      } finally {
        setBusy(null);
      }
    },
    [notify, t]
  );

  if (count === 0) return null;

  return (
    <>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          p: 2,
          mb: 2,
          borderRadius: `${designTokens.cardRadius}px`,
          bgcolor: designTokens.tertiaryContainer,
          color: designTokens.onTertiaryContainer,
        }}
      >
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="subtitle2" fontWeight={600}>
            {t('admin.openRequests', { count })}
          </Typography>
          <Typography variant="caption" noWrap sx={{ display: { xs: 'none', sm: 'block' }, opacity: 0.85 }}>
            {lines.slice(0, 3).join(' · ')}
          </Typography>
        </Box>
        <Button
          size="small"
          variant="contained"
          disableElevation
          onClick={() => setOpen(true)}
          sx={{ bgcolor: designTokens.onTertiaryContainer, color: designTokens.tertiaryContainer, '&:hover': { bgcolor: designTokens.onTertiaryContainer } }}
        >
          {t('admin.review')}
        </Button>
      </Box>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('admin.requests.title')}</DialogTitle>
        <DialogContent>
          {count === 0 && <Typography color="text.secondary">{t('admin.requests.none')}</Typography>}
          {trainerRequests.map((p) => (
            <Row key={p.userId} text={t('admin.requests.trainerRights', { name: nameOf(p) })}>
              <Button size="small" onClick={() => void decideTrainer(p, false)} disabled={busy === p.userId}>
                {t('admin.requests.decline')}
              </Button>
              <Button size="small" variant="contained" onClick={() => void decideTrainer(p, true)} disabled={busy === p.userId}>
                {t('admin.requests.approve')}
              </Button>
            </Row>
          ))}
          {workoutRequests.map((r) => (
            <Row key={r.id} text={t('admin.requests.newProgramme', { name: nameOf(r) })} note={r.note}>
              <Button size="small" onClick={() => void finishWorkout(r)} disabled={busy === r.id}>
                {t('admin.requests.done')}
              </Button>
            </Row>
          ))}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

function Row({ text, note, children }: { text: string; note?: string | null; children: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1, py: 1.25, borderBottom: '1px solid', borderColor: 'divider' }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" fontWeight={600}>
          {text}
        </Typography>
        {note && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {note}
          </Typography>
        )}
      </Box>
      <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>{children}</Box>
    </Box>
  );
}
