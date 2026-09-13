// Segmentale spier/vet-verdeling op de eigen lichaamsillustratie (dezelfde als op de Spiergroepen-pagina).
// Per lichaamsdeel kleuren de spiergroepen mee met het aandeel spier ten opzichte van vet: donkerder =
// meer spier per kilo vet. Links en rechts krijgen elk hun eigen tint door de laag op de helft af te snijden
// (voorkant: de rechterkant van de sporter staat links in beeld).
import { Box, Typography } from '@mui/material';
import BodyFrontSvg from '../../assets/body/Body Front.svg';
import { GREEN_TINTS } from '../MuscleFrequencyBody';
import { BODY_SCAN_SEGMENTS, segmentLevel, type BodyScan, type BodyScanSegment, type BodyScanSegmentKey } from '../../utils/bodyScan';

/** Alle laag-SVG's van de voorkant in één keer, op bestandsnaam (bijv. "Biceps Primary Level 3"). */
const LEVEL_SVGS = import.meta.glob('../../assets/body/levels/front levels/* Primary Level *.svg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

function levelSvg(group: string, level: number): string | null {
  const suffix = `/${group} Primary Level ${level}.svg`;
  const key = Object.keys(LEVEL_SVGS).find((k) => k.endsWith(suffix));
  return key ? LEVEL_SVGS[key] : null;
}

/** Welke spiergroepen van de illustratie bij welk lichaamsdeel horen. */
const SEGMENT_GROUPS: Record<'arm' | 'trunk' | 'leg', string[]> = {
  arm: ['Shoulders', 'Biceps', 'Underarms'],
  trunk: ['Traps', 'Chest', 'Abs', 'Obliques'],
  leg: ['Quads', 'Calves'],
};

/**
 * De SVG's zijn 620×714 met veel witruimte naast het lichaam (dat loopt van ongeveer x=170 tot 450).
 * We tonen alleen die middenstrook, zodat de figuur de kolom vult. Het lichaam blijft gecentreerd,
 * dus "de helft" van de laag is nog steeds de middellijn van het lichaam.
 */
const SVG_W = 620;
const SVG_H = 714;
const CROP_X = 170;
const CROP_W = 280;
const LAYER_SX = {
  position: 'absolute',
  top: 0,
  left: `${(-CROP_X / CROP_W) * 100}%`,
  width: `${(SVG_W / CROP_W) * 100}%`,
  height: '100%',
  pointerEvents: 'none',
} as const;

/** Gekleurde laag over de basisillustratie; `side` snijdt de laag af op de middellijn van het lichaam. */
function Overlay({ src, side }: { src: string; side?: 'viewerLeft' | 'viewerRight' }) {
  const clipPath = side === 'viewerLeft' ? 'inset(0 50% 0 0)' : side === 'viewerRight' ? 'inset(0 0 0 50%)' : undefined;
  return <Box component="img" src={src} alt="" aria-hidden sx={{ ...LAYER_SX, clipPath }} />;
}

function SegmentLabel({ segKey, seg, align }: { segKey: BodyScanSegmentKey; seg: BodyScanSegment; align: 'left' | 'right' | 'center' }) {
  const label = BODY_SCAN_SEGMENTS.find((s) => s.key === segKey)?.label ?? segKey;
  const fmt = (v: number | null) => (v == null ? '—' : `${v.toFixed(1).replace('.', ',')} kg`);
  const level = segmentLevel(seg);
  return (
    <Box sx={{ textAlign: align, minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 700, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start' }}>
        {level != null && <Box component="span" sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: GREEN_TINTS[level - 1], flex: '0 0 auto' }} />}
        {fmt(seg.muscleKg)}
      </Typography>
      <Typography variant="caption" sx={{ display: 'block', whiteSpace: 'nowrap' }}>
        {fmt(seg.fatKg)} vet
      </Typography>
    </Box>
  );
}

export function BodyScanFigure({ scan }: { scan: BodyScan }) {
  const s = scan.segments;
  // Voorkant: rechterkant van de sporter staat links in beeld.
  const overlays: { src: string; side?: 'viewerLeft' | 'viewerRight' }[] = [];
  const add = (groups: string[], level: number | null, side?: 'viewerLeft' | 'viewerRight') => {
    if (level == null) return;
    for (const g of groups) {
      const src = levelSvg(g, level);
      if (src) overlays.push({ src, side });
    }
  };
  add(SEGMENT_GROUPS.arm, segmentLevel(s.armRight), 'viewerLeft');
  add(SEGMENT_GROUPS.arm, segmentLevel(s.armLeft), 'viewerRight');
  add(SEGMENT_GROUPS.leg, segmentLevel(s.legRight), 'viewerLeft');
  add(SEGMENT_GROUPS.leg, segmentLevel(s.legLeft), 'viewerRight');
  add(SEGMENT_GROUPS.trunk, segmentLevel(s.trunk));

  return (
    <Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(110px, 34%) minmax(0, 1fr)', columnGap: 1, alignItems: 'start' }}>
        {/* Illustratie in het midden, over twee rijen */}
        <Box sx={{ gridColumn: 2, gridRow: '1 / span 2', position: 'relative', aspectRatio: `${CROP_W} / ${SVG_H}`, width: '100%', overflow: 'hidden' }}>
          <Box component="img" src={BodyFrontSvg} alt="Lichaam, voorkant" sx={LAYER_SX} />
          {overlays.map((o, i) => (
            <Overlay key={`${o.src}-${o.side ?? 'both'}-${i}`} src={o.src} side={o.side} />
          ))}
        </Box>
        {/* Labels: in beeld links = rechterkant van de sporter */}
        <Box sx={{ gridColumn: 1, gridRow: 1, pt: 3 }}>
          <SegmentLabel segKey="armRight" seg={s.armRight} align="left" />
        </Box>
        <Box sx={{ gridColumn: 3, gridRow: 1, pt: 3 }}>
          <SegmentLabel segKey="armLeft" seg={s.armLeft} align="right" />
        </Box>
        <Box sx={{ gridColumn: 1, gridRow: 2, alignSelf: 'end', pb: 3 }}>
          <SegmentLabel segKey="legRight" seg={s.legRight} align="left" />
        </Box>
        <Box sx={{ gridColumn: 3, gridRow: 2, alignSelf: 'end', pb: 3 }}>
          <SegmentLabel segKey="legLeft" seg={s.legLeft} align="right" />
        </Box>
      </Box>
      <Box sx={{ mt: 1 }}>
        <SegmentLabel segKey="trunk" seg={s.trunk} align="center" />
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5, textAlign: 'center' }}>
        Per lichaamsdeel: spiermassa (dik) en vetmassa. Donkerder groen = meer spier per kilo vet. Links en rechts horen ongeveer gelijk te zijn.
      </Typography>
    </Box>
  );
}
