// Sectie 1 van de Formule 7-routekaart: anamnese / intakegesprek (cliënt, casus, leeftijd, activiteit,
// doelstelling, frequentie, hartfrequenties en optioneel de periode van het schema).
import { Box, TextField, Autocomplete, Tooltip } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import type { Formule7Routekaart, Profile } from '../../types';
import {
  FORMULE7_GOAL_OPTIONS,
  FORMULE7_MOVER_OPTIONS,
  FORMULE7_MOVER_LEVELS_HELP,
} from '../../utils/formule7Defaults';
import { FORM_ROW, HelperText, Formule7SectionAccordion } from './sectionShared';

const SESSION_DURATION_OPTIONS = [
  { value: '<30' as const, label: 'Korter dan 30 min' },
  { value: '30-60' as const, label: '30–60 min' },
  { value: '>60' as const, label: 'Langer dan 60 min' },
];

/** Leeftijd in jaren uit een geboortedatum (YYYY-MM-DD). */
function ageFromBirthDate(iso?: string | null): number | null {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return null;
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age--;
  return age >= 0 && age < 130 ? age : null;
}

interface AnamneseSectionProps {
  value: Formule7Routekaart;
  onChange: (upd: Partial<Formule7Routekaart>) => void;
  /** Automatisch berekende max. HF (220 − leeftijd), of null als leeftijd onbekend. */
  computedMaxHr: number | null;
  sporters: Profile[];
  selectedClientId: string | null;
  onClientIdChange?: (userId: string | null) => void;
  startDate?: string;
  durationWeeks: number;
  onStartDateChange?: (value: string) => void;
  onDurationWeeksChange?: (value: number) => void;
  expanded: boolean;
  onToggle: () => void;
}

