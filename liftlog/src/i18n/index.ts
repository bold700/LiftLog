import * as Localization from 'expo-localization';
import nl from './nl.json';
import en from './en.json';

export type Locale = 'nl' | 'en';

const translations = {
  nl,
  en,
};

export function getLocale(): Locale {
  const locale = Localization.getLocale();
  if (locale.startsWith('nl')) return 'nl';
  return 'en';
}

let currentLocale: Locale = getLocale();

export function setLocale(locale: Locale) {
  currentLocale = locale;
}

export function getCurrentLocale(): Locale {
  return currentLocale;
}

export function t(key: string, locale?: Locale): string {
  const loc = locale || currentLocale;
  const translation = translations[loc][key as keyof typeof nl];
  return translation || key;
}

export const i18n = {
  t,
  setLocale,
  getCurrentLocale,
  getLocale,
};


