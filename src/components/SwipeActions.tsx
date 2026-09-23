/**
 * Veeg-acties zoals in iOS/Android-lijsten: een rij naar links vegen schuift hem opzij en toont
 * knoppen erachter (bijv. Bewerken en Verwijderen). Alleen met een vinger (touch); met de muis
 * gebeurt er niets, daar zijn de acties via het item zelf bereikbaar.
 *
 * `open` en `onOpenChange` houdt de lijst bij, zodat er steeds maar één rij open staat. Tik je op
 * een open rij, dan schuift hij terug in plaats van het item te openen.
 */
import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Box, ButtonBase } from '@mui/material';

export interface SwipeAction {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  /** Achtergrond- en tekstkleur van de knop. */
  bg: string;
  fg: string;
}

interface Props {
  actions: SwipeAction[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Afronding van de kaart, zodat de knoppen erachter dezelfde vorm hebben. */
  radius: number;
  /** Doorgegeven aan de buitenste box (bijv. `--stagger-index` voor de lijst-animatie). */
  style?: CSSProperties;
  children: ReactNode;
}

const ACTION_WIDTH = 84;

export function SwipeActions({ actions, open, onOpenChange, radius, style, children }: Props) {
  const tray = actions.length * ACTION_WIDTH;
  const [drag, setDrag] = useState<number | null>(null);
  const start = useRef<{ x: number; y: number; base: number; horizontal: boolean | null } | null>(null);
  /** Na een veeg geen klik doorlaten naar de kaart (anders opent de workout). */
  const suppressClick = useRef(false);

  const offset = drag ?? (open ? -tray : 0);

  return (
    <Box style={style} sx={{ position: 'relative', borderRadius: `${radius}px`, overflow: 'hidden', minWidth: 0 }}>
      <Box
        aria-hidden={!open}
        sx={{ position: 'absolute', top: 0, right: 0, bottom: 0, display: 'flex', width: tray }}
      >
        {actions.map((a) => (
          <ButtonBase
            key={a.label}
            tabIndex={open ? 0 : -1}
            onClick={() => {
              onOpenChange(false);
              a.onClick();
            }}
            sx={{ width: ACTION_WIDTH, flexDirection: 'column', gap: 0.5, bgcolor: a.bg, color: a.fg, fontSize: 12, fontWeight: 600 }}
          >
            {a.icon}
            {a.label}
          </ButtonBase>
        ))}
      </Box>
      <Box
        onTouchStart={(e) => {
          const t = e.touches[0];
          start.current = { x: t.clientX, y: t.clientY, base: open ? -tray : 0, horizontal: null };
        }}
        onTouchMove={(e) => {
          const s = start.current;
          if (!s) return;
          const t = e.touches[0];
          const dx = t.clientX - s.x;
          const dy = t.clientY - s.y;
          // Pas beslissen na een paar pixels: verticaal = gewoon scrollen, horizontaal = vegen.
          if (s.horizontal == null) {
            if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
            s.horizontal = Math.abs(dx) > Math.abs(dy);
          }
          if (!s.horizontal) return;
          setDrag(Math.max(-tray - 24, Math.min(0, s.base + dx)));
        }}
        onTouchEnd={() => {
          const s = start.current;
          start.current = null;
          if (!s?.horizontal || drag == null) {
            setDrag(null);
            return;
          }
          // Een veeg levert meestal geen klik op; zo niet, dan moet de volgende echte tik wel werken.
          suppressClick.current = true;
          window.setTimeout(() => {
            suppressClick.current = false;
          }, 350);
          onOpenChange(drag < -tray / 3);
          setDrag(null);
        }}
        onClickCapture={(e) => {
          if (suppressClick.current || open) {
            suppressClick.current = false;
            e.stopPropagation();
            e.preventDefault();
            if (open) onOpenChange(false);
          }
        }}
        sx={{
          position: 'relative',
          transform: `translateX(${offset}px)`,
          transition: drag == null ? 'transform 0.22s cubic-bezier(0.22, 1, 0.36, 1)' : 'none',
          touchAction: 'pan-y',
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
