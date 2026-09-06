/**
 * Eerste frame van een GIF als PNG, zonder externe libraries (Vercel-functie zonder sharp/canvas).
 * Gebruikt voor de PDF-export: een oefening-GIF van ~1 MB wordt hier een PNG van enkele tientallen KB.
 *
 *   gifFirstFrameToPng(gifBytes, { maxSize }) → Buffer (PNG, RGB)
 *
 * Alleen het eerste beeld wordt gedecodeerd (LZW), op een witte achtergrond gezet, verkleind (box-filter)
 * en als PNG (kleurtype 2, filter 0) met node:zlib gecomprimeerd.
 */
import { deflateSync } from 'node:zlib';

/** Decodeert de LZW-data van één GIF-beeld naar kleurindexen. */
function lzwDecode(minCodeSize, data, pixelCount) {
  const out = new Uint8Array(pixelCount);
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  const MAX_CODES = 4096;
  const prefix = new Int32Array(MAX_CODES);
  const suffix = new Uint8Array(MAX_CODES);
  const lengths = new Uint16Array(MAX_CODES);
  for (let i = 0; i < clearCode; i++) {
    prefix[i] = -1;
    suffix[i] = i;
    lengths[i] = 1;
  }

  let codeSize = minCodeSize + 1;
  let codeMask = (1 << codeSize) - 1;
  let nextCode = eoiCode + 1;
  let prev = -1;
  let outPos = 0;
  let bitBuf = 0;
  let bitCount = 0;
  let pos = 0;
  const stack = new Uint8Array(MAX_CODES);

  while (outPos < pixelCount) {
    while (bitCount < codeSize) {
      if (pos >= data.length) return out; // data op: rest blijft achtergrond
      bitBuf |= data[pos++] << bitCount;
      bitCount += 8;
    }
    const code = bitBuf & codeMask;
    bitBuf >>>= codeSize;
    bitCount -= codeSize;

    if (code === clearCode) {
      codeSize = minCodeSize + 1;
      codeMask = (1 << codeSize) - 1;
      nextCode = eoiCode + 1;
      prev = -1;
      continue;
    }
    if (code === eoiCode) break;

    let entry;
    let firstChar;
    if (code < nextCode) {
      entry = code;
    } else if (code === nextCode && prev !== -1) {
      entry = prev; // KwKwK-geval: prev + eerste teken van prev
    } else {
      return out; // corrupte stroom
    }

    // Schrijf de string van `entry` (achterstevoren via de stack).
    let len = 0;
    let c = entry;
    while (c !== -1) {
      stack[len++] = suffix[c];
      c = prefix[c];
    }
    firstChar = stack[len - 1];
    for (let i = len - 1; i >= 0 && outPos < pixelCount; i--) out[outPos++] = stack[i];
    if (code === nextCode && outPos < pixelCount) out[outPos++] = firstChar;

    if (prev !== -1 && nextCode < MAX_CODES) {
      prefix[nextCode] = prev;
      suffix[nextCode] = firstChar;
      lengths[nextCode] = lengths[prev] + 1;
      nextCode++;
      if (nextCode > codeMask && codeSize < 12) {
        codeSize++;
        codeMask = (1 << codeSize) - 1;
      }
    }
    prev = code;
  }
  return out;
}

