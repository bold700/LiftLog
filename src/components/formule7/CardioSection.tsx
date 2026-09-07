// Sectie 4 van de Formule 7-routekaart: cardiotraining (Tabel 8, Formule 2): trainingsmethode, organisatie
// en drie zones met organisatie, trainingshartslag en duur.
import { Box, Typography, TextField, Autocomplete, IconButton, Tooltip } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import type { Formule7Routekaart, Formule7MoverType } from '../../types';
import {
  FORMULE7_ORGANISATION_OPTIONS,
  CARDIO_ORGANISATION_BY_MOVER_TYPE,
  CARDIO_TRAINING_METHOD_OPTIONS_BY_MOVER,
  CARDIO_ZONE_HR_PERCENT,
} from '../../utils/formule7Defaults';
import { FORM_ROW, HelperText, Formule7SectionAccordion } from './sectionShared';

interface CardioSectionProps {
  value: Formule7Routekaart['cardio'];
  onChange: (upd: Partial<Formule7Routekaart['cardio']>) => void;
  onZoneChange: (zoneIndex: 0 | 1 | 2, upd: Partial<Formule7Routekaart['cardio']['zones'][0]>) => void;
  moverType: Formule7MoverType | null;
  /** Max. HF: theoretische max. HF, anders 220 − leeftijd; null als onbekend. */
  maxHr: number | null;
  expanded: boolean;
  onToggle: () => void;
}

