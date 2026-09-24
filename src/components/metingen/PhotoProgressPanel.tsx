// Foto-voortgang op de Metingen-pagina: per aanzicht de eerste foto naast de laatste, met een
// "Vergelijken"-knop die desgewenst elk ander paar metingen naast elkaar zet (PhotoCompareDialog).
import { useMemo, useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { OutlineCard } from '../layout';
import type { Measurement } from '../../services/measurementService';
import { PHOTO_VIEWS, type PhotoView } from '../../services/progressPhotoService';
import { PANEL_SX, PHOTO_IMG_SX } from './styles';
import { PhotoCompareDialog } from './PhotoCompareDialog';

interface PhotoProgressPanelProps {
  /** Metingen, oud → nieuw gesorteerd. */
  items: Measurement[];
}

export function PhotoProgressPanel({ items }: PhotoProgressPanelProps) {
  const [compareView, setCompareView] = useState<PhotoView | null>(null);

  /** Per aanzicht: eerste en laatste foto (items zijn oud → nieuw gesorteerd). */
  const photoProgress = useMemo(
    () =>
      PHOTO_VIEWS.map((v) => {
        const withPhoto = items.filter((m) => m[v.key] != null);
        const first = withPhoto[0] ?? null;
        const last = withPhoto.length > 1 ? withPhoto[withPhoto.length - 1] : null;
        return { ...v, first, last, count: withPhoto.length };
      }).filter((p) => p.first != null),
    [items]
  );

  if (photoProgress.length === 0) return null;

  return (
    <OutlineCard sx={PANEL_SX}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
        Foto's: eerste naast laatste
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {photoProgress.map((p) => (
          <Box key={p.view}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
              <Typography variant="body2" fontWeight={500}>
                {p.label}aanzicht
              </Typography>
              {p.last != null && (
                <Button size="small" onClick={() => setCompareView(p.view)} sx={{ textTransform: 'none', minWidth: 0, py: 0 }}>
                  Vergelijken
                </Button>
              )}
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1 }}>
              {[
                { m: p.first, tag: 'Eerste' },
                { m: p.last, tag: 'Laatste' },
              ].map(({ m, tag }) =>
                m ? (
                  <Box
                    key={tag}
                    component="a"
                    href={m[p.key] as string}
                    target="_blank"
                    rel="noreferrer"
                    sx={{ display: 'block', minWidth: 0, color: 'inherit', textDecoration: 'none' }}
                  >
                    <Box
                      component="img"
                      src={m[p.key] as string}
                      alt={`${p.label}aanzicht, ${tag.toLowerCase()} foto van ${m.date}`}
                      loading="lazy"
                      sx={PHOTO_IMG_SX}
                    />
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                      {tag} · {m.date}
                    </Typography>
                  </Box>
                ) : (
                  <Box
                    key={tag}
                    sx={{
                      display: 'flex',
                      aspectRatio: '3 / 4',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 2,
                      border: '1px dashed',
                      borderColor: 'divider',
                      p: 1,
                      textAlign: 'center',
                    }}
                  >
                    <Typography variant="caption" color="text.secondary">
                      Nog geen tweede foto
                    </Typography>
                  </Box>
                )
              )}
            </Box>
          </Box>
        ))}
      </Box>
      {compareView && <PhotoCompareDialog open onClose={() => setCompareView(null)} items={items} initialView={compareView} />}
    </OutlineCard>
  );
}
