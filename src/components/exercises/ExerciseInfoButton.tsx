/**
 * Knopje bij een oefening (alleen voor staf): tik erop en je ziet regressie, progressie en
 * alternatieven uit de oefeningenbibliotheek van de studio, als naslag. Niet meteen in beeld,
 * zodat de les- en workoutschermen rustig blijven. Is er iets vastgelegd, dan kleurt het knopje.
 * In hetzelfde venster kun je het ook meteen aanvullen.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import SwapVertRoundedIcon from '@mui/icons-material/SwapVertRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { useNotify } from '../../context/NotifyContext';
import { useProfile } from '../../context/ProfileContext';
import {
  deleteExerciseNote,
  getExerciseNotes,
  noteHasContent,
  saveExerciseNote,
  type ExerciseAlternative,
  type ExerciseNote,
} from '../../services/exerciseNoteService';
import { exerciseKey } from '../../utils/exerciseKey';
import { designTokens } from '../../theme/designTokens';

// Eén keer per sessie de hele bibliotheek ophalen; alle knopjes lezen daaruit.
let cache: Map<string, ExerciseNote> | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function ensureLoaded(): void {
  if (cache || loading) return;
  loading = getExerciseNotes()
    .then((notes) => {
      cache = new Map(notes.map((n) => [n.key, n]));
    })
    .catch(() => {
      cache = new Map();
    })
    .finally(() => {
      loading = null;
      emit();
    });
}

/** Na opslaan of verwijderen: de rest van de app ziet het meteen. */
export function putNoteInCache(key: string, note: ExerciseNote | null): void {
  // Nieuwe Map, zodat React (useSyncExternalStore) de wijziging ziet.
  const next = new Map(cache ?? []);
  if (note) next.set(key, note);
  else next.delete(key);
  cache = next;
  emit();
}

/** De bibliotheek (of null zolang hij laadt). */
export function useExerciseNotes(enabled = true): Map<string, ExerciseNote> | null {
  useEffect(() => {
    if (enabled) ensureLoaded();
  }, [enabled]);
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => cache
  );
}

export function ExerciseInfoButton({ exerciseName, size = 'small' }: { exerciseName: string; size?: 'small' | 'medium' }) {
  const profile = useProfile();
  const isStaff = profile?.role === 'trainer' || profile?.role === 'admin';
  const notes = useExerciseNotes(isStaff);
  const [open, setOpen] = useState(false);
  if (!isStaff) return null;
  const note = notes?.get(exerciseKey(exerciseName)) ?? null;
  const filled = noteHasContent(note);
  return (
    <>
      <Tooltip title="Regressie, progressie en alternatieven">
        <IconButton
          size={size}
          aria-label={`Regressie en progressie voor ${exerciseName}`}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
          }}
          sx={{
            flexShrink: 0,
            color: filled ? designTokens.onSecondaryContainer : 'text.secondary',
            bgcolor: filled ? designTokens.secondaryContainer : 'transparent',
            '&:hover': { bgcolor: designTokens.secondaryContainer },
          }}
        >
          <SwapVertRoundedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      {open && <ExerciseInfoDialog exerciseName={exerciseName} note={note} onClose={() => setOpen(false)} />}
    </>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 2 }}>
        {title}
      </Typography>
      <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
        {items.map((x, i) => (
          <Typography component="li" variant="body2" key={i}>
            {x}
          </Typography>
        ))}
      </Box>
    </Box>
  );
}

/** Lijstje van losse regels bewerken: elke regel een veld, met + om er een toe te voegen. */
function LinesEditor({
  label,
  placeholder,
  values,
  onChange,
}: {
  label: string;
  placeholder: string;
  values: string[];
  onChange: (v: string[]) => void;
}) {
  const rows = values.length ? values : [''];
  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 2 }}>
        {label}
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {rows.map((v, i) => (
          <Box key={i} sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
            <TextField
              size="small"
              fullWidth
              placeholder={placeholder}
              value={v}
              onChange={(e) => onChange(rows.map((x, j) => (j === i ? e.target.value : x)))}
            />
            {rows.length > 1 && (
              <IconButton size="small" aria-label="Weghalen" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
                <CloseRoundedIcon fontSize="small" />
              </IconButton>
            )}
          </Box>
        ))}
        <Button
          size="small"
          startIcon={<AddRoundedIcon />}
          onClick={() => onChange([...rows, ''])}
          sx={{ alignSelf: 'flex-start' }}
        >
          Nog een
        </Button>
      </Box>
    </Box>
  );
}

