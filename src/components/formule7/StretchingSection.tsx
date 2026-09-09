// Sectie 6 van de Formule 7-routekaart: stretching per spiergroep (duur, herhalingen), met optie om de
// spiergroepen te vullen op basis van de oefeningen in het schema.
import { Box, TextField, IconButton } from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import type { Formule7Routekaart, Formule7Stretch } from '../../types';
import { getMuscleGroupsFromExerciseNames } from '../../utils/stretchingSuggestions';
import { HelperText, Formule7SectionAccordion } from './sectionShared';
import { NumberField } from '../NumberField';

/** Rij voor stretching: volle breedte, Spiergroep groot, Duur/Herhalingen kleiner, delete-knop vast. */
const STRETCH_ROW = {
  display: 'flex',
  flexWrap: 'wrap' as const,
  gap: 2,
  alignItems: 'center' as const,
  minWidth: 0,
  width: '100%',
  '& > *:first-of-type': {
    flex: '2 1 0%',
    minWidth: 100,
  },
  '& > *:nth-of-type(2)': {
    flex: '1 1 0%',
    minWidth: 90,
  },
  '& > *:nth-of-type(3)': {
    flex: '1 1 0%',
    minWidth: 80,
  },
  '& > *:nth-of-type(4)': {
    flex: '0 0 auto',
    width: 40,
    height: 40,
  },
};

interface StretchingSectionProps {
  /** Huidige stretching-rijen (per dag of algemeen). */
  value: Formule7Stretch[];
  onChange: (next: Formule7Routekaart['stretching']) => void;
  /** Oefennamen uit het schema; gebruikt om stretching-spiergroepen voor te stellen. */
  schemaExerciseNames: string[];
  expanded: boolean;
  onToggle: () => void;
}

export function StretchingSection({
  value: stretchingRows,
  onChange: setEffectiveStretching,
  schemaExerciseNames,
  expanded,
  onToggle,
}: StretchingSectionProps) {
  const setStretch = (index: number, upd: Partial<Formule7Stretch>) => {
    const next = stretchingRows.map((s, i) => (i === index ? { ...s, ...upd } : s));
    setEffectiveStretching(next);
  };

  const addStretchRow = () => {
    setEffectiveStretching([...stretchingRows, { muscleGroup: '', stretchDurationSeconds: null, repetitions: null }]);
  };

  const removeStretchRow = (index: number) => {
    setEffectiveStretching(stretchingRows.filter((_, i) => i !== index));
  };

  return (
    <Formule7SectionAccordion title="6. Stretching" expanded={expanded} onToggle={onToggle}>
        <HelperText>
          Per spiergroep: duur van de stretch (sec) en aantal herhalingen. Je kunt de spiergroepen laten vullen op basis van de oefeningen in je workout.
        </HelperText>
        {schemaExerciseNames.length > 0 && (
          <Box sx={{ mb: 1.5 }}>
            <md-text-button
              onClick={() => {
                const groups = getMuscleGroupsFromExerciseNames(schemaExerciseNames);
                const newStretching = groups.map((muscleGroup) => ({
                  muscleGroup,
                  stretchDurationSeconds: null as number | null,
                  repetitions: null as number | null,
                }));
                setEffectiveStretching(newStretching);
              }}
            >
              Vul stretching op basis van oefeningen
            </md-text-button>
          </Box>
        )}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0 }}>
          {stretchingRows.map((row, idx) => (
            <Box
              key={idx}
              sx={{
                ...STRETCH_ROW,
                p: 1.5,
                borderRadius: 1,
                bgcolor: 'rgba(0,0,0,0.03)',
              }}
            >
              <TextField
                label="Spiergroep"
                value={row.muscleGroup}
                onChange={(e) => setStretch(idx, { muscleGroup: e.target.value })}
                size="small"
                fullWidth
                sx={{ minWidth: 0 }}
                placeholder="Spiergroep"
              />
              <NumberField
                label="Duur stretch (sec)"
                value={String(row.stretchDurationSeconds ?? '')}
                onChange={(v) =>
                  setStretch(idx, {
                    stretchDurationSeconds:
                      v === '' ? null : Number(v) || null,
                  })
                }
                size="small"
                fullWidth
                sx={{ minWidth: 0 }}
              />
              <NumberField
                label="Herhalingen"
                value={String(row.repetitions ?? '')}
                onChange={(v) =>
                  setStretch(idx, {
                    repetitions: v === '' ? null : Number(v) || null,
                  })
                }
                size="small"
                fullWidth
                sx={{ minWidth: 0 }}
              />
              <Box sx={{ flex: '0 0 40px', width: 40, height: 40, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <IconButton
                  size="small"
                  onClick={() => removeStretchRow(idx)}
                  aria-label="Rij verwijderen"
                  color="error"
                  sx={{
                    width: 40,
                    height: 40,
                    minWidth: 40,
                    padding: 0,
                    '& .MuiSvgIcon-root': { fontSize: 22 },
                  }}
                >
                  <DeleteOutlineIcon />
                </IconButton>
              </Box>
            </Box>
          ))}
          <Box sx={{ mt: 0.5 }}>
            <md-text-button onClick={addStretchRow}>
              Rij toevoegen
            </md-text-button>
          </Box>
        </Box>
    </Formule7SectionAccordion>
  );
}
