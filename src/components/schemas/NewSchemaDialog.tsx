/**
 * Keuze bij "Workout aanmaken" (+-menu): zelf maken, de 7-stappenroute (Formule 7-routekaart),
 * met AI, of van een foto van een schema. Zo blijft de editor zelf rustig: hij toont alleen wat bij
 * de gekozen manier hoort. Het aanmaken zelf gebeurt in SchemasPage.
 */
import { useRef, useState } from 'react';
import {
  Alert,
  Box,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
} from '@mui/material';
import EditNoteRoundedIcon from '@mui/icons-material/EditNoteRounded';
import ChecklistRoundedIcon from '@mui/icons-material/ChecklistRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import PhotoCameraRoundedIcon from '@mui/icons-material/PhotoCameraRounded';
import { readWorkoutPhoto } from '../../services/aiWorkoutService';
import { fileToDataUrl } from '../../utils/imageDataUrl';
import type { SchemaDay } from '../../types';

export type NewSchemaMode = 'free' | 'formule7' | 'ai';

interface NewSchemaDialogProps {
  open: boolean;
  onClose: () => void;
  onChoose: (mode: NewSchemaMode) => void;
  /** Van een foto: de uitgelezen workout openen in de editor (nog niet opgeslagen). */
  onFromPhoto: (workout: { name: string; days: SchemaDay[] }) => void;
}

const OPTIONS: { mode: NewSchemaMode | 'photo'; icon: JSX.Element; title: string; text: string }[] = [
  { mode: 'free', icon: <EditNoteRoundedIcon />, title: 'Zelf maken', text: 'Een lege workout: dagen en oefeningen kies je zelf.' },
  {
    mode: 'photo',
    icon: <PhotoCameraRoundedIcon />,
    title: 'Van foto',
    text: 'Maak of kies een foto van een schema (papier, whiteboard, scherm); de oefeningen worden overgenomen en je past het daarna aan.',
  },
  {
    mode: 'formule7',
    icon: <ChecklistRoundedIcon />,
    title: '7-stappenroute',
    text: 'De Formule 7-routekaart stap voor stap invullen (intake, doel, frequentie …); de trainingsdagen vullen zich mee.',
  },
  { mode: 'ai', icon: <AutoAwesomeRoundedIcon />, title: 'Met AI', text: 'Beschrijf doel, niveau en materiaal; de AI maakt een voorstel dat je daarna aanpast.' },
];

export const NewSchemaDialog = ({ open, onClose, onChoose, onFromPhoto }: NewSchemaDialogProps) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (reading) return;
    setError(null);
    onClose();
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setReading(true);
    setError(null);
    try {
      // Tekst moet leesbaar blijven: groter dan bij voeding (768), maar wel verkleind.
      const image = await fileToDataUrl(file, 1600, 0.85);
      onFromPhoto(await readWorkoutPhoto(image));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'De foto uitlezen lukte niet. Probeer het opnieuw.');
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <Dialog open={open} onClose={close} maxWidth="xs" fullWidth>
      <DialogTitle>Nieuwe workout</DialogTitle>
      <DialogContent sx={{ px: 1.5 }}>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
        {reading ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5, py: 4 }}>
            <CircularProgress size={28} />
            <Typography variant="body2" color="text.secondary">
              Foto uitlezen…
            </Typography>
          </Box>
        ) : (
          <>
            {error && (
              <Alert severity="error" sx={{ mx: 1, mb: 1 }}>
                {error}
              </Alert>
            )}
            <List disablePadding>
              {OPTIONS.map((o) => (
                <ListItemButton
                  key={o.mode}
                  onClick={() => (o.mode === 'photo' ? fileRef.current?.click() : onChoose(o.mode))}
                  sx={{ borderRadius: 2, alignItems: 'flex-start', py: 1.25 }}
                >
                  <ListItemIcon sx={{ minWidth: 40, mt: 0.5, color: 'primary.main' }}>{o.icon}</ListItemIcon>
                  <ListItemText primary={o.title} secondary={o.text} primaryTypographyProps={{ fontWeight: 600 }} />
                </ListItemButton>
              ))}
            </List>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={close} disabled={reading}>
          Annuleren
        </Button>
      </DialogActions>
    </Dialog>
  );
};