export function ExerciseInfoDialog({
  exerciseName,
  note,
  onClose,
  startEditing = false,
}: {
  exerciseName: string;
  note: ExerciseNote | null;
  onClose: () => void;
  startEditing?: boolean;
}) {
  const notify = useNotify();
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [editing, setEditing] = useState(startEditing || !noteHasContent(note));
  const [regressions, setRegressions] = useState<string[]>(note?.regressions ?? []);
  const [progressions, setProgressions] = useState<string[]>(note?.progressions ?? []);
  const [alternatives, setAlternatives] = useState<ExerciseAlternative[]>(note?.alternatives ?? []);
  const [tip, setTip] = useState(note?.tip ?? '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const saved = await saveExerciseNote({ exerciseName, regressions, progressions, alternatives, tip });
      putNoteInCache(saved.key, saved);
      notify?.success('Opgeslagen in de oefeningenbibliotheek.');
      setEditing(false);
    } catch (e) {
      notify?.error(e instanceof Error ? e.message : 'Opslaan mislukt');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await deleteExerciseNote(exerciseName);
      putNoteInCache(exerciseKey(exerciseName), null);
      notify?.success('Uit de bibliotheek gehaald.');
      onClose();
    } catch (e) {
      notify?.error(e instanceof Error ? e.message : 'Verwijderen mislukt');
    } finally {
      setBusy(false);
    }
  };

  const altRows = alternatives.length ? alternatives : [{ reason: '', exercise: '' }];
  const view = {
    regressions: note?.regressions ?? [],
    progressions: note?.progressions ?? [],
    alternatives: note?.alternatives ?? [],
    tip: note?.tip ?? '',
  };

  return (
    <Dialog
      open
      onClose={() => !busy && onClose()}
      fullWidth
      maxWidth="sm"
      fullScreen={fullScreen}
      onClick={(e) => e.stopPropagation()}
    >
      <DialogTitle sx={{ pb: 0.5 }}>{exerciseName}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Oefeningenbibliotheek · alleen zichtbaar voor trainers
        </Typography>

        {!editing ? (
          noteHasContent(note) ? (
            <>
              <Section title="Makkelijker (regressie)" items={view.regressions} />
              <Section title="Zwaarder (progressie)" items={view.progressions} />
              {view.alternatives.length > 0 && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 2 }}>
                    Alternatieven
                  </Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                    {view.alternatives.map((a, i) => (
                      <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'baseline' }}>
                        {a.reason && (
                          <Box
                            sx={{
                              px: 1,
                              py: 0.25,
                              borderRadius: 999,
                              typography: 'caption',
                              fontWeight: 600,
                              bgcolor: designTokens.tertiaryContainer,
                              color: designTokens.onTertiaryContainer,
                              flexShrink: 0,
                            }}
                          >
                            {a.reason}
                          </Box>
                        )}
                        <Typography variant="body2">{a.exercise}</Typography>
                      </Box>
                    ))}
                  </Box>
                </Box>
              )}
              {view.tip && (
                <Box sx={{ mb: 1 }}>
                  <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 2 }}>
                    Coachtip
                  </Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>
                    {view.tip}
                  </Typography>
                </Box>
              )}
            </>
          ) : (
            <Typography color="text.secondary">Nog niets vastgelegd voor deze oefening.</Typography>
          )
        ) : (
          <>
            <LinesEditor
              label="Makkelijker (regressie)"
              placeholder="Bijv. glute bridge op de grond"
              values={regressions}
              onChange={setRegressions}
            />
            <LinesEditor
              label="Zwaarder (progressie)"
              placeholder="Bijv. single leg hip thrust"
              values={progressions}
              onChange={setProgressions}
            />
            <Box sx={{ mb: 2 }}>
              <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 2 }}>
                Alternatieven per klacht
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {altRows.map((a, i) => (
                  <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <TextField
                      size="small"
                      placeholder="Klacht, bijv. rug"
                      value={a.reason}
                      onChange={(e) => setAlternatives(altRows.map((x, j) => (j === i ? { ...x, reason: e.target.value } : x)))}
                      sx={{ width: { xs: 110, sm: 150 }, flexShrink: 0 }}
                    />
                    <TextField
                      size="small"
                      fullWidth
                      placeholder="Wat dan, bijv. met resistance band"
                      value={a.exercise}
                      onChange={(e) => setAlternatives(altRows.map((x, j) => (j === i ? { ...x, exercise: e.target.value } : x)))}
                    />
                    {altRows.length > 1 && (
                      <IconButton
                        size="small"
                        aria-label="Weghalen"
                        onClick={() => setAlternatives(altRows.filter((_, j) => j !== i))}
                      >
                        <CloseRoundedIcon fontSize="small" />
                      </IconButton>
                    )}
                  </Box>
                ))}
                <Button
                  size="small"
                  startIcon={<AddRoundedIcon />}
                  onClick={() => setAlternatives([...altRows, { reason: '', exercise: '' }])}
                  sx={{ alignSelf: 'flex-start' }}
                >
                  Nog een
                </Button>
              </Box>
            </Box>
            <TextField
              fullWidth
              multiline
              minRows={2}
              label="Coachtip"
              placeholder="Bijv. kin naar de borst, niet overstrekken"
              value={tip}
              onChange={(e) => setTip(e.target.value)}
            />
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {editing ? (
          <>
            {note && (
              <Button color="error" onClick={() => void remove()} disabled={busy} sx={{ mr: 'auto' }}>
                Verwijderen
              </Button>
            )}
            <Button onClick={() => (noteHasContent(note) ? setEditing(false) : onClose())} disabled={busy}>
              Annuleren
            </Button>
            <Button variant="contained" disableElevation onClick={() => void save()} disabled={busy}>
              Opslaan
            </Button>
          </>
        ) : (
          <>
            <Button onClick={() => setEditing(true)} sx={{ mr: 'auto' }}>
              Bewerken
            </Button>
            <Button variant="contained" disableElevation onClick={onClose}>
              Sluiten
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
