import { Typography } from '@mui/material';

interface PageTitleProps {
  children: React.ReactNode;
}

/**
 * Consistente paginatitel: h5, gutterBottom, mb 3, fontWeight 600.
 */
export function PageTitle({ children }: PageTitleProps) {
  return (
    <Typography variant="h5" gutterBottom sx={{ mb: 3, fontWeight: 600 }}>
      {children}
    </Typography>
  );
}
