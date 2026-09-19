/**
 * Centrale design tokens, afgeleid van het actieve Material 3-schema — dat van VORM zelf, of dat
 * van de studio als die een eigen huisstijl heeft. Gebruik deze — of het MUI-palet
 * ('primary.main') — in plaats van hexcodes in componenten.
 *
 * Het zijn getters: een component dat `designTokens.cardBackground` leest, krijgt de kleur van
 * het schema dat op dát moment actief is. Bij een wisseling van studio rendert alles opnieuw
 * (het MUI-thema is dan een nieuw object), dus de getters worden vanzelf opnieuw gelezen.
 */
import { getActiveScheme } from './brandingTheme';

export const designTokens = {
  /** Max breedte pagina-inhoud (px) */
  pageMaxWidth: 800,
  /** Ruimte onderaan pagina voor nav (theme spacing) */
  pagePaddingBottom: 10,
  /** Breedte van de zijbalk op grote schermen (px) */
  railWidth: 240,
  /** Border radius cards (px) — "Corner/Large" in het ontwerp */
  cardRadius: 16,
  /** Border radius knoppen (px) */
  buttonRadius: 20,

  /** Achtergrond van de pagina */
  get surface() {
    return getActiveScheme().surface;
  },
  /** Achtergrondkleur hoofdcards: een tint donkerder dan de pagina */
  get cardBackground() {
    return getActiveScheme().surfaceContainerLow;
  },
  /** Nog een tint donkerder: tegels ín een card, de keuzebalk, de navigatie */
  get cardBackgroundHigh() {
    return getActiveScheme().surfaceContainer;
  },
  /** Randkleur secundaire/outline cards */
  get cardBorder() {
    return getActiveScheme().outlineVariant;
  },
  /** Donkergroen: gevulde knoppen, actieve balken */
  get primary() {
    return getActiveScheme().primary;
  },
  get onPrimary() {
    return getActiveScheme().onPrimary;
  },
  /** Zachtgroen: FAB, "Assigned to you"-chips, avatars */
  get primaryContainer() {
    return getActiveScheme().primaryContainer;
  },
  get onPrimaryContainer() {
    return getActiveScheme().onPrimaryContainer;
  },
  /** Gedempt groen: gekozen segment in een keuzebalk, actieve navigatie */
  get secondaryContainer() {
    return getActiveScheme().secondaryContainer;
  },
  get onSecondaryContainer() {
    return getActiveScheme().onSecondaryContainer;
  },
  /** Blauwgroen: "Last time"-balk, Duo PT, informatie */
  get tertiaryContainer() {
    return getActiveScheme().tertiaryContainer;
  },
  get onTertiaryContainer() {
    return getActiveScheme().onTertiaryContainer;
  },
  get outline() {
    return getActiveScheme().outline;
  },
};
