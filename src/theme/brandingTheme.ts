/**
 * Van merkkleur naar thema.
 *
 * VORM is het platform; een studio wil dat de app van hén lijkt. Een beheerder kiest één
 * merkkleur, en daaruit rolt het hele Material 3-schema — dezelfde rekensom als de Material
 * Theme Builder van Google, via hun eigen bibliotheek. Wie precies wil sturen plakt een export
 * van die Theme Builder; die gaat dan vóór de merkkleur.
 *
 * Het schema heeft de vorm van theme.json (schemes.light), zodat het standaardthema en een
 * studiothema door precies dezelfde code lopen.
 */
import { createTheme, type Theme } from '@mui/material/styles';
import { argbFromHex, hexFromArgb, themeFromSourceColor, type TonalPalette } from '@material/material-color-utilities';
import themeData from '../theme.json';
import type { OrgBranding } from '../types';

export type LightScheme = Record<keyof typeof themeData.schemes.light, string>;
type SchemeKey = keyof LightScheme;

export const DEFAULT_SCHEME: LightScheme = { ...themeData.schemes.light } as LightScheme;
const SCHEME_KEYS = Object.keys(DEFAULT_SCHEME) as SchemeKey[];

const HEX = /^#[0-9a-f]{6}$/i;
export const isHexColor = (v: unknown): v is string => typeof v === 'string' && HEX.test(v.trim());

const up = (argb: number) => hexFromArgb(argb).toUpperCase();

/**
 * Het volledige lichte schema uit één kleur.
 *
 * De bibliotheek (0.2.x) levert de 29 kernrollen. De surface-familie en de "fixed"-rollen die
 * de Theme Builder tegenwoordig ook uitgeeft zijn vaste tonen uit dezelfde paletten; die
 * rekenen we hier bij, zodat het resultaat gelijk is aan wat de Theme Builder exporteert.
 */
export function schemeFromSeed(seedHex: string): LightScheme {
  const source = argbFromHex(seedHex.trim());
  const t = themeFromSourceColor(source);
  const core = t.schemes.light.toJSON() as unknown as Record<string, number>;
  const tone = (p: TonalPalette, n: number) => up(p.tone(n));
  const { primary, secondary, tertiary, neutral, neutralVariant } = t.palettes;

  const scheme: Record<string, string> = {};
  for (const [k, v] of Object.entries(core)) scheme[k] = up(v);

  Object.assign(scheme, {
    surfaceTint: scheme.primary,
    // Surface-familie zoals de Theme Builder hem uitgeeft (neutraal palet, vaste tonen).
    surface: tone(neutral, 98),
    background: tone(neutral, 98),
    surfaceBright: tone(neutral, 98),
    surfaceDim: tone(neutral, 87),
    surfaceContainerLowest: tone(neutral, 100),
    surfaceContainerLow: tone(neutral, 96),
    surfaceContainer: tone(neutral, 94),
    surfaceContainerHigh: tone(neutral, 92),
    surfaceContainerHighest: tone(neutral, 90),
    surfaceVariant: tone(neutralVariant, 90),
    // "Fixed"-rollen: gelijk in licht en donker.
    primaryFixed: tone(primary, 90),
    primaryFixedDim: tone(primary, 80),
    onPrimaryFixed: tone(primary, 10),
    onPrimaryFixedVariant: tone(primary, 30),
    secondaryFixed: tone(secondary, 90),
    secondaryFixedDim: tone(secondary, 80),
    onSecondaryFixed: tone(secondary, 10),
    onSecondaryFixedVariant: tone(secondary, 30),
    tertiaryFixed: tone(tertiary, 90),
    tertiaryFixedDim: tone(tertiary, 80),
    onTertiaryFixed: tone(tertiary, 10),
    onTertiaryFixedVariant: tone(tertiary, 30),
  });

  const out = {} as LightScheme;
  for (const k of SCHEME_KEYS) out[k] = scheme[k] ?? DEFAULT_SCHEME[k];
  return out;
}

/**
 * Een geplakte Theme Builder-export. Die ziet er uit als theme.json (`{ schemes: { light: … } }`),
 * maar we nemen ook een los `{ light: … }` of een kaal schema aan. Onbekende sleutels vallen af,
 * ontbrekende komen uit het standaardschema. Null als er geen bruikbaar schema in zit.
 */
export function parseThemeBuilderExport(text: string): LightScheme | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const schemes = d.schemes && typeof d.schemes === 'object' ? (d.schemes as Record<string, unknown>) : null;
  const candidate = (schemes?.light ?? d.light ?? d) as Record<string, unknown>;
  if (!candidate || typeof candidate !== 'object') return null;
  const out = { ...DEFAULT_SCHEME };
  let found = 0;
  for (const k of SCHEME_KEYS) {
    const v = candidate[k];
    if (isHexColor(v)) {
      out[k] = v.trim().toUpperCase();
      found++;
    }
  }
  // Zonder de kernrollen is het geen schema maar toeval.
  return found >= 4 && isHexColor(candidate.primary) && isHexColor(candidate.surface) ? out : null;
}

