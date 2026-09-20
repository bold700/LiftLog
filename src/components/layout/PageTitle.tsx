import { Typography } from '@mui/material';

interface PageTitleProps {
  children: React.ReactNode;
}

/**
 * Consistente paginatitel: h5, gutterBottom, mb 3, fontWeight 600. Op de telefoon staat de titel
 * al in de bovenbalk van de schil, dus daar blijft deze weg.
 */
export function PageTitle({ children }: PageTitleProps) {
  return (
    <Typography variant="h5" gutterBottom sx={{ mb: 3, fontWeight: 600, display: { xs: 'none', md: 'block' } }}>
      {children}
    </Typography>
  );
}