export function CardioSection({
  value: effectiveCardio,
  onChange: setEffectiveCardio,
  onZoneChange: setCardioZone,
  moverType,
  maxHr,
  expanded,
  onToggle,
}: CardioSectionProps) {
  return (
    <Formule7SectionAccordion title="4. Cardiotraining" expanded={expanded} onToggle={onToggle}>
        <HelperText>
          Cardiovasculair trainen (Tabel 8, Formule 2): trainingsmethode, organisatie en per zone met
          trainingshartslag en duur (min). Organisatie en methode volgen uit de gekozen activiteit. Max. HF: 220 −
          leeftijd. De warming-up gebruikt een andere organisatie dan deze cardio.
        </HelperText>
        {!moverType && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Vul eerst sectie 1 (activiteit / belastbaarheid) in voor toegestane organisatie en trainingsmethodes.
          </Typography>
        )}
        <Box sx={{ ...FORM_ROW, mb: 2 }}>
          <Autocomplete
            freeSolo
            options={moverType ? CARDIO_TRAINING_METHOD_OPTIONS_BY_MOVER[moverType] : []}
            value={
              (() => {
                const method = effectiveCardio.trainingMethod ?? '';
                if (!method) return null;
                const opts = moverType ? CARDIO_TRAINING_METHOD_OPTIONS_BY_MOVER[moverType] : [];
                return opts.find((o) => o.value === method) ?? method;
              })()
            }
            onInputChange={(_, v) => setEffectiveCardio({ trainingMethod: v })}
            onChange={(_, v) => setEffectiveCardio({ trainingMethod: typeof v === 'string' ? v : (v as { value: string })?.value ?? '' })}
            getOptionLabel={(o) => (typeof o === 'string' ? o : (o as { label: string })?.label ?? '')}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Trainingsmethode"
                size="small"
                fullWidth
                placeholder={moverType ? 'Kies of typ' : 'Kies eerst activiteit (sectie 1)'}
              />
            )}
            sx={{ minWidth: 0 }}
          />
          <Autocomplete
            options={
              moverType
                ? CARDIO_ORGANISATION_BY_MOVER_TYPE[moverType].map((val) =>
                    FORMULE7_ORGANISATION_OPTIONS.find((o) => o.value === val)
                  ).filter(Boolean) as typeof FORMULE7_ORGANISATION_OPTIONS
                : []
            }
            value={
              moverType &&
              effectiveCardio.organisation &&
              CARDIO_ORGANISATION_BY_MOVER_TYPE[moverType].includes(effectiveCardio.organisation)
                ? FORMULE7_ORGANISATION_OPTIONS.find((o) => o.value === effectiveCardio.organisation) ?? null
                : null
            }
            onChange={(_, v) => setEffectiveCardio({ organisation: v?.value ?? null })}
            getOptionLabel={(o) => o.label}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Organisatie"
                size="small"
                fullWidth
                placeholder={moverType ? undefined : 'Kies eerst activiteit (sectie 1)'}
              />
            )}
            sx={{ minWidth: 0 }}
          />
        </Box>
        {([0, 1, 2] as const).map((i) => {
          const zoneNum = (i + 1) as 1 | 2 | 3;
          const zoneHrPreset = CARDIO_ZONE_HR_PERCENT[zoneNum];
          const suggestedHr = maxHr != null ? Math.round((maxHr * zoneHrPreset.defaultPercent) / 100) : null;
          const allowedOrgOptions =
            moverType
              ? CARDIO_ORGANISATION_BY_MOVER_TYPE[moverType].map((val) =>
                  FORMULE7_ORGANISATION_OPTIONS.find((o) => o.value === val)
                ).filter(Boolean) as typeof FORMULE7_ORGANISATION_OPTIONS
              : [];
          return (
            <Box
              key={i}
              sx={{
                p: 1.5,
                borderRadius: 1,
                bgcolor: 'rgba(0,0,0,0.03)',
              }}
            >
              <Typography variant="body2" fontWeight={600} sx={{ mb: 1.5, display: 'block' }}>
                Zone {zoneNum} ({zoneHrPreset.zoneName})
              </Typography>
              <Box sx={FORM_ROW}>
                <Autocomplete
                  options={allowedOrgOptions}
                  value={
                    moverType &&
                    effectiveCardio.zones[i]?.organisation != null &&
                    CARDIO_ORGANISATION_BY_MOVER_TYPE[moverType].includes(effectiveCardio.zones[i]!.organisation!)
                      ? FORMULE7_ORGANISATION_OPTIONS.find((o) => o.value === effectiveCardio.zones[i]?.organisation) ?? null
                      : null
                  }
                  onChange={(_, v) => setCardioZone(i, { organisation: v?.value ?? null })}
                  getOptionLabel={(o) => o.label}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Organisatie"
                      size="small"
                      fullWidth
                      placeholder={moverType ? undefined : 'Kies eerst activiteit (sectie 1)'}
                    />
                  )}
                  sx={{ minWidth: 0 }}
                />
                <TextField
                  label="Trainingshartslag (sl/min)"
                  type="number"
                  value={effectiveCardio.zones[i]?.trainingHr ?? ''}
                  onChange={(e) => {
                    const raw = e.target.value === '' ? null : Number(e.target.value) || null;
                    if (raw == null) {
                      setCardioZone(i, { trainingHr: null });
                      return;
                    }
                    const minHr = maxHr != null ? Math.round((maxHr * zoneHrPreset.min) / 100) : 0;
                    const maxHrZone = maxHr != null ? Math.round((maxHr * zoneHrPreset.max) / 100) : 300;
                    setCardioZone(i, { trainingHr: Math.min(maxHrZone, Math.max(minHr, raw)) });
                  }}
                  size="small"
                  fullWidth
                  inputProps={{
                    min: maxHr != null ? Math.round((maxHr * zoneHrPreset.min) / 100) : 0,
                    max: maxHr != null ? Math.round((maxHr * zoneHrPreset.max) / 100) : 300,
                  }}
                  placeholder={suggestedHr != null ? `Standaard ${suggestedHr} (${zoneHrPreset.defaultPercent}% max HF)` : undefined}
                  InputProps={{
                    endAdornment: (
                      <Tooltip
                        title={
                          <>
                            <Typography variant="caption" component="div" fontWeight={600}>
                              Trainingshartslag
                            </Typography>
                            <Typography variant="caption" component="div">
                              {zoneHrPreset.zoneName}: {zoneHrPreset.min}–{zoneHrPreset.max}% HF-max. Berekening: 220 − leeftijd = max HF.
                            </Typography>
                            {maxHr != null && (
                              <Typography variant="caption" component="div" sx={{ mt: 0.5 }}>
                                Max HF ≈ {maxHr}. Standaard {zoneHrPreset.defaultPercent}% → {suggestedHr} sl/min (wordt automatisch ingevuld).
                              </Typography>
                            )}
                          </>
                        }
                        placement="left"
                      >
                        <IconButton size="small" aria-label="Uitleg trainingshartslag zone">
                          <InfoOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    ),
                  }}
                />
                <TextField
                  label="Duur (min)"
                  type="number"
                  value={effectiveCardio.zones[i]?.durationMinutes ?? ''}
                  onChange={(e) =>
                    setCardioZone(i, {
                      durationMinutes: e.target.value === '' ? null : Number(e.target.value) || null,
                    })
                  }
                  size="small"
                  fullWidth
                  inputProps={{ min: 0 }}
                />
              </Box>
            </Box>
          );
        })}
    </Formule7SectionAccordion>
  );
}
