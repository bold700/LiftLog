/**
 * Iemand kiezen om als te bekijken/loggen ("Bekijk als"), via het profielfoto-menu (AppShell).
 * Iedereen in de studio: eerst de sporters, daarna het team (trainers en beheerders).
 * Bottom sheet op de telefoon, dialoog op een groot scherm — allebei dezelfde lijst.
 */
import { Dialog, Drawer, List, ListItemButton, ListItemAvatar, ListItemText, ListSubheader, Typography, Box, useMediaQuery, useTheme } from '@mui/material';
import { UserAvatar } from './UserAvatar';
import { designTokens } from '../theme/designTokens';
import type { Profile } from '../types';

interface ViewAsSheetProps {
  open: boolean;
  onClose: () => void;
  /** Iedereen in de studio behalve jezelf (sporters, trainers, beheerders). */
  members: Profile[];
  /** Wie er nu bekeken wordt (voor het vinkje/highlight), '' = jezelf. */
  viewedUserId: string;
  ownName: string;
  ownPhotoURL?: string | null;
  onPick: (member: Profile | null) => void;
}

const ROLE_LABEL: Record<string, string> = { trainer: 'Trainer', admin: 'Beheerder' };

export function ViewAsSheet({ open, onClose, members, viewedUserId, ownName, ownPhotoURL, onPick }: ViewAsSheetProps) {
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up('md'));
  const groups = [
    { title: 'Sporters', people: members.filter((m) => m.role === 'sporter') },
    { title: 'Team', people: members.filter((m) => m.role !== 'sporter') },
  ];
  // Kopjes alleen als er echt twee groepen zijn; anders is het gewoon één lijst.
  const showHeaders = groups.every((g) => g.people.length > 0);

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
        {groups.map(
          (g) =>
            g.people.length > 0 && (
              <Box key={g.title}>
                {showHeaders && (
                  <ListSubheader disableSticky sx={{ bgcolor: 'transparent', lineHeight: '32px', mt: 0.5 }}>
                    {g.title}
                  </ListSubheader>
                )}
                {g.people.map((m) => (
                  <ListItemButton key={m.userId} selected={m.userId === viewedUserId} onClick={() => onPick(m)}>
                    <ListItemAvatar>
                      <UserAvatar name={m.displayName} photoURL={m.photoURL} size={36} />
                    </ListItemAvatar>
                    <ListItemText primary={m.displayName?.trim() || m.email || m.userId} secondary={ROLE_LABEL[m.role]} />
                  </ListItemButton>
                ))}
              </Box>
            )
        )}
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
