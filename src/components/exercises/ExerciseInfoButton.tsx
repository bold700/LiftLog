/**
 * Knopje bij een oefening (alleen voor staf): tik erop en je ziet regressie, progressie en
 * alternatieven uit de oefeningenbibliotheek van de studio, als naslag. Niet meteen in beeld,
 * zodat de les- en workoutschermen rustig blijven. Is er iets vastgelegd, dan kleurt het knopje.
 * In hetzelfde venster kun je het ook meteen aanvullen.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  CircularProgress,
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
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import { useNotify } from '../../context/NotifyContext';
import { useProfile } from '../../context/ProfileContext';
import {
  deleteExerciseNote,
  getExerciseNotes,
  noteHasContent,
  saveExerciseNote,
  suggestExerciseAdvice,
  type ExerciseAlternative,
  type ExerciseNote,
} from '../../services/exerciseNoteService';
import { exerciseKey } from '../../utils/exerciseKey';
import {
  COMPLAINT_LABELS,
  complaintKeyOf,
  standardAdvice,
  standardAlternative,
  type ComplaintKey,
} from '../../data/exerciseProgressions';
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

/** Unieke regels samenvoegen (hoofdletterongevoelig), lege weg. */
function mergeLines(a: string[], b: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of [...a, ...b]) {
    const t = x.trim();
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
  }
  return out;
}
function mergeAlternatives(a: ExerciseAlternative[], b: ExerciseAlternative[]): ExerciseAlternative[] {
  const out = a.filter((x) => x.exercise.trim() || x.reason.trim());
  for (const x of b) {
    const i = out.findIndex((y) => y.reason.trim().toLowerCase() === x.reason.trim().toLowerCase());
    if (i >= 0 && !out[i].exercise.trim()) out[i] = { ...out[i], exercise: x.exercise };
    else if (i < 0) out.push(x);
  }
  return out;
}

/** Het standaardvoorstel van het systeem als lijst met alternatieven per klacht. */
function standardAsNote(exerciseName: string) {
  const std = standardAdvice(exerciseName);
  if (!std) return null;
  return {
    family: std.family,
    regressions: std.regressions,
    progressions: std.progressions,
    alternatives: (Object.keys(std.alternatives) as ComplaintKey[]).map((k) => ({
      reason: COMPLAINT_LABELS[k],
      exercise: std.alternatives[k] as string,
    })),
  };
}

