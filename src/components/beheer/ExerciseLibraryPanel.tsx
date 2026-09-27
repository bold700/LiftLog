/**
 * Beheer → Oefeningen: de oefeningenbibliotheek van de studio. Per oefening regressie, progressie,
 * alternatieven per klacht en een coachtip. Alleen voor staf. Wat hier staat, is in elke workout en
 * les op te vragen via het knopje bij de oefening.
 */
import { useMemo, useState } from 'react';
import { Autocomplete, Box, ButtonBase, InputAdornment, TextField, Typography } from '@mui/material';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import SwapVertRoundedIcon from '@mui/icons-material/SwapVertRounded';
import { ContentCard, EmptyState, LoadingBlock } from '../layout';
import { ExerciseInfoDialog, useExerciseNotes } from '../exercises/ExerciseInfoButton';
import { useExerciseSuggestions } from '../../hooks/useExerciseSuggestions';
import { exerciseKey } from '../../utils/exerciseKey';
import { designTokens } from '../../theme/designTokens';

export function ExerciseLibraryPanel() {
  const notes = useExerciseNotes();
  const [search, setSearch] = useState('');
  const [addTerm, setAddTerm] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const suggestions = useExerciseSuggestions(addTerm);

  const list = useMemo(() => {
    const all = Array.from(notes?.values() ?? []).sort((a, b) => a.exerciseName.localeCompare(b.exerciseName, 'nl'));
    const q = search.trim().toLowerCase();
    return q ? all.filter((n) => n.exerciseName.toLowerCase().includes(q)) : all;
  }, [notes, search]);

  if (notes === null) return <LoadingBlock />;

  const openNote = open ? (notes.get(exerciseKey(open)) ?? null) : null;

  return (
    <ContentCard>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Leg per oefening vast wat makkelijker (regressie) en zwaarder (progressie) is, en wat iemand met een klacht in plaats
        daarvan doet. Trainers zien het bij de oefening via het{' '}
        <SwapVertRoundedIcon sx={{ fontSize: 16, verticalAlign: 'text-bottom' }} />
        -knopje, in workouts en in de les. Sporters zien dit niet.
      </Typography>

      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 2 }}>
        <Autocomplete
          freeSolo
          options={suggestions}
          inputValue={addTerm}
          onInputChange={(_, v) => setAddTerm(v)}
          onChange={(_, v) => {
            if (typeof v === 'string' && v.trim()) {
              setOpen(v.trim());
              setAddTerm('');
            }
          }}
          sx={{ flex: '1 1 260px' }}
          renderInput={(params) => (
            <TextField
              {...params}
              size="small"
              label="Oefening toevoegen"
              placeholder="Typ of kies een oefening"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && addTerm.trim()) {
                  e.preventDefault();
                  setOpen(addTerm.trim());
                  setAddTerm('');
                }
              }}
            />
          )}
        />
        {list.length > 0 || search ? (
          <TextField
            size="small"
            placeholder="Zoeken in de bibliotheek"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ flex: '1 1 200px' }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchRoundedIcon fontSize="small" />
                  </InputAdornment>
                ),
              },
            }}
          />
        ) : null}
      </Box>

      {list.length === 0 ? (
        <EmptyState>
          {search
            ? 'Geen oefening gevonden.'
            : 'Nog niets vastgelegd. Voeg hierboven een oefening toe, of tik in een workout op het knopje bij een oefening.'}
        </EmptyState>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {list.map((n) => {
            const parts = [
              n.regressions.length ? `${n.regressions.length} makkelijker` : null,
              n.progressions.length ? `${n.progressions.length} zwaarder` : null,
              n.alternatives.length
                ? `alternatieven: ${n.alternatives
                    .map((a) => a.reason || 'overig')
                    .filter((r, i, all) => all.indexOf(r) === i)
                    .join(', ')}`
                : null,
              n.tip ? 'tip' : null,
            ].filter(Boolean);
            return (
              <ButtonBase
                key={n.key}
                onClick={() => setOpen(n.exerciseName)}
                sx={{
                  justifyContent: 'flex-start',
                  textAlign: 'left',
                  p: 1.5,
                  borderRadius: 2,
                  border: `1px solid ${designTokens.cardBorder}`,
                  width: '100%',
                  display: 'block',
                }}
              >
                <Typography variant="body2" fontWeight={600}>
                  {n.exerciseName}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {parts.join(' · ')}
                </Typography>
              </ButtonBase>
            );
          })}
        </Box>
      )}

      {open && <ExerciseInfoDialog key={open} exerciseName={open} note={openNote} onClose={() => setOpen(null)} />}
    </ContentCard>
  );
}
