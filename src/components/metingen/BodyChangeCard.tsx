// "Waar zitten de kilo's?": de gewichtsverandering tussen twee metingen opgesplitst in vet, spier en
// de rest (water, bot). Op de Metingen-pagina (laatste meting) en in het bodyscan-rapport (die scan).
import { useMemo, useState } from 'react';
import { Box, MenuItem, TextField, Typography } from '@mui/material';
import type { Measurement } from '../../services/measurementService';
import { bodyChange, bodyChangeSentence, comparableMeasurements } from '../../utils/bodyChange';
import { designTokens } from '../../theme/designTokens';

type Tone = 'good' | 'bad' | 'neutral';
const TONE_COLOR: Record<Tone, string> = { good: 'primary.main', bad: 'error.main', neutral: 'text.secondary' };

const signedKg = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(1).replace('.', ',')} kg`;
const dateLabel = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
const tone = (n: number, upIsGood: boolean | null): Tone =>
  upIsGood == null || Math.abs(n) < 0.05 ? 'neutral' : n > 0 === upIsGood ? 'good' : 'bad';

interface Props {
  items: Measurement[];
  /** De meting waar je naartoe kijkt; standaard de laatste vergelijkbare meting. */
  to?: Measurement;
  /** Zonder eigen kaart (bijv. in het rapport, dat al een kader heeft). */
  plain?: boolean;
}

export function BodyChangeCard({ items, to, plain = false }: Props) {
  const list = useMemo(() => comparableMeasurements(items), [items]);
  const target = to ?? list[list.length - 1];
  const earlier = useMemo(() => {
    const i = target ? list.findIndex((m) => m.id === target.id) : -1;
    return i > 0 ? list.slice(0, i) : [];
  }, [list, target]);
  const [fromId, setFromId] = useState<string>('');
  if (!target || earlier.length === 0) return null;
  const from = earlier.find((m) => m.id === fromId) ?? earlier[earlier.length - 1];
  const c = bodyChange(from, target);
  if (!c) return null;

  const rows: { label: string; kgDelta: number; tone: Tone; hint?: string }[] = [
    { label: 'Vet', kgDelta: c.fatKg, tone: tone(c.fatKg, false) },
    ...(c.muscleKg != null ? [{ label: 'Spier', kgDelta: c.muscleKg, tone: tone(c.muscleKg, true) }] : []),
    {
      label: c.muscleKg != null ? 'Water en overig' : 'Vetvrij',
      kgDelta: c.otherKg,
      tone: 'neutral' as Tone,
      hint: c.muscleKg != null ? 'Lichaamswater, bot en organen; schommelt per dag.' : 'Spier, water en bot samen (deze meting heeft geen spiermassa).',
    },
  ];
  const max = Math.max(0.5, ...rows.map((r) => Math.abs(r.kgDelta)));

  return (
    <Box sx={plain ? { mb: 2 } : { backgroundColor: designTokens.cardBackground, borderRadius: `${designTokens.cardRadius}px`, p: { xs: 2, md: 3 }, minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600, flex: 1, minWidth: 160 }}>
          Waar zitten de kilo's?
        </Typography>
        <TextField
          select
          size="small"
          label="Vergelijk met"
          value={from.id}
          onChange={(e) => setFromId(e.target.value)}
          sx={{ minWidth: 170 }}
        >
          {[...earlier].reverse().map((m, i) => (
            <MenuItem key={m.id} value={m.id}>
              {dateLabel(m.date)}
              {i === 0 ? ' (vorige)' : i === earlier.length - 1 ? ' (eerste)' : ''}
            </MenuItem>
          ))}
        </TextField>
      </Box>
      <Typography variant="body2" sx={{ mb: 1.5 }}>
        <Box component="span" sx={{ fontWeight: 600 }}>
          {bodyChangeSentence(c)}
        </Box>{' '}
        <Box component="span" sx={{ color: 'text.secondary' }}>
          ({c.days} {c.days === 1 ? 'dag' : 'dagen'}, {dateLabel(c.from.date)} → {dateLabel(c.to.date)})
        </Box>
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        {rows.map((r) => {
          const w = `${(Math.abs(r.kgDelta) / max) * 50}%`;
          return (
            <Box key={r.label}>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 0.5 }}>
                <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} title={r.hint}>
                  {r.label}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, color: TONE_COLOR[r.tone] }}>
                  {signedKg(r.kgDelta)}
                </Typography>
              </Box>
              {/* Balk vanuit het midden: links eraf, rechts erbij. */}
              <Box sx={{ position: 'relative', height: 6, borderRadius: 3, bgcolor: designTokens.cardBackgroundHigh }}>
                <Box sx={{ position: 'absolute', left: '50%', top: -2, bottom: -2, width: '1px', bgcolor: 'divider' }} />
                <Box
                  sx={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    borderRadius: 3,
                    bgcolor: TONE_COLOR[r.tone] === 'text.secondary' ? designTokens.onSecondaryContainer : TONE_COLOR[r.tone],
                    width: w,
                    ...(r.kgDelta >= 0 ? { left: '50%' } : { right: '50%' }),
                  }}
                />
              </Box>
            </Box>
          );
        })}
      </Box>
      {c.muscleKg != null && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.25 }}>
          Water en overig schommelt per dag (eten, drinken, tijdstip). Vergelijk daarom metingen op hetzelfde moment van de dag.
        </Typography>
      )}
    </Box>
  );
}
