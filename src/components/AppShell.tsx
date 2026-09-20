/**
 * De schil om alle schermen: op een telefoon de navigatiebalk onderin, op een groot scherm een
 * zijbalk links met "+ Log" en dezelfde bestemmingen. Eén plek voor de navigatie, zodat een
 * scherm zelf niet hoeft te weten op welk apparaat het staat.
 *
 * Volgt het Figma-ontwerp (Vorm): vijf bestemmingen, trainers krijgen Beheer erbij, en wat niet
 * in de balk past (Assistent, Metingen, Beheer voor wie het heeft) staat in de zijbalk onder een
 * lijn en op de telefoon in het menu (⋮) van de bovenbalk, naast de avatar. Die bovenbalk is de
 * "Top bar" uit het ontwerp: de titel van het scherm, het menu en de avatar, op elk scherm.
 */
import { useState, type MouseEvent, type ReactNode } from 'react';
import { Box, Button, Divider, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Menu, MenuItem, Typography, useMediaQuery, useTheme } from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded';
import { NavigationBar } from './NavigationBar';
import { UserAvatar } from './UserAvatar';
import { useI18n } from '../context/I18nContext';
import { useProfile } from '../context/ProfileContext';
import { designTokens } from '../theme/designTokens';

export interface ShellDestination {
  label: string;
  icon: ReactNode;
  tabIndex: number;
}

interface AppShellProps {
  activeTab: number;
  onNavigate: (tabIndex: number) => void;
  /** De vijf (of zes) hoofdbestemmingen, in volgorde. */
  destinations: ShellDestination[];
  /** Wat op een groot scherm onder de lijn staat en op de telefoon onder Profiel. */
  secondary: ShellDestination[];
  onLog: () => void;
  onLogout: () => void;
  /** Naam en logo van de studio; zonder huisstijl is dat VORM. */
  brand: { name: string; logoUrl: string | null };
  /** Tab van Profiel: waar de avatar in de bovenbalk heen gaat. */
  profileTabIndex?: number;
  children: ReactNode;
}

/**
 * Bovenbalk op de telefoon (ontwerp "Top bar"): titel van het scherm, menu met de secundaire
 * bestemmingen en uitloggen, en de avatar naar Profiel. Plakt bovenaan, onder de statusbalk.
 */
function MobileTopBar({ title, secondary, activeTab, onNavigate, onLogout, profileTabIndex }: { title: string; secondary: ShellDestination[]; activeTab: number; onNavigate: (tabIndex: number) => void; onLogout: () => void; profileTabIndex?: number }) {
  const { t } = useI18n();
  const profile = useProfile();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const me = profile?.profile ?? null;
  const open = (e: MouseEvent<HTMLElement>) => setAnchor(e.currentTarget);
  const close = () => setAnchor(null);
  return (
    <Box
      component="header"
      sx={{
        position: 'sticky',
        top: 'env(safe-area-inset-top, 0px)',
        zIndex: (th) => th.zIndex.appBar,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        minHeight: 56,
        px: 2.5,
        py: 0.5,
        bgcolor: 'background.default',
      }}
    >
      <Typography component="h1" variant="h6" sx={{ fontWeight: 600, flex: 1, minWidth: 0 }} noWrap>
        {title}
      </Typography>
      <IconButton aria-label={t('profile.more')} aria-haspopup="menu" aria-expanded={anchor ? 'true' : undefined} onClick={open} edge="end" sx={{ color: 'text.secondary' }}>
        <MoreVertRoundedIcon />
      </IconButton>
      {profileTabIndex != null && (
        <Box component="button" type="button" aria-label={t('nav.profile')} onClick={() => onNavigate(profileTabIndex)} sx={{ p: 0, border: 0, bgcolor: 'transparent', cursor: 'pointer', borderRadius: '50%', display: 'flex' }}>
          <UserAvatar name={me?.displayName} photoURL={me?.photoURL} size={32} />
        </Box>
      )}
      <Menu anchorEl={anchor} open={!!anchor} onClose={close} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }} slotProps={{ paper: { sx: { minWidth: 220, borderRadius: 1 } } }}>
        {secondary.map((d) => (
          <MenuItem
            key={d.tabIndex}
            selected={d.tabIndex === activeTab}
            onClick={() => {
              close();
              onNavigate(d.tabIndex);
            }}
            sx={{ minHeight: 48 }}
          >
            <ListItemIcon>{d.icon}</ListItemIcon>
            <ListItemText primary={d.label} />
          </MenuItem>
        ))}
        {secondary.length > 0 && <Divider />}
        <MenuItem
          onClick={() => {
            close();
            onLogout();
          }}
          sx={{ minHeight: 48, color: 'text.secondary' }}
        >
          <ListItemIcon sx={{ color: 'inherit' }}>
            <LogoutRoundedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary={t('nav.signOut')} />
        </MenuItem>
      </Menu>
    </Box>
  );
}