/** Leest het eerste beeld uit een GIF → { width, height, rgb: Uint8Array } (op witte achtergrond). */
export function decodeGifFirstFrame(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length < 13 || b[0] !== 0x47 || b[1] !== 0x49 || b[2] !== 0x46) {
    throw new Error('Geen GIF-bestand');
  }
  const screenW = b[6] | (b[7] << 8);
  const screenH = b[8] | (b[9] << 8);
  const packed = b[10];
  let p = 13;
  let globalCt = null;
  if (packed & 0x80) {
    const size = 3 * (1 << ((packed & 0x07) + 1));
    globalCt = b.subarray(p, p + size);
    p += size;
  }

  let transparentIndex = -1;
  while (p < b.length) {
    const marker = b[p++];
    if (marker === 0x21) {
      const label = b[p++];
      if (label === 0xf9 && b[p] === 4) {
        const gpacked = b[p + 1];
        if (gpacked & 0x01) transparentIndex = b[p + 4];
      }
      // sub-blokken overslaan
      while (p < b.length) {
        const len = b[p++];
        if (len === 0) break;
        p += len;
      }
      continue;
    }
    if (marker === 0x2c) {
      const left = b[p] | (b[p + 1] << 8);
      const top = b[p + 2] | (b[p + 3] << 8);
      const w = b[p + 4] | (b[p + 5] << 8);
      const h = b[p + 6] | (b[p + 7] << 8);
      const ipacked = b[p + 8];
      p += 9;
      let ct = globalCt;
      if (ipacked & 0x80) {
        const size = 3 * (1 << ((ipacked & 0x07) + 1));
        ct = b.subarray(p, p + size);
        p += size;
      }
      const interlaced = (ipacked & 0x40) !== 0;
      const minCodeSize = b[p++];
      // Sub-blokken samenvoegen
      const chunks = [];
      let total = 0;
      while (p < b.length) {
        const len = b[p++];
        if (len === 0) break;
        chunks.push(b.subarray(p, p + len));
        total += len;
        p += len;
      }
      const data = new Uint8Array(total);
      let o = 0;
      for (const c of chunks) {
        data.set(c, o);
        o += c.length;
      }
      const indices = lzwDecode(minCodeSize, data, w * h);

      // Rijvolgorde bij interlacing
      let rowOrder = null;
      if (interlaced) {
        rowOrder = new Int32Array(h);
        let r = 0;
        for (const [start, step] of [[0, 8], [4, 8], [2, 4], [1, 2]]) {
          for (let y = start; y < h; y += step) rowOrder[r++] = y;
        }
      }

      const rgb = new Uint8Array(screenW * screenH * 3).fill(255);
      if (!ct) return { width: screenW, height: screenH, rgb };
      for (let row = 0; row < h; row++) {
        const y = top + (rowOrder ? rowOrder[row] : row);
        if (y < 0 || y >= screenH) continue;
        for (let col = 0; col < w; col++) {
          const x = left + col;
          if (x < 0 || x >= screenW) continue;
          const idx = indices[row * w + col];
          if (idx === transparentIndex) continue;
          const ci = idx * 3;
          if (ci + 2 >= ct.length) continue;
          const o3 = (y * screenW + x) * 3;
          rgb[o3] = ct[ci];
          rgb[o3 + 1] = ct[ci + 1];
          rgb[o3 + 2] = ct[ci + 2];
        }
      }
      return { width: screenW, height: screenH, rgb };
    }
    if (marker === 0x3b) break;
    throw new Error('Onbekend GIF-blok');
  }
  throw new Error('GIF zonder beeld');
}

/** Verkleint RGB-pixels naar maximaal `maxSize` op de langste zijde (box-filter). */
export function downscaleRgb(frame, maxSize) {
  const { width, height, rgb } = frame;
  const scale = Math.min(1, maxSize / Math.max(width, height));
  if (scale >= 1) return frame;
  const dw = Math.max(1, Math.round(width * scale));
  const dh = Math.max(1, Math.round(height * scale));
  const out = new Uint8Array(dw * dh * 3);
  for (let dy = 0; dy < dh; dy++) {
    const sy0 = Math.floor((dy * height) / dh);
    const sy1 = Math.max(sy0 + 1, Math.floor(((dy + 1) * height) / dh));
    for (let dx = 0; dx < dw; dx++) {
      const sx0 = Math.floor((dx * width) / dw);
      const sx1 = Math.max(sx0 + 1, Math.floor(((dx + 1) * width) / dw));
      let r = 0;
      let g = 0;
      let bl = 0;
      let n = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        let i = (sy * width + sx0) * 3;
        for (let sx = sx0; sx < sx1; sx++) {
          r += rgb[i];
          g += rgb[i + 1];
          bl += rgb[i + 2];
          i += 3;
          n++;
        }
      }
      const o = (dy * dw + dx) * 3;
      out[o] = Math.round(r / n);
      out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(bl / n);
    }
  }
  return { width: dw, height: dh, rgb: out };
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([len, typeAndData, crc]);
}

/** RGB-pixels → PNG-buffer (8 bit, kleurtype 2). */
export function encodePngRgb(frame) {
  const { width, height, rgb } = frame;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const o = y * (width * 3 + 1);
    raw[o] = 0; // filter: none
    raw.set(rgb.subarray(y * width * 3, (y + 1) * width * 3), o + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bitdiepte
  ihdr[9] = 2; // RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** GIF-bytes → PNG-buffer van het eerste frame, verkleind tot `maxSize` px op de langste zijde. */
export function gifFirstFrameToPng(gifBytes, { maxSize = 320 } = {}) {
  return encodePngRgb(downscaleRgb(decodeGifFirstFrame(gifBytes), maxSize));
}
