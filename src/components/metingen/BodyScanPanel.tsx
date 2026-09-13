// Paneel bovenaan de Metingen-pagina met het rapport van de laatste bodyscan. Inklapbaar, zodat de
// invoer eronder bereikbaar blijft; het verschil met de vorige scan staat in de kop.
import { useState } from 'react';
import { Box, Button, Collapse, Typography } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { OutlineCard } from '../layout';
import type { Measurement } from '../../services/measurementService';
import { formatScanValue, type BodyScanValueKey } from '../../utils/bodyScan';
import { BodyScanReport } from './BodyScanReport';
import { PANEL_SX } from './styles';

interface BodyScanPanelProps {
  /** Metingen, oud → nieuw gesorteerd. */
  items: Measurement[];
}

const DELTA_KEYS: { key: BodyScanValueKey; label: string; unit: string }[] = [
  { key: 'skeletalMuscleKg', label: 'spier', unit: 'kg' },
  { key: 'fatMassKg', label: 'vet', unit: 'kg' },
  { key: 'visceralFatLevel', label: 'visceraal', unit: '' },
];

export function BodyScanPanel({ items }: BodyScanPanelProps) {
  const [open, setOpen] = useState(true);
  const scans = items.filter((m) => m.bodyScan);
  const latest = scans[scans.length - 1] ?? null;
  const previous = scans.length > 1 ? scans[scans.length - 2] : null;
  if (!latest?.bodyScan) return null;

  // Verschil met de vorige scan: alleen voor waarden die in beide zitten.
  const deltas = previous?.bodyScan
    ? DELTA_KEYS.map((d) => {
        const a = previous.bodyScan?.values[d.key];
        const b = latest.bodyScan?.values[d.key];
        if (a == null || b == null) return null;
        const diff = Math.round((b - a) * 10) / 10;
        return `${d.label} ${diff > 0 ? '+' : ''}${formatScanValue(d.key, diff)}${d.unit ? ` ${d.unit}` : ''}`;
      }).filter((x): x is string => x != null)
    : [];

  return (
    <OutlineCard sx={PANEL_SX}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1" fontWeight={600}>
            Bodyscan {latest.date}
          </Typography>
          {deltas.length > 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              Sinds {previous?.date}: {deltas.join(' · ')}
            </Typography>
          )}
        </Box>
        <Button
          size="small"
          variant="text"
          onClick={() => setOpen((o) => !o)}
          endIcon={<ExpandMoreIcon sx={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />}
          sx={{ textTransform: 'none', flex: '0 0 auto' }}
          aria-expanded={open}
        >
          {open ? 'Inklappen' : 'Rapport'}
        </Button>
      </Box>
      <Collapse in={open}>
        <Box sx={{ mt: 1.5 }}>
          <BodyScanReport scan={latest.bodyScan} date={latest.date} />
        </Box>
      </Collapse>
    </OutlineCard>
  );
}
