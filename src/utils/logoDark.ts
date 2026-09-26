/**
 * Studiologo in de donkere modus. Veel logo's zijn zwart op transparant; op een donkere achtergrond
 * vallen die weg. Zonder een apart donker logo maken we er zelf een: de donkere delen worden licht,
 * kleur blijft kleur.
 *
 * - SVG: in de tekst zelf de donkere fill/stroke-kleuren vervangen (blijft scherp).
 * - Andere plaatjes: per pixel op een canvas (zie BrandLogo).
 */

/** Relatieve helderheid 0–1 van een sRGB-kleur (0–255 per kanaal). */
export function luminance(r: number, g: number, b: number): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Onder deze helderheid telt een kleur als "donker" (zwart, antraciet, heel donkerblauw). */
export const DARK_LUMINANCE = 0.06;

/** Een CSS-kleur uit een SVG naar RGB; null als het geen kleur is die we kennen (url(), none, currentColor). */
export function parseColor(value: string): [number, number, number] | null {
  const v = value.trim().toLowerCase();
  if (v === 'black') return [0, 0, 0];
  if (v === 'white') return [255, 255, 255];
  let m = /^#([0-9a-f]{3,4})$/.exec(v);
  if (m) {
    const [r, g, b] = m[1].split('').map((c) => parseInt(c + c, 16));
    return [r, g, b];
  }
  m = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/.exec(v);
  if (m) return [0, 2, 4].map((i) => parseInt(m![1].slice(i, i + 2), 16)) as [number, number, number];
  m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(v);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return null;
}

const isDark = (value: string) => {
  // In een <img> is currentColor zwart: er is geen tekstkleur om van te erven.
  if (value.trim().toLowerCase() === 'currentcolor') return true;
  const rgb = parseColor(value);
  return rgb != null && luminance(...rgb) < DARK_LUMINANCE;
};

/**
 * De SVG met donkere vlakken en lijnen in `light`. Staat er nergens een fill, dan tekent SVG in
 * zwart: dan zetten we de fill op het <svg>-element zelf.
 * @returns de aangepaste tekst, of null als er niets donkers in zat (dan hoeft er niets te veranderen).
 */
export function recolorSvgForDark(svg: string, light: string): string | null {
  let changed = false;
  let out = svg.replace(/\b(fill|stroke|stop-color)\s*=\s*(["'])([^"']*)\2/gi, (all, attr: string, q: string, val: string) => {
    if (!isDark(val)) return all;
    changed = true;
    return `${attr}=${q}${light}${q}`;
  });
  out = out.replace(/\b(fill|stroke|stop-color)\s*:\s*([^;"'}]+)/gi, (all, prop: string, val: string) => {
    if (!isDark(val)) return all;
    changed = true;
    return `${prop}:${light}`;
  });
  const hasAnyFill = /\bfill\s*[=:]/i.test(svg);
  if (!hasAnyFill) {
    out = out.replace(/<svg\b/i, `<svg fill="${light}"`);
    changed = true;
  }
  return changed ? out : null;
}

/**
 * Moet een gerasterd logo (RGBA-pixels) aangepast worden? Ja als het merendeel van de zichtbare
 * pixels donker is: dan verdwijnt het op een donkere achtergrond. Een logo met een eigen lichte
 * achtergrond (wit vlak) valt hier buiten en blijft zoals het is.
 */
export function rasterNeedsLightening(data: Uint8ClampedArray): boolean {
  let visible = 0;
  let dark = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 32) continue;
    visible++;
    if (luminance(data[i], data[i + 1], data[i + 2]) < DARK_LUMINANCE) dark++;
  }
  return visible > 0 && dark / visible >= 0.5;
}

/** Donkere pixels naar `light` (doorzichtigheid blijft), in place. */
export function lightenRaster(data: Uint8ClampedArray, light: [number, number, number]): void {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    if (luminance(data[i], data[i + 1], data[i + 2]) < DARK_LUMINANCE) {
      data[i] = light[0];
      data[i + 1] = light[1];
      data[i + 2] = light[2];
    }
  }
}
