// Dialoog met het volledige bodyscan-rapport van één meting (vanuit de historie). Op mobiel schermvullend.
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, IconButton, useMediaQuery, useTheme } from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import type { Measurement } from '../../services/measurementService';
import { BodyScanReport } from './BodyScanReport';
import { BodyChangeCard } from './BodyChangeCard';

interface BodyScanDialogProps {
  measurement: Measurement | null;
  /** Alle metingen van deze sporter: om met een eerdere scan te vergelijken. */
  items?: Measurement[];
  onClose: () => void;
}

export function BodyScanDialog({ measurement, items = [], onClose }: BodyScanDialogProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const scan = measurement?.bodyScan ?? null;
  return (
    <Dialog open={!!scan} onClose={onClose} maxWidth="sm" fullWidth fullScreen={fullScreen}>
      <DialogTitle sx={{ pr: 6 }}>
        Bodyscan {measurement?.date ?? ''}
        <IconButton aria-label="Sluiten" onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }}>
          <CloseRoundedIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {scan && measurement && (
          <>
            <BodyChangeCard key={measurement.id} items={items} to={measurement} plain />
            <BodyScanReport scan={scan} date={measurement.date} />
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button variant="text" onClick={onClose} sx={{ textTransform: 'none' }}>
          Sluiten
        </Button>
      </DialogActions>
    </Dialog>
  );
}
