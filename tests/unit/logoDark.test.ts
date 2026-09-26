/**
 * Studiologo in de donkere modus: een zwart logo (zoals dat van Van As) viel weg op de donkere
 * achtergrond. De app maakt de donkere delen nu zelf licht; kleur blijft kleur.
 */
import { describe, it, expect } from 'vitest';
import { lightenRaster, parseColor, rasterNeedsLightening, recolorSvgForDark } from '../../src/utils/logoDark';

describe('recolorSvgForDark', () => {
  it('zwarte vlakken en lijnen worden licht, andere kleuren blijven', () => {
    const svg = '<svg viewBox="0 0 10 10"><path fill="#000" d="M0"/><path fill="#E4572E" d="M1"/><rect stroke="black"/></svg>';
    const out = recolorSvgForDark(svg, '#EEEEEE')!;
    expect(out).toContain('fill="#EEEEEE" d="M0"');
    expect(out).toContain('fill="#E4572E"');
    expect(out).toContain('stroke="#EEEEEE"');
  });

  it('ook kleuren in een style-attribuut', () => {
    const out = recolorSvgForDark('<svg><path style="fill:#111111;stroke:none"/></svg>', '#fff')!;
    expect(out).toContain('fill:#fff');
    expect(out).toContain('stroke:none');
  });

  it('zonder fill tekent SVG zwart: dan krijgt het <svg>-element de lichte kleur', () => {
    expect(recolorSvgForDark('<svg viewBox="0 0 1 1"><path d="M0"/></svg>', '#fff')).toBe('<svg fill="#fff" viewBox="0 0 1 1"><path d="M0"/></svg>');
  });

  it('currentColor is in een plaatje zwart (zo is het logo van Van As gemaakt)', () => {
    const out = recolorSvgForDark('<svg><style>.cls-1{fill:currentColor;}</style><path class="cls-1"/></svg>', '#EEE')!;
    expect(out).toContain('.cls-1{fill:#EEE;}');
  });

  it('een logo zonder donkere delen blijft zoals het is', () => {
    expect(recolorSvgForDark('<svg><path fill="#E4572E"/></svg>', '#fff')).toBeNull();
  });
});

describe('parseColor', () => {
  it('kent hex, rgb() en namen', () => {
    expect(parseColor('#abc')).toEqual([170, 187, 204]);
    expect(parseColor('#112233ff')).toEqual([17, 34, 51]);
    expect(parseColor('rgb(1, 2, 3)')).toEqual([1, 2, 3]);
    expect(parseColor('black')).toEqual([0, 0, 0]);
    expect(parseColor('url(#grad)')).toBeNull();
  });
});

describe('gerasterd logo', () => {
  const px = (...rgba: number[][]) => new Uint8ClampedArray(rgba.flat());

  it('vooral zwart op transparant: aanpassen; doorzichtige pixels tellen niet mee', () => {
    const data = px([0, 0, 0, 255], [10, 10, 10, 255], [228, 87, 46, 255], [255, 255, 255, 0], [255, 255, 255, 0]);
    expect(rasterNeedsLightening(data)).toBe(true);
    lightenRaster(data, [240, 240, 240]);
    expect([...data.slice(0, 4)]).toEqual([240, 240, 240, 255]);
    expect([...data.slice(8, 12)]).toEqual([228, 87, 46, 255]);
  });

  it('logo met een eigen witte achtergrond: niet aanpassen', () => {
    expect(rasterNeedsLightening(px([255, 255, 255, 255], [255, 255, 255, 255], [0, 0, 0, 255]))).toBe(false);
  });
});
