/**
 * Werkbalk boven de ledenlijst: zoeken, rol en abonnement filteren, en op de telefoon sorteren
 * (op een groot scherm sorteer je met de kolomkoppen). Op een groot scherm alles op één regel.
 */
import { Box, Chip, InputAdornment, MenuItem, TextField, Typography } from '@mui/material';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { useI18n } from '../../context/I18nContext';
import { designTokens } from '../../theme/designTokens';
import { filterPillSx } from '../../theme/segmentedToggle';
import { NO_PLAN, type MemberFilter, type MemberSort, type MemberSortKey, type RoleFilter } from '../../utils/memberTable';

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
    <Box sx={{ display: 'flex', flexWrap: { xs: 'wrap', md: 'nowrap' }, alignItems: 'center', gap: 1, mb: 2 }}>
      <TextField
        size="small"
        placeholder={t('admin.search')}
        value={filter.query}
        onChange={(e) => onFilter({ ...filter, query: e.target.value })}
        sx={{
          width: { xs: '100%', md: 280 },
          flexShrink: 0,
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
        sx={{ display: 'flex', gap: 1, alignItems: 'center', overflowX: 'auto', maxWidth: '100%', ml: { md: 1 } }}
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
        {/* Sorteren: op een groot scherm via de kolomkoppen, op de telefoon hier. */}
        <TextField
          select
          size="small"
          value={`${sort.key}:${sort.dir}`}
          onChange={(e) => {
            const [key, dir] = e.target.value.split(':') as [MemberSortKey, 'asc' | 'desc'];
            onSort({ key, dir });
          }}
          inputProps={{ 'aria-label': t('admin.memberFilters.sortBy') }}
          sx={{ display: { md: 'none' }, minWidth: 150, flexShrink: 0, ...pillSelectSx(false) }}
        >
          {SORT_KEYS.flatMap((k) =>
            (['asc', 'desc'] as const).map((d) => (
              <MenuItem key={`${k}:${d}`} value={`${k}:${d}`}>
                {t(`admin.columns.${k}`)} · {t(`admin.memberFilters.${d}`)}
              </MenuItem>
            ))
          )}
        </TextField>
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto', whiteSpace: 'nowrap', flexShrink: 0 }} aria-live="polite">
        {shown === total ? t('admin.memberFilters.count', { count: total }) : t('admin.memberFilters.countOf', { count: shown, total })}
      </Typography>
    </Box>
  );
}
