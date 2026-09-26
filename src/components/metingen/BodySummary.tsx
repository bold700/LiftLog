// Onderdelen van Inzichten → Metingen zoals Figma "Body": scanbanner, laatste gewicht met trend,
// lichaamssamenstelling met balken en de historie als rijen met een bron-label.
import { useState, type MouseEvent } from 'react';
import { Box, Button, CircularProgress, IconButton, Menu, MenuItem, Typography } from '@mui/material';
import QrCodeScannerRoundedIcon from '@mui/icons-material/QrCodeScannerRounded';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { skinfoldSum, type Measurement } from '../../services/measurementService';
import { BODY_SCAN_SOURCES } from '../../utils/bodyScan';
import {
  bodyComposition,
  latestWeight,
  measurementSource,
  measurementWhen,
  type MeasurementSource,
  weightTone,
  type DeltaTone,
} from '../../utils/bodySummary';
import { designTokens } from '../../theme/designTokens';
import { TrendChart, type TrendPoint } from './TrendChart';

const nl = (n: number) => String(n).replace('.', ',');

/** Goed nieuws in de hoofdkleur, slecht nieuws in rood, de rest neutraal. */
const TONE_COLOR: Record<DeltaTone, string> = { good: 'primary.main', bad: 'error.main', neutral: 'text.secondary' };

const cardSx = () => ({
  backgroundColor: designTokens.cardBackground,
  borderRadius: `${designTokens.cardRadius}px`,
});

/** Figma "Scan CTA": groene balk die de invoer opent met de bodyscan-stap open. */
export function ScanBanner({ onClick }: { onClick: () => void }) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      sx={{
        all: 'unset',
        boxSizing: 'border-box',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        width: '100%',
        minHeight: 64,
        pl: 2,
        pr: 1.75,
        py: 1.25,
        borderRadius: `${designTokens.cardRadius}px`,
        bgcolor: designTokens.primaryContainer,
        color: designTokens.onPrimaryContainer,
        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, color: 'inherit' }}>
          Bodyscan uitlezen
        </Typography>
        <Typography variant="caption" sx={{ display: 'block', color: 'inherit', opacity: 0.85 }}>
          Maak een foto van de uitslag op de weegschaal; de waarden worden ingevuld
        </Typography>
      </Box>
      <Box
        aria-hidden
        sx={{
          width: 36,
          height: 36,
          borderRadius: '10px',
          bgcolor: designTokens.primary,
          color: designTokens.onPrimary,
          display: 'grid',
          placeItems: 'center',
          flexShrink: 0,
        }}
      >
        <QrCodeScannerRoundedIcon fontSize="small" />
      </Box>
    </Box>
  );
}

interface LatestWeightCardProps {
  items: Measurement[];
  goalWeight: number | null;
}

