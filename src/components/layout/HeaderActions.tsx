import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useMediaQuery, useTheme } from '@mui/material';

/** Id van de plek rechts in de desktop-paginakop (AppShell), waar een scherm zijn knoppen kwijt kan. */
export const PAGE_HEADER_ACTIONS_ID = 'page-header-actions';

/**
 * Knoppen die in Figma rechts in de paginakop staan ("New workout"). Op desktop verhuizen ze naar die
 * kop; op een telefoon is er geen kop met ruimte, dan blijven ze staan waar het scherm ze zet.
 */
export function HeaderActions({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up('md'));
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setTarget(wide ? document.getElementById(PAGE_HEADER_ACTIONS_ID) : null);
  }, [wide]);
  return target ? createPortal(children, target) : <>{children}</>;
}
