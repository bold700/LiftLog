import { describe, expect, it } from 'vitest';
import { logoToDataUrl, svgToPng } from '../../api/_lib/invoiceLogo.mjs';

const svg = '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1260 837"><path d="M1260,837L887,0H746L446,673L146,0H0l373,836h146l85-195l424,4l87,192z"/></svg>';

describe('logo op de factuur', () => {
  it('rastert een SVG-logo naar PNG met doorzichtige achtergrond', async () => {
    const png = await svgToPng(svg);
    expect(png.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    expect(png.length).toBeGreaterThan(500);
  });

  it('laat PNG en JPEG door, zet SVG om en weigert de rest', async () => {
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    expect(await logoToDataUrl(pngBytes, 'image/png; charset=binary')).toBe(`data:image/png;base64,${pngBytes.toString('base64')}`);
    expect((await logoToDataUrl(Buffer.from(svg), 'image/svg+xml'))?.startsWith('data:image/png;base64,')).toBe(true);
    // Zonder juiste content-type herkent hij de SVG aan de inhoud.
    expect((await logoToDataUrl(Buffer.from(svg), 'application/octet-stream'))?.startsWith('data:image/png;base64,')).toBe(true);
    expect(await logoToDataUrl(Buffer.from('GIF89a'), 'image/gif')).toBeNull();
  });
});
