/**
 * Centrale design tokens voor consistente layout en styling.
 * Gebruik deze overal i.p.v. hardcoded waarden.
 */
export const designTokens = {
  /** Max breedte pagina-inhoud (px) */
  pageMaxWidth: 800,
  /** Ruimte onderaan pagina voor nav (theme spacing) */
  pagePaddingBottom: 10,
  /** Achtergrondkleur hoofdcards (warme beige) */
  cardBackground: '#FEF2E5',
  /** Randkleur secundaire/outline cards */
  cardBorder: '#D2C5B4',
  /** Border radius cards (px) */
  cardRadius: 16,
  /** Border radius knoppen (px) */
  buttonRadius: 20,
} as const;
