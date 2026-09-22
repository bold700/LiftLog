/**
 * De schil om alle schermen: op een telefoon de navigatiebalk onderin, op een groot scherm een
 * zijbalk links met "+ Log" en dezelfde bestemmingen. Eén plek voor de navigatie, zodat een
 * scherm zelf niet hoeft te weten op welk apparaat het staat.
 *
 * Volgt het Figma-ontwerp (Vorm): vijf bestemmingen, trainers krijgen Beheer erbij, en wat niet
 * in de balk past (Assistent, Metingen, Beheer voor wie het heeft) staat in de zijbalk onder een
 * lijn en op de telefoon in een zwevende toolbar (Material 3 "floating toolbar") boven de
 * navigatiebalk, naast de "+"-knop. De bovenbalk is de "Top bar" uit het ontwerp: de titel van
 * het scherm en de avatar naar Profiel.
 */
import { useState, type ReactNode } from 'react';
import { Box, Button, Divider, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Menu, MenuItem, Tooltip, Typography, useMediaQuery, useTheme } from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import PersonRoundedIcon from '@mui/icons-material/PersonRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import SupervisorAccountRoundedIcon from '@mui/icons-material/SupervisorAccountRounded';
import { NavigationBar } from './NavigationBar';
import { UserAvatar } from './UserAvatar';
import { ViewAsSheet } from './ViewAsSheet';
import { useI18n } from '../context/I18nContext';
import { useProfile } from '../context/ProfileContext';
import { useViewAs } from '../context/ViewAsContext';
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
 * Avatar met menu ("Naar profiel" / "Bekijk als"): de knop in de bovenbalk op de telefoon, en
 * boven "Uitloggen" in de zijbalk op een groot scherm — zelfde gedrag, andere plek.
 */
function ProfileMenuButton({
  onNavigate,
  profileTabIndex,
  showName,
}: {
  onNavigate: (tabIndex: number) => void;
  profileTabIndex: number;
  /** Toont naam naast de avatar, in dezelfde stijl/uitlijning als de andere zijbalk-items; zonder is het alleen de cirkel (bovenbalk). */
  showName?: boolean;
}) {
  const { t } = useI18n();
  const profile = useProfile();
  const me = profile?.profile ?? null;
  const { viewed, mayViewOthers, setViewing } = useViewAs();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const ariaLabel = viewed.isOther ? `${t('nav.profile')} · ${t('viewAs.viewingAs', { name: viewed.name })}` : t('nav.profile');
  const avatarWithBadge = (
    <Box sx={{ position: 'relative', display: 'flex', flexShrink: 0 }}>
      <UserAvatar name={viewed.isOther ? viewed.name : me?.displayName} photoURL={viewed.isOther ? viewed.photoURL : me?.photoURL} size={showName ? 28 : 32} />
      {viewed.isOther && (
        <SupervisorAccountRoundedIcon
          sx={{
            position: 'absolute',
            bottom: -3,
            right: -3,
            fontSize: 16,
            color: designTokens.onPrimary,
            bgcolor: designTokens.primary,
            borderRadius: '50%',
            border: '1.5px solid',
            borderColor: 'background.default',
            p: 0.1,
          }}
        />
      )}
    </Box>
  );

  // Op de zijbalk moet dit knopje er precies zo uitzien als Inzichten/Workouts/…: zelfde
  // padding, icoonbreedte en tekststijl (railItemSx), anders springt het eruit als "iets anders".
  const avatarButton = showName ? (
    <ListItemButton onClick={(e) => setMenuAnchor(e.currentTarget)} aria-label={ariaLabel} sx={railItemSx(false)}>
      <ListItemIcon>{avatarWithBadge}</ListItemIcon>
      <ListItemText
        primary={viewed.isOther ? viewed.name : me?.displayName || me?.email || t('nav.profile')}
        secondary={viewed.isOther ? t('viewAs.viewingAs', { name: viewed.name }) : undefined}
        primaryTypographyProps={{ noWrap: true }}
        secondaryTypographyProps={{ noWrap: true }}
      />
    </ListItemButton>
  ) : (
    <Box
      component="button"
      type="button"
      aria-label={ariaLabel}
      onClick={(e) => setMenuAnchor(e.currentTarget)}
      sx={{ position: 'relative', p: 0, border: 0, bgcolor: 'transparent', cursor: 'pointer', borderRadius: '50%', display: 'flex' }}
    >
      {avatarWithBadge}
    </Box>
  );

  return (
    <>
      {avatarButton}
      <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}>
        <MenuItem
          onClick={() => {
            setMenuAnchor(null);
            onNavigate(profileTabIndex);
          }}
        >
          <ListItemIcon>
            <PersonRoundedIcon fontSize="small" />
          </ListItemIcon>
          {t('nav.profile')}
        </MenuItem>
        {mayViewOthers && (
          <MenuItem
            onClick={() => {
              setMenuAnchor(null);
              setPickerOpen(true);
            }}
          >
            <ListItemIcon>
              <VisibilityRoundedIcon fontSize="small" />
            </ListItemIcon>
            {viewed.isOther ? t('viewAs.viewingAs', { name: viewed.name }) : t('viewAs.menuLabel')}
          </MenuItem>
        )}
      </Menu>
      {mayViewOthers && (
        <ViewAsSheet
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          sporters={profile?.allSporters ?? []}
          viewedUserId={viewed.isOther ? viewed.userId : ''}
          ownName={me?.displayName || me?.email || 'Mijzelf'}
          ownPhotoURL={me?.photoURL}
          onPick={(sporter) => {
            setViewing(sporter ? { userId: sporter.userId, name: sporter.displayName?.trim() || sporter.email || 'Sporter', photoURL: sporter.photoURL } : null);
            setPickerOpen(false);
          }}
        />
      )}
    </>
  );
}

