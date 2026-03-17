import { ReactNode } from 'react';
import { Card, CardContent } from '@mui/material';
import { designTokens } from '../../theme/designTokens';

interface ContentCardProps {
  children: ReactNode;
  /** Onderrand van de card (theme spacing) */
  sx?: object;
}

/**
 * Hoofdcard: warme achtergrond (#FEF2E5), afgeronde hoeken.
 * Gebruik voor secties met titel + inhoud.
 */
export function ContentCard({ children, sx }: ContentCardProps) {
  return (
    <Card
      sx={{
        mb: 3,
        backgroundColor: designTokens.cardBackground,
        borderRadius: `${designTokens.cardRadius}px`,
        transition: 'transform 0.25s ease, box-shadow 0.25s ease',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: 2,
        },
        ...sx,
      }}
      elevation={0}
    >
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/**
 * Secundaire card: transparante achtergrond, rand (#D2C5B4).
 * Gebruik voor geneste blokken (grafieken, lijsten).
 */
export function OutlineCard({
  children,
  sx,
  noPadding,
}: ContentCardProps & { noPadding?: boolean }) {
  return (
    <Card
      sx={{
        mb: 3,
        backgroundColor: 'transparent',
        borderRadius: `${designTokens.cardRadius}px`,
        border: `1px solid ${designTokens.cardBorder}`,
        transition: 'transform 0.25s ease, box-shadow 0.25s ease, border-color 0.2s ease',
        '&:hover': {
          transform: 'translateY(-1px)',
          boxShadow: 1,
          borderColor: 'rgba(0,0,0,0.15)',
        },
        ...sx,
      }}
      elevation={0}
    >
      <CardContent sx={noPadding ? { p: 0, '&:last-child': { pb: 0 } } : undefined}>{children}</CardContent>
    </Card>
  );
}
