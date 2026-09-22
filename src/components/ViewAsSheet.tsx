/**
 * Sporter kiezen om als te bekijken/loggen ("Bekijk als"), via het profielfoto-menu (AppShell).
 * Bottom sheet op de telefoon, dialoog op een groot scherm — allebei dezelfde lijst.
 */
import { Dialog, Drawer, List, ListItemButton, ListItemAvatar, ListItemText, Typography, Box, useMediaQuery, useTheme } from '@mui/material';
import { UserAvatar } from './UserAvatar';
import { designTokens } from '../theme/designTokens';
import type { Profile } from '../types';

interface ViewAsSheetProps {
  open: boolean;
  onClose: () => void;
  /** Sporters die je kunt kiezen. */
  sporters: Profile[];
  /** Wie er nu bekeken wordt (voor het vinkje/highlight), '' = jezelf. */
  viewedUserId: string;
  ownName: string;
  ownPhotoURL?: string | null;
  onPick: (sporter: Profile | null) => void;
}

export function ViewAsSheet({ open, onClose, sporters, viewedUserId, ownName, ownPhotoURL, onPick }: ViewAsSheetProps) {
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up('md'));

  const content = (
    <>
      <Typography variant="subtitle1" fontWeight={600} sx={{ px: 2, pt: 2, pb: 1 }}>
        Bekijk als
      </Typography>
      <List sx={{ pb: 1 }}>
        <ListItemButton selected={!viewedUserId} onClick={() => onPick(null)}>
          <ListItemAvatar>
            <UserAvatar name={ownName} photoURL={ownPhotoURL} size={36} />
          </ListItemAvatar>
          <ListItemText primary={`${ownName} (mezelf)`} />
        </ListItemButton>
        {sporters.map((s) => (
          <ListItemButton key={s.userId} selected={s.userId === viewedUserId} onClick={() => onPick(s)}>
            <ListItemAvatar>
              <UserAvatar name={s.displayName} photoURL={s.photoURL} size={36} />
            </ListItemAvatar>
            <ListItemText primary={s.displayName?.trim() || s.email || s.userId} />
          </ListItemButton>
        ))}
      </List>
    </>
  );

  if (wide) {
    return (
      <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
        {content}
      </Dialog>
    );
  }

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { borderTopLeftRadius: `${designTokens.cardRadius}px`, borderTopRightRadius: `${designTokens.cardRadius}px`, maxHeight: '70vh' } }}
    >
      <Box sx={{ width: 36, height: 4, borderRadius: 2, bgcolor: designTokens.outline, mx: 'auto', mt: 1.5, opacity: 0.5 }} />
      {content}
    </Drawer>
  );
}
