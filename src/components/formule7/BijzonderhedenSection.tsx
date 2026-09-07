// Sectie 7 van de Formule 7-routekaart: bijzonderheden (vrije notities, contra-indicaties, aandachtspunten).
import { TextField } from '@mui/material';
import { HelperText, Formule7SectionAccordion } from './sectionShared';

interface BijzonderhedenSectionProps {
  value: string;
  onChange: (notes: string) => void;
  expanded: boolean;
  onToggle: () => void;
}

export function BijzonderhedenSection({ value, onChange, expanded, onToggle }: BijzonderhedenSectionProps) {
  return (
    <Formule7SectionAccordion title="7. Bijzonderheden" expanded={expanded} onToggle={onToggle}>
        <HelperText>
          Eventuele opmerkingen, contra-indicaties of aandachtspunten voor deze workout.
        </HelperText>
        <TextField
          label="Bijzonderheden"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          size="small"
          fullWidth
          multiline
          rows={3}
          placeholder="Vrije notities…"
        />
    </Formule7SectionAccordion>
  );
}
