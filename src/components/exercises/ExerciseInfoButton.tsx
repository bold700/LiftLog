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
import SwapHorizRoundedIcon from '@mui/icons-material/SwapHorizRounded';
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
  type ExerciseRef,
} from '../../data/exerciseProgressions';
import { ExerciseDbDemo } from '../ExerciseDbDemo';
import { useExerciseSuggestions } from '../../hooks/useExerciseSuggestions';
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

export function ExerciseInfoButton({
  exerciseName,
  size = 'small',
  onSwap,
  plannedName,
}: {
  exerciseName: string;
  size?: 'small' | 'medium';
  /** Tijdens een training: een voorstel aantikken wisselt de oefening meteen (alleen voor deze training). */
  onSwap?: (exerciseName: string) => void;
  /** De oefening uit het schema, als er al gewisseld is: dan kun je terug. */
  plannedName?: string;
}) {
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
      {open && (
        <ExerciseInfoDialog exerciseName={exerciseName} note={note} onClose={() => setOpen(false)} onSwap={onSwap} plannedName={plannedName} />
      )}
    </>
  );
}

/**
 * Eén voorstel: gifje van de oefening (tik om te vergroten), naam en aanwijzing. Met `onPick`
 * (tijdens een training) staat er een knop achter om meteen naar deze oefening te wisselen.
 */
export function RefRow({ item, onPick }: { item: ExerciseRef; onPick?: (exerciseName: string) => void }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minHeight: item.exercise ? 52 : 0, flex: 1, minWidth: 0 }}>
      {item.exercise ? <ExerciseDbDemo exerciseName={item.exercise} variant="aside" /> : null}
      <Box sx={{ minWidth: 0, flex: 1 }}>
        {item.exercise && (
          <Typography variant="body2" fontWeight={600}>
            {item.exercise}
          </Typography>
        )}
        {item.note && (
          <Typography variant="body2" color={item.exercise ? 'text.secondary' : 'text.primary'}>
            {item.note}
          </Typography>
        )}
      </Box>
      {onPick && item.exercise && (
        <Button
          size="small"
          startIcon={<SwapHorizRoundedIcon />}
          onClick={() => onPick(item.exercise)}
          aria-label={`Wissel naar ${item.exercise}`}
          sx={{
            flexShrink: 0,
            bgcolor: designTokens.secondaryContainer,
            color: designTokens.onSecondaryContainer,
            px: 1.5,
            '&:hover': { bgcolor: designTokens.secondaryContainer, filter: 'brightness(0.95)' },
          }}
        >
          Wissel
        </Button>
      )}
    </Box>
  );
}

function Section({ title, items, onPick }: { title: string; items: ExerciseRef[]; onPick?: (exerciseName: string) => void }) {
  if (items.length === 0) return null;
  const withExercise = items.filter((x) => x.exercise);
  const tips = items.filter((x) => !x.exercise);
  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 2 }}>
        {title}
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {withExercise.map((x, i) => (
          <RefRow key={i} item={x} onPick={onPick} />
        ))}
      </Box>
      {tips.length > 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: withExercise.length ? 1 : 0 }}>
          {tips.map((t) => t.note).join(' · ')}
        </Typography>
      )}
    </Box>
  );
}

