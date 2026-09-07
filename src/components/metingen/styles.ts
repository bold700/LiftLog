// Gedeelde sx-constanten van de Metingen-pagina en de onderdelen in deze map.
// Alleen bedoeld voor MetingenPage en src/components/metingen; geen generieke UI-bouwsteen.

/** Omkaderd blok binnen de hoofdcard (statistieken, grafieken, foto's): compacte padding, kleine onderrand. */
export const PANEL_SX = {
  mb: 2,
  '& .MuiCardContent-root': { p: 2, '&:last-child': { pb: 2 } },
} as const;

/** Zwarte primaire knop, zelfde look als de andere pagina's. */
export const PRIMARY_BUTTON_SX = {
  bgcolor: '#000',
  color: '#F2E4D3',
  borderRadius: '24px',
  textTransform: 'none',
  fontWeight: 600,
  '&:hover': { bgcolor: '#1a1a1a' },
  '&.Mui-disabled': { bgcolor: 'rgba(0,0,0,0.12)', color: 'rgba(29,27,26,0.38)' },
} as const;

/** Staande foto (3:4), afgerond, passend bijgesneden. */
export const PHOTO_IMG_SX = {
  aspectRatio: '3 / 4',
  width: '100%',
  borderRadius: 2,
  bgcolor: 'rgba(0,0,0,0.06)',
  objectFit: 'cover',
  display: 'block',
} as const;