/** Figma "Latest": groot gewicht, verschil met de vorige weging, wanneer/hoe gemeten, en de trend. */
export function LatestWeightCard({ items, goalWeight }: LatestWeightCardProps) {
  const latest = latestWeight(items);
  const weightPoints: TrendPoint[] = items
    .filter((m) => m.weightKg != null)
    .map((m) => ({ id: m.id, date: m.date, value: m.weightKg as number }));
  const skinPoints: TrendPoint[] = items
    .map((m) => ({ id: m.id, date: m.date, value: skinfoldSum(m) }))
    .filter((p): p is TrendPoint => p.value != null);

  if (!latest) {
    return (
      <Box sx={{ ...cardSx(), p: { xs: 2, md: 3 }, minWidth: 0 }}>
        <Typography variant="body2" color="text.secondary">
          Nog geen gewicht gemeten.
        </Typography>
      </Box>
    );
  }

  const m = latest.measurement;
  const source = m.bodyScan ? BODY_SCAN_SOURCES.find((s) => s.key === m.bodyScan?.source)?.label ?? 'bodyscan' : null;
  const toGoal = goalWeight != null ? Math.round((latest.weightKg - goalWeight) * 10) / 10 : null;

  return (
    <Box sx={{ ...cardSx(), p: { xs: 2, md: 3 }, minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
        <Typography sx={{ fontSize: { xs: 36, md: 45 }, lineHeight: 1.15, fontWeight: 500 }}>{nl(latest.weightKg)}</Typography>
        <Typography variant="body1" color="text.secondary" sx={{ flex: 1 }}>
          kg
        </Typography>
        {latest.deltaKg != null && latest.deltaKg !== 0 && (
          <Typography
            variant="body2"
            sx={{
              fontWeight: 600,
              textAlign: 'right',
              color: TONE_COLOR[weightTone(latest.weightKg, latest.weightKg - latest.deltaKg, goalWeight)],
            }}
          >
            {latest.deltaKg > 0 ? '+' : '−'}
            {nl(Math.abs(latest.deltaKg))} kg
            {/* Ook op de telefoon zeggen waar het verschil over gaat, anders staat er een los getal. */}
            <Box component="span" sx={{ display: { xs: 'inline', md: 'none' } }}>
              {' '}t.o.v. vorige
            </Box>
            <Box component="span" sx={{ display: { xs: 'none', md: 'inline' } }}>
              {' '}t.o.v. vorige meting
            </Box>
          </Typography>
        )}
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
        Gemeten {measurementWhen(m, { weekday: true })}
        {source ? ` · ${source}` : ''}
      </Typography>
      {goalWeight != null && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          Doel {nl(goalWeight)} kg
          {toGoal != null && (Math.abs(toGoal) < 0.05 ? ' · behaald' : ` · nog ${nl(Math.abs(toGoal))} kg`)}
        </Typography>
      )}
      {weightPoints.length >= 2 && (
        <Box sx={{ mt: 2 }}>
          <TrendChart points={weightPoints} unit="kg" goal={goalWeight} />
        </Box>
      )}
      {skinPoints.length >= 2 && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            Som huidplooien (mm)
          </Typography>
          <TrendChart points={skinPoints} unit="mm" />
        </Box>
      )}
    </Box>
  );
}

interface CompositionCardProps {
  items: Measurement[];
  heightCm: number | null | undefined;
  /** Opent het volledige rapport van de laatste bodyscan; alleen als er een scan is. */
  onViewScan: ((m: Measurement) => void) | null;
}

