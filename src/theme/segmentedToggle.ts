/**
 * Opmaak voor een keuzebalk (MUI ToggleButtonGroup) in de stijl van de app: één afgeronde balk met
 * een lichte achtergrond, waarin de gekozen optie als zwarte pil staat. Zonder dit worden het losse
 * pillen met dubbele randen ertussen.
 */
/** Opmaak van één segment; los exporteerbaar zodat een scherm er iets aan kan toevoegen. */
export const segmentedToggleItemSx = {
  flex: 1,
  border: 0,
  borderRadius: '999px !important',
  textTransform: 'none',
  fontWeight: 500,
  color: 'text.secondary',
  py: 0.75,
  '&:hover': { bgcolor: 'rgba(0, 0, 0, 0.06)' },
  '&.Mui-selected': {
    bgcolor: '#000',
    color: '#F2E4D3',
    '&:hover': { bgcolor: '#1a1a1a' },
  },
} as const;

export const segmentedToggleSx = {
  bgcolor: 'rgba(0, 0, 0, 0.05)',
  borderRadius: '999px',
  p: '3px',
  gap: '3px',
  '& .MuiToggleButtonGroup-grouped': segmentedToggleItemSx,
};
