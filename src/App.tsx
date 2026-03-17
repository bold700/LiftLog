import { useState, useEffect, useCallback, useRef } from 'react';
import { ThemeProvider, CssBaseline, Box, Fab, Menu, MenuItem, Alert, Button } from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import FitnessCenterRoundedIcon from '@mui/icons-material/FitnessCenterRounded';
import EventNoteRoundedIcon from '@mui/icons-material/EventNoteRounded';
import MenuRoundedIcon from '@mui/icons-material/MenuRounded';
import DonutLargeRoundedIcon from '@mui/icons-material/DonutLargeRounded';
import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded';
import PersonRoundedIcon from '@mui/icons-material/PersonRounded';
import { lightTheme } from './theme';
import { NavigationBar } from './components/NavigationBar';
import { FullscreenMenu } from './components/FullscreenMenu';
import { InzichtenPage } from './components/InzichtenPage';
import { AddPage } from './components/AddPage';
import { SchemasPage } from './components/SchemasPage';
import { BeheerPage } from './components/BeheerPage';
import { ProfielPage } from './components/ProfielPage';
import { AddFromSchemaProvider } from './context/AddFromSchemaContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProfileProvider, useProfile } from './context/ProfileContext';
import { INZICHTEN_SUB } from './components/InzichtenPage';
import { LoginPage } from './components/LoginPage';
import { isFirebaseConfigured } from './firebase/config';
import { updateProfile } from './services/profileService';
import './styles/material-web-theme.css';
import './styles/animations.css';

const TAB_MENU = 0;
const TAB_INZICHTEN = 1;
const TAB_SCHEMAS = 2;
const TAB_PROFIEL = 3;
const TAB_BEHEER = 4;

