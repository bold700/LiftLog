import { ReactNode } from 'react';
import { Card, CardContent } from '@mui/material';
import { designTokens } from '../../theme/designTokens';

interface ContentCardProps {
  children: ReactNode;
  /** Onderrand van de card (theme spacing) */
  sx?: object;
}

/**
 * Hoofdcard: een tint donkerder dan de pagina (surfaceContainerLow), afgeronde hoeken.
 * Gebruik voor secties met titel + inhoud.
 */
export function ContentCard({ children, sx }: ContentCardProps) {
  return (
    <Card
      sx={{
        mb: 3,
        backgroundColor: designTokens.cardBackground,
        borderRadius: `${designTokens.cardRadius}px`,
        // Geen optil-effect bij hover: deze kaart is niet klikbaar, en optillen belooft dat wel.
        ...sx,
      }}
      elevation={0}
    >
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/**
 * Secundaire card: transparante achtergrond, rand in outlineVariant.
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
        ...sx,
      }}
      elevation={0}
    >
      <CardContent sx={noPadding ? { p: 0, '&:last-child': { pb: 0 } } : undefined}>{children}</CardContent>
    </Card>
  );
}
