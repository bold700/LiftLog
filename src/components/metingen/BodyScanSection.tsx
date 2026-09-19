// Bodyscan-invoer op de Metingen-pagina: foto's van de weegschaal laten uitlezen, de herkende
// waarden controleren en bijwerken, en meteen zien hoe het rapport eruitziet.
// Het concept (BodyScanDraft) leeft in MetingenPage, zodat opslaan/bewerken daar blijft.
import { useMemo, useRef, useState } from 'react';
import { Box, Button, CircularProgress, IconButton, MenuItem, TextField, Typography } from '@mui/material';
import PhotoCameraRoundedIcon from '@mui/icons-material/PhotoCameraRounded';
import PhotoLibraryRoundedIcon from '@mui/icons-material/PhotoLibraryRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { NumberField } from '../NumberField';
import { BodyScanReport } from './BodyScanReport';
import { recognizeBodyScanPhotos, BODY_SCAN_MAX_PHOTOS } from '../../services/bodyScanService';
import {
  BODY_SCAN_FIELDS,
  BODY_SCAN_SEGMENTS,
  BODY_SCAN_SOURCES,
  bodyScanFromDraft,
  draftHasValues,
  formatScanValue,
  type BodyScan,
  type BodyScanDraft,
  type BodyScanGroup,
  type BodyScanSource,
} from '../../utils/bodyScan';

interface BodyScanSectionProps {
  draft: BodyScanDraft;
  onDraftChange: (draft: BodyScanDraft) => void;
  /** Na een geslaagde herkenning; de pagina zet dan ook gewicht, vetpercentage en datum. */
  onRecognized: (scan: BodyScan) => void;
  onClear: () => void;
  /** Uit het profiel van de sporter, om een verkeerd ingevoerde leeftijd/lengte op het apparaat te signaleren. */
  profileAge: number | null;
  profileHeightCm: number | null | undefined;
}

const GROUP_TITLES: Record<BodyScanGroup, string> = {
  samenstelling: 'Samenstelling',
  obesitas: 'Obesitas',
  regulatie: 'Gewichtsregulatie',
  overig: 'Overig',
};

const GRID_SX = { display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)' }, gap: 1.5 } as const;

interface PendingPhoto {
  file: File;
  previewUrl: string;
}

