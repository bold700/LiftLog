/**
 * Centrale design tokens, afgeleid van het Material 3-schema in theme.json (het Figma-ontwerp).
 * Gebruik deze — of het MUI-palet ('primary.main') — in plaats van hexcodes in componenten.
 */
import themeData from '../theme.json';

const scheme = themeData.schemes.light;

export const designTokens = {
  /** Max breedte pagina-inhoud (px) */
  pageMaxWidth: 800,
  /** Ruimte onderaan pagina voor nav (theme spacing) */
  pagePaddingBottom: 10,
  /** Breedte van de zijbalk op grote schermen (px) */
  railWidth: 240,
  /** Achtergrond van de pagina */
  surface: scheme.surface,
  /** Achtergrondkleur hoofdcards: een tint donkerder dan de pagina */
  cardBackground: scheme.surfaceContainerLow,
  /** Nog een tint donkerder: tegels ín een card, de keuzebalk, de navigatie */
  cardBackgroundHigh: scheme.surfaceContainer,
  /** Randkleur secundaire/outline cards */
  cardBorder: scheme.outlineVariant,
  /** Border radius cards (px) — "Corner/Large" in het ontwerp */
  cardRadius: 16,
  /** Border radius knoppen (px) */
  buttonRadius: 20,
  /** Donkergroen: gevulde knoppen, actieve balken */
  primary: scheme.primary,
  onPrimary: scheme.onPrimary,
  /** Zachtgroen: FAB, "Assigned to you"-chips, avatars */
  primaryContainer: scheme.primaryContainer,
  onPrimaryContainer: scheme.onPrimaryContainer,
  /** Gedempt groen: gekozen segment in een keuzebalk, actieve navigatie */
  secondaryContainer: scheme.secondaryContainer,
  onSecondaryContainer: scheme.onSecondaryContainer,
  /** Blauwgroen: "Last time"-balk, Duo PT, informatie */
  tertiaryContainer: scheme.tertiaryContainer,
  onTertiaryContainer: scheme.onTertiaryContainer,
  outline: scheme.outline,
} as const;
