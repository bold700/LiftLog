/**
 * Eén laag van de lichaamsillustratie (basis of een spiergroep).
 *
 * De SVG's tekenen de omtreklijnen in zwart. Op een donkere kaart vallen die weg, dus in de donkere
 * modus kleuren we de lijnen in met de tekstkleur van het thema, en draaien we de groentinten om
 * (zie theme/muscleTints.ts): we lezen de SVG één keer in, vervangen de kleuren en tonen de
 * ingekleurde versie. In de lichte modus blijft het bestand zoals het is.
 */
import { useEffect, useState } from 'react';
import { Box, useTheme, type SxProps, type Theme } from '@mui/material';
import { GREEN_TINTS, muscleTints } from '../theme/muscleTints';

const cache = new Map<string, Promise<string>>();

const DARK_SWAP = new Map(GREEN_TINTS.map((c, i) => [c.toLowerCase(), muscleTints('dark')[i]]));

/** De SVG op `url` in donkere kleuren (lijnen in `color`), als object-URL. Per combinatie maar één keer. */
function tintedSvgUrl(url: string, color: string, swapGreens: boolean): Promise<string> {
  const key = `${url}|${color}|${swapGreens}`;
  let p = cache.get(key);
  if (!p) {
    p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.text();
      })
      .then((svg) =>
        URL.createObjectURL(
          new Blob(
            [
              svg.replace(/fill="(black|#[0-9a-fA-F]{6})"/g, (m, c: string) =>
                c === 'black'
                  ? `fill="${color}"`
                  : swapGreens && DARK_SWAP.has(c.toLowerCase())
                    ? `fill="${DARK_SWAP.get(c.toLowerCase())}"`
                    : m
              ),
            ],
            { type: 'image/svg+xml' }
          )
        )
      );
    cache.set(key, p);
    p.catch(() => cache.delete(key));
  }
  return p;
}

export function BodyLayerImg({
  src,
  alt,
  sx,
  ariaHidden,
  highlight = false,
}: {
  src: string;
  alt: string;
  sx?: SxProps<Theme>;
  ariaHidden?: boolean;
  /**
   * De laag markeert alleen "deze spier doet mee" (geen niveau): dan blijft het groen zoals het is.
   * Het lichte groen valt op een donkere kaart juist op; omdraaien zou het onzichtbaar maken.
   */
  highlight?: boolean;
}) {
  const theme = useTheme();
  const dark = theme.palette.mode === 'dark';
  const color = theme.palette.text.secondary;
  const [tinted, setTinted] = useState<{ key: string; url: string } | null>(null);
  const key = `${src}|${color}|${highlight}`;

  useEffect(() => {
    if (!dark) return;
    let alive = true;
    tintedSvgUrl(src, color, !highlight)
      .then((url) => {
        if (alive) setTinted({ key, url });
      })
      .catch(() => undefined); // Dan blijft de gewone versie staan.
    return () => {
      alive = false;
    };
  }, [dark, src, color, key, highlight]);

  const shown = dark && tinted?.key === key ? tinted.url : src;
  return <Box component="img" src={shown} alt={alt} aria-hidden={ariaHidden || undefined} sx={sx} />;
}