export function BodyScanSection({ draft, onDraftChange, onRecognized, onClear, profileAge, profileHeightCm }: BodyScanSectionProps) {
  const cameraInput = useRef<HTMLInputElement | null>(null);
  const galleryInput = useRef<HTMLInputElement | null>(null);
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  const [recognizing, setRecognizing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasValues = draftHasValues(draft);
  const preview = useMemo(() => (hasValues ? bodyScanFromDraft(draft) : null), [draft, hasValues]);

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    setError(null);
    setPending((p) => {
      const next = [...p];
      for (const f of Array.from(files)) {
        if (next.length >= BODY_SCAN_MAX_PHOTOS) break;
        next.push({ file: f, previewUrl: URL.createObjectURL(f) });
      }
      return next;
    });
  };

  const removePending = (i: number) => {
    setPending((p) => {
      URL.revokeObjectURL(p[i].previewUrl);
      return p.filter((_, j) => j !== i);
    });
  };

  const clearPending = () => {
    setPending((p) => {
      for (const x of p) URL.revokeObjectURL(x.previewUrl);
      return [];
    });
  };

  const recognize = async () => {
    if (pending.length === 0) return;
    setRecognizing(true);
    setError(null);
    try {
      const scan = await recognizeBodyScanPhotos(pending.map((p) => p.file));
      if (!scan) {
        setError('Geen meetwaarden herkend. Fotografeer het scherm recht van voren, met de cijfers scherp in beeld.');
        return;
      }
      onRecognized(scan);
      clearPending();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Herkenning mislukt.');
    } finally {
      setRecognizing(false);
    }
  };

  const setValue = (key: keyof BodyScanDraft['values'], v: string) => onDraftChange({ ...draft, values: { ...draft.values, [key]: v } });
  const setSegment = (key: keyof BodyScanDraft['segments'], part: 'muscleKg' | 'fatKg', v: string) =>
    onDraftChange({ ...draft, segments: { ...draft.segments, [key]: { ...draft.segments[key], [part]: v } } });

  // Op het apparaat wordt leeftijd en lengte met de hand ingevoerd; een tikfout daar verschuift alle normaalwaardes.
  const warnings: string[] = [];
  const scanAge = draft.ageYears.trim() !== '' ? Number(draft.ageYears) : null;
  const scanHeight = draft.heightCm.trim() !== '' ? Number(draft.heightCm) : null;
  if (scanAge != null && profileAge != null && Math.abs(scanAge - profileAge) >= 2) {
    warnings.push(`Op de scan staat ${scanAge} jaar, volgens het profiel is de sporter ${profileAge}. De normaalwaardes van het apparaat kloppen dan niet helemaal.`);
  }
  if (scanHeight != null && profileHeightCm != null && Math.abs(scanHeight - profileHeightCm) >= 2) {
    warnings.push(`Op de scan staat ${scanHeight} cm, in het profiel ${profileHeightCm} cm. Controleer de lengte op het apparaat bij de volgende meting.`);
  }

  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
        Fotografeer het scherm van de weegschaal (bovenste en onderste helft) of de uitdraai, recht van voren. De waarden worden uitgelezen en
        komen hieronder te staan; controleer ze en pas aan waar nodig. De foto&apos;s zelf worden niet bewaard.
      </Typography>

      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={galleryInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
        <Button
          variant="outlined"
          size="small"
          startIcon={<PhotoCameraRoundedIcon />}
          disabled={recognizing || pending.length >= BODY_SCAN_MAX_PHOTOS}
          onClick={() => cameraInput.current?.click()}
        >
          Foto maken
        </Button>
        <Button
          variant="outlined"
          size="small"
          startIcon={<PhotoLibraryRoundedIcon />}
          disabled={recognizing || pending.length >= BODY_SCAN_MAX_PHOTOS}
          onClick={() => galleryInput.current?.click()}
        >
          Uit galerij
        </Button>
      </Box>

      {pending.length > 0 && (
        <Box sx={{ mb: 1.5 }}>
          <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
            {pending.map((p, i) => (
              <Box key={p.previewUrl} sx={{ position: 'relative', width: 72, height: 96, flex: '0 0 auto' }}>
                <Box
                  component="img"
                  src={p.previewUrl}
                  alt={`Foto ${i + 1} van de weegschaal`}
                  sx={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 1.5, display: 'block', bgcolor: 'rgba(0,0,0,0.06)' }}
                />
                <IconButton
                  size="small"
                  aria-label={`Foto ${i + 1} verwijderen`}
                  onClick={() => removePending(i)}
                  disabled={recognizing}
                  sx={{ position: 'absolute', top: -6, right: -6, bgcolor: '#fff', boxShadow: 1, width: 24, height: 24, '&:hover': { bgcolor: '#fff' } }}
                >
                  <CloseRoundedIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Box>
            ))}
          </Box>
          <Button
            variant="contained"
            size="small"
            disabled={recognizing}
            onClick={recognize}
            startIcon={recognizing ? <CircularProgress size={14} color="inherit" /> : undefined}
            sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', textTransform: 'none', fontWeight: 600, '&:hover': { bgcolor: 'primary.dark' } }}
          >
            {recognizing ? 'Uitlezen…' : `Waarden uitlezen (${pending.length} foto${pending.length === 1 ? '' : "'s"})`}
          </Button>
        </Box>
      )}

      {error && (
        <Typography variant="caption" color="error" sx={{ display: 'block', mb: 1 }}>
          {error}
        </Typography>
      )}

      {hasValues && (
        <>
          {warnings.map((w) => (
            <Typography key={w} variant="caption" sx={{ display: 'block', mb: 1, color: '#573F00', bgcolor: '#FFDEA0', p: 1, borderRadius: 1.5 }}>
              {w}
            </Typography>
          ))}

          {preview && (
            <Box sx={{ p: 1.5, mb: 2, borderRadius: 2, bgcolor: '#fff', border: '1px solid rgba(0,0,0,0.08)' }}>
              <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.5 }}>
                Zo komt het rapport eruit te zien
              </Typography>
              <BodyScanReport scan={preview} />
            </Box>
          )}

          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
            Uitgelezen waarden controleren
          </Typography>
          <Box sx={{ ...GRID_SX, mb: 2 }}>
            <TextField
              select
              size="small"
              label="Apparaat"
              value={draft.source}
              onChange={(e) => onDraftChange({ ...draft, source: e.target.value as BodyScanSource })}
            >
              {BODY_SCAN_SOURCES.map((s) => (
                <MenuItem key={s.key} value={s.key}>
                  {s.label}
                </MenuItem>
              ))}
            </TextField>
            <NumberField label="Leeftijd op scan" size="small" value={draft.ageYears} onChange={(v) => onDraftChange({ ...draft, ageYears: v })} />
            <NumberField label="Lengte op scan (cm)" decimal size="small" value={draft.heightCm} onChange={(v) => onDraftChange({ ...draft, heightCm: v })} />
          </Box>

          {(Object.keys(GROUP_TITLES) as BodyScanGroup[]).map((group) => (
            <Box key={group} sx={{ mb: 2 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, fontWeight: 600 }}>
                {GROUP_TITLES[group]}
              </Typography>
              <Box sx={GRID_SX}>
                {BODY_SCAN_FIELDS.filter((f) => f.group === group).map((f) => {
                  const range = draft.ranges[f.key];
                  const label = f.unit ? `${f.label} (${f.unit})` : f.label;
                  const helperText = range ? `normaal ${formatScanValue(f.key, range.min)}–${formatScanValue(f.key, range.max)}` : ' ';
                  // Regulatiewaarden zijn negatief bij afvallen ("-22,2 kg"); NumberField laat geen minteken toe.
                  if (f.min < 0) {
                    return (
                      <TextField
                        key={f.key}
                        label={label}
                        size="small"
                        value={draft.values[f.key]}
                        onChange={(e) => setValue(f.key, e.target.value.replace(',', '.').replace(/[^\d.-]/g, ''))}
                        helperText={helperText}
                        inputProps={{ inputMode: 'text' }}
                      />
                    );
                  }
                  return (
                    <NumberField
                      key={f.key}
                      label={label}
                      decimal={f.decimals > 0}
                      size="small"
                      value={draft.values[f.key]}
                      onChange={(v) => setValue(f.key, v)}
                      helperText={helperText}
                    />
                  );
                })}
              </Box>
            </Box>
          ))}

          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, fontWeight: 600 }}>
            Segmentaal (kg spier / kg vet)
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 1.5, mb: 1.5 }}>
            {BODY_SCAN_SEGMENTS.map((s) => (
              <Box key={s.key} sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                <NumberField label={`${s.label} spier`} decimal size="small" value={draft.segments[s.key].muscleKg} onChange={(v) => setSegment(s.key, 'muscleKg', v)} />
                <NumberField label={`${s.label} vet`} decimal size="small" value={draft.segments[s.key].fatKg} onChange={(v) => setSegment(s.key, 'fatKg', v)} />
              </Box>
            ))}
          </Box>

          <Button variant="text" size="small" onClick={onClear} sx={{ textTransform: 'none' }}>
            Bodyscan wissen
          </Button>
        </>
      )}
    </Box>
  );
}
