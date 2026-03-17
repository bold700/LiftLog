import { Typography } from '@mui/material';

interface EmptyStateProps {
  children: React.ReactNode;
}

/**
 * Consistente lege-staat tekst: gecentreerd, text.secondary, py 4.
 */
export function EmptyState({ children }: EmptyStateProps) {
  return (
    <Typography
      variant="body1"
      color="text.secondary"
      align="center"
      className="animate-fade-in"
      sx={{ py: 4 }}
    >
      {children}
    </Typography>
  );
}
