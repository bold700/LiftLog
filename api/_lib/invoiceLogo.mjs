/**
 * Studiologo klaarmaken voor de factuur-PDF. jsPDF tekent alleen PNG en JPEG; een SVG-logo (wat
 * de meeste studio's uploaden) wordt hier op de server gerasterd met resvg, zonder browser.
 */

/** Lange zijde van het gerasterde logo in pixels; het vak op de factuur is 42 pt, dus dit is ruim scherp. */
const PRINT_SIZE = 320;

/** SVG-tekst → PNG-buffer. Gooit als resvg niet beschikbaar is of de SVG onleesbaar. */
export async function svgToPng(svgText) {
  const { Resvg } = await import('@resvg/resvg-js');
  const r = new Resvg(String(svgText), { fitTo: { mode: 'width', value: PRINT_SIZE }, background: 'rgba(0,0,0,0)' });
  return Buffer.from(r.render().asPng());
}

/**
 * Logo-bytes + content-type → data-URL die jsPDF aankan (PNG of JPEG), of null als het geen
 * bruikbaar plaatje is. Een SVG wordt eerst omgezet naar PNG.
 */
export async function logoToDataUrl(bytes, contentType) {
  const type = String(contentType ?? '').split(';')[0].trim().toLowerCase();
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (type === 'image/png' || type === 'image/jpeg') return `data:${type};base64,${buf.toString('base64')}`;
  if (type === 'image/svg+xml' || buf.subarray(0, 300).toString('utf8').includes('<svg')) {
    try {
      return `data:image/png;base64,${(await svgToPng(buf.toString('utf8'))).toString('base64')}`;
    } catch (e) {
      console.warn('[invoice] SVG-logo rasteren mislukt:', e instanceof Error ? e.message : e);
      return null;
    }
  }
  return null;
}
