/**
 * Filters boven de workout-lijst (onder de categorie-tabs, die in SchemasPage blijven):
 * - tab Workouts, alleen trainer: zoekveld "Filter op sporter" (meerdere selecties) + telling;
 * - categorie-tab met meerdere series: chips per serie + chip "Deze week" + telling.
 * De filter-state blijft in SchemasPage; wijzigingen gaan via callbacks (die scrollen naar boven).
 */
import { Box, Typography, Autocomplete, TextField, Chip } from '@mui/material';
import type { Profile } from '../../types';
import { UserAvatar } from '../UserAvatar';

/** Optie in het sporter-zoekveld: een sporter, of een van de vaste keuzes (open / niet toegewezen). */
export type AssigneeOption = { key: string; label: string; profile?: Profile };

interface SchemaListFiltersProps {
  /** Actieve tab: '' = gewone workouts, anders de categorie. */
  activeCategory: string;
  /** Sporter-filter tonen (trainer met minstens één sporter); geldt alleen op de tab Workouts. */
  showAssigneeFilter: boolean;
  assigneeOptions: AssigneeOption[];
  assigneeFilter: AssigneeOption[];
  onAssigneeFilterChange: (value: AssigneeOption[]) => void;
  /** Series binnen de actieve categorie; chips worden alleen getoond bij meer dan één serie. */
  seriesOptions: string[];
  activeSeries: string | null;
  onSeriesChange: (series: string | null) => void;
  onlyCurrentWeek: boolean;
  onToggleCurrentWeek: () => void;
  currentScheduleWeek: number;
  /** Aantal workouts dat na filtering zichtbaar is. */
  visibleCount: number;
}

export const SchemaListFilters = ({
  activeCategory,
  showAssigneeFilter,
  assigneeOptions,
  assigneeFilter,
  onAssigneeFilterChange,
  seriesOptions,
  activeSeries,
  onSeriesChange,
  onlyCurrentWeek,
  onToggleCurrentWeek,
  currentScheduleWeek,
  visibleCount,
}: SchemaListFiltersProps) => (
  <>
    {!activeCategory && showAssigneeFilter && (
      <Box sx={{ mb: 2 }}>
        <Autocomplete
          multiple
          options={assigneeOptions}
          value={assigneeFilter}
          onChange={(_, v) => onAssigneeFilterChange(v)}
          getOptionLabel={(o) => o.label}
          isOptionEqualToValue={(a, b) => a.key === b.key}
          filterSelectedOptions
          size="small"
          renderOption={(props, o) => (
            <li {...props} key={o.key}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {o.profile && <UserAvatar name={o.label} photoURL={o.profile.photoURL ?? null} size={24} />}
                <span>{o.label}</span>
              </Box>
            </li>
          )}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Filter op sporter"
              placeholder={assigneeFilter.length ? '' : 'Zoek op naam of e-mail…'}
            />
          )}
        />
        {assigneeFilter.length > 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            {visibleCount} {visibleCount === 1 ? 'workout' : 'workouts'} voor{' '}
            {assigneeFilter.map((o) => o.label).join(', ')}
          </Typography>
        )}
      </Box>
    )}
    {activeCategory && seriesOptions.length > 1 && (
      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Chip
            label="Alle"
            size="small"
            color={activeSeries ? 'default' : 'primary'}
            variant={activeSeries ? 'outlined' : 'filled'}
            onClick={() => onSeriesChange(null)}
          />
          {seriesOptions.map((s) => (
            <Chip
              key={s}
              label={s}
              size="small"
              color={activeSeries === s ? 'primary' : 'default'}
              variant={activeSeries === s ? 'filled' : 'outlined'}
              onClick={() => onSeriesChange(activeSeries === s ? null : s)}
            />
          ))}
          <Chip
            label={`Deze week (week ${currentScheduleWeek})`}
            size="small"
            color={onlyCurrentWeek ? 'primary' : 'default'}
            variant={onlyCurrentWeek ? 'filled' : 'outlined'}
            onClick={onToggleCurrentWeek}
          />
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          {visibleCount} {visibleCount === 1 ? 'training' : 'trainingen'}
          {activeSeries ? ` · ${activeSeries}` : ''}
          {onlyCurrentWeek ? ` · alleen week ${currentScheduleWeek}` : ''}
        </Typography>
      </Box>
    )}
  </>
);
