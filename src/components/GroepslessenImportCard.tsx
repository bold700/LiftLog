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
import { saveWorkoutToFirestore, getWorkoutsForUser, deleteWorkoutFromFirestore } from '../services/workoutFirestore';
import { getCurrentScheduleWeek } from '../utils/workoutFilter';
import type { Schema, SchemaDay } from '../types';

interface LessonData {
  key: string;
  name: string;
  /** Volgorde binnen de week: 0 = maandag … 6 = zondag. */
  order: number;
  days: SchemaDay[];
}

interface AppData {
  source: string;
  generatedAt: string;
  lessons: LessonData[];
}

const CATEGORY = 'Groepslessen';

/** Id van de losse weektraining (les × week). */
function weekSchemaId(key: string, weekIndex: number): string {
  return `schema_sgt2026_${key}_w${String(weekIndex + 1).padStart(2, '0')}`;
}

/** Id van de oude import (één workout met 26 dagen); wordt bij een nieuwe import opgeruimd. */
function legacySchemaId(key: string): string {
  return `schema_sgt2026_${key}`;
}

async function inChunks<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

export function GroepslessenImportCard() {
  const auth = useAuth();
  const profile = useProfile();
  const [data, setData] = useState<AppData | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [existing, setExisting] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const uid = auth?.user?.uid ?? null;
  const currentWeek = getCurrentScheduleWeek();

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
    setBusy(true);
    setResult(null);
    let saved = 0;
    try {
      // Elke week van elke les wordt een losse workout in de categorie "Groepslessen".
      const schemas: Schema[] = [];
      const createdAt = new Date().toISOString();
      for (const lesson of data.lessons) {
        const lessonName = (names[lesson.key] ?? lesson.name).trim() || lesson.name;
        lesson.days.forEach((day, weekIndex) => {
          schemas.push({
            id: weekSchemaId(lesson.key, weekIndex),
            name: `${lessonName} · ${day.dayLabel}`,
            trainerId: uid,
            clientId: null,
            audience: 'group',
            participantIds: [],
            category: CATEGORY,
            series: lessonName,
            seriesOrder: lesson.order,
            scheduleWeek: weekIndex + 1,
            createdAt,
            days: [day],
            // Geen periode: week 1–26 volgen het weeknummer van de kalender.
            startDate: null,
            endDate: null,
            formule7: null,
            isFormule7Template: false,
          });
        });
      }
      await inChunks(schemas, 10, async (schema) => {
        await saveWorkoutToFirestore(schema);
        saved += 1;
        setProgress(`Bezig… ${saved}/${schemas.length}`);
      });
      // Oude import (één workout met 26 dagen per les) opruimen.
      const legacy = data.lessons.map((l) => legacySchemaId(l.key)).filter((id) => existing.has(id));
      await inChunks(legacy, 10, (id) => deleteWorkoutFromFirestore(id));
      setExisting((prev) => {
        const next = new Set([...prev, ...schemas.map((s) => s.id)]);
        legacy.forEach((id) => next.delete(id));
        return next;
      });
      setResult({
        type: 'success',
        text: `${schemas.length} trainingen opgeslagen (${data.lessons.length} lesmomenten × 26 weken) in Workouts → tab "${CATEGORY}". Week ${currentWeek} is nu aan de beurt.${legacy.length ? ` De ${legacy.length} oude workouts met 26 dagen zijn verwijderd.` : ''}`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setResult({
        type: 'error',
        text: `Import gestopt na ${saved} trainingen: ${msg}. Opnieuw proberen werkt bestaande trainingen bij.`,
      });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }, [data, uid, busy, names, existing]);

  if (!uid) return null;

  const alreadyImported = data ? data.lessons.filter((l) => existing.has(weekSchemaId(l.key, 0))).length : 0;
  const hasLegacy = data ? data.lessons.some((l) => existing.has(legacySchemaId(l.key))) : false;
  const totalExercises = data ? data.lessons.reduce((n, l) => n + l.days.reduce((m, d) => m + d.exercises.length, 0), 0) : 0;

  return (
    <Box sx={{ mt: 3, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'rgba(0,0,0,0.02)' }}>
      <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 0.5 }}>
        Groepslessen importeren
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Zet elke week van elk lesmoment als losse groepsles-workout op jouw naam, in Workouts onder de tab
        &quot;{CATEGORY}&quot;.
        {data ? ` ${data.lessons.length} lesmomenten × 26 weken, ${totalExercises} oefeningen.` : ' Laden…'} Week 1–26
        volgen het weeknummer van de kalender en herhalen zich vanaf week 27; deze week is week {currentWeek}.
        {alreadyImported > 0 && ` ${alreadyImported} lesmomenten staan al in je workouts; importeren werkt ze bij.`}
        {hasLegacy && ' De oude workouts met 26 dagen worden daarbij vervangen.'}
      </Typography>

      {data && (
        <>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            Naam per lesmoment (tabblad 1 t/m 8 uit het rooster; tabblad 6, vrijdag, was leeg)
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1, mb: 2 }}>
            {data.lessons.map((l) => (
              <TextField
                key={l.key}
                label={`Tabblad ${l.key.replace(/\D/g, '') || l.key}`.trim()}
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
            {busy ? progress ?? 'Bezig…' : alreadyImported > 0 || hasLegacy ? 'Opnieuw importeren (bijwerken)' : 'Importeren als workouts'}
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
