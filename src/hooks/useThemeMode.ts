import { useState, useEffect } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'liftlog_theme_mode';

export const useThemeMode = () => {
  const [mode, setMode] = useState<ThemeMode>(() => {
    // Check localStorage first
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      return saved as ThemeMode;
    }
    return 'system';
  });

  const [resolvedMode, setResolvedMode] = useState<'light' | 'dark'>(() => {
    if (mode === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return mode;
  });

  useEffect(() => {
    // Update localStorage when mode changes
    localStorage.setItem(STORAGE_KEY, mode);

    // Determine resolved mode
    if (mode === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const updateMode = () => {
        setResolvedMode(mediaQuery.matches ? 'dark' : 'light');
      };
      
      // Check initial value
      updateMode();
      
      // Listen for changes
      mediaQuery.addEventListener('change', updateMode);
      return () => mediaQuery.removeEventListener('change', updateMode);
    } else {
      setResolvedMode(mode);
    }
  }, [mode]);

  return { mode, setMode, resolvedMode };
};

