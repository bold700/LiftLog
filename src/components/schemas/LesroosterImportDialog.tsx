/**
 * Dialoog "Lesrooster importeren" op de Workouts-pagina. Het importeren van het seizoensrooster is
 * iets wat een trainer een paar keer per jaar doet, dus het staat niet in een eigen tabblad maar
 * naast de groepslessen zelf.
 */
import { Dialog, DialogContent, DialogTitle, IconButton } from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { GroepslessenImportCard } from '../GroepslessenImportCard';

interface LesroosterImportDialogProps {
  open: boolean;
  onClose: () => void;
}

export const LesroosterImportDialog = ({ open, onClose }: LesroosterImportDialogProps) => (
  <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
    <DialogTitle sx={{ fontWeight: 600, pr: 6 }}>
      Lesrooster importeren
      <IconButton onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }} aria-label="Sluiten">
        <CloseRoundedIcon />
      </IconButton>
    </DialogTitle>
    <DialogContent>
      <GroepslessenImportCard />
    </DialogContent>
  </Dialog>
);
