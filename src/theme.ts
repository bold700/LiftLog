import { createTheme } from '@mui/material/styles';
import themeData from './theme.json';

const lightScheme = themeData.schemes.light;
const darkScheme = themeData.schemes.dark;

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
});

// Dark theme - alleen Material 3 tokens gebruiken
export const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: darkScheme.primary,
      light: darkScheme.primaryFixed,
      dark: darkScheme.primaryContainer,
      contrastText: darkScheme.onPrimary,
    },
    secondary: {
      main: darkScheme.secondary,
      light: darkScheme.secondaryFixed,
      dark: darkScheme.secondaryContainer,
      contrastText: darkScheme.onSecondary,
    },
    error: {
      main: darkScheme.error,
      light: darkScheme.errorContainer,
      dark: darkScheme.error,
      contrastText: darkScheme.onError,
    },
    background: {
      default: darkScheme.background,
      paper: darkScheme.surface,
    },
    text: {
      primary: darkScheme.onSurface,
      secondary: darkScheme.onSurfaceVariant,
    },
    divider: darkScheme.outlineVariant,
  },
  typography: {
    fontFamily: 'Roboto, sans-serif',
  },
});

// Default export voor backward compatibility
export const theme = lightTheme;
