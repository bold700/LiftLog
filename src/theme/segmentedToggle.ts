/**
 * Opmaak voor een keuzebalk (MUI ToggleButtonGroup) in de stijl van het ontwerp: één afgeronde balk
 * in een lichte tint, waarin de gekozen optie als zachtgroene pil staat (Dag · Week · Maand).
 * Zonder dit worden het losse pillen met dubbele randen ertussen.
 */
import { designTokens } from './designTokens';

/** Opmaak van één segment; los exporteerbaar zodat een scherm er iets aan kan toevoegen. */
export const segmentedToggleItemSx = {
  flex: 1,
  border: 0,
  borderRadius: '999px !important',
  textTransform: 'none',
  fontWeight: 500,
  color: 'text.secondary',
  py: 0.75,
  // Zonder dit breekt een label van twee woorden ("Mijn dag") af zodra flex:1 de knop smaller
  // maakt dan de tekst breed is — de knop moet dan breder worden, niet de tekst omvouwen.
  whiteSpace: 'nowrap',
  '&:hover': { bgcolor: 'action.hover' },
  '&.Mui-selected': {
    bgcolor: designTokens.secondaryContainer,
    color: designTokens.onSecondaryContainer,
    fontWeight: 600,
    '&:hover': { bgcolor: designTokens.secondaryContainer },
  },
} as const;

export const segmentedToggleSx = {
  bgcolor: designTokens.cardBackgroundHigh,
  borderRadius: '999px',
  p: '3px',
  gap: '3px',
  '& .MuiToggleButtonGroup-grouped': segmentedToggleItemSx,
};

/**
 * Losse omlijnde filterpil met tussenruimte (bijv. de room-filter op Schedule: "All rooms ·
 * Room 1 · Room 2"), niet te verwarren met de keuzebalk hierboven — die twee zien er in het
 * ontwerp verschillend uit, ook al filteren ze allebei maar één ding tegelijk. Als losse MUI
 * `Chip`'s in plaats van een `ToggleButtonGroup`: die laatste verbindt buren met een gedeelde
 * rand en is niet gemaakt voor pillen mét tussenruimte.
 */
export function filterPillSx(selected: boolean) {
  return selected
    ? {
        bgcolor: designTokens.secondaryContainer,
        color: designTokens.onSecondaryContainer,
        fontWeight: 600,
        border: `1px solid ${designTokens.secondaryContainer}`,
        '&:hover': { bgcolor: designTokens.secondaryContainer },
      }
    : {
        bgcolor: 'transparent',
        color: 'text.secondary',
        fontWeight: 500,
        border: `1px solid ${designTokens.outline}`,
      };
}
