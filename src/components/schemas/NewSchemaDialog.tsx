/**
 * Keuze bij "Workout aanmaken" (+-menu): zelf maken, de 7-stappenroute (Formule 7-routekaart) of
 * met AI. Zo blijft de editor zelf rustig: hij toont alleen wat bij de gekozen manier hoort. Het
 * aanmaken zelf gebeurt in SchemasPage.
 */
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import EditNoteRoundedIcon from '@mui/icons-material/EditNoteRounded';
import ChecklistRoundedIcon from '@mui/icons-material/ChecklistRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';

export type NewSchemaMode = 'free' | 'formule7' | 'ai';

interface NewSchemaDialogProps {
  open: boolean;
  onClose: () => void;
  onChoose: (mode: NewSchemaMode) => void;
}

const OPTIONS: { mode: NewSchemaMode; icon: JSX.Element; title: string; text: string }[] = [
  { mode: 'free', icon: <EditNoteRoundedIcon />, title: 'Zelf maken', text: 'Een lege workout: dagen en oefeningen kies je zelf.' },
  {
    mode: 'formule7',
    icon: <ChecklistRoundedIcon />,
    title: '7-stappenroute',
    text: 'De Formule 7-routekaart stap voor stap invullen (intake, doel, frequentie …); de trainingsdagen vullen zich mee.',
  },
  { mode: 'ai', icon: <AutoAwesomeRoundedIcon />, title: 'Met AI', text: 'Beschrijf doel, niveau en materiaal; de AI maakt een voorstel dat je daarna aanpast.' },
];

export const NewSchemaDialog = ({ open, onClose, onChoose }: NewSchemaDialogProps) => (
  <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
    <DialogTitle>Nieuwe workout</DialogTitle>
    <DialogContent sx={{ px: 1.5 }}>
      <List disablePadding>
        {OPTIONS.map((o) => (
          <ListItemButton key={o.mode} onClick={() => onChoose(o.mode)} sx={{ borderRadius: 2, alignItems: 'flex-start', py: 1.25 }}>
            <ListItemIcon sx={{ minWidth: 40, mt: 0.5, color: 'primary.main' }}>{o.icon}</ListItemIcon>
            <ListItemText
              primary={o.title}
              secondary={o.text}
              primaryTypographyProps={{ fontWeight: 600 }}
            />
          </ListItemButton>
        ))}
      </List>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose}>Annuleren</Button>
    </DialogActions>
  </Dialog>
);