/** Het schema dat bij deze huisstijl hoort: export vóór merkkleur, en anders VORM zelf. */
export function resolveScheme(branding: OrgBranding | null | undefined): LightScheme {
  if (branding?.lightScheme && isHexColor(branding.lightScheme.primary)) {
    const out = { ...DEFAULT_SCHEME };
    for (const k of SCHEME_KEYS) {
      const v = branding.lightScheme[k];
      if (isHexColor(v)) out[k] = v.trim().toUpperCase();
    }
    return out;
  }
  if (isHexColor(branding?.seedColor)) return schemeFromSeed(branding!.seedColor!);
  return DEFAULT_SCHEME;
}

/** De kleurstalen die het beheerscherm onder de merkkleur toont, in de volgorde van het ontwerp. */
export const SWATCH_KEYS: SchemeKey[] = [
  'primary',
  'primaryContainer',
  'secondaryContainer',
  'tertiaryContainer',
  'surfaceContainerHigh',
  'surfaceContainer',
  'surface',
];

/**
 * De Material Web-componenten (navigatiebalk, gevulde knoppen) lezen CSS-variabelen, geen
 * MUI-thema. Die zetten we op <html>, zodat material-web-theme.css ze oppakt.
 */
export function applyMaterialWebVars(scheme: LightScheme, root: HTMLElement | null = typeof document !== 'undefined' ? document.documentElement : null): void {
  if (!root) return;
  const toKebab = (k: string) => k.replace(/([A-Z])/g, '-$1').toLowerCase();
  for (const k of SCHEME_KEYS) root.style.setProperty(`--md-sys-color-${toKebab(k)}`, scheme[k]);
  root.style.setProperty('--vorm-background', scheme.surface);
}

let activeScheme: LightScheme = DEFAULT_SCHEME;
/** Het schema dat op dit moment op het scherm staat; designTokens leest hieruit. */
export const getActiveScheme = (): LightScheme => activeScheme;
export function setActiveScheme(scheme: LightScheme): void {
  activeScheme = scheme;
  applyMaterialWebVars(scheme);
}

/** Het MUI-thema voor een schema. Alle vormgeving buiten kleur staat hier één keer. */
export function createAppTheme(s: LightScheme): Theme {
  return createTheme({
    palette: {
      mode: 'light',
      primary: {
        main: s.primary,
        // light = de zachte container (chips, FAB); dark = de hover-tint van een gevulde knop.
        light: s.primaryContainer,
        dark: s.onPrimaryContainer,
        contrastText: s.onPrimary,
      },
      secondary: { main: s.secondary, light: s.secondaryContainer, dark: s.onSecondaryContainer, contrastText: s.onSecondary },
      error: { main: s.error, light: s.errorContainer, dark: s.error, contrastText: s.onError },
      success: { main: s.primary, light: s.primaryContainer, dark: s.onPrimaryContainer, contrastText: s.onPrimary },
      info: { main: s.tertiary, light: s.tertiaryContainer, dark: s.onTertiaryContainer, contrastText: s.onTertiary },
      background: { default: s.background, paper: s.surface },
      text: { primary: s.onSurface, secondary: s.onSurfaceVariant },
      divider: s.outlineVariant,
    },
    typography: {
      fontFamily: 'Roboto, sans-serif',
      h5: { fontWeight: 500, letterSpacing: '-0.2px' },
      h6: { fontWeight: 500 },
      subtitle1: { fontWeight: 500 },
      button: { textTransform: 'none', fontWeight: 500 },
    },
    // Bewust op de MUI-standaard (4): `borderRadius: 2` in sx betekent overal in de app 2 × 4 = 8 px.
    // De 16 px van het ontwerp ("Corner/Large") staat per component hieronder, niet als vermenigvuldiger.
    shape: { borderRadius: 4 },
    components: {
      MuiButton: { styleOverrides: { root: { borderRadius: '9999999999px', textTransform: 'none' } } },
      MuiChip: { styleOverrides: { root: { borderRadius: 8 } } },
      // MUI rondt bij een accordion alleen de buitenste hoeken van de eerste en laatste af, met
      // shape.borderRadius (4 px). In het ontwerp is elke sectie een losse kaart van 16 px, dus
      // krijgen alle hoeken van elke accordion dezelfde afronding — ook de eerste en de laatste.
      MuiAccordion: {
        styleOverrides: {
          root: {
            borderRadius: 16,
            '&:first-of-type': { borderTopLeftRadius: 16, borderTopRightRadius: 16 },
            '&:last-of-type': { borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },
            '&::before': { display: 'none' },
          },
        },
      },
      MuiPaper: { styleOverrides: { rounded: { borderRadius: 16 } } },
      MuiFab: {
        styleOverrides: {
          root: { borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.3), 0 4px 8px 3px rgba(0,0,0,0.15)' },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          notchedOutline: {
            // Safari/iOS tekent de uitsparing voor het label niet altijd opnieuw als de legend
            // geanimeerd van 0 naar vol breed gaat (rand loopt dan door het label). Zonder animatie wel.
            '& legend': { transition: 'none' },
          },
        },
      },
    },
  });
}
