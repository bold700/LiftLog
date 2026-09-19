/**
 * Huisstijl van de actieve studio.
 *
 * Laadt het studiodocument zodra bekend is welke studio actief is, leidt daar het thema uit af en
 * geeft naam en logo door aan de schil. Zonder huisstijl (of vóór het inloggen) is het VORM zelf.
 * Wisselt een trainer van studio, dan wisselt de app van jas.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Theme } from '@mui/material/styles';
import { useProfile } from './ProfileContext';
import { getOrg } from '../services/orgService';
import { createAppTheme, DEFAULT_SCHEME, resolveScheme, setActiveScheme, type LightScheme } from '../theme/brandingTheme';
import type { Org } from '../types';

export interface BrandingValue {
  /** Naam in de balk: de studionaam, en vóór het inloggen VORM. */
  name: string;
  logoUrl: string | null;
  scheme: LightScheme;
  theme: Theme;
  org: Org | null;
  /** Opnieuw laden, bijvoorbeeld nadat de beheerder de huisstijl heeft opgeslagen. */
  refresh: () => Promise<void>;
}

const PLATFORM_NAME = 'VORM';

const BrandingContext = createContext<BrandingValue | null>(null);

export function BrandingProvider({ children }: { children: ReactNode }) {
  const profile = useProfile();
  const orgId = profile?.activeOrgId ?? null;
  const [org, setOrg] = useState<Org | null>(null);

  const load = useCallback(async () => {
    if (!orgId) {
      setOrg(null);
      return;
    }
    const next = await getOrg(orgId).catch(() => null);
    setOrg(next);
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const scheme = useMemo(() => resolveScheme(org?.branding), [org]);
  const theme = useMemo(() => createAppTheme(scheme), [scheme]);

  // Het actieve schema ook buiten React zetten: designTokens leest het, en de Material Web-
  // componenten krijgen hun CSS-variabelen. Vóór de eerste render al, zodat er niet eerst een
  // flits VORM-groen komt.
  useMemo(() => setActiveScheme(scheme), [scheme]);
  useEffect(() => () => setActiveScheme(DEFAULT_SCHEME), []);

  const name = org?.name || PLATFORM_NAME;
  useEffect(() => {
    document.title = name;
  }, [name]);

  const value = useMemo<BrandingValue>(
    () => ({ name, logoUrl: org?.branding?.logoUrl ?? null, scheme, theme, org, refresh: load }),
    [name, org, scheme, theme, load]
  );
  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding(): BrandingValue | null {
  return useContext(BrandingContext);
}
