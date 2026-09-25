// Lijngrafiek voor de trends op de Metingen-pagina: gewicht en som huidplooien. Met assen (waarde links,
// datum onder), rasterlijnen en een stip per meting, zodat je de waarden kunt aflezen; hover/tik toont
// de exacte meting. Zelfde bibliotheek (recharts) als de progressiegrafiek bij Oefeningen.
import { Box, useTheme } from '@mui/material';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export interface TrendPoint {
  id: string;
  date: string;
  value: number;
}

/** "2026-09-23" als lokale middag (geen tijdzonesprong naar de vorige dag); volledige ISO-tijd zoals hij is. */
function toTime(date: string): number {
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T12:00:00` : date).getTime();
}

const num = (v: number) => v.toLocaleString('nl-NL', { maximumFractionDigits: 1 });
const DAY = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short' });
const FULL = new Intl.DateTimeFormat('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

/** Ronde, gelijke stappen voor de waarde-as (1, 2, 5, 10 …), met wat ruimte boven en onder de lijn. */
function niceTicks(values: number[]): number[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max(0.5, (max - min) * 0.1);
  const lo = min - pad;
  const hi = max + pad;
  const raw = (hi - lo) / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((f) => f * mag).find((s) => s >= raw) ?? 10 * mag;
  const ticks: number[] = [];
  for (let v = Math.floor(lo / step) * step; v <= Math.ceil(hi / step) * step + step / 2; v += step) {
    ticks.push(Math.round(v * 100) / 100);
  }
  return ticks;
}

export function TrendChart({ points, unit, goal }: { points: TrendPoint[]; unit: string; goal?: number | null }) {
  const theme = useTheme();
  const data = points
    .map((p) => ({ ...p, t: toTime(p.date) }))
    .filter((p) => Number.isFinite(p.t))
    .sort((a, b) => a.t - b.t)
    .slice(-20);
  if (data.length === 0) return null;

  const yTicks = niceTicks([...data.map((d) => d.value), ...(goal != null ? [goal] : [])]);
  const axisText = { fontSize: 11, fill: theme.palette.text.secondary };

  return (
    <Box sx={{ width: '100%', height: { xs: 190, md: 230 } }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={theme.palette.divider} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            ticks={data.map((d) => d.t)}
            interval="preserveStartEnd"
            minTickGap={28}
            tickFormatter={(t: number) => DAY.format(t).replace('.', '')}
            tick={axisText}
            tickLine={false}
            axisLine={{ stroke: theme.palette.divider }}
            padding={{ left: 8, right: 8 }}
          />
          <YAxis
            domain={[yTicks[0], yTicks[yTicks.length - 1]]}
            ticks={yTicks}
            tickFormatter={(v: number) => `${num(v)} ${unit}`}
            tick={axisText}
            tickLine={false}
            axisLine={false}
            width={52}
          />
          <Tooltip
            formatter={(v: number) => [`${num(v)} ${unit}`, '']}
            separator=""
            labelFormatter={(t: number) => FULL.format(t)}
            contentStyle={{ borderRadius: 8, border: `1px solid ${theme.palette.divider}`, fontSize: 13 }}
          />
          {goal != null && (
            <ReferenceLine
              y={goal}
              stroke={theme.palette.text.disabled}
              strokeDasharray="4 4"
              label={{ value: `Doel ${num(goal)} ${unit}`, position: 'insideTopRight', fontSize: 11, fill: theme.palette.text.secondary }}
            />
          )}
          <Line
            type="linear"
            dataKey="value"
            stroke={theme.palette.primary.main}
            strokeWidth={2.5}
            dot={{ r: 3.5, fill: theme.palette.primary.main, strokeWidth: 0 }}
            activeDot={{ r: 5.5 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
}
