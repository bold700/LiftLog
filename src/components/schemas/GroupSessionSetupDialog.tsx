/**
 * Dialoog "Wie trainen er mee?" voor trainers bij een groepsles: datum kiezen en aanvinken welke
 * sporters vandaag meetrainen, waarna de groepssessie start. De state (datum, deelnemers, "starting")
 * blijft in SchemasPage, omdat die ook nodig is om de sessie in Firestore aan te maken.
 */
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  TextField,
  FormGroup,
  FormControlLabel,
  Checkbox,
  Button,
} from '@mui/material';
import type { Profile } from '../../types';

interface GroupSessionSetupDialogProps {
  open: boolean;
  /** Label van de gekozen dag, bijv. "Maandag" of "Dag 2". */
  dayLabel: string;
  /** Datum van de sessie (ISO, yyyy-mm-dd). */
  date: string;
  /** Aangevinkte deelnemers. */
  participantIds: string[];
  /** True zolang de groepssessie wordt aangemaakt. */
  starting: boolean;
  /** Alle sporter-accounts van de trainer. */
  roster: Profile[];
  /** Vaste deelnemers van de groepsles (staan bovenaan, met " · vast"). */
  assignedParticipantIds: string[];
  onDateChange: (date: string) => void;
  onToggleParticipant: (userId: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}

export const GroupSessionSetupDialog = ({
  open,
  dayLabel,
  date,
  participantIds,
  starting,
  roster,
  assignedParticipantIds,
  onDateChange,
  onToggleParticipant,
  onClose,
  onConfirm,
}: GroupSessionSetupDialogProps) => (
  <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
    <DialogTitle>Wie trainen er mee?</DialogTitle>
    <DialogContent>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {dayLabel}. Kies de datum en
        vink aan wie er vandaag meetrainen. Per deelnemer zie je straks wat ze vorige keer deden, zodat je progressie
        kunt loggen.
      </Typography>
      <TextField
        type="date"
        label="Datum"
        value={date}
        onChange={(e) => onDateChange(e.target.value)}
        fullWidth
        size="small"
        InputLabelProps={{ shrink: true }}
        sx={{ mb: 2 }}
      />
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Aanwezig vandaag ({participantIds.length})
      </Typography>
      {(() => {
        if (roster.length === 0) {
          return (
            <Typography variant="body2" color="text.secondary">
              Nog geen sporter-accounts. Voeg eerst klanten toe via Menu → Beheer (of laat ze een account aanmaken en
              wijs ze de rol "sporter" toe).
            </Typography>
          );
        }
        const assigned = new Set(assignedParticipantIds);
        const sorted = [...roster].sort((a, b) => {
          const aa = assigned.has(a.userId) ? 0 : 1;
          const bb = assigned.has(b.userId) ? 0 : 1;
          if (aa !== bb) return aa - bb;
          return (a.displayName || a.email || '').localeCompare(b.displayName || b.email || '');
        });
        return (
          <FormGroup sx={{ maxHeight: 320, overflow: 'auto' }}>
            {sorted.map((sp) => (
              <FormControlLabel
                key={sp.userId}
                control={
                  <Checkbox
                    checked={participantIds.includes(sp.userId)}
                    onChange={() => onToggleParticipant(sp.userId)}
                  />
                }
                label={`${sp.displayName?.trim() || sp.email || sp.userId}${assigned.has(sp.userId) ? ' · vast' : ''}`}
              />
            ))}
          </FormGroup>
        );
      })()}
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose}>Annuleren</Button>
      <Button
        variant="contained"
        onClick={onConfirm}
        disabled={participantIds.length === 0 || starting}
        sx={{ bgcolor: '#000000', color: '#F2E4D3', '&:hover': { bgcolor: '#1a1a1a' } }}
      >
        {starting ? 'Bezig…' : 'Training starten'}
      </Button>
    </DialogActions>
  </Dialog>
);