function AppContent() {
  const [activeTab, setActiveTab] = useState(TAB_INZICHTEN);
  const [addOpen, setAddOpen] = useState(false);
  const [requestedInsightsSubTab, setRequestedInsightsSubTab] = useState<number | null>(null);
  const [requestedOpenSessionLogDialog, setRequestedOpenSessionLogDialog] = useState(false);
  const [fabAnchorEl, setFabAnchorEl] = useState<null | HTMLElement>(null);
  const fabMenuOpen = Boolean(fabAnchorEl);
  const profile = useProfile();
  const auth = useAuth();
  // Rol direct uit profiel (zelfde bron als in menu); fallback tot profile?.role uit context
  const role = (profile?.profile?.role ?? profile?.role ?? 'sporter') as 'sporter' | 'trainer' | 'admin';
  const isAdmin = role === 'admin';
  const isTrainer = role === 'trainer' || isAdmin;
  const [approvingSelf, setApprovingSelf] = useState(false);

  const handleSelfApproveTrainer = useCallback(async () => {
    const uid = auth?.user?.uid ?? profile?.profile?.userId;
    if (!uid || !profile) return;
    setApprovingSelf(true);
    try {
      await updateProfile(uid, { role: 'trainer', trainerRequested: false });
      await profile.refreshProfile();
    } finally {
      setApprovingSelf(false);
    }
  }, [auth?.user?.uid, profile]);

  const openAdd = useCallback(() => setAddOpen(true), []);
  const closeAdd = useCallback(() => setAddOpen(false), []);
  const switchToSchemasTab = useCallback(() => setActiveTab(TAB_SCHEMAS), []);
  const switchToLogsTab = useCallback(() => {
    setActiveTab(TAB_INZICHTEN);
    setRequestedInsightsSubTab(INZICHTEN_SUB.LOGS);
  }, []);

  const handleFabClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setFabAnchorEl(event.currentTarget);
  }, []);

  const handleFabMenuClose = useCallback(() => setFabAnchorEl(null), []);

  const handleAddExerciseFromFab = useCallback(() => {
    handleFabMenuClose();
    openAdd();
  }, [handleFabMenuClose, openAdd]);

  const handleAddTrainingLogFromFab = useCallback(() => {
    handleFabMenuClose();
    setActiveTab(TAB_INZICHTEN);
    setRequestedInsightsSubTab(INZICHTEN_SUB.LOGS);
    setRequestedOpenSessionLogDialog(true);
  }, [handleFabMenuClose]);

  useEffect(() => {
    document.title = 'Van As Personal Training Logs';
  }, []);

  const handleExerciseAdded = useCallback(() => {
    setAddOpen(false);
    setActiveTab(TAB_INZICHTEN);
    setRequestedInsightsSubTab(INZICHTEN_SUB.LOGS);
  }, []);

  const tabs = [
    { label: 'Menu', icon: <MenuRoundedIcon fontSize="small" />, tabIndex: TAB_MENU },
    { label: 'Inzichten', icon: <DonutLargeRoundedIcon fontSize="small" />, tabIndex: TAB_INZICHTEN },
    { label: 'Workouts', icon: <CalendarMonthRoundedIcon fontSize="small" />, tabIndex: TAB_SCHEMAS },
    ...(isTrainer ? [{ label: 'Beheer', icon: <FitnessCenterRoundedIcon fontSize="small" />, tabIndex: TAB_BEHEER }] : []),
  ];

  const barIndexForActiveTab = tabs.findIndex((t) => t.tabIndex === activeTab);
  const navBarValue = barIndexForActiveTab >= 0 ? barIndexForActiveTab : 0;
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const handleNavBarChange = useCallback((barIndex: number) => {
    const t = tabsRef.current[barIndex];
    if (t?.tabIndex != null) setActiveTab(t.tabIndex);
  }, []);

  const renderPage = () => {
    switch (activeTab) {
      case TAB_MENU:
        return (
          <FullscreenMenu
            onClose={() => setActiveTab(TAB_INZICHTEN)}
            navItems={[
              { label: 'Inzichten', tabIndex: TAB_INZICHTEN, icon: <DonutLargeRoundedIcon fontSize="small" /> },
              { label: 'Workouts', tabIndex: TAB_SCHEMAS, icon: <CalendarMonthRoundedIcon fontSize="small" /> },
              { label: 'Profiel', tabIndex: TAB_PROFIEL, icon: <PersonRoundedIcon fontSize="small" /> },
            ]}
            onNavigateToTab={setActiveTab}
            beheerTabIndex={TAB_BEHEER}
          />
        );
      case TAB_INZICHTEN:
        return (
          <InzichtenPage
            initialSubTab={requestedInsightsSubTab}
            onConsumeInitialSubTab={() => setRequestedInsightsSubTab(null)}
            initialOpenSessionLogDialog={requestedOpenSessionLogDialog}
            onConsumeInitialOpenSessionLogDialog={() => setRequestedOpenSessionLogDialog(false)}
          />
        );
      case TAB_SCHEMAS:
        return <SchemasPage />;
      case TAB_BEHEER:
        return <BeheerPage />;
      case TAB_PROFIEL:
        return <ProfielPage />;
      default:
        return (
          <InzichtenPage
            initialSubTab={requestedInsightsSubTab}
            onConsumeInitialSubTab={() => setRequestedInsightsSubTab(null)}
            initialOpenSessionLogDialog={requestedOpenSessionLogDialog}
            onConsumeInitialOpenSessionLogDialog={() => setRequestedOpenSessionLogDialog(false)}
          />
        );
    }
  };

  const firebaseConfigured = isFirebaseConfigured();
  const showLogin = firebaseConfigured && !auth?.loading && !auth?.user;

  if (showLogin) {
    return (
      <ThemeProvider theme={lightTheme}>
        <CssBaseline />
        <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
          <LoginPage />
        </Box>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={lightTheme}>
      <CssBaseline />
      <ProfileProvider>
      <AddFromSchemaProvider
        onSwitchToAddTab={openAdd}
        onSwitchToSchemasTab={switchToSchemasTab}
        onSwitchToLogsTab={switchToLogsTab}
      >
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            minHeight: '100vh',
            pb: 10,
          }}
        >
          <Box
            sx={{
              flex: 1,
              p: 3,
              paddingTop: {
                xs: 'calc(24px + env(safe-area-inset-top, 0px))',
                sm: 'calc(24px + env(safe-area-inset-top, 0px))',
              },
              overflow: 'auto',
              scrollbarGutter: 'stable',
            }}
          >
            {profile?.error && (
              <Alert
                severity="error"
                sx={{ mb: 2 }}
                action={
                  <Button color="inherit" size="small" onClick={() => profile?.refreshProfile()}>
                    Opnieuw proberen
                  </Button>
                }
              >
                {profile.error}
              </Alert>
            )}
            {profile?.profile?.trainerRequested && (
              <Alert
                severity="info"
                sx={{ mb: 2 }}
                icon={false}
                action={
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Button
                      variant="outlined"
                      size="small"
                      color="inherit"
                      onClick={handleSelfApproveTrainer}
                      disabled={approvingSelf}
                    >
                      {approvingSelf ? 'Bezig…' : 'Direct trainerrechten'}
                    </Button>
                    <Button color="inherit" size="small" onClick={() => profile?.refreshProfile()}>
                      Vernieuwen
                    </Button>
                  </Box>
                }
              >
                <strong>Je trainer-aanvraag wacht op goedkeuring.</strong> Geen beheerder? Klik op <strong>Direct trainerrechten</strong> om jezelf nu trainer te maken.
              </Alert>
            )}
            {renderPage()}
          </Box>

          {!addOpen && (
            <>
              <Fab
                color="primary"
                aria-label="Log toevoegen"
                sx={{
                  position: 'fixed',
                  bottom: 92,
                  right: 16,
                  zIndex: 1001,
                  transition: 'transform 0.2s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.2s ease',
                  '&:hover': {
                    transform: 'scale(1.08)',
                    boxShadow: 4,
                  },
                  '&:active': {
                    transform: 'scale(0.96)',
                  },
                }}
                onClick={handleFabClick}
              >
                <AddRoundedIcon />
              </Fab>
              <Menu
                anchorEl={fabAnchorEl}
                open={fabMenuOpen}
                onClose={handleFabMenuClose}
                anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
                transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
                slotProps={{
                  paper: {
                    sx: {
                      mt: -2,
                      minWidth: 200,
                    },
                  },
                }}
              >
                <MenuItem onClick={handleAddExerciseFromFab}>
                  <FitnessCenterRoundedIcon sx={{ mr: 1.5 }} fontSize="small" />
                  Oefening toevoegen
                </MenuItem>
                <MenuItem onClick={handleAddTrainingLogFromFab}>
                  <EventNoteRoundedIcon sx={{ mr: 1.5 }} fontSize="small" />
                  Training log toevoegen
                </MenuItem>
              </Menu>
            </>
          )}

          <NavigationBar key={`nav-${role}`} value={navBarValue} onChange={handleNavBarChange} tabs={tabs} />
        </Box>

        {addOpen && (
          <AddPage
            useDialog
            onExerciseAdded={handleExerciseAdded}
            onClose={closeAdd}
          />
        )}
      </AddFromSchemaProvider>
      </ProfileProvider>
    </ThemeProvider>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
