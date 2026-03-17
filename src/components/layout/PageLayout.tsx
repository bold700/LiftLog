import { ReactNode } from 'react';
import { Box } from '@mui/material';
import { designTokens } from '../../theme/designTokens';

interface PageLayoutProps {
  children: ReactNode;
  /** Optioneel: andere max-width (default 800) */
  maxWidth?: number;
}

/**
 * Consistente pagina-wrapper: gecentreerd, max breedte, ruimte voor bottom nav.
 * Gebruik op elke pagina voor dezelfde layout.
 */
export function PageLayout({ children, maxWidth = designTokens.pageMaxWidth }: PageLayoutProps) {
  return (
    <Box
      className="animate-fade-in-up"
      sx={{
        maxWidth,
        mx: 'auto',
        pb: designTokens.pagePaddingBottom,
      }}
    >
      {children}
    </Box>
  );
}
