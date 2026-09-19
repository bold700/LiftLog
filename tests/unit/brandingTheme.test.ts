import { describe, expect, it } from 'vitest';
import { DEFAULT_SCHEME, parseThemeBuilderExport, resolveScheme, schemeFromSeed } from '../../src/theme/brandingTheme';

describe('schemeFromSeed', () => {
  it('levert alle rollen van theme.json, allemaal als hexkleur', () => {
    const s = schemeFromSeed('#4E6543');
    expect(Object.keys(s).sort()).toEqual(Object.keys(DEFAULT_SCHEME).sort());
    for (const v of Object.values(s)) expect(v).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('is deterministisch en verandert mee met de merkkleur', () => {
    expect(schemeFromSeed('#4E6543')).toEqual(schemeFromSeed('#4e6543'));
    expect(schemeFromSeed('#4E6543').primary).not.toBe(schemeFromSeed('#1E5AA8').primary);
  });

  it('houdt de surface-familie licht en oplopend donker, zoals de Theme Builder', () => {
    const s = schemeFromSeed('#4E6543');
    const lum = (hex: string) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);
    expect(lum(s.surfaceContainerLowest)).toBeGreaterThanOrEqual(lum(s.surface));
    expect(lum(s.surface)).toBeGreaterThan(lum(s.surfaceContainerLow));
    expect(lum(s.surfaceContainerLow)).toBeGreaterThan(lum(s.surfaceContainer));
    expect(lum(s.surfaceContainer)).toBeGreaterThan(lum(s.surfaceContainerHigh));
    expect(lum(s.surfaceContainerHigh)).toBeGreaterThan(lum(s.surfaceContainerHighest));
    expect(s.onPrimary).toBe('#FFFFFF');
  });
});

describe('parseThemeBuilderExport', () => {
  const themeBuilder = JSON.stringify({ description: 'x', seed: '#4E6543', schemes: { light: { primary: '#4e6543', onPrimary: '#ffffff', surface: '#f8faf0', onSurface: '#191d17', tertiary: '#386667' }, dark: {} } });

  it('leest de export zoals de Theme Builder hem geeft en vult de rest aan uit het standaardschema', () => {
    const s = parseThemeBuilderExport(themeBuilder)!;
    expect(s.primary).toBe('#4E6543');
    expect(s.tertiary).toBe('#386667');
    expect(s.secondaryContainer).toBe(DEFAULT_SCHEME.secondaryContainer);
  });

  it('accepteert ook een los light-blok of een kaal schema', () => {
    expect(parseThemeBuilderExport(JSON.stringify({ light: { primary: '#123456', surface: '#fafafa', onSurface: '#111111', error: '#ba1a1a' } }))?.primary).toBe('#123456');
    expect(parseThemeBuilderExport(JSON.stringify({ primary: '#123456', surface: '#fafafa', onSurface: '#111111', error: '#ba1a1a' }))?.primary).toBe('#123456');
  });

  it('weigert wat geen schema is', () => {
    expect(parseThemeBuilderExport('dit is geen json')).toBeNull();
    expect(parseThemeBuilderExport('{"primary":"groen"}')).toBeNull();
    expect(parseThemeBuilderExport('{"foo":"#112233","bar":"#445566"}')).toBeNull();
    expect(parseThemeBuilderExport('[]')).toBeNull();
  });
});

describe('resolveScheme', () => {
  it('zonder huisstijl is het VORM zelf', () => {
    expect(resolveScheme(null)).toBe(DEFAULT_SCHEME);
    expect(resolveScheme({ displayName: 'Studio' })).toBe(DEFAULT_SCHEME);
  });

  it('een merkkleur levert een afgeleid schema', () => {
    expect(resolveScheme({ seedColor: '#1E5AA8' }).primary).toBe(schemeFromSeed('#1E5AA8').primary);
  });

  it('een geplakte export gaat vóór de merkkleur', () => {
    const s = resolveScheme({ seedColor: '#1E5AA8', lightScheme: { primary: '#AA0000', surface: '#FFFFFF' } });
    expect(s.primary).toBe('#AA0000');
    expect(s.secondary).toBe(DEFAULT_SCHEME.secondary);
  });

  it('negeert een kapotte merkkleur', () => {
    expect(resolveScheme({ seedColor: 'blauw' })).toBe(DEFAULT_SCHEME);
  });
});