/** Oefening kiezen uit de database (met gifje), of zelf typen. */
export function ExerciseField({
  value,
  onChange,
  placeholder = 'Oefening uit de database',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [term, setTerm] = useState('');
  const options = useExerciseSuggestions(term);
  return (
    <Autocomplete
      freeSolo
      fullWidth
      size="small"
      options={options}
      filterOptions={(x) => x}
      inputValue={value}
      onInputChange={(_, v, reason) => {
        onChange(v);
        if (reason === 'input') setTerm(v);
      }}
      renderOption={(props, option) => {
        const { key, ...rest } = props as typeof props & { key: string };
        return (
          <Box component="li" key={key} {...rest} sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
            <ExerciseDbDemo exerciseName={option} variant="thumb" />
            <Typography variant="body2">{option}</Typography>
          </Box>
        );
      }}
      renderInput={(params) => <TextField {...params} placeholder={placeholder} />}
    />
  );
}

/** Lijst voorstellen bewerken: per regel een oefening uit de database plus een korte aanwijzing. */
function RefsEditor({ label, values, onChange }: { label: string; values: ExerciseRef[]; onChange: (v: ExerciseRef[]) => void }) {
  const rows = values.length ? values : [{ exercise: '', note: '' }];
  const set = (i: number, patch: Partial<ExerciseRef>) => onChange(rows.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 2 }}>
        {label}
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        {rows.map((v, i) => (
          <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
            <Box sx={{ flex: 1, minWidth: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
              <ExerciseField value={v.exercise} onChange={(exercise) => set(i, { exercise })} />
              <TextField
                size="small"
                placeholder="Aanwijzing (optioneel)"
                value={v.note}
                onChange={(e) => set(i, { note: e.target.value })}
              />
            </Box>
            <IconButton
              size="small"
              aria-label="Weghalen"
              onClick={() => onChange(rows.filter((_, j) => j !== i))}
              sx={{ mt: 0.5 }}
            >
              <CloseRoundedIcon fontSize="small" />
            </IconButton>
          </Box>
        ))}
        <Button
          size="small"
          startIcon={<AddRoundedIcon />}
          onClick={() => onChange([...rows, { exercise: '', note: '' }])}
          sx={{ alignSelf: 'flex-start' }}
        >
          Nog een
        </Button>
      </Box>
    </Box>
  );
}

const refKey = (r: ExerciseRef) => `${r.exercise.trim().toLowerCase()}|${r.exercise ? '' : r.note.trim().toLowerCase()}`;

/** Unieke voorstellen samenvoegen (zelfde oefening telt één keer), lege weg. */
function mergeRefs(a: ExerciseRef[], b: ExerciseRef[]): ExerciseRef[] {
  const out: ExerciseRef[] = [];
  const seen = new Set<string>();
  for (const x of [...a, ...b]) {
    if (!x.exercise.trim() && !x.note.trim()) continue;
    const k = refKey(x);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}
function mergeAlternatives(a: ExerciseAlternative[], b: ExerciseAlternative[]): ExerciseAlternative[] {
  const out = a.filter((x) => x.exercise.trim() || x.note.trim() || x.reason.trim());
  for (const x of b) {
    const i = out.findIndex((y) => y.reason.trim().toLowerCase() === x.reason.trim().toLowerCase());
    if (i >= 0 && !out[i].exercise.trim() && !out[i].note.trim()) out[i] = { ...out[i], exercise: x.exercise, note: x.note };
    else if (i < 0) out.push(x);
  }
  return out;
}

/** Het standaardvoorstel van het systeem, met de alternatieven als lijst per klacht. */
function standardAsNote(exerciseName: string) {
  const std = standardAdvice(exerciseName);
  if (!std) return null;
  return {
    family: std.family,
    regressions: std.regressions,
    progressions: std.progressions,
    alternatives: (Object.keys(std.alternatives) as ComplaintKey[]).map((k) => ({
      reason: COMPLAINT_LABELS[k],
      ...(std.alternatives[k] as ExerciseRef),
    })),
  };
}

function AlternativesList({ items, onPick }: { items: ExerciseAlternative[]; onPick?: (exerciseName: string) => void }) {
  if (items.length === 0) return null;
  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 2 }}>
        Alternatieven bij klachten
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        {items.map((a, i) => (
          <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
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
                minWidth: 64,
                textAlign: 'center',
              }}
            >
              {a.reason || 'Overig'}
            </Box>
            <RefRow item={a} onPick={onPick} />
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
 * "Klacht van de sporter?": kies of typ een klacht en het systeem geeft een alternatief. Eerst wat
 * de studio zelf vastlegde, dan de ingebouwde standaard, en anders een slim voorstel (AI).
 */
function ComplaintLookup({
  exerciseName,
  note,
  onPick,
}: {
  exerciseName: string;
  note: ExerciseNote | null;
  onPick?: (exerciseName: string) => void;
}) {
  const [complaint, setComplaint] = useState('');
  const [answer, setAnswer] = useState<{ ref: ExerciseRef | null; text?: string; source: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const lookup = async (value: string = complaint) => {
    const c = value.trim();
    if (!c) return;
    const key = complaintKeyOf(c);
    const own = note?.alternatives.find(
      (a) => a.reason.trim().toLowerCase() === c.toLowerCase() || (key && complaintKeyOf(a.reason) === key)
    );
    if (own) return setAnswer({ ref: own, source: 'Van de studio' });
    const std = standardAlternative(exerciseName, c);
    if (std) return setAnswer({ ref: std, source: 'Standaard van het systeem' });
    setBusy(true);
    try {
      const ai = await suggestExerciseAdvice(exerciseName, c);
      const alt = ai.alternatives[0];
      setAnswer(
        alt
          ? { ref: alt, source: 'Slim voorstel (AI), check het even' }
          : { ref: null, text: 'Geen voorstel gevonden.', source: '' }
      );
    } catch (e) {
      setAnswer({ ref: null, text: e instanceof Error ? e.message : 'Voorstel ophalen mislukt.', source: '' });
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
        <Box sx={{ mt: 1.25 }}>
          {answer.ref ? <RefRow item={answer.ref} onPick={onPick} /> : <Typography variant="body2">{answer.text}</Typography>}
          {answer.source && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
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
  onSwap,
  plannedName,
}: {
  exerciseName: string;
  note: ExerciseNote | null;
  onClose: () => void;
  startEditing?: boolean;
  /** Tijdens een training: wisselen naar het aangetikte voorstel, daarna sluit het venster. */
  onSwap?: (exerciseName: string) => void;
  /** Geplande oefening als er al gewisseld is (dan staat er een knop om terug te gaan). */
  plannedName?: string;
}) {
  const notify = useNotify();
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const standard = standardAsNote(exerciseName);
  const hasOwn = noteHasContent(note);
  const [editing, setEditing] = useState(startEditing || (!hasOwn && !standard));
  const [regressions, setRegressions] = useState<ExerciseRef[]>(note?.regressions ?? []);
  const [progressions, setProgressions] = useState<ExerciseRef[]>(note?.progressions ?? []);
  const [alternatives, setAlternatives] = useState<ExerciseAlternative[]>(note?.alternatives ?? []);
  const [tip, setTip] = useState(note?.tip ?? '');
  const [busy, setBusy] = useState(false);
  const [suggesting, setSuggesting] = useState<number | 'all' | null>(null);

  const fillStandard = () => {
    if (!standard) return;
    setRegressions((r) => mergeRefs(r, standard.regressions));
    setProgressions((p) => mergeRefs(p, standard.progressions));
    setAlternatives((a) => mergeAlternatives(a, standard.alternatives));
  };

  const askAi = async () => {
    setSuggesting('all');
    try {
      const ai = await suggestExerciseAdvice(exerciseName);
      setRegressions((r) => mergeRefs(r, ai.regressions));
      setProgressions((p) => mergeRefs(p, ai.progressions));
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
    const row = rows[index];
    const reason = row?.reason.trim();
    if (!reason || row.exercise.trim() || row.note.trim()) return;
    const std = standardAlternative(exerciseName, reason);
    if (std) {
      setAlternatives(rows.map((x, j) => (j === index ? { ...x, ...std } : x)));
      return;
    }
    setSuggesting(index);
    try {
      const ai = await suggestExerciseAdvice(exerciseName, reason);
      const alt = ai.alternatives[0];
      if (alt) {
        setAlternatives((cur) =>
          (cur.length ? cur : rows).map((x, j) =>
            j === index && !x.exercise.trim() && !x.note.trim() ? { ...x, exercise: alt.exercise, note: alt.note } : x
          )
        );
      }
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

  const pick = onSwap
    ? (name: string) => {
        onSwap(name);
        onClose();
      }
    : undefined;
  const swapped = !!plannedName && plannedName.trim().toLowerCase() !== exerciseName.trim().toLowerCase();

  const altRows: ExerciseAlternative[] = alternatives.length ? alternatives : [{ reason: '', exercise: '', note: '' }];
  const setAlt = (i: number, patch: Partial<ExerciseAlternative>) =>
    setAlternatives(altRows.map((x, j) => (j === i ? { ...x, ...patch } : x)));
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
        {pick && !editing && (
          <Typography variant="body2" sx={{ mb: 2 }}>
            {swapped ? `Gewisseld: in plaats van ${plannedName}. ` : ''}Tik op Wissel om de oefening alleen in deze training te vervangen.
          </Typography>
        )}

        {!editing ? (
          <>
            <ComplaintLookup exerciseName={exerciseName} note={note} onPick={pick} />
            {shown ? (
              <>
                <Section title="Makkelijker (regressie)" items={shown.regressions} onPick={pick} />
                <Section title="Zwaarder (progressie)" items={shown.progressions} onPick={pick} />
                <AlternativesList items={shown.alternatives} onPick={pick} />
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
            <RefsEditor label="Makkelijker (regressie)" values={regressions} onChange={setRegressions} />
            <RefsEditor label="Zwaarder (progressie)" values={progressions} onChange={setProgressions} />
            <Box sx={{ mb: 2 }}>
              <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 2 }}>
                Alternatieven per klacht
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                Kies een klacht; het systeem stelt een oefening uit de database voor.
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {altRows.map((a, i) => (
                  <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                    <Box
                      sx={{
                        flex: 1,
                        minWidth: 0,
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', sm: '150px 1fr 1fr' },
                        gap: 1,
                      }}
                    >
                      <Autocomplete
                        freeSolo
                        size="small"
                        options={complaintOptions(note)}
                        inputValue={a.reason}
                        onInputChange={(_, v) => setAlt(i, { reason: v })}
                        onChange={(_, v) => {
                          if (typeof v !== 'string' || !v.trim()) return;
                          const rows = altRows.map((x, j) => (j === i ? { ...x, reason: v } : x));
                          setAlternatives(rows);
                          void suggestFor(i, rows);
                        }}
                        onBlur={() => void suggestFor(i, altRows)}
                        renderInput={(params) => <TextField {...params} placeholder="Klacht" />}
                      />
                      <ExerciseField
                        value={a.exercise}
                        onChange={(exercise) => setAlt(i, { exercise })}
                        placeholder={suggesting === i ? 'Voorstel ophalen…' : 'Oefening uit de database'}
                      />
                      <TextField
                        size="small"
                        placeholder="Aanwijzing"
                        value={a.note}
                        onChange={(e) => setAlt(i, { note: e.target.value })}
                      />
                    </Box>
                    <Tooltip title="Voorstel van het systeem">
                      <span>
                        <IconButton
                          size="small"
                          aria-label="Voorstel voor deze klacht"
                          disabled={!a.reason.trim() || suggesting !== null}
                          onClick={() => {
                            const rows = altRows.map((x, j) => (j === i ? { ...x, exercise: '', note: '' } : x));
                            setAlternatives(rows);
                            void suggestFor(i, rows);
                          }}
                          sx={{ mt: 0.5 }}
                        >
                          {suggesting === i ? <CircularProgress size={16} /> : <AutoAwesomeRoundedIcon fontSize="small" />}
                        </IconButton>
                      </span>
                    </Tooltip>
                    <IconButton
                      size="small"
                      aria-label="Weghalen"
                      onClick={() => setAlternatives(altRows.filter((_, j) => j !== i))}
                      sx={{ mt: 0.5 }}
                    >
                      <CloseRoundedIcon fontSize="small" />
                    </IconButton>
                  </Box>
                ))}
                <Button
                  size="small"
                  startIcon={<AddRoundedIcon />}
                  onClick={() => setAlternatives([...altRows, { reason: '', exercise: '', note: '' }])}
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
              Opslaan in bibliotheek
            </Button>
          </>
        ) : (
          <>
            {pick && swapped && plannedName ? (
              <Button onClick={() => pick(plannedName)} sx={{ mr: 'auto' }}>
                Terug naar {plannedName}
              </Button>
            ) : (
              <Button onClick={adopt} sx={{ mr: 'auto' }}>
                {hasOwn ? 'Bewerken' : standard ? 'Overnemen en aanpassen' : 'Invullen'}
              </Button>
            )}
            <Button variant="contained" disableElevation onClick={onClose}>
              Sluiten
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
