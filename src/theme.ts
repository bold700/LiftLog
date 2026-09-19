import { createTheme } from '@mui/material/styles';
import themeData from './theme.json';

const lightScheme = themeData.schemes.light;

/**
 * Licht thema, één-op-één uit het Material 3-schema in theme.json — dat is het schema uit het
 * Figma-ontwerp (Vorm): donkergroen op gebroken wit, zachtgroene containers. Componenten halen
 * kleuren uit het palet ('primary.main', 'background.default'); hexcodes horen hier of in
 * theme/designTokens.ts en nergens anders.
 */
export const lightTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: lightScheme.primary,
      // light = de zachte container (chips, FAB); dark = de hover-tint van een gevulde knop.
      light: lightScheme.primaryContainer,
      dark: lightScheme.onPrimaryContainer,
      contrastText: lightScheme.onPrimary,
    },
    secondary: {
      main: lightScheme.secondary,
      light: lightScheme.secondaryContainer,
      dark: lightScheme.onSecondaryContainer,
      contrastText: lightScheme.onSecondary,
    },
    error: {
      main: lightScheme.error,
      light: lightScheme.errorContainer,
      dark: lightScheme.error,
      contrastText: lightScheme.onError,
    },
    success: {
      main: lightScheme.primary,
      light: lightScheme.primaryContainer,
      dark: lightScheme.onPrimaryContainer,
      contrastText: lightScheme.onPrimary,
    },
    info: {
      main: lightScheme.tertiary,
      light: lightScheme.tertiaryContainer,
      dark: lightScheme.onTertiaryContainer,
      contrastText: lightScheme.onTertiary,
    },
    background: {
      default: lightScheme.background,
      paper: lightScheme.surface,
    },
    text: {
      primary: lightScheme.onSurface,
      secondary: lightScheme.onSurfaceVariant,
    },
    divider: lightScheme.outlineVariant,
  },
  typography: {
    fontFamily: 'Roboto, sans-serif',
    h5: { fontWeight: 500, letterSpacing: '-0.2px' },
    h6: { fontWeight: 500 },
    subtitle1: { fontWeight: 500 },
    button: { textTransform: 'none', fontWeight: 500 },
  },
  // Bewust op de MUI-standaard (4): `borderRadius: 2` in sx betekent overal in de app 2 × 4 = 8 px.
  // De 16 px van het ontwerp ("Corner/Large") staat per component hieronder, niet als vermenigvuldiger.
  shape: { borderRadius: 4 },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: '9999999999px',
          textTransform: 'none',
        },
      },
    },
    MuiChip: {
      styleOverrides: { root: { borderRadius: 8 } },
    },
    // MUI rondt bij een accordion alleen de buitenste hoeken van de eerste en laatste af, met
    // shape.borderRadius (4 px). In het ontwerp is elke sectie een losse kaart van 16 px, dus
    // krijgen alle hoeken van elke accordion dezelfde afronding — ook de eerste en de laatste.
    MuiAccordion: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          '&:first-of-type': { borderTopLeftRadius: 16, borderTopRightRadius: 16 },
          '&:last-of-type': { borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },
          '&::before': { display: 'none' },
        },
      },
    },
    MuiPaper: {
      styleOverrides: { rounded: { borderRadius: 16 } },
    },
    MuiFab: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          boxShadow: '0 1px 3px rgba(0,0,0,0.3), 0 4px 8px 3px rgba(0,0,0,0.15)',
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        notchedOutline: {
          // Safari/iOS tekent de uitsparing voor het label niet altijd opnieuw als de legend
          // geanimeerd van 0 naar vol breed gaat (rand loopt dan door het label). Zonder animatie wel.
          '& legend': { transition: 'none' },
        },
      },
    },
  },
});
