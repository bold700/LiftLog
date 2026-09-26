import { describe, expect, it } from 'vitest';
import { DEFAULT_DARK_SCHEME, DEFAULT_SCHEME, parseThemeBuilderExport, resolveScheme, schemeFromSeed } from '../../src/theme/brandingTheme';
import { resolveColorMode } from '../../src/context/ColorModeContext';

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

describe('donkere modus', () => {
  const lum = (hex: string) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);

  it('leidt uit dezelfde merkkleur een donker schema af: donkere vlakken, lichte tekst', () => {
    const light = schemeFromSeed('#426833');
    const dark = schemeFromSeed('#426833', 'dark');
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
    expect(lum(dark.surface)).toBeLessThan(lum(light.surface));
    expect(lum(dark.onSurface)).toBeGreaterThan(lum(dark.surface));
    // In donker is primary een lichtere tint van hetzelfde groen, met donkere tekst erop.
    expect(lum(dark.primary)).toBeGreaterThan(lum(light.primary));
    expect(lum(dark.onPrimary)).toBeLessThan(lum(dark.primary));
    // Surface-containers lopen in donker op naar lichter.
    expect(lum(dark.surfaceContainerLow)).toBeGreaterThan(lum(dark.surface));
    expect(lum(dark.surfaceContainerHigh)).toBeGreaterThan(lum(dark.surfaceContainer));
  });

  it('VORM zelf gebruikt in donker zijn eigen groen, niet het oude zwart-gele schema uit theme.json', () => {
    expect(resolveScheme(null, 'dark')).toEqual(DEFAULT_DARK_SCHEME);
    expect(DEFAULT_DARK_SCHEME.primary).toBe(schemeFromSeed('#426833', 'dark').primary);
    expect(DEFAULT_DARK_SCHEME.primary).not.toBe('#FFFFFF');
  });

  it('een studio krijgt in donker haar eigen kleur, ook met alleen een Theme Builder-export', () => {
    expect(resolveScheme({ seedColor: '#1E5AA8' } as never, 'dark').primary).toBe(schemeFromSeed('#1E5AA8', 'dark').primary);
    expect(resolveScheme({ lightScheme: { primary: '#8B2E2E' } } as never, 'dark').primary).toBe(schemeFromSeed('#8B2E2E', 'dark').primary);
  });

  it('systeem volgt de telefoon, licht en donker gaan daarvoor', () => {
    expect(resolveColorMode('system', true)).toBe('dark');
    expect(resolveColorMode('system', false)).toBe('light');
    expect(resolveColorMode('light', true)).toBe('light');
    expect(resolveColorMode('dark', false)).toBe('dark');
  });
});
