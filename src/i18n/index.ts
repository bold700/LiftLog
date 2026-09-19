/**
 * Vertalen zonder bibliotheek: twee woordenboeken, één `t()`.
 *
 * - `t('nav.insights')` geeft de tekst in de gekozen taal.
 * - `t('admin.openRequests', { count: 2 })` kiest `one` of `other` en vult `{count}` in.
 * - Ontbreekt een sleutel in de gekozen taal, dan valt hij terug op Nederlands en anders op de
 *   sleutel zelf, zodat een vergeten vertaling zichtbaar is in plaats van een lege plek.
 */
import { nl } from './nl';
import { en } from './en';
import { LANGS, type Lang, type MessageKey, type Messages } from './types';

export type { Lang, MessageKey, Messages };
export { LANGS };

const DICTS: Record<Lang, Messages> = { nl, en };

export const DEFAULT_LANG: Lang = 'nl';
// Versie 2: de eerste versie schreef ook de browsertaal weg, waardoor een Engelse telefoon "Engels
// gekozen" leek. Onder deze sleutel staat alleen nog een keuze die iemand zelf maakte.
export const LANG_STORAGE_KEY = 'vorm.lang.v2';

export function isLang(v: unknown): v is Lang {
  return typeof v === 'string' && (LANGS as readonly string[]).includes(v);
}

/** Taal van de browser, als er nog niets gekozen is. Alleen Engels wijkt af van de standaard. */
export function browserLang(): Lang {
  if (typeof navigator === 'undefined') return DEFAULT_LANG;
  const first = (navigator.languages?.[0] ?? navigator.language ?? '').toLowerCase();
  return first.startsWith('en') ? 'en' : DEFAULT_LANG;
}

type Vars = Record<string, string | number>;

function lookup(dict: Messages, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), dict);
}

function fill(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

export function translate(lang: Lang, key: MessageKey, vars?: Vars): string {
  const found = lookup(DICTS[lang], key) ?? lookup(DICTS[DEFAULT_LANG], key);
  if (typeof found === 'string') return fill(found, vars);
  if (found && typeof found === 'object' && 'one' in found && 'other' in found) {
    const plural = found as { one: string; other: string };
    const count = typeof vars?.count === 'number' ? vars.count : Number(vars?.count);
    return fill(count === 1 ? plural.one : plural.other, vars);
  }
  return key;
}

/** Een `t` die de taal al weet; handig buiten React en in tests. */
export function translator(lang: Lang) {
  return (key: MessageKey, vars?: Vars) => translate(lang, key, vars);
}
