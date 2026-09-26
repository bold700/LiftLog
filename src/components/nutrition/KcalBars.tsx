/**
 * Kcal per dag als staafjes, voor Voeding (week/maand) en Inzichten → Voeding.
 *
 * Een grafiek zonder waarden zei weinig: de waarde stond alleen in een hover-tooltip (werkt niet op
 * een telefoon) en er was geen doel te zien. Nu: een stippellijn op het doel, tik op een dag voor de
 * waarde, en leesbare labels (bij een maand één per week).
 */
import { useState } from 'react';
import { Box, Typography } from '@mui/material';
import { designTokens } from '../../theme/designTokens';
import { formatNumber } from '../../utils/format';

export interface KcalDay {
  /** YYYY-MM-DD */
  date: string;
  kcal: number;
}

const WEEKDAYS = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
const MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

const dateOf = (iso: string) => new Date(`${iso}T12:00:00`);
const longLabel = (iso: string) => {
  const d = dateOf(iso);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

export function KcalBars({ days, goal, height = 120 }: { days: KcalDay[]; goal?: number | null; height?: number }) {
  const [selected, setSelected] = useState<string | null>(null);
  const max = Math.max(1, ...days.map((d) => d.kcal), goal ?? 0) * 1.08;
  const many = days.length > 14;
  const sel = days.find((d) => d.date === selected) ?? null;
  const pct = (kcal: number) => `${Math.round((kcal / max) * 1000) / 10}%`;

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ minHeight: 20, mb: 1 }}>
        {sel
          ? `${longLabel(sel.date)} · ${formatNumber(sel.kcal, 0)} kcal`
          : goal
            ? `Stippellijn = je doel van ${formatNumber(goal, 0)} kcal · tik op een dag voor de waarde`
            : 'Tik op een dag voor de waarde'}
      </Typography>
      <Box sx={{ position: 'relative', height }}>
        {goal ? (
          <Box
            aria-hidden
            sx={{ position: 'absolute', left: 0, right: 0, bottom: pct(goal), borderTop: `1px dashed ${designTokens.outline}`, pointerEvents: 'none', zIndex: 1 }}
          />
        ) : null}
        <Box sx={{ display: 'flex', alignItems: 'stretch', gap: many ? '2px' : 1, height: '100%' }}>
          {days.map((d) => {
            const over = !!goal && d.kcal > goal * 1.1;
            const active = d.date === selected;
            return (
              <Box
                key={d.date}
                component="button"
                type="button"
                aria-label={`${longLabel(d.date)}: ${formatNumber(d.kcal, 0)} kcal`}
                aria-pressed={active}
                onClick={() => setSelected(active ? null : d.date)}
                sx={{ all: 'unset', flex: 1, minWidth: 0, height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', cursor: 'pointer' }}
              >
                <Box
                  sx={{
                    width: many ? '100%' : '70%',
                    height: pct(d.kcal),
                    minHeight: d.kcal > 0 ? 2 : 0,
                    borderRadius: '4px 4px 0 0',
                    // Boven het doel (meer dan 10% erboven) in de tertiaire kleur, zodat het opvalt zonder alarm.
                    bgcolor: over ? designTokens.tertiary : designTokens.primary,
                    opacity: selected && !active ? 0.45 : 1,
                    transition: 'opacity 0.15s ease, height 0.2s ease',
                  }}
                />
              </Box>
            );
          })}
        </Box>
      </Box>
      <Box sx={{ display: 'flex', gap: many ? '2px' : 1, mt: 0.5 }}>
        {days.map((d, i) => {
          const dt = dateOf(d.date);
          // Bij een maand één label per week (maandag), anders elke dag.
          const show = !many || dt.getDay() === 1 || i === 0;
          return (
            <Typography key={d.date} sx={{ flex: 1, minWidth: 0, fontSize: 11, lineHeight: '14px', color: 'text.secondary', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'visible' }}>
              {show ? (many ? `${dt.getDate()} ${MONTHS[dt.getMonth()]}` : days.length <= 7 ? WEEKDAYS[dt.getDay()] : dt.getDate()) : ''}
            </Typography>
          );
        })}
      </Box>
    </Box>
  );
}
