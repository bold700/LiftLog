import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography, CircularProgress } from '@mui/material';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';

interface BarcodeScannerDialogProps {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
  /** Kop en aanwijzing; standaard voor de streepjescode van een product (Voeding). Leest ook QR-codes. */
  title?: string;
  hint?: string;
}

export function BarcodeScannerDialog({
  open,
  onClose,
  onDetected,
  title = 'Barcode scannen',
  hint = 'Richt de camera op de streepjescode van het product.',
}: BarcodeScannerDialogProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const doneRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    doneRef.current = false;
    setError(null);
    setStarting(true);
    const reader = new BrowserMultiFormatReader();

    (async () => {
      try {
        const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current ?? undefined, (result) => {
          if (result && !doneRef.current) {
            doneRef.current = true;
            try {
              controlsRef.current?.stop();
            } catch {
              /* ignore */
            }
            onDetected(result.getText());
          }
        });
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        // WKWebView (iOS) laat het camerabeeld soms zwart zien terwijl er wél gescand wordt: de
        // <video> krijgt geen eigen compositing-laag. Expliciet afspelen en een duwtje geven zodra
        // het eerste frame er is, dwingt een herschilderbeurt af.
        const video = videoRef.current;
        if (video) {
          video.play().catch(() => {
            /* autoplay kan geweigerd worden; de decoder blijft dan gewoon frames lezen */
          });
          const nudge = () => {
            if (cancelled) return;
            video.style.transform = 'translateZ(0)';
          };
          video.addEventListener('loadedmetadata', nudge, { once: true });
        }
      } catch {
        if (!cancelled) setError('Camera niet beschikbaar. Geef toestemming, of gebruik zoeken/foto.');
      } finally {
        if (!cancelled) setStarting(false);
      }
    })();

    return () => {
      cancelled = true;
      try {
        controlsRef.current?.stop();
      } catch {
        /* ignore */
      }
      controlsRef.current = null;
    };
  }, [open, onDetected]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pb: 0.5 }}>{title}</DialogTitle>
      <DialogContent>
        {error ? (
          <Typography variant="body2" color="error">
            {error}
          </Typography>
        ) : (
          <Box sx={{ position: 'relative' }}>
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              style={{
                width: '100%',
                height: 280,
                objectFit: 'cover',
                borderRadius: 8,
                background: '#000',
                display: 'block',
                transform: 'translateZ(0)',
                backfaceVisibility: 'hidden',
              }}
            />
            {/* Richtkader */}
            <Box
              sx={{
                position: 'absolute',
                top: '50%',
                left: '10%',
                right: '10%',
                height: 2,
                bgcolor: 'error.main',
                opacity: 0.7,
                transform: 'translateY(-50%)',
                pointerEvents: 'none',
              }}
            />
            {starting && (
              <CircularProgress size={24} sx={{ position: 'absolute', top: '50%', left: '50%', mt: '-12px', ml: '-12px', color: '#fff' }} />
            )}
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              {hint}
            </Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Sluiten</Button>
      </DialogActions>
    </Dialog>
  );
}
