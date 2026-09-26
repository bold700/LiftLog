/**
 * Het standaardthema: VORM zelf, uit het Material 3-schema in theme.json (het Figma-ontwerp), licht
 * of donker naar de keuze van de gebruiker. Een studio met een eigen huisstijl krijgt hetzelfde
 * thema met een ander schema; zie theme/brandingTheme.ts en context/BrandingContext.tsx.
 */
import { useEffect, useMemo } from 'react';
import { createAppTheme, DEFAULT_SCHEME, defaultScheme, setActiveScheme } from './theme/brandingTheme';
import { useColorMode } from './context/ColorModeContext';

export const lightTheme = createAppTheme(DEFAULT_SCHEME);

/** Het VORM-thema in de gekozen modus (vóór het inloggen, en zolang de studio nog laadt). */
export function useBaseTheme() {
  const { mode } = useColorMode();
  return useMemo(() => createAppTheme(defaultScheme(mode), mode), [mode]);
}

/**
 * Buiten een studio (het inlogscherm): designTokens en de Material Web-variabelen ook in VORM-kleuren
 * en de gekozen modus. Binnen de app doet BrandingContext dit met het schema van de studio.
 */
export function useApplyBaseScheme() {
  const { mode } = useColorMode();
  useEffect(() => {
    setActiveScheme(defaultScheme(mode), mode);
  }, [mode]);
}
