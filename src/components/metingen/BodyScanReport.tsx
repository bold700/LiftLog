// Bodyscan-rapport: de uitslag van de weegschaal als leesbaar overzicht op mobiel, in de opzet van
// een InBody-uitdraai: score bovenaan, balken laag/normaal/hoog per waarde, samenstelling, segmentale
// spier/vet-verdeling en gewichtsregulatie. Alleen weergave; rekent niets zelf uit.
import { Box, Typography } from '@mui/material';
import { BodyScanFigure } from './BodyScanFigure';
import {
  BODY_SCAN_FIELDS,
  BODY_SCAN_SOURCES,
  RANGE_BAR_NORMAL,
  RANGE_STATUS_LABEL,
  fieldDef,
  formatScanValue,
  groupHasValues,
  rangeBarPosition,
  rangeStatus,
  segmentsHaveValues,
  type BodyScan,
  type BodyScanRange,
  type BodyScanValueKey,
  type RangeStatus,
} from '../../utils/bodyScan';

interface BodyScanReportProps {
  scan: BodyScan;
  /** Datum van de meting in de app (YYYY-MM-DD); het apparaat-tijdstip staat in de scan zelf. */
  date?: string | null;
}

const STATUS_STYLE: Record<RangeStatus, { color: string; bg: string }> = {
  laag: { color: '#573F00', bg: '#FFDEA0' },
  normaal: { color: '#005238', bg: '#BFF3DC' },
  hoog: { color: '#573F00', bg: '#FFDEA0' },
};

/** Zones van de balk: laag | normaal | hoog. De normaalzone is groen, de rest neutraal. */
const ZONE_BG = { laag: 'action.selected', normaal: 'rgba(0,207,147,0.28)', hoog: 'action.selected' } as const;

const SECTION_TITLE_SX = { display: 'block', mb: 1, mt: 2.5, fontWeight: 600, letterSpacing: 0.2 } as const;

function StatusChip({ status }: { status: RangeStatus | null }) {
  if (!status) return null;
  const s = STATUS_STYLE[status];
  return (
    <Box
      component="span"
      sx={{ px: 0.75, py: 0.1, borderRadius: 1, fontSize: 11, fontWeight: 600, color: s.color, bgcolor: s.bg, whiteSpace: 'nowrap' }}
    >
      {RANGE_STATUS_LABEL[status]}
    </Box>
  );
}

function formatRange(key: BodyScanValueKey, range: BodyScanRange): string {
  return `${formatScanValue(key, range.min)}–${formatScanValue(key, range.max)}`;
}

/** Eén waarde als balk met drie zones en een marker; zonder normaalwaarde alleen de waarde. */
function RangeBar({ scan, fieldKey }: { scan: BodyScan; fieldKey: BodyScanValueKey }) {
  const def = fieldDef(fieldKey);
  const value = scan.values[fieldKey];
  const range = scan.ranges[fieldKey] ?? null;
  if (value == null) return null;
  const status = rangeStatus(value, range);
  const pos = range ? rangeBarPosition(value, range) : null;
  return (
    <Box sx={{ mb: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1, mb: 0.5 }}>
        <Typography variant="body2" sx={{ fontWeight: 500, minWidth: 0 }}>
          {def.label}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
          <StatusChip status={status} />
          <Typography variant="body2" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
            {formatScanValue(fieldKey, value)}
            {def.unit ? ` ${def.unit}` : ''}
          </Typography>
        </Box>
      </Box>
      {range && pos != null ? (
        <>
          <Box sx={{ position: 'relative', height: 10, borderRadius: 5, overflow: 'hidden', display: 'flex' }} aria-hidden>
            <Box sx={{ width: `${RANGE_BAR_NORMAL.start * 100}%`, bgcolor: ZONE_BG.laag }} />
            <Box sx={{ width: `${(RANGE_BAR_NORMAL.end - RANGE_BAR_NORMAL.start) * 100}%`, bgcolor: ZONE_BG.normaal }} />
            <Box sx={{ flex: 1, bgcolor: ZONE_BG.hoog }} />
            {/* Vulling tot de waarde, zoals op een InBody-uitdraai */}
            <Box sx={{ position: 'absolute', left: 0, top: 3, height: 4, width: `${pos * 100}%`, bgcolor: 'primary.main', borderRadius: 2 }} />
            <Box sx={{ position: 'absolute', top: 0, height: 10, width: 3, bgcolor: 'text.primary', left: `calc(${pos * 100}% - 1.5px)` }} />
          </Box>
          <Box sx={{ position: 'relative', height: 16, fontSize: 10, color: 'text.secondary' }} aria-hidden>
            <Box component="span" sx={{ position: 'absolute', left: 0 }}>
              laag
            </Box>
            <Box component="span" sx={{ position: 'absolute', left: `${RANGE_BAR_NORMAL.start * 100}%`, transform: 'translateX(-50%)' }}>
              {formatScanValue(fieldKey, range.min)}
            </Box>
            <Box component="span" sx={{ position: 'absolute', left: `${RANGE_BAR_NORMAL.end * 100}%`, transform: 'translateX(-50%)' }}>
              {formatScanValue(fieldKey, range.max)}
            </Box>
            <Box component="span" sx={{ position: 'absolute', right: 0 }}>
              hoog
            </Box>
          </Box>
        </>
      ) : def.hint ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {def.hint}
        </Typography>
      ) : null}
    </Box>
  );
}

