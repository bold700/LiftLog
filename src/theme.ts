/**
 * Het standaardthema: VORM zelf, uit het Material 3-schema in theme.json (het Figma-ontwerp).
 * Een studio met een eigen huisstijl krijgt hetzelfde thema met een ander schema; zie
 * theme/brandingTheme.ts en context/BrandingContext.tsx.
 */
import { createAppTheme, DEFAULT_SCHEME } from './theme/brandingTheme';

export const lightTheme = createAppTheme(DEFAULT_SCHEME);