const railItemSx = (active: boolean) => ({
  borderRadius: '999px',
  mb: 0.5,
  px: 2,
  py: 1,
  bgcolor: active ? designTokens.secondaryContainer : 'transparent',
  color: active ? designTokens.onSecondaryContainer : 'text.primary',
  '& .MuiListItemIcon-root': { color: 'inherit', minWidth: 36 },
  '& .MuiListItemText-primary': { fontWeight: active ? 600 : 500, fontSize: 14 },
  '&:hover': { bgcolor: active ? designTokens.secondaryContainer : 'rgba(0,0,0,0.04)' },
});

export function AppShell({ activeTab, onNavigate, destinations, secondary, onLog, onLogout, brand, profileTabIndex, children }: AppShellProps) {
  const theme = useTheme();
  const { t } = useI18n();
  const wide = useMediaQuery(theme.breakpoints.up('md'));

  if (!wide) {
    const barIndex = Math.max(0, destinations.findIndex((d) => d.tabIndex === activeTab));
    const title = [...destinations, ...secondary].find((d) => d.tabIndex === activeTab)?.label ?? brand.name;
    return (
      <>
        {/* Op een telefoon scrolt de inhoud onder de statusbalk door; deze strook houdt dat vlak dicht,
            zodat een paginatitel niet half achter de klok of de notch verdwijnt. */}
        <Box
          aria-hidden
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            height: 'env(safe-area-inset-top, 0px)',
            bgcolor: 'background.default',
            zIndex: (th) => th.zIndex.appBar,
            pointerEvents: 'none',
          }}
        />
        <MobileTopBar title={title} secondary={secondary} activeTab={activeTab} onNavigate={onNavigate} onLogout={onLogout} profileTabIndex={profileTabIndex} />
        {children}
        <NavigationBar
          value={barIndex}
          onChange={(i) => destinations[i] && onNavigate(destinations[i].tabIndex)}
          tabs={destinations.map((d) => ({ label: d.label, icon: d.icon }))}
        />
      </>
    );
  }

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Box
        component="nav"
        aria-label={t('nav.mainNavigation')}
        sx={{
          width: designTokens.railWidth,
          flexShrink: 0,
          position: 'sticky',
          top: 0,
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          px: 1.5,
          pt: 3,
          pb: 2,
          bgcolor: 'background.default',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 2, pb: 2, minHeight: 36 }}>
          {brand.logoUrl && <Box component="img" src={brand.logoUrl} alt="" sx={{ height: 32, width: 'auto', maxWidth: 120, objectFit: 'contain' }} />}
          <Typography sx={{ fontWeight: 700, fontSize: 20, letterSpacing: '-0.3px', lineHeight: 1.1 }} noWrap>
            {brand.name}
          </Typography>
        </Box>
        <Button
          onClick={onLog}
          startIcon={<AddRoundedIcon />}
          sx={{
            mx: 1,
            mb: 2.5,
            alignSelf: 'flex-start',
            px: 2,
            py: 1.25,
            borderRadius: 4,
            bgcolor: designTokens.primaryContainer,
            color: designTokens.onPrimaryContainer,
            fontWeight: 600,
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            '&:hover': { bgcolor: designTokens.primaryContainer, boxShadow: '0 2px 6px rgba(0,0,0,0.25)' },
          }}
        >
          {t('nav.log')}
        </Button>
        <List disablePadding>
          {destinations.map((d) => (
            <ListItemButton key={d.tabIndex} selected={d.tabIndex === activeTab} onClick={() => onNavigate(d.tabIndex)} sx={railItemSx(d.tabIndex === activeTab)}>
              <ListItemIcon>{d.icon}</ListItemIcon>
              <ListItemText primary={d.label} />
            </ListItemButton>
          ))}
        </List>
        {secondary.length > 0 && (
          <>
            <Divider sx={{ my: 1.5, mx: 2 }} />
            <List disablePadding>
              {secondary.map((d) => (
                <ListItemButton key={d.tabIndex} selected={d.tabIndex === activeTab} onClick={() => onNavigate(d.tabIndex)} sx={railItemSx(d.tabIndex === activeTab)}>
                  <ListItemIcon>{d.icon}</ListItemIcon>
                  <ListItemText primary={d.label} />
                </ListItemButton>
              ))}
            </List>
          </>
        )}
        <Box sx={{ flex: 1 }} />
        <Button onClick={onLogout} startIcon={<LogoutRoundedIcon />} color="inherit" sx={{ alignSelf: 'flex-start', mx: 1, color: 'text.secondary' }}>
          {t('nav.signOut')}
        </Button>
      </Box>
      <Box component="main" sx={{ flex: 1, minWidth: 0, px: 5, pt: 2 }}>
        {children}
      </Box>
    </Box>
  );
}