/** Tabelregel: label, waarde, normaalwaarde en status. Voor de samenstelling (water, eiwit, …). */
function ValueRow({ scan, fieldKey }: { scan: BodyScan; fieldKey: BodyScanValueKey }) {
  const def = fieldDef(fieldKey);
  const value = scan.values[fieldKey];
  if (value == null) return null;
  const range = scan.ranges[fieldKey] ?? null;
  const status = rangeStatus(value, range);
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto auto',
        alignItems: 'center',
        columnGap: 1.5,
        py: 0.75,
        borderBottom: 1, borderColor: 'divider',
        '&:last-child': { borderBottom: 0 },
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {def.label}
        </Typography>
        {def.hint && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {def.hint}
          </Typography>
        )}
      </Box>
      <Box sx={{ textAlign: 'right' }}>
        <Typography variant="body2" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
          {formatScanValue(fieldKey, value)}
          {def.unit ? ` ${def.unit}` : ''}
        </Typography>
        {range && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', whiteSpace: 'nowrap' }}>
            normaal {formatRange(fieldKey, range)}
          </Typography>
        )}
      </Box>
      <Box sx={{ minWidth: 52, textAlign: 'right' }}>
        <StatusChip status={status} />
      </Box>
    </Box>
  );
}

/** Grote cijfers bovenaan: score, lichaamsleeftijd, basaal metabolisme. */
function HeadlineTiles({ scan }: { scan: BodyScan }) {
  const tiles: { key: BodyScanValueKey; caption: string }[] = [
    { key: 'healthScore', caption: 'score' },
    { key: 'bodyAge', caption: 'lichaamsleeftijd' },
    { key: 'basalMetabolismKcal', caption: 'kcal in rust per dag' },
  ];
  const shown = tiles.filter((t) => scan.values[t.key] != null);
  if (shown.length === 0) return null;
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${shown.length}, 1fr)`, gap: 1, textAlign: 'center', mb: 1 }}>
      {shown.map((t) => {
        const def = fieldDef(t.key);
        const v = scan.values[t.key] as number;
        return (
          <Box key={t.key} sx={{ p: 1.25, borderRadius: 2, bgcolor: 'action.hover' }}>
            <Typography variant="h5" fontWeight={700} sx={{ lineHeight: 1.1 }}>
              {formatScanValue(t.key, v)}
              {t.key === 'healthScore' && (
                <Box component="span" sx={{ fontSize: 13, fontWeight: 500, color: 'text.secondary' }}>
                  {def.unit}
                </Box>
              )}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
              {t.caption}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}

function ControlRow({ scan, fieldKey }: { scan: BodyScan; fieldKey: BodyScanValueKey }) {
  const def = fieldDef(fieldKey);
  const v = scan.values[fieldKey];
  if (v == null) return null;
  const signed = fieldKey === 'targetWeightKg' ? formatScanValue(fieldKey, v) : `${v > 0 ? '+' : ''}${formatScanValue(fieldKey, v)}`;
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 1, py: 0.5 }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2">{def.label}</Typography>
        {def.hint && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {def.hint}
          </Typography>
        )}
      </Box>
      <Typography variant="body2" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
        {signed} {def.unit}
      </Typography>
    </Box>
  );
}

export function BodyScanReport({ scan, date }: BodyScanReportProps) {
  const sourceLabel = BODY_SCAN_SOURCES.find((s) => s.key === scan.source)?.label ?? 'Bodyscan';
  const meta = [scan.measuredAt ?? date ?? null, scan.ageYears != null ? `${scan.ageYears} jaar` : null, scan.heightCm != null ? `${scan.heightCm} cm` : null]
    .filter(Boolean)
    .join(' · ');
  const compositionKeys = BODY_SCAN_FIELDS.filter((f) => f.group === 'samenstelling' && !['weightKg', 'skeletalMuscleKg', 'fatMassKg'].includes(f.key)).map(
    (f) => f.key
  );
  const obesityKeys = BODY_SCAN_FIELDS.filter((f) => f.group === 'obesitas').map((f) => f.key);
  const controlKeys = BODY_SCAN_FIELDS.filter((f) => f.group === 'regulatie').map((f) => f.key);
  const hasMuscleFat = scan.values.weightKg != null || scan.values.skeletalMuscleKg != null || scan.values.fatMassKg != null;

  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
        {sourceLabel}
        {meta ? ` · ${meta}` : ''}
      </Typography>

      <HeadlineTiles scan={scan} />

      {hasMuscleFat && (
        <>
          <Typography variant="overline" sx={SECTION_TITLE_SX}>
            Spier-vet analyse
          </Typography>
          <RangeBar scan={scan} fieldKey="weightKg" />
          <RangeBar scan={scan} fieldKey="skeletalMuscleKg" />
          <RangeBar scan={scan} fieldKey="fatMassKg" />
        </>
      )}

      {groupHasValues(scan, 'obesitas') && (
        <>
          <Typography variant="overline" sx={SECTION_TITLE_SX}>
            Obesitas analyse
          </Typography>
          {obesityKeys.map((k) => (
            <RangeBar key={k} scan={scan} fieldKey={k} />
          ))}
        </>
      )}

      {compositionKeys.some((k) => scan.values[k] != null) && (
        <>
          <Typography variant="overline" sx={SECTION_TITLE_SX}>
            Lichaamssamenstelling
          </Typography>
          {compositionKeys.map((k) => (
            <ValueRow key={k} scan={scan} fieldKey={k} />
          ))}
        </>
      )}

      {segmentsHaveValues(scan) && (
        <>
          <Typography variant="overline" sx={SECTION_TITLE_SX}>
            Segmentale analyse
          </Typography>
          <BodyScanFigure scan={scan} />
        </>
      )}

      {groupHasValues(scan, 'regulatie') && (
        <>
          <Typography variant="overline" sx={SECTION_TITLE_SX}>
            Gewichtsregulatie
          </Typography>
          {controlKeys.map((k) => (
            <ControlRow key={k} scan={scan} fieldKey={k} />
          ))}
        </>
      )}
    </Box>
  );
}
