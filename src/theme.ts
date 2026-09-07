import { createTheme } from '@mui/material/styles';
import themeData from './theme.json';

const lightScheme = themeData.schemes.light;

// Light theme - alleen Material 3 tokens gebruiken
export const lightTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: lightScheme.primary,
      light: lightScheme.primaryFixed,
      dark: lightScheme.primaryContainer,
      contrastText: lightScheme.onPrimary,
    },
    secondary: {
      main: lightScheme.secondary,
      light: lightScheme.secondaryFixed,
      dark: lightScheme.secondaryContainer,
      contrastText: lightScheme.onSecondary,
    },
    error: {
      main: lightScheme.error,
      light: lightScheme.errorContainer,
      dark: lightScheme.error,
      contrastText: lightScheme.onError,
    },
    success: {
      main: '#00CF93', // Using tertiary color for success
      light: '#5AFDBD',
      dark: '#006C4B',
      contrastText: '#FFFFFF',
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
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: '9999999999px',
        },
      },
    },
  },
});
