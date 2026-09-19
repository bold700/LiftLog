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
  '&:hover': { bgcolor: 'rgba(0, 0, 0, 0.04)' },
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
