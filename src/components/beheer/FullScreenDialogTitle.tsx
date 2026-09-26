/**
 * Kop van een schermvullend Beheer-venster op de telefoon (Material 3 full-screen dialog): sluiten
 * met een X linksboven, naast de titel. Eerst stond er onderaan alleen "Annuleren", onder de eigen
 * Opslaan-knop van het formulier: twee knoppen onderaan en geen weg terug bovenin.
 */
import { DialogTitle, IconButton, Typography } from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { useI18n } from '../../context/I18nContext';

export function FullScreenDialogTitle({ title, onClose }: { title: string; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pl: 1, pr: 2, py: 1, minHeight: 56, borderBottom: 1, borderColor: 'divider' }}>
      <IconButton onClick={onClose} aria-label={t('common.close')} edge="start" sx={{ ml: 0 }}>
        <CloseRoundedIcon />
      </IconButton>
      <Typography component="span" variant="h6" noWrap sx={{ fontWeight: 500, minWidth: 0 }}>
        {title}
      </Typography>
    </DialogTitle>
  );
}
