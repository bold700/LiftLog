import { useCallback, useEffect, useRef, useState } from 'react';
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
  // De echte <video> blijft onzichtbaar (zxing leest daar zijn frames uit); wat de gebruiker ziet
  // is dit canvas, waar we elk frame handmatig op tekenen. WKWebView (iOS) laat een <video> met een
  // camerastream soms gewoon zwart zien terwijl er wél gescand wordt — geen enkele CSS-truc bleek
  // dat betrouwbaar te verhelpen. Een canvas-tekening forceert elke keer een echte herschilderbeurt,
  // dus dat laat altijd zien wat de camera ziet.
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const rafRef = useRef<number | null>(null);
  const doneRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  // Callback ref i.p.v. een gewone ref uitlezen in useEffect: MUI's Dialog zet zijn inhoud pas een
  // frame na React's eigen commit in de DOM (portal-mount), dus videoRef.current was op het moment
  // dat het effect draaide nog steeds null. Zxing kreeg dan undefined mee en maakte zijn eigen,
  // onzichtbare <video> aan om de stream op te zetten — die werkte prima (het scannen lukte dus
  // gewoon), maar onze eigen <video>/canvas kreeg nooit een beeld. Met een callback ref weten we
  // precies het moment dat het element er echt staat.
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const videoCallbackRef = useCallback((el: HTMLVideoElement | null) => setVideoEl(el), []);

  useEffect(() => {
    if (!open || !videoEl) return;
    let cancelled = false;
    doneRef.current = false;
    setError(null);
    setStarting(true);
    const reader = new BrowserMultiFormatReader();

    (async () => {
      try {
        const controls = await reader.decodeFromVideoDevice(undefined, videoEl, (result) => {
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

        videoEl.play().catch(() => {
          /* autoplay kan geweigerd worden; de decoder blijft dan gewoon frames lezen */
        });

        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d') ?? null;
        if (canvas && ctx) {
          const draw = () => {
            if (cancelled) return;
            if (videoEl.readyState >= videoEl.HAVE_CURRENT_DATA && videoEl.videoWidth > 0) {
              const dpr = window.devicePixelRatio || 1;
              const cssWidth = canvas.clientWidth || 1;
              const cssHeight = canvas.clientHeight || 1;
              const targetWidth = Math.round(cssWidth * dpr);
              const targetHeight = Math.round(cssHeight * dpr);
              if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
                canvas.width = targetWidth;
                canvas.height = targetHeight;
              }
              // Zelfde uitsnede als CSS "object-fit: cover": het midden van het camerabeeld, zonder vervorming.
              const videoRatio = videoEl.videoWidth / videoEl.videoHeight;
              const canvasRatio = canvas.width / canvas.height;
              let sx = 0;
              let sy = 0;
              let sw = videoEl.videoWidth;
              let sh = videoEl.videoHeight;
              if (videoRatio > canvasRatio) {
                sw = videoEl.videoHeight * canvasRatio;
                sx = (videoEl.videoWidth - sw) / 2;
              } else {
                sh = videoEl.videoWidth / canvasRatio;
                sy = (videoEl.videoHeight - sh) / 2;
              }
              ctx.drawImage(videoEl, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
            }
            rafRef.current = requestAnimationFrame(draw);
          };
          rafRef.current = requestAnimationFrame(draw);
        }
      } catch {
        if (!cancelled) setError('Camera niet beschikbaar. Geef toestemming, of gebruik zoeken/foto.');
      } finally {
        if (!cancelled) setStarting(false);
      }
    })();

    return () => {
      cancelled = true;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      try {
        controlsRef.current?.stop();
      } catch {
        /* ignore */
      }
      controlsRef.current = null;
    };
  }, [open, videoEl, onDetected]);

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
              ref={videoCallbackRef}
              autoPlay
              muted
              playsInline
              aria-hidden
              style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
            />
            <canvas
              ref={canvasRef}
              style={{
                width: '100%',
                height: 280,
                borderRadius: 8,
                background: '#000',
                display: 'block',
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
