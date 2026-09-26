/**
 * Centrale design tokens, afgeleid van het actieve Material 3-schema — dat van VORM zelf, of dat
 * van de studio als die een eigen huisstijl heeft, in licht of donker. Gebruik deze — of het
 * MUI-palet ('primary.main') — in plaats van hexcodes in componenten.
 *
 * Een kleur-token is een CSS-variabele (`var(--md-sys-color-…)`), met de huidige kleur als
 * terugval. De variabelen zet brandingTheme.setActiveScheme op <html>. Zo wisselt ook een stijl
 * die al bij het laden van een bestand is vastgelegd (een `const cardSx = {…}`) mee met de studio
 * en met licht/donker, zonder dat het component opnieuw hoeft te rekenen.
 */
import { getActiveScheme, type LightScheme } from './brandingTheme';

const cssVar = (key: keyof LightScheme) =>
  `var(--md-sys-color-${String(key).replace(/([A-Z])/g, '-$1').toLowerCase()}, ${getActiveScheme()[key]})`;

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
    return cssVar('surface');
  },
  /** Achtergrondkleur hoofdcards: een tint donkerder dan de pagina */
  get cardBackground() {
    return cssVar('surfaceContainerLow');
  },
  /** Nog een tint donkerder: tegels ín een card, de keuzebalk, de navigatie */
  get cardBackgroundHigh() {
    return cssVar('surfaceContainer');
  },
  /** Randkleur secundaire/outline cards */
  get cardBorder() {
    return cssVar('outlineVariant');
  },
  /** Donkergroen: gevulde knoppen, actieve balken */
  get primary() {
    return cssVar('primary');
  },
  get onPrimary() {
    return cssVar('onPrimary');
  },
  /** Zachtgroen: FAB, "Assigned to you"-chips, avatars */
  get primaryContainer() {
    return cssVar('primaryContainer');
  },
  get onPrimaryContainer() {
    return cssVar('onPrimaryContainer');
  },
  /** Gedempt groen: gekozen segment in een keuzebalk, actieve navigatie */
  get secondaryContainer() {
    return cssVar('secondaryContainer');
  },
  get onSecondaryContainer() {
    return cssVar('onSecondaryContainer');
  },
  /** Blauwgroen: "Last time"-balk, Duo PT, informatie */
  get tertiaryContainer() {
    return cssVar('tertiaryContainer');
  },
  get onTertiaryContainer() {
    return cssVar('onTertiaryContainer');
  },
  /** Verzadigd blauwgroen: secundaire voortgangsbalken (bijv. macro's op Voeding) */
  get tertiary() {
    return cssVar('tertiary');
  },
  get outline() {
    return cssVar('outline');
  },
};
