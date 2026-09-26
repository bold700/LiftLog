/**
 * Logo van de studio, met een versie voor de donkere modus.
 *
 * Heeft de studio een apart logo voor donker geüpload (Beheer → Huisstijl), dan komt dat. Anders
 * maken we er zelf een: donkere delen worden licht (utils/logoDark.ts). Lukt dat niet (bijvoorbeeld
 * een plaatje dat niet te lezen is), dan blijft het gewone logo staan.
 */
import { useEffect, useState } from 'react';
import { Box, useTheme, type SxProps, type Theme } from '@mui/material';
import { lightenRaster, parseColor, rasterNeedsLightening, recolorSvgForDark } from '../utils/logoDark';

const cache = new Map<string, Promise<string | null>>();

async function rasterForDark(blob: Blob, light: [number, number, number]): Promise<string | null> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Logo niet te lezen'));
      el.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || 256;
    canvas.height = img.naturalHeight || 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    if (!rasterNeedsLightening(pixels.data)) return null;
    lightenRaster(pixels.data, light);
    ctx.putImageData(pixels, 0, 0);
    const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    return out ? URL.createObjectURL(out) : null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Een lichte versie van het logo op `src` als object-URL, of null als dat niet nodig of niet mogelijk is. */
function darkVersion(src: string, light: string): Promise<string | null> {
  const key = `${src}|${light}`;
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      const res = await fetch(src);
      if (!res.ok) return null;
      const blob = await res.blob();
      const head = (await blob.slice(0, 512).text()).trimStart().toLowerCase();
      if (blob.type.includes('svg') || head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) {
        const svg = recolorSvgForDark(await blob.text(), light);
        return svg ? URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })) : null;
      }
      const rgb = parseColor(light);
      return rgb ? rasterForDark(blob, rgb) : null;
    })().catch(() => null);
    cache.set(key, p);
  }
  return p;
}

export function BrandLogo({
  src,
  darkSrc,
  alt = '',
  sx,
  mode,
  lightColor,
}: {
  src: string;
  darkSrc?: string | null;
  alt?: string;
  sx?: SxProps<Theme>;
  /** Forceer licht of donker (voorbeeld in Huisstijl); anders volgt het logo de app. */
  mode?: 'light' | 'dark';
  /** Kleur voor de donkere delen in donker; standaard de tekstkleur van het thema. */
  lightColor?: string;
}) {
  const theme = useTheme();
  const dark = (mode ?? theme.palette.mode) === 'dark';
  const light = lightColor ?? (theme.palette.mode === 'dark' ? theme.palette.text.primary : '#E2E3DC');
  const [auto, setAuto] = useState<{ key: string; url: string | null } | null>(null);
  const key = `${src}|${light}`;

  useEffect(() => {
    if (!dark || darkSrc) return;
    let alive = true;
    void darkVersion(src, light).then((url) => {
      if (alive) setAuto({ key, url });
    });
    return () => {
      alive = false;
    };
  }, [dark, darkSrc, src, light, key]);

  const shown = !dark ? src : darkSrc || (auto?.key === key && auto.url) || src;
  return <Box component="img" src={shown} alt={alt} sx={sx} />;
}