function AlternativesList({ items }: { items: ExerciseAlternative[] }) {
  if (items.length === 0) return null;
  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 2 }}>
        Alternatieven bij klachten
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        {items.map((a, i) => (
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
  );
}

/** Klachten om uit te kiezen: de vaste lijst plus wat de studio zelf gebruikte. Typen mag ook. */
function complaintOptions(note: ExerciseNote | null): string[] {
  const out: string[] = Object.values(COMPLAINT_LABELS);
  for (const a of note?.alternatives ?? []) {
    const r = a.reason.trim();
    if (r && !out.some((x) => x.toLowerCase() === r.toLowerCase())) out.push(r);
  }
  return out;
}

/**
 * "Klacht van de sporter?": typ een klacht en het systeem geeft een alternatief. Eerst wat de
 * studio zelf vastlegde, dan de ingebouwde standaard, en anders een slim voorstel (AI).
 */
function ComplaintLookup({ exerciseName, note }: { exerciseName: string; note: ExerciseNote | null }) {
  const [complaint, setComplaint] = useState('');
  const [answer, setAnswer] = useState<{ text: string; source: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const lookup = async (value: string = complaint) => {
    const c = value.trim();
    if (!c) return;
    const key = complaintKeyOf(c);
    const own = note?.alternatives.find(
      (a) => a.reason.trim().toLowerCase() === c.toLowerCase() || (key && complaintKeyOf(a.reason) === key)
    );
    if (own) return setAnswer({ text: own.exercise, source: 'Van de studio' });
    const std = standardAlternative(exerciseName, c);
    if (std) return setAnswer({ text: std, source: 'Standaard van het systeem' });
    setBusy(true);
    try {
      const ai = await suggestExerciseAdvice(exerciseName, c);
      const alt = ai.alternatives[0]?.exercise;
      setAnswer(
        alt ? { text: alt, source: 'Slim voorstel (AI), check het even' } : { text: 'Geen voorstel gevonden.', source: '' }
      );
    } catch (e) {
      setAnswer({ text: e instanceof Error ? e.message : 'Voorstel ophalen mislukt.', source: '' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ p: 1.5, mb: 2, borderRadius: 2, bgcolor: designTokens.cardBackgroundHigh }}>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Autocomplete
          freeSolo
          fullWidth
          size="small"
          options={complaintOptions(note)}
          inputValue={complaint}
          onInputChange={(_, v, reason) => {
            setComplaint(v);
            if (reason === 'input' || reason === 'clear') setAnswer(null);
          }}
          onChange={(_, v) => {
            if (typeof v === 'string' && v.trim()) {
              setComplaint(v);
              void lookup(v);
            }
          }}
          renderInput={(params) => (
            <TextField {...params} label="Klacht van de sporter?" placeholder="Kies of typ, bijv. knie of achillespees" />
          )}
        />
        <Button variant="contained" disableElevation onClick={() => void lookup()} disabled={busy || !complaint.trim()}>
          {busy ? <CircularProgress size={18} color="inherit" /> : 'Alternatief'}
        </Button>
      </Box>
      {answer && (
        <Box sx={{ mt: 1 }}>
          <Typography variant="body2" fontWeight={600}>
            {answer.text}
          </Typography>
          {answer.source && (
            <Typography variant="caption" color="text.secondary">
              {answer.source}
            </Typography>
          )}
        </Box>
      )}
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
  const standard = standardAsNote(exerciseName);
  const hasOwn = noteHasContent(note);
  const [editing, setEditing] = useState(startEditing || (!hasOwn && !standard));
  const [regressions, setRegressions] = useState<string[]>(note?.regressions ?? []);
  const [progressions, setProgressions] = useState<string[]>(note?.progressions ?? []);
  const [alternatives, setAlternatives] = useState<ExerciseAlternative[]>(note?.alternatives ?? []);
  const [tip, setTip] = useState(note?.tip ?? '');
  const [busy, setBusy] = useState(false);
  const [suggesting, setSuggesting] = useState<number | 'all' | null>(null);

  const fillStandard = () => {
    if (!standard) return;
    setRegressions((r) => mergeLines(r, standard.regressions));
    setProgressions((p) => mergeLines(p, standard.progressions));
    setAlternatives((a) => mergeAlternatives(a, standard.alternatives));
  };

  const askAi = async () => {
    setSuggesting('all');
    try {
      const ai = await suggestExerciseAdvice(exerciseName);
      setRegressions((r) => mergeLines(r, ai.regressions));
      setProgressions((p) => mergeLines(p, ai.progressions));
      setAlternatives((a) => mergeAlternatives(a, ai.alternatives));
      notify?.success('Voorstel toegevoegd. Pas aan wat niet klopt en sla op.');
    } catch (e) {
      notify?.error(e instanceof Error ? e.message : 'Voorstel ophalen mislukt');
    } finally {
      setSuggesting(null);
    }
  };

  /** Klacht ingevuld maar nog geen alternatief: standaard, anders slim voorstel. */
  const suggestFor = async (index: number, rows: ExerciseAlternative[]) => {
    const reason = rows[index]?.reason.trim();
    if (!reason || rows[index].exercise.trim()) return;
    const std = standardAlternative(exerciseName, reason);
    if (std) {
      setAlternatives(rows.map((x, j) => (j === index ? { ...x, exercise: std } : x)));
      return;
    }
    setSuggesting(index);
    try {
      const ai = await suggestExerciseAdvice(exerciseName, reason);
      const alt = ai.alternatives[0]?.exercise;
      if (alt)
        setAlternatives((cur) =>
          (cur.length ? cur : rows).map((x, j) => (j === index && !x.exercise.trim() ? { ...x, exercise: alt } : x))
        );
    } catch (e) {
      notify?.error(e instanceof Error ? e.message : 'Voorstel ophalen mislukt');
    } finally {
      setSuggesting(null);
    }
  };

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

  /** Overnemen: het standaardvoorstel in de velden, zodat de trainer het kan aanpassen en bewaren. */
  const adopt = () => {
    if (!hasOwn) fillStandard();
    setEditing(true);
  };

  const altRows = alternatives.length ? alternatives : [{ reason: '', exercise: '' }];
  // Wat we in de leesweergave tonen: wat de studio vastlegde, anders de standaard van het systeem.
  const shown = hasOwn
    ? { regressions: note!.regressions, progressions: note!.progressions, alternatives: note!.alternatives, tip: note!.tip }
    : standard
      ? { regressions: standard.regressions, progressions: standard.progressions, alternatives: standard.alternatives, tip: '' }
      : null;

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
          {hasOwn
            ? 'Oefeningenbibliotheek van de studio'
            : standard
              ? `Standaard van het systeem · ${standard.family}`
              : 'Oefeningenbibliotheek'}{' '}
          · alleen zichtbaar voor trainers
        </Typography>

        {!editing ? (
          <>
            <ComplaintLookup exerciseName={exerciseName} note={note} />
            {shown ? (
              <>
                <Section title="Makkelijker (regressie)" items={shown.regressions} />
                <Section title="Zwaarder (progressie)" items={shown.progressions} />
                <AlternativesList items={shown.alternatives} />
                {shown.tip && (
                  <Box sx={{ mb: 1 }}>
                    <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 2 }}>
                      Coachtip
                    </Typography>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>
                      {shown.tip}
                    </Typography>
                  </Box>
                )}
              </>
            ) : (
              <Typography color="text.secondary">
                Nog niets vastgelegd, en het systeem herkent deze oefening niet. Vraag een slim voorstel of vul het zelf in.
              </Typography>
            )}
          </>
        ) : (
          <>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
              {standard && (
                <Button size="small" variant="outlined" onClick={fillStandard}>
                  Standaard invullen
                </Button>
              )}
              <Button
                size="small"
                variant="outlined"
                startIcon={suggesting === 'all' ? <CircularProgress size={14} /> : <AutoAwesomeRoundedIcon />}
                onClick={() => void askAi()}
                disabled={suggesting !== null}
              >
                Slim voorstel
              </Button>
            </Box>
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
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                Vul een klacht in; het systeem stelt het alternatief voor.
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {altRows.map((a, i) => (
                  <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <Autocomplete
                      freeSolo
                      size="small"
                      options={complaintOptions(note)}
                      inputValue={a.reason}
                      onInputChange={(_, v) => setAlternatives(altRows.map((x, j) => (j === i ? { ...x, reason: v } : x)))}
                      onChange={(_, v) => {
                        if (typeof v !== 'string' || !v.trim()) return;
                        const rows = altRows.map((x, j) => (j === i ? { ...x, reason: v } : x));
                        setAlternatives(rows);
                        void suggestFor(i, rows);
                      }}
                      onBlur={() => void suggestFor(i, altRows)}
                      sx={{ width: { xs: 130, sm: 170 }, flexShrink: 0 }}
                      renderInput={(params) => <TextField {...params} placeholder="Klacht" />}
                    />
                    <TextField
                      size="small"
                      fullWidth
                      placeholder={suggesting === i ? 'Voorstel ophalen…' : 'Wat dan, bijv. met resistance band'}
                      value={a.exercise}
                      onChange={(e) => setAlternatives(altRows.map((x, j) => (j === i ? { ...x, exercise: e.target.value } : x)))}
                    />
                    <Tooltip title="Voorstel van het systeem">
                      <span>
                        <IconButton
                          size="small"
                          aria-label="Voorstel voor deze klacht"
                          disabled={!a.reason.trim() || suggesting !== null}
                          onClick={() => {
                            const rows = altRows.map((x, j) => (j === i ? { ...x, exercise: '' } : x));
                            setAlternatives(rows);
                            void suggestFor(i, rows);
                          }}
                        >
                          {suggesting === i ? <CircularProgress size={16} /> : <AutoAwesomeRoundedIcon fontSize="small" />}
                        </IconButton>
                      </span>
                    </Tooltip>
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
            <Button onClick={() => (hasOwn || standard ? setEditing(false) : onClose())} disabled={busy}>
              Annuleren
            </Button>
            <Button variant="contained" disableElevation onClick={() => void save()} disabled={busy}>
              Opslaan
            </Button>
          </>
        ) : (
          <>
            <Button onClick={adopt} sx={{ mr: 'auto' }}>
              {hasOwn ? 'Bewerken' : standard ? 'Overnemen en aanpassen' : 'Invullen'}
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
