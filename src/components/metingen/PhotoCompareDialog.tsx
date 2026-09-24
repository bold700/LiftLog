// Vergelijk-dialoog: twee voortgangsfoto's van hetzelfde aanzicht naast elkaar (splitscreen), waarbij je
// links en rechts onafhankelijk een meting kiest — bijv. week 1 tegenover de meest recente, of week 7
// tegenover week 8. Schermvullend op mobiel voor een echt splitscreen-gevoel.
import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Select,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import type { Measurement } from '../../services/measurementService';
import { PHOTO_VIEWS, type PhotoUrlKey, type PhotoView } from '../../services/progressPhotoService';
import { getWeeksBetween } from '../../utils/format';
import { PHOTO_IMG_SX } from './styles';

interface PhotoCompareDialogProps {
  open: boolean;
  onClose: () => void;
  /** Metingen, oud → nieuw gesorteerd. */
  items: Measurement[];
  /** Aanzicht waarmee de dialoog opent (bijv. het aanzicht waarvan de gebruiker "Vergelijken" koos). */
  initialView: PhotoView;
}

function withPhotoFor(items: Measurement[], key: PhotoUrlKey): Measurement[] {
  return items.filter((m) => m[key] != null);
}

/** Korte datum zonder weekdag/jaar (bijv. "19 jul") — de weeknummers geven al context in de tijd. */
function shortDate(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}

const SELECT_SX = {
  fontSize: 13,
  '& .MuiSelect-select': { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
} as const;

function Side({
  label,
  options,
  index,
  onChange,
  photoUrl,
}: {
  label: string;
  options: Measurement[];
  index: number;
  onChange: (i: number) => void;
  photoUrl: string;
}) {
  const weekOf = (m: Measurement) => getWeeksBetween(options[0].date, m.date) + 1;
  return (
    <Box sx={{ minWidth: 0 }}>
      <Select size="small" fullWidth value={index} onChange={(e) => onChange(Number(e.target.value))} sx={{ ...SELECT_SX, mb: 0.5 }}>
        {options.map((m, i) => (
          <MenuItem key={m.id} value={i} sx={{ fontSize: 13 }}>
            Week {weekOf(m)} · {shortDate(m.date)}
          </MenuItem>
        ))}
      </Select>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
        <IconButton size="small" disabled={index <= 0} onClick={() => onChange(index - 1)} aria-label={`Vorige foto (${label})`}>
          <ChevronLeftRoundedIcon fontSize="small" />
        </IconButton>
        <IconButton
          size="small"
          disabled={index >= options.length - 1}
          onClick={() => onChange(index + 1)}
          aria-label={`Volgende foto (${label})`}
        >
          <ChevronRightRoundedIcon fontSize="small" />
        </IconButton>
      </Box>
      <Box component="img" src={photoUrl} alt={`${label}, week ${weekOf(options[index])}`} loading="lazy" sx={PHOTO_IMG_SX} />
    </Box>
  );
}

export function PhotoCompareDialog({ open, onClose, items, initialView }: PhotoCompareDialogProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [view, setView] = useState<PhotoView>(initialView);
  const [leftIndex, setLeftIndex] = useState(0);
  const [rightIndex, setRightIndex] = useState(0);

  const availableViews = useMemo(() => PHOTO_VIEWS.filter((v) => withPhotoFor(items, v.key).length > 0), [items]);
  const current = availableViews.find((v) => v.view === view) ?? availableViews[0] ?? null;
  const withPhoto = useMemo(() => (current ? withPhotoFor(items, current.key) : []), [items, current]);

  // Bij openen (of van aanzicht wisselen) terug naar het standaardpaar: eerste tegenover laatste foto.
  useEffect(() => {
    if (!open) return;
    setView(initialView);
  }, [open, initialView]);

  useEffect(() => {
    setLeftIndex(0);
    setRightIndex(Math.max(0, withPhoto.length - 1));
  }, [current?.view, withPhoto.length]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth fullScreen={fullScreen}>
      <DialogTitle sx={{ pr: 6 }}>
        Foto's vergelijken
        <IconButton aria-label="Sluiten" onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }}>
          <CloseRoundedIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {!current || withPhoto.length < 2 ? (
          <Typography variant="body2" color="text.secondary">
            Nog niet genoeg foto's om te vergelijken.
          </Typography>
        ) : (
          <>
            {availableViews.length > 1 && (
              <ToggleButtonGroup
                exclusive
                size="small"
                value={current.view}
                onChange={(_, v) => v && setView(v)}
                sx={{ mb: 2 }}
              >
                {availableViews.map((v) => (
                  <ToggleButton key={v.view} value={v.view} sx={{ textTransform: 'none' }}>
                    {v.label}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            )}
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: { xs: 1, sm: 2 } }}>
              <Side label="links" options={withPhoto} index={leftIndex} onChange={setLeftIndex} photoUrl={withPhoto[leftIndex][current.key] as string} />
              <Side label="rechts" options={withPhoto} index={rightIndex} onChange={setRightIndex} photoUrl={withPhoto[rightIndex][current.key] as string} />
            </Box>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
