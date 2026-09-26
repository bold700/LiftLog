// Gedeelde sx-constanten van de Metingen-pagina en de onderdelen in deze map.
// Alleen bedoeld voor MetingenPage en src/components/metingen; geen generieke UI-bouwsteen.

/** Omkaderd blok binnen de hoofdcard (statistieken, grafieken, foto's): compacte padding, kleine onderrand. */
export const PANEL_SX = {
  mb: 2,
  '& .MuiCardContent-root': { p: 2, '&:last-child': { pb: 2 } },
} as const;

/** Zwarte primaire knop, zelfde look als de andere pagina's. */
export const PRIMARY_BUTTON_SX = {
  bgcolor: 'primary.main',
  color: 'primary.contrastText',
  borderRadius: '24px',
  textTransform: 'none',
  fontWeight: 600,
  '&:hover': { bgcolor: 'primary.dark' },
  '&.Mui-disabled': { bgcolor: 'action.disabledBackground', color: 'action.disabled' },
} as const;

/** Staande foto (3:4), afgerond, passend bijgesneden. */
export const PHOTO_IMG_SX = {
  aspectRatio: '3 / 4',
  width: '100%',
  borderRadius: 2,
  bgcolor: 'action.hover',
  objectFit: 'cover',
  display: 'block',
} as const;
