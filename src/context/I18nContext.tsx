/**
 * Welke taal de app spreekt.
 *
 * De keuze staat op het profiel (`language`), zodat hij op elk apparaat hetzelfde is. Vóór het
 * inloggen, of zolang het profiel nog laadt, telt wat de browser eerder onthield en anders de
 * browsertaal. Kiezen schrijft beide weg en zet `<html lang>`.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useProfile } from './ProfileContext';
import { updateProfile } from '../services/profileService';
import { browserLang, isLang, translate, LANG_STORAGE_KEY, type Lang, type MessageKey } from '../i18n';

export interface I18nValue {
  lang: Lang;
  setLang: (lang: Lang) => Promise<void>;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

function rememberedLang(): Lang | null {
  try {
    const v = localStorage.getItem(LANG_STORAGE_KEY);
    return isLang(v) ? v : null;
  } catch {
    return null;
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const profile = useProfile();
  const profileLang = profile?.profile?.language ?? null;
  const [local, setLocal] = useState<Lang>(() => rememberedLang() ?? browserLang());

  // Het profiel wint zodra het er is; de browser onthoudt het voor de volgende keer.
  useEffect(() => {
    if (profileLang && isLang(profileLang) && profileLang !== local) setLocal(profileLang);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileLang]);

  useEffect(() => {
    document.documentElement.lang = local;
    try {
      localStorage.setItem(LANG_STORAGE_KEY, local);
    } catch {
      /* privémodus */
    }
  }, [local]);

  const setLang = useCallback(
    async (next: Lang) => {
      setLocal(next);
      const uid = profile?.profile?.userId;
      if (uid) {
        await updateProfile(uid, { language: next });
        await profile?.refreshProfile();
      }
    },
    [profile]
  );

  const value = useMemo<I18nValue>(
    () => ({ lang: local, setLang, t: (key, vars) => translate(local, key, vars) }),
    [local, setLang]
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Buiten de provider (bijvoorbeeld het inlogscherm) spreekt de app de onthouden of browsertaal. */
export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (ctx) return ctx;
  const lang = rememberedLang() ?? browserLang();
  return { lang, setLang: async () => {}, t: (key, vars) => translate(lang, key, vars) };
}