export function AnamneseSection({
  value: formule7,
  onChange: set,
  computedMaxHr,
  sporters,
  selectedClientId,
  onClientIdChange,
  startDate,
  durationWeeks,
  onStartDateChange,
  onDurationWeeksChange,
  expanded,
  onToggle,
}: AnamneseSectionProps) {
  return (
    <Formule7SectionAccordion title="1. Anamnese / Intakegesprek" expanded={expanded} onToggle={onToggle}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <HelperText>
          Basisgegevens van de cliënt en doelstelling volgens de Formule 7.
        </HelperText>
        <Box sx={FORM_ROW}>
          {sporters.length > 0 ? (
            <Autocomplete
              options={sporters}
              value={sporters.find((s) => s.userId === selectedClientId) ?? null}
              onChange={(_, profile) => {
                if (profile) {
                  // Vul de anamnese alvast met bekende profielgegevens
                  const age = ageFromBirthDate(profile.birthDate);
                  const genderVal = profile.gender === 'man' ? 'M' : profile.gender === 'vrouw' ? 'V' : null;
                  set({
                    clientName: profile.displayName || profile.email || '',
                    ...(genderVal ? { gender: genderVal } : {}),
                    ...(age != null ? { ageYears: age, theoreticalMaxHr: 220 - age } : {}),
                    ...(profile.restingHrBpm != null ? { restingHr: profile.restingHrBpm } : {}),
                  });
                  onClientIdChange?.(profile.userId);
                } else {
                  set({ clientName: '' });
                  onClientIdChange?.(null);
                }
              }}
              getOptionLabel={(p) => p.displayName || p.email || p.userId}
              renderInput={(params) => (
                <TextField {...params} label="Naam cliënt (toewijzen aan profiel)" size="small" fullWidth placeholder="Kies een sporter" />
              )}
              sx={{ width: '100%' }}
            />
          ) : (
            <TextField
              label="Naam cliënt"
              value={formule7.clientName}
              onChange={(e) => set({ clientName: e.target.value })}
              size="small"
              fullWidth
            />
          )}
        </Box>
        <TextField
          label="Casus"
          value={formule7.casus}
          onChange={(e) => set({ casus: e.target.value })}
          size="small"
          fullWidth
          multiline
          minRows={4}
          maxRows={12}
          placeholder="Korte omschrijving van de cliënt"
        />
        <Box sx={FORM_ROW}>
          <TextField
            label="Leeftijd (jaar)"
            type="number"
            value={formule7.ageYears ?? ''}
            onChange={(e) => set({ ageYears: e.target.value === '' ? null : Number(e.target.value) || null })}
            size="small"
            fullWidth
            inputProps={{ min: 0 }}
          />
          <Autocomplete
            options={['M', 'V']}
            value={formule7.gender}
            onChange={(_, v) => set({ gender: (v as 'M' | 'V' | null) ?? null })}
            renderInput={(params) => (
              <TextField {...params} label="Geslacht" size="small" fullWidth />
            )}
            sx={{ width: '100%' }}
          />
          <Autocomplete
            options={FORMULE7_MOVER_OPTIONS}
            value={FORMULE7_MOVER_OPTIONS.find((o) => o.value === formule7.moverType) ?? null}
            onChange={(_, v) => set({ moverType: v?.value ?? null })}
            getOptionLabel={(o) => o.label}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Activiteit / belastbaarheid"
                size="small"
                fullWidth
                InputProps={{
                  ...params.InputProps,
                  endAdornment: (
                    <>
                      {params.InputProps.endAdornment}
                      <Tooltip
                        title={FORMULE7_MOVER_LEVELS_HELP}
                        placement="top"
                        arrow
                        componentsProps={{
                          tooltip: {
                            sx: {
                              maxWidth: 320,
                              whiteSpace: 'pre-line',
                              textAlign: 'left',
                            },
                          },
                        }}
                      >
                        <span
                          style={{ display: 'inline-flex', cursor: 'help', marginRight: 4 }}
                          aria-label="Uitleg activiteitsniveaus"
                        >
                          <InfoOutlinedIcon sx={{ fontSize: 20, opacity: 0.65 }} />
                        </span>
                      </Tooltip>
                    </>
                  ),
                }}
              />
            )}
            sx={{ width: '100%' }}
          />
          <Autocomplete
            options={FORMULE7_GOAL_OPTIONS}
            value={FORMULE7_GOAL_OPTIONS.find((o) => o.value === formule7.goal) ?? null}
            onChange={(_, v) => set({ goal: v?.value ?? null })}
            getOptionLabel={(o) => o.label}
            renderInput={(params) => (
              <TextField {...params} label="Doelstelling (Formule 7)" size="small" fullWidth />
            )}
            sx={{ width: '100%' }}
          />
        </Box>
        <Box sx={FORM_ROW}>
          <Autocomplete
            options={[1, 2, 3, 4, 5, 6, 7] as const}
            value={formule7.sessionsPerWeek ?? null}
            onChange={(_, v) =>
              set({ sessionsPerWeek: typeof v === 'number' && v >= 1 && v <= 7 ? v : null })
            }
            getOptionLabel={(v) => String(v)}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Trainingsfrequentie per week"
                size="small"
                fullWidth
                InputProps={{
                  ...params.InputProps,
                  endAdornment: (
                    <>
                      {params.InputProps?.endAdornment}
                      <Tooltip
                        title="Hoe vaak de sporter per week wil trainen; hierop wordt het ideaal weekplan gebaseerd."
                        placement="top"
                      >
                        <span style={{ display: 'inline-flex', cursor: 'help', marginLeft: 4 }} aria-label="Uitleg trainingsfrequentie">
                          <InfoOutlinedIcon sx={{ fontSize: 18, opacity: 0.7 }} />
                        </span>
                      </Tooltip>
                    </>
                  ),
                }}
              />
            )}
            sx={{ width: '100%' }}
          />
          <Autocomplete
            options={SESSION_DURATION_OPTIONS}
            value={SESSION_DURATION_OPTIONS.find((o) => o.value === formule7.sessionDurationCategory) ?? null}
            onChange={(_, v) => set({ sessionDurationCategory: v?.value ?? null })}
            getOptionLabel={(o) => o.label}
            renderInput={(params) => (
              <TextField {...params} label="Trainingstijd per sessie" size="small" fullWidth />
            )}
            sx={{ width: '100%' }}
          />
          <TextField
            label="Rusthartfrequentie (sl/min)"
            type="number"
            value={formule7.restingHr ?? ''}
            onChange={(e) => set({ restingHr: e.target.value === '' ? null : Number(e.target.value) || null })}
            size="small"
            fullWidth
            inputProps={{ min: 0 }}
          />
          <TextField
            label="Theoretische max. hartfrequentie (sl/min)"
            type="number"
            value={formule7.theoreticalMaxHr ?? computedMaxHr ?? ''}
            size="small"
            fullWidth
            inputProps={{ min: 0, readOnly: true }}
            placeholder="Vul leeftijd in (220 − leeftijd)"
            InputProps={{
              endAdornment: (
                <Tooltip title="Automatisch: 220 − leeftijd (slagen per minuut)" placement="top">
                  <span style={{ display: 'inline-flex', cursor: 'help', marginLeft: 4 }} aria-label="Uitleg berekening">
                    <InfoOutlinedIcon sx={{ fontSize: 18, opacity: 0.7 }} />
                  </span>
                </Tooltip>
              ),
            }}
          />
        </Box>
        {onStartDateChange != null && onDurationWeeksChange != null && (
          <Box sx={FORM_ROW}>
            <TextField
              label="Startdatum periode"
              type="date"
              value={startDate ?? ''}
              onChange={(e) => onStartDateChange(e.target.value)}
              size="small"
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            <Autocomplete
              options={[4, 5, 6, 7, 8]}
              value={durationWeeks}
              onChange={(_, v) => v != null && onDurationWeeksChange(v)}
              getOptionLabel={(v) => `${v} weken`}
              renderInput={(params) => (
                <TextField {...params} label="Duur (weken)" size="small" fullWidth />
              )}
              sx={{ minWidth: 0 }}
            />
          </Box>
        )}
        </Box>
    </Formule7SectionAccordion>
  );
}
