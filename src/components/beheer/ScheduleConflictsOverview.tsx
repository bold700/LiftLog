/**
 * Beheer → Lessoorten, bovenaan: weekmomenten die nu al botsen (zelfde trainer of ruimte op
 * hetzelfde moment), zodat de studio ze één keer rechtzet. Niets dubbel: niets te zien.
 */
import { useEffect, useState } from 'react';
import { Alert, AlertTitle, Typography } from '@mui/material';
import { useI18n } from '../../context/I18nContext';
import { getScheduleConflicts } from '../../services/classTypeService';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

type Conflicts = Awaited<ReturnType<typeof getScheduleConflicts>>['conflicts'];

/** `refreshKey` verandert na elke opslag, zodat het overzicht meteen klopt. */
export function ScheduleConflictsOverview({ refreshKey }: { refreshKey: number }) {
  const { t } = useI18n();
  const [conflicts, setConflicts] = useState<Conflicts>([]);

  useEffect(() => {
    let cancelled = false;
    getScheduleConflicts().then(
      (r) => {
        if (!cancelled) setConflicts(r.conflicts);
      },
      () => undefined
    );
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (conflicts.length === 0) return null;
  const day = (weekday: number) => t(`classTypes.schedule.weekdayLabels.${DAY_KEYS[weekday] ?? 'mon'}`).slice(0, 2);
  const why = (c: Conflicts[number]) =>
    c.sameTrainer && c.sameRoom
      ? t('classTypes.schedule.conflict.both')
      : c.sameTrainer
        ? t('classTypes.schedule.conflict.sameTrainer')
        : t('classTypes.schedule.conflict.sameRoom', { room: c.a.room ?? '' });

  return (
    <Alert severity="warning" sx={{ mb: 2 }}>
      <AlertTitle>{t('classTypes.schedule.conflict.overviewTitle', { count: conflicts.length })}</AlertTitle>
      <Typography variant="body2" sx={{ mb: 0.75 }}>
        {t('classTypes.schedule.conflict.overviewHelp')}
      </Typography>
      {conflicts.slice(0, 10).map((c, i) => (
        <Typography key={i} variant="body2">
          {day(c.a.weekday)} {c.a.startTime}–{c.a.endTime}: {c.a.name} ↔ {c.b.name} ({c.b.startTime}–{c.b.endTime}), {why(c)}
        </Typography>
      ))}
    </Alert>
  );
}
