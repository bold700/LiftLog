/**
 * Beheer → Groepslessen importeren: zet het meegeleverde lesrooster (src/data/groepslessenSgt2026.json,
 * gegenereerd door scripts/import-groepslessen.mjs --emit-app-data) als groepsles-workouts in Firestore,
 * op naam van de ingelogde trainer. Geen service account nodig: de app schrijft via de eigen rechten.
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, TextField, Typography } from '@mui/material';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import { useAuth } from '../context/AuthContext';
import { useProfile } from '../context/ProfileContext';
import { saveWorkoutToFirestore, getWorkoutsForUser } from '../services/workoutFirestore';
import { addWeeks } from '../utils/format';
import type { Schema, SchemaDay } from '../types';

interface LessonData {
  key: string;
  name: string;
  days: SchemaDay[];
}

interface AppData {
  source: string;
  generatedAt: string;
  defaultStart: string;
  lessons: LessonData[];
}

function schemaIdFor(key: string): string {
  return `schema_sgt2026_${key}`;
}

function nextMonday(): string {
  const d = new Date();
  const day = d.getDay(); // 0 = zondag
  const add = day === 1 ? 0 : (8 - day) % 7;
  d.setDate(d.getDate() + add);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function GroepslessenImportCard() {
  const auth = useAuth();
  const profile = useProfile();
  const [data, setData] = useState<AppData | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [startDate, setStartDate] = useState(nextMonday());
  const [existing, setExisting] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const uid = auth?.user?.uid ?? null;

  useEffect(() => {
    let cancelled = false;
    import('../data/groepslessenSgt2026.json')
      .then((mod) => {
        if (cancelled) return;
        const d = (mod.default ?? mod) as unknown as AppData;
        setData(d);
        setNames(Object.fromEntries(d.lessons.map((l) => [l.key, l.name])));
      })
      .catch(() => {
        if (!cancelled) setResult({ type: 'error', text: 'Lesrooster kon niet worden geladen.' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!uid || !profile?.profile) return;
    getWorkoutsForUser(uid, profile.role)
      .then((list) => setExisting(new Set(list.map((s) => s.id))))
      .catch(() => {});
  }, [uid, profile?.profile, profile?.role]);

  const handleImport = useCallback(async () => {
    if (!data || !uid || busy) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      setResult({ type: 'error', text: 'Kies een geldige startdatum voor Week 1.' });
      return;
    }
    setBusy(true);
    setResult(null);
    const done: string[] = [];
    try {
      for (const lesson of data.lessons) {
        const name = (names[lesson.key] ?? lesson.name).trim() || lesson.name;
        setProgress(`Bezig met ${name}…`);
        const weeks = lesson.days.length;
        const schema: Schema = {
          id: schemaIdFor(lesson.key),
          name,
          trainerId: uid,
          clientId: null,
          audience: 'group',
          participantIds: [],
          createdAt: new Date().toISOString(),
          days: lesson.days,
          startDate,
          endDate: weeks > 0 ? addWeeks(startDate, weeks) : null,
          formule7: null,
          isFormule7Template: false,
        };
        await saveWorkoutToFirestore(schema);
        done.push(name);
      }
      setExisting((prev) => new Set([...prev, ...data.lessons.map((l) => schemaIdFor(l.key))]));
      setResult({
        type: 'success',
        text: `${done.length} groepslessen opgeslagen als workouts: ${done.join(', ')}. Je vindt ze onder Workouts; de huidige week staat bovenaan.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setResult({
        type: 'error',
        text: `Import gestopt na ${done.length} les(sen): ${msg}. Opnieuw proberen werkt bestaande lessen bij.`,
      });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }, [data, uid, busy, startDate, names]);

  if (!uid) return null;

  const alreadyImported = data ? data.lessons.filter((l) => existing.has(schemaIdFor(l.key))).length : 0;
  const totalExercises = data ? data.lessons.reduce((n, l) => n + l.days.reduce((m, d) => m + d.exercises.length, 0), 0) : 0;

  return (
    <Box sx={{ mt: 3, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'rgba(0,0,0,0.02)' }}>
      <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 0.5 }}>
        Groepslessen importeren
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Zet het lesrooster (26 weken per les) als groepsles-workouts op jouw naam.
        {data ? ` ${data.lessons.length} lessen, ${totalExercises} oefeningen.` : ' Laden…'}
        {alreadyImported > 0 && ` ${alreadyImported} van de lessen staan al in je workouts; importeren werkt ze bij.`}
      </Typography>

      {data && (
        <>
          <TextField
            type="date"
            label="Datum van Week 1"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            size="small"
            InputLabelProps={{ shrink: true }}
            sx={{ mb: 2, minWidth: 200 }}
            disabled={busy}
          />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            Naam per les (zoals in het rooster: tabblad 1 t/m 8, tabblad 6 was leeg)
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1, mb: 2 }}>
            {data.lessons.map((l) => (
              <TextField
                key={l.key}
                label={`Tabblad ${l.key.replace(/\D/g, '') || l.key}`}
                value={names[l.key] ?? l.name}
                onChange={(e) => setNames((n) => ({ ...n, [l.key]: e.target.value }))}
                size="small"
                fullWidth
                disabled={busy}
                helperText={`${l.days.length} weken · ${l.days.reduce((m, d) => m + d.exercises.length, 0)} oefeningen`}
              />
            ))}
          </Box>
          <Button
            variant="contained"
            startIcon={<DownloadRoundedIcon />}
            onClick={handleImport}
            disabled={busy}
          >
            {busy ? progress ?? 'Bezig…' : alreadyImported > 0 ? 'Opnieuw importeren (bijwerken)' : 'Importeren als workouts'}
          </Button>
        </>
      )}

      {result && (
        <Alert severity={result.type} sx={{ mt: 2 }} onClose={() => setResult(null)}>
          {result.text}
        </Alert>
      )}
    </Box>
  );
}
