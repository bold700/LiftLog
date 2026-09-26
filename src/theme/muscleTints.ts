/**
 * Groentinten van de lichaamsillustratie: level 1 (minst getraind) tot level 5 (meest).
 *
 * Dezelfde tinten zitten in de SVG's (src/assets/body). Op een lichte kaart valt het donkerste groen
 * het meest op; op een donkere kaart juist het lichtste. Daarom draait de volgorde in de donkere
 * modus om, zodat "meer" altijd het meest opvalt. BodyLayerImg past de SVG's daarop aan.
 */
import type { ColorMode } from './brandingTheme';

export const GREEN_TINTS = ['#D0EABF', '#A5C392', '#799A64', '#4B6738', '#3D532E'];

const DARK_TINTS = [...GREEN_TINTS].reverse();

export function muscleTints(mode: ColorMode): string[] {
  return mode === 'dark' ? DARK_TINTS : GREEN_TINTS;
}
