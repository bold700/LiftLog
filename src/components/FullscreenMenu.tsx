import { type ReactNode } from 'react';
import {
  Box,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Button,
  Divider,
} from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import PersonRoundedIcon from '@mui/icons-material/PersonRounded';
import FitnessCenterRoundedIcon from '@mui/icons-material/FitnessCenterRounded';
import { useAuth } from '../context/AuthContext';
import { useProfile } from '../context/ProfileContext';

export interface FullscreenMenuNavItem {
  label: string;
  icon: ReactNode;
  tabIndex: number;
}

export interface FullscreenMenuProps {
  onClose: () => void;
  navItems: FullscreenMenuNavItem[];
  onNavigateToTab: (tabIndex: number) => void;
  /** Tab-index voor Beheer (wordt alleen getoond als profiel trainer of admin). */
  beheerTabIndex: number;
}

export const FullscreenMenu = ({ onClose, navItems, onNavigateToTab, beheerTabIndex }: FullscreenMenuProps) => {
  const auth = useAuth();
  const profile = useProfile();
  const isTrainer = profile?.isTrainer ?? false;
  const menuItems: FullscreenMenuNavItem[] = [
    ...navItems,
    ...(isTrainer ? [{ label: 'Beheer', tabIndex: beheerTabIndex, icon: <FitnessCenterRoundedIcon fontSize="small" /> }] : []),
  ];

  const handleLogout = async () => {
    await auth?.logout();
    onClose();
  };

  const handleNav = (tabIndex: number) => {
    onNavigateToTab(tabIndex);
    /* Menu sluit vanzelf: we schakelen naar een andere tab, dus FullscreenMenu wordt niet meer gerenderd. Geen onClose() aanroepen – in App is onClose gelijk aan setActiveTab(TAB_INZICHTEN), wat de navigatie zou overschrijven. */
  };

  return (
    <Box
      className="animate-fade-in-scale"
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: 1100,
        bgcolor: 'background.default',
        display: 'flex',
        flexDirection: 'column',
        pt: 'calc(24px + env(safe-area-inset-top, 0px))',
        pb: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, pb: 2 }}>
        <Typography variant="h6" fontWeight={600}>
          Menu
        </Typography>
        <IconButton aria-label="Menu sluiten" onClick={onClose} size="large">
          <CloseRoundedIcon />
        </IconButton>
      </Box>
      {auth?.user && (
        <Box sx={{ px: 2, pb: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <PersonRoundedIcon fontSize="small" />
            Ingelogd als {auth.user.email}
          </Typography>
        </Box>
      )}
      <List sx={{ flex: 1, px: 1 }}>
        {menuItems.map((item) => (
          <ListItemButton
            key={item.tabIndex}
            onClick={() => handleNav(item.tabIndex)}
            sx={{ borderRadius: 1, mb: 0.5 }}
          >
            <ListItemIcon sx={{ minWidth: 40 }}>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} />
          </ListItemButton>
        ))}
      </List>
      <Divider />
      <Box sx={{ px: 2, py: 2 }}>
        <Button
          fullWidth
          variant="outlined"
          startIcon={<LogoutRoundedIcon />}
          onClick={handleLogout}
          size="medium"
          color="inherit"
        >
          Uitloggen
        </Button>
      </Box>
    </Box>
  );
};