/**
 * Bovenbalk op de telefoon (ontwerp "Top bar"): titel van het scherm en de avatar naar Profiel.
 * Plakt bovenaan, onder de statusbalk.
 */
function MobileTopBar({ title, onNavigate, profileTabIndex }: { title: string; onNavigate: (tabIndex: number) => void; profileTabIndex?: number }) {
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
      {profileTabIndex != null && <ProfileMenuButton onNavigate={onNavigate} profileTabIndex={profileTabIndex} />}
    </Box>
  );
}

/** Hoogte van de navigatiebalk plus de marge erboven: waar de "+"-knop en de toolbar op rusten (App.tsx: FAB op bottom 92). */
const TOOLBAR_BOTTOM = 92;

/**
 * Zwevende toolbar (Material 3 floating toolbar, standaardkleur): 64 hoog, volledig rond,
 * 8 binnenmarge, iconknoppen van 48 met 4 ertussen. Draagt de secundaire bestemmingen; de
 * actieve krijgt de secondary-container-cirkel, zoals in de navigatiebalk.
 */
function FloatingToolbar({ items, activeTab, onNavigate }: { items: ShellDestination[]; activeTab: number; onNavigate: (tabIndex: number) => void }) {
  const { t } = useI18n();
  if (items.length === 0) return null;
  return (
    <Box
      component="nav"
      aria-label={t('nav.shortcuts')}
      sx={{
        position: 'fixed',
        bottom: TOOLBAR_BOTTOM,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1001,
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        p: 1,
        height: 64,
        borderRadius: 32,
        bgcolor: designTokens.cardBackground,
        boxShadow: '0 2px 6px rgba(0,0,0,0.18), 0 1px 2px rgba(0,0,0,0.12)',
      }}
    >
      {items.map((d) => {
        const active = d.tabIndex === activeTab;
        return (
          <Tooltip key={d.tabIndex} title={d.label} enterTouchDelay={400}>
            <IconButton
              aria-label={d.label}
              aria-current={active ? 'page' : undefined}
              onClick={() => onNavigate(d.tabIndex)}
              sx={{
                width: 48,
                height: 48,
                bgcolor: active ? designTokens.secondaryContainer : 'transparent',
                color: active ? designTokens.onSecondaryContainer : 'text.secondary',
                '&:hover': { bgcolor: active ? designTokens.secondaryContainer : 'rgba(0,0,0,0.06)' },
              }}
            >
              {d.icon}
            </IconButton>
          </Tooltip>
        );
      })}
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
        <MobileTopBar title={title} onNavigate={onNavigate} profileTabIndex={profileTabIndex} />
        {children}
        <FloatingToolbar items={secondary} activeTab={activeTab} onNavigate={onNavigate} />
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
        {profileTabIndex != null && <ProfileMenuButton onNavigate={onNavigate} profileTabIndex={profileTabIndex} showName />}
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
