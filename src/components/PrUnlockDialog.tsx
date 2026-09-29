/**
 * Nieuw personal record: gevierd als een unlock in een game. Trofee die binnenploft, stralen,
 * confetti en een trilling op de telefoon. Een trots moment, dus even groot in beeld; één tik en
 * je traint verder.
 */
import { useEffect, useMemo } from 'react';
import { Box, Button, Dialog, Typography } from '@mui/material';
import { keyframes } from '@mui/system';
import EmojiEventsRoundedIcon from '@mui/icons-material/EmojiEventsRounded';
import { Capacitor } from '@capacitor/core';
import { describeRecord, type PreviousPerformance } from '../utils/previousPerformance';

const GOLD = '#FFC940';
const GOLD_DEEP = '#E09B00';
const INK = '#17130A';
const CONFETTI = ['#FFC940', '#9BD67E', '#7FD3FF', '#FF8FA3', '#FFFFFF', '#C8A6FF'];

const pop = keyframes`
  0% { transform: scale(0.2) rotate(-18deg); opacity: 0; }
  55% { transform: scale(1.18) rotate(6deg); opacity: 1; }
  75% { transform: scale(0.95) rotate(-2deg); }
  100% { transform: scale(1) rotate(0deg); }
`;
const spin = keyframes`
  from { transform: translate(-50%, -50%) rotate(0deg); }
  to { transform: translate(-50%, -50%) rotate(360deg); }
`;
const glow = keyframes`
  0%, 100% { box-shadow: 0 0 24px 4px rgba(255, 201, 64, 0.45); }
  50% { box-shadow: 0 0 48px 14px rgba(255, 201, 64, 0.7); }
`;
const rise = keyframes`
  from { transform: translateY(12px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
`;
const fall = keyframes`
  0% { transform: translate3d(0, -20px, 0) rotate(0deg); opacity: 1; }
  100% { transform: translate3d(var(--drift), 460px, 0) rotate(var(--turn)); opacity: 0; }
`;

/** Korte trilling: echte haptiek in de app, anders (Android-browser) een vibratie. */
async function celebrateHaptics(): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { Haptics, NotificationType } = await import('@capacitor/haptics');
      await Haptics.notification({ type: NotificationType.Success });
    } else {
      navigator.vibrate?.([30, 60, 30, 60, 80]);
    }
  } catch {
    // Geen trilling: geen probleem.
  }
}

/** "+2,5 kg" of "+2 herhalingen" ten opzichte van het vorige record. */
export function recordGain(record: PreviousPerformance, before: PreviousPerformance | null): string | null {
  if (!before) return null;
  const w = record.weight ?? 0;
  const bw = before.weight ?? 0;
  if (w > 0 && w > bw) return `+${String(Math.round((w - bw) * 10) / 10).replace('.', ',')} kg`;
  const r = (record.reps ?? 0) - (before.reps ?? 0);
  if (r > 0) return `+${r} ${r === 1 ? 'herhaling' : 'herhalingen'}`;
  return null;
}

