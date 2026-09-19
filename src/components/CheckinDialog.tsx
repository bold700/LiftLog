/**
 * Check-in bij "Training afronden": hoe voelde de training (1–5) en waar moet je trainer op letten.
 * Tien seconden werk voor de sporter; de trainer ziet het bij "Sinds de vorige keer".
 *
 * Gaf een trainer de training voor iemand anders, dan volgt een tweede stap: de overdracht aan de
 * vaste trainer plus een kort bericht aan de sporter. Die worden op basis van de gelogde oefeningen
 * voorgeschreven en zijn daarna gewoon te wijzigen — de trainer zet zijn naam eronder, niet de AI.
 *
 * De overdracht wordt opgeslagen bij de training, waar de volgende trainer hem tegenkomt. Versturen
 * doet de app niet: daar is WhatsApp voor, met een knop die de tekst al klaarzet.
 */
import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { FEELING_LABELS } from '../utils/trainingFeedback';
import { ShareTextButtons } from './ShareTextButtons';
import { segmentedToggleItemSx, segmentedToggleSx } from '../theme/segmentedToggle';

export type Feeling = 1 | 2 | 3 | 4 | 5;

export interface HandoverDraft {
  handover: string;
  toSporter: string;
}

interface CheckinDialogProps {
  open: boolean;
  dayLabel: string;
  saving?: boolean;
  onSkip: () => void;
  onSave: (feeling: Feeling, note: string) => void;
  /**
   * Naam van de sporter als een trainer deze training voor iemand anders gaf. Alleen dan volgt de
   * tweede stap met de overdracht.
   */
  sporterName?: string | null;
  /** Vraagt de server om een voorzet; krijgt het gevoel en de notitie van stap 1 mee. */
  onRequestDraft?: (feeling: Feeling, note: string) => Promise<HandoverDraft>;
  /** Slaat de overdracht op bij de training. Versturen doet de trainer zelf via WhatsApp. */
  onSaveHandover?: (draft: HandoverDraft) => Promise<void>;
}

const FEELINGS: Feeling[] = [1, 2, 3, 4, 5];

export function CheckinDialog({
  open,
  dayLabel,
  saving,
  onSkip,
  onSave,
  sporterName,
  onRequestDraft,
  onSaveHandover,
}: CheckinDialogProps) {
  const [feeling, setFeeling] = useState<Feeling | null>(null);
  const [note, setNote] = useState('');
  const [step, setStep] = useState<'checkin' | 'handover'>('checkin');
  const [draft, setDraft] = useState<HandoverDraft>({ handover: '', toSporter: '' });
  const [drafting, setDrafting] = useState(false);
  const [storing, setStoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wantsHandover = Boolean(sporterName && onRequestDraft && onSaveHandover);

  /** Stap 1 afronden. Voor jezelf is dat het einde; voor een sporter volgt de overdracht. */
  const handleFirstSave = async () => {
    if (feeling === null) return;
    const trimmed = note.trim();
    if (!wantsHandover) {
      onSave(feeling, trimmed);
      return;
    }
    setStep('handover');
    setDrafting(true);
    setError(null);
    try {
      setDraft(await onRequestDraft!(feeling, trimmed));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Voorzet maken mislukt. Schrijf het zelf.');
    } finally {
      setDrafting(false);
    }
  };

  const handleStore = async () => {
    setStoring(true);
    setError(null);
    try {
      await onSaveHandover!({ handover: draft.handover.trim(), toSporter: draft.toSporter.trim() });
      onSave(feeling!, note.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Opslaan mislukt. Probeer het opnieuw.');
      setStoring(false);
    }
  };

  if (step === 'handover') {
    return (
      <Dialog open={open} onClose={onSkip} maxWidth="sm" fullWidth>
        <DialogTitle>Overdracht over {sporterName}</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}
          {drafting ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 3 }}>
              <CircularProgress size={20} />
              <Typography variant="body2" color="text.secondary">
                Bezig met een voorzet op basis van wat je hebt gelogd…
              </Typography>
            </Box>
          ) : (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Lees het na en schrijf gerust bij. Dit is jouw overdracht, niet die van de computer.
              </Typography>
              <TextField
                label="Aan de vaste trainer"
                value={draft.handover}
                onChange={(e) => setDraft((d) => ({ ...d, handover: e.target.value }))}
                multiline
                rows={5}
                fullWidth
                slotProps={{ inputLabel: { shrink: true } }}
                helperText="Komt bij deze training te staan. De sporter ziet dit niet."
              />
              <ShareTextButtons text={draft.handover} label="Stuur naar de trainer" sx={{ mb: 2.5 }} />
              <TextField
                label={`Bericht aan ${sporterName}`}
                value={draft.toSporter}
                onChange={(e) => setDraft((d) => ({ ...d, toSporter: e.target.value }))}
                multiline
                rows={3}
                fullWidth
                slotProps={{ inputLabel: { shrink: true } }}
                helperText="Stuur je zelf, in het gesprek dat je toch al hebt."
              />
              <ShareTextButtons text={draft.toSporter} label={`Stuur naar ${sporterName}`} />
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => feeling !== null && onSave(feeling, note.trim())}
            disabled={storing}
            sx={{ textTransform: 'none', borderRadius: '24px' }}
          >
            Overslaan
          </Button>
          <Button
            variant="contained"
            disabled={drafting || storing || !draft.handover.trim()}
            onClick={handleStore}
            sx={{ textTransform: 'none', borderRadius: '24px', bgcolor: 'primary.main', color: 'primary.contrastText', '&:hover': { bgcolor: 'primary.dark' } }}
          >
            {storing ? 'Opslaan…' : 'Opslaan bij de training'}
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onClose={onSkip} maxWidth="xs" fullWidth>
      <DialogTitle>Hoe ging {dayLabel}?</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {wantsHandover
            ? `Hoe het voor ${sporterName} ging. Daarna schrijf je de overdracht.`
            : 'Je trainer ziet dit bij de volgende sessie.'}
        </Typography>
        <ToggleButtonGroup
          exclusive
          fullWidth
          value={feeling}
          onChange={(_, next: Feeling | null) => setFeeling(next)}
          aria-label="Hoe voelde de training"
          sx={{
            ...segmentedToggleSx,
            mb: 2,
            '& .MuiToggleButtonGroup-grouped': { ...segmentedToggleItemSx, flexDirection: 'column', py: 1, lineHeight: 1.2 },
          }}
        >
          {FEELINGS.map((f) => (
            <ToggleButton key={f} value={f} aria-label={`${f} ${FEELING_LABELS[f]}`}>
              <Box component="span" sx={{ fontWeight: 700, fontSize: 18 }}>
                {f}
              </Box>
              <Box component="span" sx={{ fontSize: 11 }}>
                {FEELING_LABELS[f]}
              </Box>
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <TextField
          label={wantsHandover ? 'Wat viel op tijdens de training?' : 'Waar moet je trainer op letten?'}
          placeholder="Bijv. Arnold press was lastig, lunges zonder gewicht gedaan"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          multiline
          rows={3}
          fullWidth
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onSkip} disabled={saving} sx={{ textTransform: 'none', borderRadius: '24px' }}>
          Overslaan
        </Button>
        <Button
          variant="contained"
          disabled={saving || feeling === null}
          onClick={handleFirstSave}
          sx={{ textTransform: 'none', borderRadius: '24px', bgcolor: 'primary.main', color: 'primary.contrastText', '&:hover': { bgcolor: 'primary.dark' } }}
        >
          {saving ? 'Opslaan…' : wantsHandover ? 'Volgende' : 'Opslaan'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
