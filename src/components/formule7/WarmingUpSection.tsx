// Sectie 2 van de Formule 7-routekaart: warming-up (organisatie, intensiteit, trainings-HF, duur).
// Organisatie-opties en de HF-berekening komen als afgeleide invoer uit het formulier.
import { Box, TextField, Autocomplete, IconButton, Tooltip, Typography } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import type { Formule7Routekaart, Formule7MoverType } from '../../types';
import { FORMULE7_ORGANISATION_OPTIONS, WARMUP_BY_MOVER_TYPE } from '../../utils/formule7Defaults';
import { FORM_ROW, HelperText, Formule7SectionAccordion } from './sectionShared';

interface WarmingUpSectionProps {
  value: Formule7Routekaart['warmup'];
  onChange: (upd: Partial<Formule7Routekaart['warmup']>) => void;
  moverType: Formule7MoverType | null;
  /** Toegestane organisaties (activiteit) minus de organisaties die cardio al gebruikt. */
  organisationChoices: typeof FORMULE7_ORGANISATION_OPTIONS;
  /** Trainings-HF uit leeftijd/rustHF voor een gegeven % HFmax (Formule 2). */
  computeTrainingHr: (percent?: number | null) => number | null;
  expanded: boolean;
  onToggle: () => void;
}

export function WarmingUpSection({
  value: effectiveWarmup,
  onChange: setEffectiveWarmup,
  moverType,
  organisationChoices: warmupOrganisationChoices,
  computeTrainingHr,
  expanded,
  onToggle,
}: WarmingUpSectionProps) {
  return (
    <Formule7SectionAccordion title="2. Warming-up" expanded={expanded} onToggle={onToggle}>
        <HelperText>
          Op basis van de gekozen activiteit worden organisatie, intensiteit en duur automatisch ingevuld.
          De warming-up mag niet dezelfde organisatie (oefenvorm) hebben als de cardiotraining — die opties worden
          daarom uitgesloten. Trainingshartfrequentie volgt uit leeftijd en rusthartslag.
        </HelperText>
        <Box sx={FORM_ROW}>
          <Autocomplete
            options={warmupOrganisationChoices}
            value={warmupOrganisationChoices.find((o) => o.value === effectiveWarmup.organisation) ?? null}
            onChange={(_, v) => setEffectiveWarmup({ organisation: v?.value ?? null })}
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
            sx={{ width: '100%' }}
          />
          <TextField
            label="Intensiteit (% HFmax)"
            type="number"
            value={effectiveWarmup.intensityPercentOfMaxHr ?? ''}
            onChange={(e) => {
              const raw = e.target.value === '' ? null : Number(e.target.value);
              if (raw === null) {
                setEffectiveWarmup({ intensityPercentOfMaxHr: null });
                return;
              }
              if (moverType) {
                const { intensityPercentMin, intensityPercentMax } = WARMUP_BY_MOVER_TYPE[moverType];
                const clamped = Math.min(intensityPercentMax, Math.max(intensityPercentMin, raw));
                setEffectiveWarmup({ intensityPercentOfMaxHr: clamped });
              } else {
                setEffectiveWarmup({ intensityPercentOfMaxHr: raw });
              }
            }}
            size="small"
            fullWidth
            inputProps={
              moverType
                ? {
                    min: WARMUP_BY_MOVER_TYPE[moverType].intensityPercentMin,
                    max: WARMUP_BY_MOVER_TYPE[moverType].intensityPercentMax,
                  }
                : { min: 0, max: 100 }
            }
            InputProps={{
              endAdornment: moverType ? (
                <Tooltip
                  title={`Intensiteit: ${WARMUP_BY_MOVER_TYPE[moverType].intensityLabel} (alleen dit bereik toegestaan)`}
                  placement="left"
                >
                  <IconButton size="small" aria-label="Uitleg intensiteit">
                    <InfoOutlinedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              ) : undefined,
            }}
          />
          <Box sx={FORM_ROW}>
            <TextField
              label="Trainingshartfrequentie (sl/min)"
              type="text"
              value={(() => {
                const preset = moverType ? WARMUP_BY_MOVER_TYPE[moverType] : null;
                if (preset && preset.intensityPercentMin !== preset.intensityPercentMax) {
                  const hrMin = computeTrainingHr(preset.intensityPercentMin);
                  const hrMax = computeTrainingHr(preset.intensityPercentMax);
                  if (hrMin != null && hrMax != null) return `${hrMin}-${hrMax}`;
                }
                return effectiveWarmup.trainingHr ?? '';
              })()}
              size="small"
              fullWidth
              sx={{ minWidth: 0 }}
              inputProps={{ readOnly: true }}
              InputProps={{
                endAdornment: (
                  <Tooltip
                    title={
                      <>
                        <Typography variant="caption" component="div" fontWeight={600}>
                          Formule
                        </Typography>
                        <Typography variant="caption" component="div">
                          ((220 − leeftijd − rustHF) × %HFmax) + rustHF
                        </Typography>
                        <Typography variant="caption" component="div" sx={{ mt: 0.5 }}>
                          RustHF onbekend = 60 sl/min (fallback).
                        </Typography>
                        {moverType && (
                          <>
                            <Typography variant="caption" component="div" fontWeight={600} sx={{ mt: 1 }}>
                              Intensiteit
                            </Typography>
                            <Typography variant="caption" component="div">
                              {WARMUP_BY_MOVER_TYPE[moverType].intensityLabel}
                            </Typography>
                            {WARMUP_BY_MOVER_TYPE[moverType].intensityPercentMin !==
                            WARMUP_BY_MOVER_TYPE[moverType].intensityPercentMax ? (
                              <Typography variant="caption" component="div">
                                Berekend: bij {WARMUP_BY_MOVER_TYPE[moverType].intensityPercentMin}% →{' '}
                                {computeTrainingHr(WARMUP_BY_MOVER_TYPE[moverType].intensityPercentMin) ?? '–'} sl/min,
                                bij {WARMUP_BY_MOVER_TYPE[moverType].intensityPercentMax}% →{' '}
                                {computeTrainingHr(WARMUP_BY_MOVER_TYPE[moverType].intensityPercentMax) ?? '–'} sl/min.
                              </Typography>
                            ) : (
                              <Typography variant="caption" component="div">
                                Berekend: {effectiveWarmup.trainingHr ?? '–'} sl/min.
                              </Typography>
                            )}
                          </>
                        )}
                      </>
                    }
                    placement="left"
                  >
                    <IconButton size="small" aria-label="Uitleg formule en uitkomst">
                      <InfoOutlinedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                ),
              }}
            />
            <TextField
              label="Duur (min)"
              type="number"
              value={effectiveWarmup.durationMinutes ?? ''}
              onChange={(e) => {
                const raw = e.target.value === '' ? null : Number(e.target.value);
                if (raw === null) {
                  setEffectiveWarmup({ durationMinutes: null });
                  return;
                }
                if (moverType) {
                  const { durationMin, durationMax } = WARMUP_BY_MOVER_TYPE[moverType];
                  const clamped = Math.min(durationMax, Math.max(durationMin, raw));
                  setEffectiveWarmup({ durationMinutes: clamped });
                } else {
                  setEffectiveWarmup({ durationMinutes: raw });
                }
              }}
              size="small"
              fullWidth
              sx={{ minWidth: 0 }}
              inputProps={
              moverType
                ? {
                    min: WARMUP_BY_MOVER_TYPE[moverType].durationMin,
                    max: WARMUP_BY_MOVER_TYPE[moverType].durationMax,
                  }
                : { min: 0 }
            }
            InputProps={{
              endAdornment: moverType ? (
                <Tooltip
                  title={`Duur: ${WARMUP_BY_MOVER_TYPE[moverType].durationMin}-${WARMUP_BY_MOVER_TYPE[moverType].durationMax} min`}
                  placement="left"
                >
                  <IconButton size="small" aria-label="Uitleg duur">
                    <InfoOutlinedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              ) : undefined,
            }}
          />
        </Box>
        </Box>
    </Formule7SectionAccordion>
  );
}
