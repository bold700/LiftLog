import { describe, expect, it } from 'vitest';
import { translate, translator, isLang } from '../../src/i18n';
import { nl } from '../../src/i18n/nl';
import { en } from '../../src/i18n/en';

function keys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'string' ? [prefix + k] : keys(v as Record<string, unknown>, `${prefix}${k}.`)
  );
}

describe('i18n', () => {
  it('Engels heeft precies dezelfde sleutels als Nederlands', () => {
    expect(keys(en as unknown as Record<string, unknown>).sort()).toEqual(keys(nl as unknown as Record<string, unknown>).sort());
  });

  it('vertaalt een gewone sleutel per taal', () => {
    expect(translate('nl', 'nav.insights')).toBe('Inzichten');
    expect(translate('en', 'nav.insights')).toBe('Insights');
  });

  it('kiest enkelvoud of meervoud en vult het aantal in', () => {
    const t = translator('nl');
    expect(t('admin.openRequests', { count: 1 })).toBe('1 open aanvraag');
    expect(t('admin.openRequests', { count: 3 })).toBe('3 open aanvragen');
    expect(translate('en', 'admin.creditsLeft', { count: 8 })).toBe('8 left');
  });

  it('laat een onbekende sleutel zichtbaar staan in plaats van leeg', () => {
    // @ts-expect-error bewust een sleutel die niet bestaat
    expect(translate('en', 'nav.nope')).toBe('nav.nope');
  });

  it('herkent alleen de talen die de app spreekt', () => {
    expect(isLang('nl')).toBe(true);
    expect(isLang('en')).toBe(true);
    expect(isLang('de')).toBe(false);
    expect(isLang(null)).toBe(false);
  });
});
