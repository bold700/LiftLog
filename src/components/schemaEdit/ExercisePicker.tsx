/**
 * Oefening-keuze in een dagkaart van SchemaEditView: apparatuur- en spiergroepfilter
 * naast elkaar, daaronder de Autocomplete met GIF-plaatje per optie.
 */
import {
  Box,
  TextField,
  Autocomplete,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import type { ExerciseDbEquipmentFilter } from '../../hooks/useExerciseDbSearch';
import { ExerciseGifThumb } from '../ExerciseGifThumb';
import { MUSCLE_GROUP_OPTIONS } from '../../utils/exerciseMuscleFilter';

const EQUIPMENT_FILTER_OPTIONS: { value: ExerciseDbEquipmentFilter; label: string }[] = [
  { value: 'all', label: 'Alle oefeningen' },
  { value: 'machine', label: 'Alleen machines' },
  { value: 'free_weight', label: 'Alleen vrije gewichten' },
  { value: 'cable', label: 'Alleen kabels' },
  { value: 'bodyweight', label: 'Alleen bodyweight' },
  { value: 'other', label: 'Overig' },
];

export interface ExercisePickerProps {
  /** Huidige oefeningnaam van deze rij. */
  value: string;
  /** Zoekresultaten uit de oefeningendatabase (gedeeld met de routekaart). */
  options: string[];
  equipmentFilter: ExerciseDbEquipmentFilter;
  onEquipmentFilterChange: (value: ExerciseDbEquipmentFilter) => void;
  selectedMuscleGroup: string | null;
  onMuscleGroupChange: (value: string | null) => void;
  /** Zoekterm voor de database-zoekopdracht bijwerken. */
  onSearchTermChange: (term: string) => void;
  /** Optie gekozen of gewist ('' = leeg). */
  onSelect: (name: string) => void;
  /** Vrije invoer in het tekstveld. */
  onInput: (value: string) => void;
}

export function ExercisePicker({
  value,
  options,
  equipmentFilter,
  onEquipmentFilterChange,
  selectedMuscleGroup,
  onMuscleGroupChange,
  onSearchTermChange,
  onSelect,
  onInput,
}: ExercisePickerProps) {
  return (
    <>
      {/* Beide filters naast elkaar, direct boven Oefening in elke dagkaart. */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 1.5 }}>
        <FormControl size="small" sx={{ minWidth: 180, flex: '1 1 160px' }}>
          <InputLabel id="equipment-filter-label">Oefeningen tonen</InputLabel>
          <Select
            labelId="equipment-filter-label"
            value={equipmentFilter}
            label="Oefeningen tonen"
            onChange={(e) => onEquipmentFilterChange(e.target.value as ExerciseDbEquipmentFilter)}
          >
            {EQUIPMENT_FILTER_OPTIONS.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 180, flex: '1 1 160px' }}>
          <InputLabel id="muscle-group-filter-label" shrink>
            Filter op spiergroep
          </InputLabel>
          <Select
            labelId="muscle-group-filter-label"
            value={selectedMuscleGroup ?? ''}
            label="Filter op spiergroep"
            onChange={(e) =>
              onMuscleGroupChange(e.target.value === '' ? null : (e.target.value as string))
            }
            displayEmpty
          >
            <MenuItem value="">
              <em>Geen filter</em>
            </MenuItem>
            {MUSCLE_GROUP_OPTIONS.map((muscle) => (
              <MenuItem key={muscle} value={muscle}>
                {muscle}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1.5, minWidth: 0, width: '100%' }}>
        <Autocomplete
          freeSolo={false}
          options={options}
          groupBy={(option) => (option && option[0] ? option[0].toUpperCase() : '#')}
          autoHighlight
          selectOnFocus
          openOnFocus
          forcePopupIcon
          clearOnBlur={false}
          onOpen={() => onSearchTermChange('')}
          value={value}
          onChange={(_, v) => {
            const n = typeof v === 'string' ? v : v ?? '';
            onSearchTermChange(n);
            onSelect(n);
          }}
          onInputChange={(_, v) =>
            {
              onSearchTermChange(v || '');
              onInput(v);
            }
          }
          renderInput={(params) => (
            <TextField {...params} label="Oefening" size="small" fullWidth />
          )}
          renderOption={(props, option) => {
            // Naam links, klein GIF-plaatje rechts (alleen als de dataset er een heeft).
            const { key, ...rest } = props as typeof props & { key?: string };
            return (
              <Box
                component="li"
                key={key ?? option}
                {...rest}
                sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minHeight: 44 }}
              >
                <Box component="span" sx={{ flex: 1, minWidth: 0 }}>
                  {option}
                </Box>
                <ExerciseGifThumb exerciseName={option} />
              </Box>
            );
          }}
          ListboxProps={{
            style: { maxHeight: 380 },
          }}
          sx={{ flex: 1, minWidth: 0 }}
        />
      </Box>
    </>
  );
}
