/**
 * In de les een andere oefening kiezen voor één deelnemer: het alternatief bij een klacht,
 * makkelijker of zwaarder uit de bibliotheek (of de standaard), of zelf zoeken in de database.
 * De trainer kiest; wat hier gekozen wordt, wordt gelogd onder die oefening.
 */
import { useMemo, useState, type ReactNode } from 'react';
import {
  Box,
  Button,
  ButtonBase,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { ExerciseDbDemo } from '../ExerciseDbDemo';
import { ExerciseField } from '../exercises/ExerciseInfoButton';
import { substituteOptions } from '../../utils/exerciseAlternatives';
import type { ExerciseRef } from '../../data/exerciseProgressions';
import type { ExerciseNote } from '../../services/exerciseNoteService';
import type { Limitation } from '../../types';
import { designTokens } from '../../theme/designTokens';

function Option({ item, label, onPick }: { item: ExerciseRef; label?: string; onPick: (name: string) => void }) {
  return (
    <ButtonBase
      onClick={() => onPick(item.exercise)}
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: 1.5,
        p: 1,
        width: '100%',
        textAlign: 'left',
        borderRadius: 3,
        bgcolor: designTokens.cardBackground,
        '&:hover': { bgcolor: designTokens.secondaryContainer },
      }}
    >
      <ExerciseDbDemo exerciseName={item.exercise} variant="thumb" />
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" fontWeight={600}>
          {item.exercise}
        </Typography>
        {(label || item.note) && (
          <Typography variant="caption" color="text.secondary" component="div">
            {[label, item.note].filter(Boolean).join(' · ')}
          </Typography>
        )}
      </Box>
    </ButtonBase>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 2 }}>
        {title}
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>{children}</Box>
    </Box>
  );
}

export function SubstituteDialog({
  participantName,
  planned,
  current,
  limitations,
  note,
  onPick,
  onClose,
}: {
  participantName: string;
  planned: string;
  /** Wat deze deelnemer nu doet als dat al een alternatief is. */
  current: string | null;
  /** Klachten van de deelnemer; alleen die met een alternatief voor deze oefening komen erin. */
  limitations: Limitation[];
  note: ExerciseNote | null;
  onPick: (exerciseName: string | null) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [search, setSearch] = useState('');
  const opts = useMemo(() => substituteOptions(planned, limitations, note), [planned, limitations, note]);
  const pick = (name: string) => {
    const n = name.trim();
    if (n) onPick(n.toLowerCase() === planned.trim().toLowerCase() ? null : n);
  };
  const empty = !opts.complaint.length && !opts.easier.length && !opts.harder.length;

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" fullScreen={fullScreen}>
      <DialogTitle sx={{ pb: 0.5 }}>Andere oefening voor {participantName}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          In plaats van {planned}. Gewicht, reps en sets worden gelogd onder de oefening die je kiest.
        </Typography>

        {opts.complaint.length > 0 && (
          <Group title="Bij klacht">
            {opts.complaint.map((r) => (
              <Option key={r.exercise} item={r} label={r.reason} onPick={pick} />
            ))}
          </Group>
        )}
        {opts.easier.length > 0 && (
          <Group title="Makkelijker">
            {opts.easier.map((r) => (
              <Option key={r.exercise} item={r} onPick={pick} />
            ))}
          </Group>
        )}
        {opts.harder.length > 0 && (
          <Group title="Zwaarder">
            {opts.harder.map((r) => (
              <Option key={r.exercise} item={r} onPick={pick} />
            ))}
          </Group>
        )}
        {empty && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Geen voorstellen voor deze oefening. Zoek hieronder zelf een oefening.
          </Typography>
        )}

        <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 2 }}>
          Zelf zoeken
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <ExerciseField value={search} onChange={setSearch} placeholder="Typ een oefening" />
          <Button variant="outlined" disabled={!search.trim()} onClick={() => pick(search)}>
            Kiezen
          </Button>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {current && (
          <Button onClick={() => onPick(null)} sx={{ mr: 'auto' }}>
            Terug naar {planned}
          </Button>
        )}
        <Button onClick={onClose}>Annuleren</Button>
      </DialogActions>
    </Dialog>
  );
}
