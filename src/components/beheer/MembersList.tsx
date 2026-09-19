/**
 * De ledenlijst van Beheer, naar het ontwerp: op een groot scherm een tabel (naam, e-mail, rol,
 * abonnement, credits), op de telefoon kaartjes met abonnement en credits onder de naam.
 * Abonnementen bestaan nog niet; die kolom toont een streepje tot die stap er is.
 */
import { Box, Chip, Table, TableBody, TableCell, TableHead, TableRow, Typography, useMediaQuery, useTheme } from '@mui/material';
import { useI18n } from '../../context/I18nContext';
import { UserAvatar } from '../UserAvatar';
import { designTokens } from '../../theme/designTokens';
import type { Profile, ProfileRole } from '../../types';

interface MembersListProps {
  profiles: Profile[];
  /** Creditsaldo per userId; ontbreekt iemand, dan is er nog geen rekening. */
  credits: Record<string, number>;
  selfId: string;
  loading: boolean;
  hasAny: boolean;
  onOpen: (p: Profile) => void;
}

export function MembersList({ profiles, credits, selfId, loading, hasAny, onOpen }: MembersListProps) {
  const { t } = useI18n();
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up('md'));

  const nameOf = (p: Profile) => `${p.displayName?.trim() || p.email || p.userId}${p.userId === selfId ? ` ${t('admin.me')}` : ''}`;
  const subscriptionOf = () => t('common.none');
  const creditsOf = (p: Profile) => {
    if (p.role !== 'sporter') return t('common.none');
    const n = credits[p.userId];
    return n == null ? t('common.none') : t('admin.creditsLeft', { count: n });
  };

  if (loading && !hasAny) {
    return <Empty text={t('admin.loading')} />;
  }
  if (profiles.length === 0) {
    return <Empty text={hasAny ? t('admin.emptySearch') : t('admin.empty')} />;
  }

  if (!wide) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {profiles.map((p) => (
          <Box
            key={p.userId}
            role="button"
            tabIndex={0}
            onClick={() => onOpen(p)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onOpen(p);
            }}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              p: 1.5,
              borderRadius: `${designTokens.cardRadius}px`,
              bgcolor: designTokens.cardBackground,
              cursor: 'pointer',
              '&:hover': { bgcolor: designTokens.cardBackgroundHigh },
            }}
          >
            <UserAvatar name={p.displayName} photoURL={p.photoURL} size={40} />
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="body2" fontWeight={600} noWrap>
                {nameOf(p)}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                {p.role === 'sporter' ? `${subscriptionOf()} · ${creditsOf(p)}` : p.email ?? t('common.none')}
              </Typography>
            </Box>
            <RoleChip role={p.role} />
          </Box>
        ))}
      </Box>
    );
  }

  return (
    <Box sx={{ borderRadius: `${designTokens.cardRadius}px`, bgcolor: designTokens.cardBackground, overflow: 'hidden' }}>
      <Table size="medium" sx={{ '& td, & th': { borderBottom: 0, py: 1.5 }, '& th': { color: 'text.secondary', fontSize: 12, fontWeight: 500, pb: 0.5 } }}>
        <TableHead>
          <TableRow>
            <TableCell>{t('admin.columns.name')}</TableCell>
            <TableCell>{t('admin.columns.email')}</TableCell>
            <TableCell>{t('admin.columns.role')}</TableCell>
            <TableCell>{t('admin.columns.subscription')}</TableCell>
            <TableCell>{t('admin.columns.credits')}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {profiles.map((p) => (
            <TableRow key={p.userId} hover onClick={() => onOpen(p)} sx={{ cursor: 'pointer' }}>
              <TableCell sx={{ width: '28%' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <UserAvatar name={p.displayName} photoURL={p.photoURL} size={28} />
                  <Typography variant="body2" fontWeight={600} noWrap>
                    {nameOf(p)}
                  </Typography>
                </Box>
              </TableCell>
              <TableCell sx={{ color: 'text.secondary' }}>{p.email ?? t('common.none')}</TableCell>
              <TableCell>
                <RoleChip role={p.role} />
              </TableCell>
              <TableCell sx={{ color: 'text.secondary' }}>{subscriptionOf()}</TableCell>
              <TableCell sx={{ color: 'text.secondary' }}>{creditsOf(p)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

/** Sporter grijs, staf in de primaire container: zo staat het in het ontwerp. */
export function RoleChip({ role }: { role: ProfileRole }) {
  const { t } = useI18n();
  const staff = role !== 'sporter';
  return (
    <Chip
      size="small"
      label={t(`admin.roles.${role}`)}
      sx={{
        height: 22,
        fontSize: 12,
        bgcolor: staff ? designTokens.primaryContainer : designTokens.cardBackgroundHigh,
        color: staff ? designTokens.onPrimaryContainer : 'text.primary',
      }}
    />
  );
}

function Empty({ text }: { text: string }) {
  return (
    <Box sx={{ p: 3, borderRadius: `${designTokens.cardRadius}px`, bgcolor: designTokens.cardBackground }}>
      <Typography color="text.secondary">{text}</Typography>
    </Box>
  );
}
