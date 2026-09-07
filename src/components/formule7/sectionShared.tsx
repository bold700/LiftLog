// Gedeelde stijl en accordion-wrapper voor de secties van het Formule 7-routekaartformulier.
// Alleen bedoeld voor de sectiecomponenten in deze map; geen generieke UI-bouwsteen.
import { Accordion, AccordionSummary, AccordionDetails, Typography } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

export const SECTION_STYLE = {
  margin: 0,
  p: 1.5,
  borderRadius: 2,
  border: '1px solid rgba(0,0,0,0.08)',
  backgroundColor: 'rgba(0,0,0,0.02)',
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 1.5,
  '&.Mui-expanded': { margin: 0 },
};

/** Rij met invoervelden: vult de volle breedte; velden delen de ruimte gelijk. Op kleine schermen gestapeld. */
export const FORM_ROW = {
  display: 'flex',
  flexWrap: 'wrap' as const,
  gap: 2,
  alignItems: 'flex-start' as const,
  width: '100%',
  minWidth: 0,
  '& > *': {
    flex: '1 1 100%',
    minWidth: 0,
    '@media (min-width: 600px)': { flex: '1 1 0%', minWidth: 80 },
  },
};

export const HelperText = ({ children }: { children: React.ReactNode }) => (
  <Typography variant="body2" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
    {children}
  </Typography>
);

interface Formule7SectionAccordionProps {
  /** Sectiekop, bijv. "2. Warming-up". */
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

/** Uitklapbare sectie van de routekaart (identieke opmaak voor alle 7 secties). */
export function Formule7SectionAccordion({ title, expanded, onToggle, children }: Formule7SectionAccordionProps) {
  return (
    <Accordion
      disableGutters
      expanded={expanded}
      onChange={onToggle}
      sx={{
        ...SECTION_STYLE,
        '&:before': { display: 'none' },
        boxShadow: 'none',
        '& .MuiAccordionSummary-root': { py: 0.5, minHeight: 44, px: 0 },
        '& .MuiAccordionSummary-content': { my: 0.75 },
      }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="subtitle1" fontWeight={600}>
          {title}
        </Typography>
      </AccordionSummary>
      <AccordionDetails sx={{ py: 1.5, px: 0, minWidth: 0 }}>{children}</AccordionDetails>
    </Accordion>
  );
}
