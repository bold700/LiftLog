/**
 * Bijzonderheden van een sporter beheren (blessures, pijntjes): lichaamsdeel, hoe streng
 * ("let op" of "vermijden") en een toelichting. De app gebruikt dit om tijdens een training te
 * waarschuwen bij oefeningen die dat gebied belasten en alternatieven voor te stellen.
 */
import { useState } from 'react';
import { Box, Button, Chip, MenuItem, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import type { Limitation, LimitationArea } from '../types';
import { LIMITATION_AREAS, describeLimitation } from '../utils/exerciseLimitations';

interface LimitationsEditorProps {
  value: Limitation[];
  onChange: (next: Limitation[]) => void;
  disabled?: boolean;
}

function newId(): string {
  return `lim_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function LimitationsEditor({ value, onChange, disabled }: LimitationsEditorProps) {
  const [adding, setAdding] = useState(false);
  const [area, setArea] = useState<LimitationArea>('schouder');
  const [severity, setSeverity] = useState<Limitation['severity']>('let-op');
  const [note, setNote] = useState('');
  const [alternative, setAlternative] = useState('');

  const add = () => {
    onChange([
      ...value,
      { id: newId(), area, severity, note: note.trim() || null, alternative: alternative.trim() || null, createdAt: new Date().toISOString() },
    ]);
    setArea('schouder');
    setSeverity('let-op');
    setNote('');
    setAlternative('');
    setAdding(false);
  };

  return (
    <Box>
      <Typography variant="subtitle2" fontWeight={600}>
        Bijzonderheden
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        Blessures en pijntjes. Tijdens een training waarschuwt de app bij oefeningen die dit gebied belasten en toont
        ze wat je hier als vervanging noteert.
      </Typography>

      {value.length > 0 ? (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1 }}>
          {value.map((l) => (
            <Chip
              key={l.id}
              label={describeLimitation(l)}
              size="small"
              color={l.severity === 'vermijden' ? 'error' : 'warning'}
              variant="outlined"
              onDelete={disabled ? undefined : () => onChange(value.filter((x) => x.id !== l.id))}
            />
          ))}
        </Box>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Niets opgegeven.
        </Typography>
      )}

      {adding ? (
        <Box sx={{ display: 'grid', gap: 1.5, p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
          <TextField
            select
            size="small"
            label="Waar zit het?"
            value={area}
            onChange={(e) => setArea(e.target.value as LimitationArea)}
            fullWidth
          >
            {LIMITATION_AREAS.map((a) => (
              <MenuItem key={a.value} value={a.value}>
                {a.label}
              </MenuItem>
            ))}
          </TextField>
          <ToggleButtonGroup
            exclusive
            fullWidth
            size="small"
            value={severity}
            onChange={(_, next: Limitation['severity'] | null) => next && setSeverity(next)}
            aria-label="Hoe streng"
            sx={{
              '& .MuiToggleButton-root': { textTransform: 'none', borderRadius: '20px' },
              '& .MuiToggleButton-root.Mui-selected': { bgcolor: '#000', color: '#F2E4D3', '&:hover': { bgcolor: '#1a1a1a' } },
            }}
          >
            <ToggleButton value="let-op">Let op</ToggleButton>
            <ToggleButton value="vermijden">Vermijden</ToggleButton>
          </ToggleButtonGroup>
          <TextField
            size="small"
            label="Toelichting (optioneel)"
            placeholder="Bijv. links, sinds juni"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            fullWidth
          />
          <TextField
            size="small"
            label="In plaats daarvan (optioneel)"
            placeholder="Bijv. geen pressen boven schouderhoogte, wel floor press"
            value={alternative}
            onChange={(e) => setAlternative(e.target.value)}
            fullWidth
          />
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
            <Button size="small" onClick={() => setAdding(false)} sx={{ textTransform: 'none', borderRadius: '24px' }}>
              Annuleren
            </Button>
            <Button
              size="small"
              variant="contained"
              onClick={add}
              sx={{ textTransform: 'none', borderRadius: '24px', bgcolor: '#000', color: '#F2E4D3', '&:hover': { bgcolor: '#1a1a1a' } }}
            >
              Toevoegen
            </Button>
          </Box>
        </Box>
      ) : (
        <Button
          size="small"
          variant="outlined"
          startIcon={<AddRoundedIcon />}
          disabled={disabled}
          onClick={() => setAdding(true)}
          sx={{ textTransform: 'none', borderRadius: '24px' }}
        >
          Bijzonderheid toevoegen
        </Button>
      )}
    </Box>
  );
}
