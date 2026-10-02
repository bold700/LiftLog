/**
 * Workout inspreken (Nieuwe workout → Inspreken): de trainer noemt de oefeningen en gewichten en de
 * app maakt er meteen een workout van, die daarna in de editor opengaat om aan te passen.
 *
 * In de browser neemt de app zelf op (microfoon). In de iOS/Android-app pas als NATIVE_VOICE_RECORDING
 * aan staat (zie config/features); tot dan dicteer je daar met de microfoon van het toetsenbord in
 * het tekstveld. Typen kan altijd.
 */
import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Alert, Box, Button, CircularProgress, TextField, Typography } from '@mui/material';
import MicRoundedIcon from '@mui/icons-material/MicRounded';
import StopRoundedIcon from '@mui/icons-material/StopRounded';
import { readWorkoutVoice } from '../../services/aiWorkoutService';
import { NATIVE_VOICE_RECORDING } from '../../config/features';
import type { SchemaDay } from '../../types';

/** Langer dan dit wordt het bestand te groot om te versturen; spreek dan in delen in. */
const MAX_SECONDS = 180;
const MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

const canRecord = () =>
  (NATIVE_VOICE_RECORDING || !Capacitor.isNativePlatform()) &&
  typeof window !== 'undefined' &&
  typeof window.MediaRecorder !== 'undefined' &&
  !!navigator.mediaDevices?.getUserMedia;

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Opname lezen mislukt.'));
    reader.readAsDataURL(blob);
  });

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

interface Props {
  onDone: (workout: { name: string; days: SchemaDay[] }) => void;
  onBusyChange: (busy: boolean) => void;
}

export function VoiceWorkoutPanel({ onDone, onBusyChange }: Props) {
  const recordable = canRecord();
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  /** Dialoog dicht tijdens het opnemen: de opname niet meer versturen. */
  const abortedRef = useRef(false);

  const stopStream = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };
  // Dialoog dicht tijdens opnemen: microfoon los, niets versturen.
  useEffect(() => {
    abortedRef.current = false; // StrictMode monteert twee keer
    return () => {
      abortedRef.current = true;
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      stopStream();
    };
  }, []);
  useEffect(() => onBusyChange(recording || working), [recording, working, onBusyChange]);

  const send = async (input: { audio: string } | { text: string }) => {
    setWorking(true);
    setError(null);
    try {
      const { name, days } = await readWorkoutVoice(input);
      onDone({ name, days });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Inspreken verwerken lukte niet. Probeer het opnieuw.');
    } finally {
      setWorking(false);
    }
  };

  const start = async () => {
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError('Geen toegang tot de microfoon. Sta de microfoon toe in je browser, of typ/dicteer hieronder.');
      return;
    }
    streamRef.current = stream;
    const mimeType = MIME_TYPES.find((t) => MediaRecorder.isTypeSupported?.(t));
    const recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 48000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    recorder.onstop = () => {
      stopStream();
      setRecording(false);
      if (abortedRef.current) return;
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
      if (blob.size === 0) {
        setError('Er is niets opgenomen. Probeer het opnieuw.');
        return;
      }
      void blobToDataUrl(blob).then((audio) => send({ audio }), (e: Error) => setError(e.message));
    };
    recorderRef.current = recorder;
    recorder.start();
    setSeconds(0);
    setRecording(true);
    timerRef.current = window.setInterval(() => {
      setSeconds((s) => {
        if (s + 1 >= MAX_SECONDS && recorder.state === 'recording') recorder.stop();
        return s + 1;
      });
    }, 1000);
  };

  const stop = () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  };

  if (working) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5, py: 4 }}>
        <CircularProgress size={28} />
        <Typography variant="body2" color="text.secondary">
          Workout maken…
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, px: 1 }}>
      {error && <Alert severity="error">{error}</Alert>}
      <Typography variant="body2" color="text.secondary">
        Noem per oefening de naam en wat erbij hoort, bijvoorbeeld: "Goblet squat, drie keer tien, twaalf kilo. Deadlift, twaalf en een
        half of vijftien kilo." Daarna pas je alles aan in de editor.
      </Typography>

      {recordable && (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, py: 1 }}>
          <Button
            variant="contained"
            disableElevation
            color={recording ? 'error' : 'primary'}
            onClick={() => (recording ? stop() : void start())}
            aria-label={recording ? 'Stop en maak workout' : 'Start opnemen'}
            sx={{ width: 72, height: 72, minWidth: 0, borderRadius: '50%' }}
          >
            {recording ? <StopRoundedIcon sx={{ fontSize: 36 }} /> : <MicRoundedIcon sx={{ fontSize: 36 }} />}
          </Button>
          <Typography variant="body2" color={recording ? 'error' : 'text.secondary'} sx={{ fontVariantNumeric: 'tabular-nums' }}>
            {recording ? `Opnemen… ${clock(seconds)} · tik om te stoppen` : 'Tik om in te spreken'}
          </Typography>
        </Box>
      )}

      {!recording && (
        <>
          <TextField
            label={recordable ? 'Of typ het hier' : 'Spreek of typ de oefeningen'}
            placeholder="Goblet squat 3x10 12 kilo, deadlift 12,5 of 15 kilo…"
            helperText={recordable ? undefined : 'Tik op de microfoon van je toetsenbord om in te spreken.'}
            multiline
            minRows={3}
            maxRows={8}
            value={text}
            onChange={(e) => setText(e.target.value)}
            fullWidth
          />
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="contained" disableElevation disabled={!text.trim()} onClick={() => void send({ text: text.trim() })}>
              Workout maken
            </Button>
          </Box>
        </>
      )}
    </Box>
  );
}