export function PrUnlockDialog({
  exerciseName,
  record,
  before,
  personName,
  onClose,
}: {
  exerciseName: string;
  record: PreviousPerformance;
  /** Het record van hiervoor, voor "was 90 kg × 6". */
  before: PreviousPerformance | null;
  /** Logt de trainer voor een sporter, dan staat diens naam erbij. */
  personName?: string | null;
  onClose: () => void;
}) {
  useEffect(() => {
    void celebrateHaptics();
  }, []);

  // Vaste confetti per keer openen (niet bij elke render opnieuw husselen).
  const pieces = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => ({
        left: `${(i * 37) % 100}%`,
        delay: `${(i % 7) * 0.12}s`,
        duration: `${1.6 + ((i * 13) % 10) / 10}s`,
        drift: `${((i * 29) % 80) - 40}px`,
        turn: `${360 + ((i * 53) % 360)}deg`,
        color: CONFETTI[i % CONFETTI.length],
        size: 6 + (i % 3) * 2,
        round: i % 4 === 0,
      })),
    []
  );
  const gain = recordGain(record, before);

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      aria-labelledby="pr-unlock-title"
      slotProps={{ backdrop: { sx: { bgcolor: 'rgba(0,0,0,0.72)' } } }}
      PaperProps={{
        sx: {
          position: 'relative',
          overflow: 'hidden',
          bgcolor: INK,
          color: '#fff',
          border: `1px solid rgba(255, 201, 64, 0.5)`,
          borderRadius: '28px',
          textAlign: 'center',
          px: 3,
          pt: 4,
          pb: 3,
          '@media (prefers-reduced-motion: reduce)': { '& *': { animation: 'none !important' } },
        },
      }}
    >
      {/* Stralen achter de trofee. */}
      <Box
        aria-hidden
        sx={{
          position: 'absolute',
          top: 104,
          left: '50%',
          width: 520,
          height: 520,
          borderRadius: '50%',
          background: `repeating-conic-gradient(rgba(255, 201, 64, 0.16) 0deg 10deg, transparent 10deg 24deg)`,
          maskImage: 'radial-gradient(circle, #000 20%, transparent 62%)',
          WebkitMaskImage: 'radial-gradient(circle, #000 20%, transparent 62%)',
          animation: `${spin} 14s linear infinite`,
          pointerEvents: 'none',
        }}
      />
      {/* Confetti. */}
      <Box aria-hidden sx={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {pieces.map((p, i) => (
          <Box
            key={i}
            sx={{
              position: 'absolute',
              top: 0,
              left: p.left,
              width: p.size,
              height: p.round ? p.size : p.size * 1.8,
              borderRadius: p.round ? '50%' : '2px',
              bgcolor: p.color,
              opacity: 0,
              '--drift': p.drift,
              '--turn': p.turn,
              animation: `${fall} ${p.duration} ease-in ${p.delay} 2 both`,
            }}
          />
        ))}
      </Box>

      <Box sx={{ position: 'relative' }}>
        <Typography
          sx={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.18em', color: GOLD, animation: `${rise} 0.4s ease-out both` }}
        >
          NIEUW PERSONAL RECORD
        </Typography>
        <Box
          sx={{
            width: 104,
            height: 104,
            mx: 'auto',
            my: 2.5,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: `radial-gradient(circle at 35% 30%, #FFE7A3, ${GOLD} 45%, ${GOLD_DEEP})`,
            color: INK,
            animation: `${pop} 0.7s cubic-bezier(.2,.8,.3,1.2) 0.1s both, ${glow} 2.4s ease-in-out 0.8s infinite`,
          }}
        >
          <EmojiEventsRoundedIcon sx={{ fontSize: 60 }} />
        </Box>
        <Typography
          id="pr-unlock-title"
          sx={{ fontSize: 28, fontWeight: 800, lineHeight: '34px', animation: `${rise} 0.4s ease-out 0.35s both` }}
        >
          Ontgrendeld!
        </Typography>
        <Typography sx={{ fontSize: 15, mt: 0.5, opacity: 0.85, animation: `${rise} 0.4s ease-out 0.45s both` }}>
          {personName ? `${personName} · ${exerciseName}` : exerciseName}
        </Typography>
        <Box sx={{ mt: 2, animation: `${rise} 0.4s ease-out 0.55s both` }}>
          <Typography sx={{ fontSize: 36, fontWeight: 800, color: GOLD, fontVariantNumeric: 'tabular-nums', lineHeight: '42px' }}>
            {describeRecord(record)}
          </Typography>
          {(gain || before) && (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 1, mt: 1, flexWrap: 'wrap' }}>
              {gain && (
                <Box
                  component="span"
                  sx={{ px: 1.25, borderRadius: '10px', bgcolor: 'rgba(155, 214, 126, 0.18)', color: '#B8F09A', fontSize: 13, fontWeight: 700, lineHeight: '24px' }}
                >
                  {gain}
                </Box>
              )}
              {before && (
                <Typography component="span" sx={{ fontSize: 13, opacity: 0.7 }}>
                  was {describeRecord(before)}
                </Typography>
              )}
            </Box>
          )}
        </Box>
        <Button
          variant="contained"
          disableElevation
          fullWidth
          autoFocus
          onClick={onClose}
          sx={{
            mt: 3,
            height: 52,
            fontSize: 16,
            fontWeight: 700,
            bgcolor: GOLD,
            color: INK,
            '&:hover': { bgcolor: GOLD_DEEP },
            animation: `${rise} 0.4s ease-out 0.7s both`,
          }}
        >
          Trots!
        </Button>
      </Box>
    </Dialog>
  );
}
