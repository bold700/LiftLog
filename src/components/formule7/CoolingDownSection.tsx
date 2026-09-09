// Sectie 5 van de Formule 7-routekaart: cooling-down (organisatie, intensiteit, berekende trainings-HF, duur).
import { Box, Typography, TextField, Autocomplete, IconButton, Tooltip } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import type { Formule7Routekaart } from '../../types';
import { FORMULE7_COOLDOWN_ORGANISATION_OPTIONS } from '../../utils/formule7Defaults';
import { FORM_ROW, HelperText, Formule7SectionAccordion } from './sectionShared';
import { NumberField } from '../NumberField';

interface CoolingDownSectionProps {
  value: Formule7Routekaart['cooldown'];
  onChange: (upd: Partial<Formule7Routekaart['cooldown']>) => void;
  expanded: boolean;
  onToggle: () => void;
}

export function CoolingDownSection({
  value: effectiveCooldown,
  onChange: setEffectiveCooldown,
  expanded,
  onToggle,
}: CoolingDownSectionProps) {
  return (
    <Formule7SectionAccordion title="5. Cooling-down" expanded={expanded} onToggle={onToggle}>
        <HelperText>
          Vul intensiteit in % HFmax in; de trainingshartfrequentie wordt automatisch berekend met je leeftijd en
          rusthartslag.
        </HelperText>
        <Box sx={FORM_ROW}>
          <Autocomplete
            options={FORMULE7_COOLDOWN_ORGANISATION_OPTIONS}
            value={
              FORMULE7_COOLDOWN_ORGANISATION_OPTIONS.find((o) => o.value === effectiveCooldown.organisation) ?? null
            }
            onChange={(_, v) => setEffectiveCooldown({ organisation: v?.value ?? null })}
            getOptionLabel={(o) => o.label}
            renderInput={(params) => (
              <TextField {...params} label="Organisatie" size="small" fullWidth />
            )}
            sx={{ minWidth: 0 }}
          />
          <NumberField
            label="Intensiteit (% HFmax)"
            value={String(effectiveCooldown.intensityPercentOfMaxHr ?? '')}
            onChange={(v) =>
              setEffectiveCooldown({
                intensityPercentOfMaxHr: v === '' ? null : Number(v) || null,
              })
            }
            size="small"
            fullWidth
            sx={{ minWidth: 0 }}
          />
          <TextField
            label="Trainingshartfrequentie (sl/min)"
            type="text"
            value={effectiveCooldown.trainingHr ?? ''}
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
                        RustHF onbekend = 60 sl/min (fallback). Berekend: {effectiveCooldown.trainingHr ?? '–'} sl/min.
                      </Typography>
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
          <NumberField
            label="Duur (min)"
            value={String(effectiveCooldown.durationMinutes ?? '')}
            onChange={(v) =>
              setEffectiveCooldown({ durationMinutes: v === '' ? null : Number(v) || null })
            }
            size="small"
            fullWidth
            sx={{ minWidth: 0 }}
          />
        </Box>
    </Formule7SectionAccordion>
  );
}
