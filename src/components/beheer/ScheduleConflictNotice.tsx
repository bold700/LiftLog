/**
 * Beheer → Lessoorten: een weekmoment botst met een andere les (zelfde trainer of ruimte). Per
 * botsing wat er botst en waarom, met voorstellen die je met één tik overneemt: een vrije ruimte op
 * hetzelfde tijdstip, of een vrij tijdstip op dezelfde dag. Het systeem stelt voor, de trainer kiest.
 */
import { Alert, AlertTitle, Box, Chip, Typography } from '@mui/material';
import { useI18n } from '../../context/I18nContext';
import type { ClassScheduleSlot } from '../../types';
import type { ScheduleCheck } from '../../services/classTypeService';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

interface Props {
  check: ScheduleCheck;
  onPickRoom: (room: string) => void;
  onPickTime: (slotIndex: number, slot: ClassScheduleSlot) => void;
}

export function ScheduleConflictNotice({ check, onPickRoom, onPickTime }: Props) {
  const { t } = useI18n();
  const day = (weekday: number) => t(`classTypes.schedule.weekdayLabels.${DAY_KEYS[weekday] ?? 'mon'}`);
  const why = (c: ScheduleCheck['conflicts'][number]) =>
    c.sameTrainer && c.sameRoom
      ? t('classTypes.schedule.conflict.both')
      : c.sameTrainer
        ? t('classTypes.schedule.conflict.sameTrainer')
        : t('classTypes.schedule.conflict.sameRoom', { room: c.other.room ?? '' });
  const slotIndexes = [...new Set(check.conflicts.map((c) => c.slotIndex))];

  return (
    <Alert severity={check.block ? 'error' : 'warning'}>
      <AlertTitle>{check.block ? t('classTypes.schedule.conflict.title') : t('classTypes.schedule.conflict.titleWarn')}</AlertTitle>
      {check.conflicts.map((c, i) => (
        <Typography key={i} variant="body2" sx={{ mb: 0.5 }}>
          {t('classTypes.schedule.conflict.with', {
            day: day(c.slot.weekday),
            start: c.slot.startTime,
            end: c.slot.endTime,
            name: c.other.name,
            otherDay: day(c.other.weekday),
            otherStart: c.other.startTime,
            otherEnd: c.other.endTime,
          })}
          : {why(c)}.
        </Typography>
      ))}
      {slotIndexes.map((idx) => {
        const s = check.suggestions[idx];
        if (!s) return null;
        const none = s.rooms.length === 0 && s.times.length === 0;
        return (
          <Box key={idx} sx={{ mt: 1 }}>
            {none && (
              <Typography variant="body2" color="text.secondary">
                {t('classTypes.schedule.conflict.noSuggestion')}
              </Typography>
            )}
            {s.rooms.length > 0 && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, alignItems: 'center', mb: 0.75 }}>
                <Typography variant="caption" sx={{ fontWeight: 600, mr: 0.5 }}>
                  {t('classTypes.schedule.conflict.otherRoom')}
                </Typography>
                {s.rooms.map((r) => (
                  <Chip key={r} size="small" label={r} onClick={() => onPickRoom(r)} />
                ))}
              </Box>
            )}
            {s.times.length > 0 && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, alignItems: 'center' }}>
                <Typography variant="caption" sx={{ fontWeight: 600, mr: 0.5 }}>
                  {t('classTypes.schedule.conflict.otherTime')}
                </Typography>
                {s.times.map((slot) => (
                  <Chip
                    key={slot.startTime}
                    size="small"
                    label={`${day(slot.weekday).slice(0, 2)} ${slot.startTime}–${slot.endTime}${slot.adjacent ? ` · ${t('classTypes.schedule.conflict.adjacent')}` : ''}`}
                    color={slot.adjacent ? 'primary' : 'default'}
                    variant={slot.adjacent ? 'filled' : 'outlined'}
                    onClick={() => onPickTime(idx, slot)}
                  />
                ))}
              </Box>
            )}
          </Box>
        );
      })}
      {check.block && (
        <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>
          {t('classTypes.schedule.conflict.blocked')}
        </Typography>
      )}
    </Alert>
  );
}
