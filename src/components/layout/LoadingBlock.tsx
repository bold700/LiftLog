import { Box, CircularProgress } from '@mui/material';

/** Laadindicator voor een pagina of tabblad dat nog wordt opgehaald (lazy-loaded of data). */
export function LoadingBlock({ minHeight = 240 }: { minHeight?: number }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight, py: 4 }} role="status" aria-label="Laden">
      <CircularProgress size={28} />
    </Box>
  );
}