/** Figma "Body composition": per waarde een regel met getal en verschil, en een balk. */
export function CompositionCard({ items, heightCm, onViewScan }: CompositionCardProps) {
  const rows = bodyComposition(items, heightCm);
  if (rows.length === 0) return null;
  const lastScan = [...items].reverse().find((m) => m.bodyScan) ?? null;
  return (
    <Box sx={{ ...cardSx(), p: { xs: 2, md: 3 }, minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1.25 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Lichaamssamenstelling
        </Typography>
        {lastScan && onViewScan && (
          <Button size="small" onClick={() => onViewScan(lastScan)} sx={{ textTransform: 'none', fontWeight: 600, my: -0.5 }}>
            Volledig rapport
          </Button>
        )}
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {rows.map((r) => (
          <Box key={r.label}>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 0.75 }}>
              <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>
                {r.label}
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 600, width: 80, textAlign: { xs: 'right', md: 'left' } }}>
                {r.value}
              </Typography>
              <Typography
                variant="caption"
                sx={{ width: 46, color: TONE_COLOR[r.tone], fontWeight: 500, display: { xs: 'none', md: 'block' } }}
              >
                {r.delta ?? ''}
              </Typography>
            </Box>
            <Box sx={{ height: 6, borderRadius: 3, bgcolor: designTokens.cardBackgroundHigh, overflow: 'hidden' }}>
              <Box sx={{ height: '100%', width: `${r.fill * 100}%`, borderRadius: 3, bgcolor: designTokens.onSecondaryContainer }} />
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

const SOURCE_TAG: Record<MeasurementSource, string> = { scan: 'Scan', plooien: 'Plooien', handmatig: 'Handmatig' };

function SourceTag({ source }: { source: MeasurementSource }) {
  return (
    <Box
      component="span"
      sx={{
        px: 1,
        py: 0.25,
        borderRadius: '6px',
        fontSize: 11,
        fontWeight: 500,
        lineHeight: '16px',
        whiteSpace: 'nowrap',
        bgcolor: source === 'scan' ? designTokens.tertiaryContainer : designTokens.cardBackgroundHigh,
        color: source === 'scan' ? designTokens.onTertiaryContainer : 'text.secondary',
      }}
    >
      {SOURCE_TAG[source]}
    </Box>
  );
}

interface HistoryRowsProps {
  loading: boolean;
  /** Metingen, oud → nieuw. */
  items: Measurement[];
  onEdit: (m: Measurement) => void;
  onDelete: (id: string) => void;
  onViewScan: (m: Measurement) => void;
}

/** Figma "History": per meting datum, gewicht, vetpercentage en bron; ⋮ voor bewerken/verwijderen. */
export function HistoryRows({ loading, items, onEdit, onDelete, onViewScan }: HistoryRowsProps) {
  const [menu, setMenu] = useState<{ anchor: HTMLElement; m: Measurement } | null>(null);
  const open = (e: MouseEvent<HTMLElement>, m: Measurement) => setMenu({ anchor: e.currentTarget, m });

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
        <CircularProgress size={20} />
      </Box>
    );
  }
  if (items.length === 0) return null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {[...items].reverse().map((m) => {
        const extras = [
          m.note?.trim() ? `“${m.note.trim()}”` : null,
          skinfoldSum(m) != null ? `plooien ${nl(skinfoldSum(m) as number)} mm` : null,
        ].filter(Boolean);
        return (
          <Box key={m.id} sx={{ ...cardSx(), display: 'flex', alignItems: 'center', gap: { xs: 1.5, md: 2 }, pl: 2.5, pr: 0.5, py: 0.75, minHeight: 44 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: { xs: 1.5, md: 2 } }}>
                <Typography variant="body2" sx={{ fontWeight: 600, flex: { md: 1 }, whiteSpace: 'nowrap' }}>
                  <Box component="span" sx={{ display: { xs: 'none', md: 'inline' } }}>
                    {measurementWhen(m)}
                  </Box>
                  <Box component="span" sx={{ display: { xs: 'inline', md: 'none' } }}>
                    {measurementWhen(m, { time: false })}
                  </Box>
                </Typography>
                <Typography variant="body2" color="text.secondary" noWrap sx={{ flex: { xs: 1, md: 'none' }, minWidth: 0 }}>
                  {[m.weightKg != null ? `${nl(m.weightKg)} kg` : null, m.bodyFatPct != null ? `${nl(m.bodyFatPct)} %` : null]
                    .filter(Boolean)
                    .join(' · ') || '—'}
                </Typography>
              </Box>
              {extras.length > 0 && (
                <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                  {extras.join(' · ')}
                </Typography>
              )}
            </Box>
            {/* Vaste breedte: anders springen de waarden per regel door "Scan", "Plooien" of "Handmatig". */}
            <Box sx={{ width: 84, display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
              <SourceTag source={measurementSource(m)} />
            </Box>
            <IconButton size="small" aria-label="Meting bewerken of verwijderen" onClick={(e) => open(e, m)} sx={{ color: 'text.secondary' }}>
              <MoreVertIcon fontSize="small" />
            </IconButton>
          </Box>
        );
      })}
      <Menu anchorEl={menu?.anchor ?? null} open={menu != null} onClose={() => setMenu(null)}>
        {menu?.m.bodyScan && (
          <MenuItem
            onClick={() => {
              onViewScan(menu.m);
              setMenu(null);
            }}
          >
            Bodyscan-rapport
          </MenuItem>
        )}
        <MenuItem
          onClick={() => {
            if (menu) onEdit(menu.m);
            setMenu(null);
          }}
        >
          Bewerken
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menu) onDelete(menu.m.id);
            setMenu(null);
          }}
          sx={{ color: 'error.main' }}
        >
          Verwijderen
        </MenuItem>
      </Menu>
    </Box>
  );
}
