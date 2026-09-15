/**
 * Keuzelijst boven de inzichten: van wie wil je de cijfers zien?
 *
 * Alleen zichtbaar voor een trainer of beheerder. Staat er iemand anders gekozen, dan komt er
 * een balk onder te staan — anders is op geen enkel scherm te zien dat je niet naar jezelf
 * kijkt, en dat is precies waar verkeerde conclusies vandaan komen.
 */
import { Alert, Box, Button, MenuItem, TextField } from '@mui/material';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import { useProfile } from '../../context/ProfileContext';
import { useViewAs } from '../../context/ViewAsContext';

export const SporterSelect = () => {
  const profile = useProfile();
  const { viewed, mayViewOthers, setViewing } = useViewAs();

  if (!mayViewOthers) return null;

  const sporters = profile?.allSporters ?? [];
  const ownName = profile?.profile?.displayName || profile?.profile?.email || 'Mijzelf';

  return (
    <Box sx={{ mb: 2 }}>
      <TextField
        select
        size="small"
        fullWidth
        label="Inzichten van"
        value={viewed.isOther ? viewed.userId : ''}
        onChange={(e) => {
          const userId = e.target.value;
          if (!userId) {
            setViewing(null);
            return;
          }
          const chosen = sporters.find((s) => s.userId === userId);
          setViewing({ userId, name: chosen?.displayName || chosen?.email || 'Sporter' });
        }}
      >
        <MenuItem value="">{ownName} (mijzelf)</MenuItem>
        {sporters.map((s) => (
          <MenuItem key={s.userId} value={s.userId}>
            {s.displayName || s.email || s.userId}
          </MenuItem>
        ))}
      </TextField>

      {viewed.isOther && (
        <Alert
          severity="info"
          icon={<VisibilityRoundedIcon fontSize="small" />}
          sx={{ mt: 1.5 }}
          action={
            <Button color="inherit" size="small" onClick={() => setViewing(null)}>
              Terug naar mijzelf
            </Button>
          }
        >
          Je kijkt mee met <strong>{viewed.name}</strong>.
        </Alert>
      )}
    </Box>
  );
};
