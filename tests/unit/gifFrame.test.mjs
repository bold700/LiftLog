import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { decodeGifFirstFrame, downscaleRgb, encodePngRgb, gifFirstFrameToPng } from '../../api/_lib/gifFrame.mjs';

const gif = readFileSync(new URL('../fixtures/tiny.gif', import.meta.url));
const expected = JSON.parse(readFileSync(new URL('../fixtures/tiny.gif.json', import.meta.url), 'utf8'));

describe('decodeGifFirstFrame', () => {
  it('decodeert LZW, interlacing en transparantie (wit) pixel-exact', () => {
    const f = decodeGifFirstFrame(gif);
    expect(f.width).toBe(expected.width);
    expect(f.height).toBe(expected.height);
    expect(Array.from(f.rgb)).toEqual(expected.rgb.flat());
  });
  it('weigert iets dat geen GIF is', () => {
    expect(() => decodeGifFirstFrame(Buffer.from('hallo dit is geen gif'))).toThrow();
  });
});

describe('downscaleRgb', () => {
  it('verkleint met box-filter en houdt de verhouding', () => {
    const f = decodeGifFirstFrame(gif);
    const s = downscaleRgb(f, 3);
    expect([s.width, s.height]).toEqual([3, 2]);
    expect(s.rgb).toHaveLength(3 * 2 * 3);
    expect(downscaleRgb(f, 100)).toBe(f); // niet vergroten
  });
});

describe('encodePngRgb', () => {
  it('maakt een geldige PNG waarvan de rauwe pixels terug te lezen zijn', () => {
    const f = decodeGifFirstFrame(gif);
    const png = encodePngRgb(f);
    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(png.readUInt32BE(16)).toBe(6); // IHDR breedte
    expect(png.readUInt32BE(20)).toBe(4); // IHDR hoogte
    const idatLen = png.readUInt32BE(33);
    expect(png.subarray(37, 41).toString('ascii')).toBe('IDAT');
    const raw = inflateSync(png.subarray(41, 41 + idatLen));
    const rows = [];
    for (let y = 0; y < 4; y++) {
      expect(raw[y * 19]).toBe(0); // filter: none
      rows.push(...raw.subarray(y * 19 + 1, (y + 1) * 19));
    }
    expect(rows).toEqual(expected.rgb.flat());
  });
  it('gifFirstFrameToPng combineert alles', () => {
    const png = gifFirstFrameToPng(gif, { maxSize: 3 });
    expect(png.readUInt32BE(16)).toBe(3);
  });
});
