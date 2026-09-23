/**
 * Werkbalk boven de ledenlijst: zoeken, rol en abonnement filteren, en op de telefoon sorteren
 * (op een groot scherm sorteer je met de kolomkoppen). Op een groot scherm alles op één regel.
 */
import { Box, Chip, InputAdornment, MenuItem, TextField, Typography } from '@mui/material';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { useI18n } from '../../context/I18nContext';
import { designTokens } from '../../theme/designTokens';
import { filterPillSx } from '../../theme/segmentedToggle';
import { FilterGroup, FilterSheet } from '../FilterSheet';
import { DEFAULT_MEMBER_SORT, NO_PLAN, type MemberFilter, type MemberSort, type MemberSortKey, type RoleFilter } from '../../utils/memberTable';

interface Props {
  filter: MemberFilter;
  onFilter: (f: MemberFilter) => void;
  sort: MemberSort;
  onSort: (s: MemberSort) => void;
  plans: { id: string; name: string }[];
  shown: number;
  total: number;
}

const ROLES: { value: RoleFilter; key: 'all' | 'sporters' | 'staff' }[] = [
  { value: 'all', key: 'all' },
  { value: 'sporter', key: 'sporters' },
  { value: 'staff', key: 'staff' },
];
const SORT_KEYS: MemberSortKey[] = ['name', 'role', 'subscription', 'credits', 'email'];

const pillSelectSx = (active: boolean) => ({
  '& .MuiOutlinedInput-root': {
    borderRadius: 999,
    height: 32,
    fontSize: 13,
    fontWeight: active ? 600 : 500,
    bgcolor: active ? designTokens.secondaryContainer : 'transparent',
    color: active ? designTokens.onSecondaryContainer : 'text.secondary',
    '& fieldset': { borderColor: active ? designTokens.secondaryContainer : designTokens.outline },
  },
  '& .MuiSelect-select': { py: 0.5, pl: 1.5 },
});

export function MembersToolbar({ filter, onFilter, sort, onSort, plans, shown, total }: Props) {
  const { t } = useI18n();
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mb: 2 }}>
      <TextField
        size="small"
        placeholder={t('admin.search')}
        value={filter.query}
        onChange={(e) => onFilter({ ...filter, query: e.target.value })}
        sx={{
          width: { md: 280 },
          flex: { xs: 1, md: 'none' },
          minWidth: 0,
          '& .MuiOutlinedInput-root': { borderRadius: 999, bgcolor: designTokens.cardBackgroundHigh, height: 36 },
          '& fieldset': { border: 0 },
        }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchRoundedIcon fontSize="small" />
            </InputAdornment>
          ),
        }}
        inputProps={{ 'aria-label': t('admin.searchMembers'), type: 'search' }}
      />
      <Box
        role="group"
        aria-label={t('admin.columns.role')}
        sx={{ display: { xs: 'none', md: 'flex' }, gap: 1, alignItems: 'center', ml: 1 }}
      >
        {ROLES.map((r) => (
          <Chip
            key={r.value}
            label={t(`admin.memberFilters.${r.key}`)}
            size="small"
            onClick={() => onFilter({ ...filter, role: r.value })}
            aria-pressed={filter.role === r.value}
            sx={{ height: 32, ...filterPillSx(filter.role === r.value) }}
          />
        ))}
        <TextField
          select
          size="small"
          value={filter.plan || 'all'}
          onChange={(e) => onFilter({ ...filter, plan: e.target.value === 'all' ? '' : e.target.value })}
          inputProps={{ 'aria-label': t('admin.memberFilters.plan') }}
          sx={{ minWidth: 150, flexShrink: 0, ...pillSelectSx(!!filter.plan) }}
        >
          <MenuItem value="all">{t('admin.memberFilters.allPlans')}</MenuItem>
          <MenuItem value={NO_PLAN}>{t('admin.memberFilters.noPlan')}</MenuItem>
          {plans.map((p) => (
            <MenuItem key={p.id} value={p.id}>
              {p.name}
            </MenuItem>
          ))}
        </TextField>
      </Box>
      {/* Telefoon: rol, abonnement en sorteren achter de filterknop, in een bottom sheet. */}
      <Box sx={{ display: { xs: 'flex', md: 'none' } }}>
        <FilterSheet
          activeCount={(filter.role !== 'all' ? 1 : 0) + (filter.plan ? 1 : 0) + (sort.key !== DEFAULT_MEMBER_SORT.key || sort.dir !== DEFAULT_MEMBER_SORT.dir ? 1 : 0)}
          onReset={() => {
            onFilter({ ...filter, role: 'all', plan: '' });
            onSort(DEFAULT_MEMBER_SORT);
          }}
        >
          <FilterGroup label={t('admin.columns.role')}>
            {ROLES.map((r) => (
              <Chip
                key={r.value}
                label={t(`admin.memberFilters.${r.key}`)}
                onClick={() => onFilter({ ...filter, role: r.value })}
                sx={filterPillSx(filter.role === r.value)}
              />
            ))}
          </FilterGroup>
          <FilterGroup label={t('admin.memberFilters.plan')}>
            <Chip label={t('admin.memberFilters.allPlans')} onClick={() => onFilter({ ...filter, plan: '' })} sx={filterPillSx(!filter.plan)} />
            <Chip label={t('admin.memberFilters.noPlan')} onClick={() => onFilter({ ...filter, plan: NO_PLAN })} sx={filterPillSx(filter.plan === NO_PLAN)} />
            {plans.map((p) => (
              <Chip key={p.id} label={p.name} onClick={() => onFilter({ ...filter, plan: p.id })} sx={filterPillSx(filter.plan === p.id)} />
            ))}
          </FilterGroup>
          <FilterGroup label={t('admin.memberFilters.sortBy')}>
            {SORT_KEYS.map((k) => (
              <Chip key={k} label={t(`admin.columns.${k}`)} onClick={() => onSort({ ...sort, key: k })} sx={filterPillSx(sort.key === k)} />
            ))}
          </FilterGroup>
          <FilterGroup label={t('admin.memberFilters.order')}>
            {(['asc', 'desc'] as const).map((d) => (
              <Chip key={d} label={t(`admin.memberFilters.${d}`)} onClick={() => onSort({ ...sort, dir: d })} sx={filterPillSx(sort.dir === d)} />
            ))}
          </FilterGroup>
        </FilterSheet>
      </Box>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ ml: 'auto', whiteSpace: 'nowrap', flexShrink: 0, width: { xs: '100%', md: 'auto' }, textAlign: 'right' }}
        aria-live="polite"
      >
        {shown === total ? t('admin.memberFilters.count', { count: total }) : t('admin.memberFilters.countOf', { count: shown, total })}
      </Typography>
    </Box>
  );
}
