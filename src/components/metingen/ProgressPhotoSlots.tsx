// De drie fotoslots (voor/zij/achter) in het invoerformulier van de Metingen-pagina: kiezen, tonen, vervangen, verwijderen.
// De slot-state en de verborgen file-inputs (refs) blijven eigendom van MetingenPage.
import type { MutableRefObject } from 'react';
import { Box, Typography, IconButton, Button } from '@mui/material';
import PhotoCameraRoundedIcon from '@mui/icons-material/PhotoCameraRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { PHOTO_VIEWS, type PhotoView } from '../../services/progressPhotoService';
import { PHOTO_IMG_SX } from './styles';

/** Per aanzicht: bestaande URL (uit de meting), nieuw gekozen bestand, en of de bestaande foto weg moet. */
export interface PhotoSlot {
  existingUrl: string | null;
  file: File | null;
  previewUrl: string | null;
  remove: boolean;
}

interface ProgressPhotoSlotsProps {
  photos: Record<PhotoView, PhotoSlot>;
  inputsRef: MutableRefObject<Record<PhotoView, HTMLInputElement | null>>;
  onPick: (view: PhotoView, file: File | null) => void;
  onClear: (view: PhotoView) => void;
}

export function ProgressPhotoSlots({ photos, inputsRef, onPick, onClear }: ProgressPhotoSlotsProps) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
      {PHOTO_VIEWS.map((v) => {
        const slot = photos[v.view];
        const shown = slot.previewUrl ?? (slot.remove ? null : slot.existingUrl);
        return (
          <Box key={v.view} sx={{ minWidth: 0 }}>
            <input
              ref={(el) => {
                inputsRef.current[v.view] = el;
              }}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              id={`photo-${v.view}`}
              onChange={(e) => onPick(v.view, e.target.files?.[0] ?? null)}
            />
            <Typography variant="caption" fontWeight={500} sx={{ display: 'block', mb: 0.5 }}>
              {v.label}
            </Typography>
            {shown ? (
              <Box sx={{ position: 'relative' }}>
                <Box component="img" src={shown} alt={`${v.label}aanzicht`} sx={PHOTO_IMG_SX} />
                <IconButton
                  type="button"
                  size="small"
                  aria-label={`${v.label}foto verwijderen`}
                  onClick={() => onClear(v.view)}
                  sx={{
                    position: 'absolute',
                    top: 4,
                    right: 4,
                    width: 32,
                    height: 32,
                    bgcolor: 'background.paper',
                    boxShadow: 1,
                    '&:hover': { bgcolor: 'background.paper' },
                  }}
                >
                  <CloseRoundedIcon fontSize="small" />
                </IconButton>
              </Box>
            ) : (
              <Box
                component="label"
                htmlFor={`photo-${v.view}`}
                sx={{
                  display: 'flex',
                  aspectRatio: '3 / 4',
                  cursor: 'pointer',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 0.5,
                  borderRadius: 2,
                  border: '1px dashed',
                  borderColor: 'divider',
                  color: 'text.secondary',
                  fontSize: 12,
                  transition: 'background-color 0.2s ease',
                  '&:hover': { bgcolor: 'rgba(0,0,0,0.04)' },
                  '&:focus-within': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
                }}
              >
                <PhotoCameraRoundedIcon fontSize="small" />
                Kies foto
              </Box>
            )}
            {shown && (
              <Button
                type="button"
                variant="text"
                size="small"
                fullWidth
                sx={{ mt: 0.5, height: 32, fontSize: 12, textTransform: 'none' }}
                onClick={() => inputsRef.current[v.view]?.click()}
              >
                Vervangen
              </Button>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
