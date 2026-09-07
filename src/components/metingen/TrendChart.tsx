// Lijngrafiek (inline SVG) voor de trends op de Metingen-pagina: gewicht en som huidplooien.
import { useEffect, useRef, useState } from 'react';
import { Box } from '@mui/material';

export interface TrendPoint {
  id: string;
  date: string;
  value: number;
}

/** Lijngrafiek (viewBox = echte pixelbreedte, geen vervorming). Optionele stippellijn voor een doel. */
export function TrendChart({ points, unit, goal }: { points: TrendPoint[]; unit: string; goal?: number | null }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(320);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setWidth(Math.round(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const pts = points.slice(-20);
  const CH = 130;
  const pad = 14;
  const values = pts.map((p) => p.value);
  const min = Math.min(...values, goal ?? Infinity);
  const max = Math.max(...values, goal ?? -Infinity);
  const range = max - min || 1;
  const cx = (i: number) => (pts.length > 1 ? (i * (width - 2 * pad)) / (pts.length - 1) : (width - 2 * pad) / 2) + pad;
  const cy = (v: number) => CH - pad - ((v - min) / range) * (CH - 2 * pad);
  const line = pts.map((p, i) => `${cx(i)},${cy(p.value)}`).join(' ');
  return (
    <Box ref={ref} sx={{ width: '100%', color: 'primary.main' }}>
      <svg viewBox={`0 0 ${width} ${CH}`} style={{ display: 'block', height: CH, width: '100%' }}>
        {goal != null && <line x1={0} y1={cy(goal)} x2={width} y2={cy(goal)} stroke="#9e9e9e" strokeWidth={1} strokeDasharray="4 4" />}
        <polyline points={line} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => (
          <circle key={p.id} cx={cx(i)} cy={cy(p.value)} r={3} fill="currentColor">
            <title>{`${p.date}: ${p.value} ${unit}`}</title>
          </circle>
        ))}
      </svg>
    </Box>
  );
}
