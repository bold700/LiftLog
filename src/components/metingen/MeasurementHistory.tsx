// Historie-lijst op de Metingen-pagina: alle metingen (nieuwste eerst) met bewerken/verwijderen.
import { Box, Typography, IconButton, CircularProgress, List, ListItem, ListItemText } from '@mui/material';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import { CIRCUMFERENCE_FIELDS, skinfoldSum, type Measurement } from '../../services/measurementService';
import { PHOTO_VIEWS } from '../../services/progressPhotoService';
import { fatFreeMassKg } from '../../utils/bodyFat';

interface MeasurementHistoryProps {
  loading: boolean;
  /** Metingen, oud → nieuw gesorteerd (zoals geladen). */
  items: Measurement[];
  onEdit: (m: Measurement) => void;
  onDelete: (id: string) => Promise<void>;
}

export function MeasurementHistory({ loading, items, onEdit, onDelete }: MeasurementHistoryProps) {
  return (
    <>
      <Typography variant="subtitle1" fontWeight={600} sx={{ mt: 3, mb: 1 }}>
        Historie
      </Typography>
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
          <CircularProgress size={20} />
        </Box>
      ) : items.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Nog geen metingen.
        </Typography>
      ) : (
        <List disablePadding>
          {[...items].reverse().map((m) => {
            const circSummary = CIRCUMFERENCE_FIELDS.filter((f) => m[f.key] != null)
              .map((f) => `${f.label} ${m[f.key]}`)
              .join(' · ');
            const sum = skinfoldSum(m);
            const skinSummary = sum != null ? `Plooien ${sum} mm` : null;
            const photoCount = PHOTO_VIEWS.filter((v) => m[v.key] != null).length;
            const photoSummary = photoCount > 0 ? `${photoCount} foto${photoCount === 1 ? '' : "'s"}` : null;
            const secondary = [circSummary || null, skinSummary, photoSummary, m.note || null].filter(Boolean).join(' — ');
            const ffm = m.weightKg != null && m.bodyFatPct != null ? fatFreeMassKg(m.weightKg, m.bodyFatPct) : null;
            const fatLabel =
              m.bodyFatPct != null
                ? `${m.bodyFatPct}%${m.bodyFatMethod === 'durnin-womersley' ? ' (berekend)' : ''}${ffm != null ? ` · VVM ${ffm} kg` : ''}`
                : '';
            return (
              <ListItem
                key={m.id}
                disableGutters
                divider
                alignItems="flex-start"
                sx={{ py: 1.25, pr: 10, '&:last-child': { borderBottom: 0 } }}
                secondaryAction={
                  <Box sx={{ display: 'flex', gap: 0.25 }}>
                    <IconButton size="small" sx={{ width: 32, height: 32 }} onClick={() => onEdit(m)} aria-label="Bewerken">
                      <EditRoundedIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" sx={{ width: 32, height: 32 }} onClick={() => onDelete(m.id)} aria-label="Verwijderen">
                      <DeleteOutlineRoundedIcon fontSize="small" />
                    </IconButton>
                  </Box>
                }
              >
                <ListItemText
                  sx={{ my: 0, minWidth: 0 }}
                  primary={`${m.date} · ${m.weightKg != null ? `${m.weightKg} kg` : ''}${m.weightKg != null && fatLabel ? ' · ' : ''}${fatLabel}`}
                  primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }}
                  secondary={secondary || null}
                  secondaryTypographyProps={{ variant: 'caption', sx: { display: 'block', mt: 0.25 } }}
                />
              </ListItem>
            );
          })}
        </List>
      )}
    </>
  );
}
