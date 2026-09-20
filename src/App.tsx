import { lazy, Suspense, useState, useEffect, useCallback } from 'react';
import { ThemeProvider, CssBaseline, Box, Fab, Menu, MenuItem, Alert, Button } from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import FitnessCenterRoundedIcon from '@mui/icons-material/FitnessCenterRounded';
import GroupRoundedIcon from '@mui/icons-material/GroupRounded';
import EventNoteRoundedIcon from '@mui/icons-material/EventNoteRounded';
import DonutLargeRoundedIcon from '@mui/icons-material/DonutLargeRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded';
import PersonRoundedIcon from '@mui/icons-material/PersonRounded';
import RestaurantRoundedIcon from '@mui/icons-material/RestaurantRounded';
import MonitorWeightRoundedIcon from '@mui/icons-material/MonitorWeightRounded';
import { lightTheme } from './theme';
import { AppShell, type ShellDestination } from './components/AppShell';
import { StudioSwitcher } from './components/StudioSwitcher';
import { InzichtenPage } from './components/InzichtenPage';
import { AddPage } from './components/AddPage';
import { SchemasPage } from './components/SchemasPage';
import { LoadingBlock } from './components/layout/LoadingBlock';
import { NotifyProvider } from './context/NotifyContext';

// Minder vaak gebruikte tabbladen pas laden als ze opengaan (kleinere eerste download).
const BeheerPage = lazy(() => import('./components/BeheerPage').then((m) => ({ default: m.BeheerPage })));
const AssistentPage = lazy(() => import('./components/AssistentPage').then((m) => ({ default: m.AssistentPage })));
const LessenPage = lazy(() => import('./components/LessenPage').then((m) => ({ default: m.LessenPage })));
const ProfielPage = lazy(() => import('./components/ProfielPage').then((m) => ({ default: m.ProfielPage })));
const NutritionPage = lazy(() => import('./components/NutritionPage').then((m) => ({ default: m.NutritionPage })));
const MetingenPage = lazy(() => import('./components/MetingenPage').then((m) => ({ default: m.MetingenPage })));
import { LeaderboardAutoSync } from './components/LeaderboardAutoSync';
import { AddFromSchemaProvider } from './context/AddFromSchemaContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProfileProvider, useProfile } from './context/ProfileContext';
import { ViewAsProvider } from './context/ViewAsContext';
import { BrandingProvider, useBranding } from './context/BrandingContext';
import { I18nProvider, useI18n } from './context/I18nContext';
import { INZICHTEN_SUB } from './components/InzichtenPage';
import { LoginPage } from './components/LoginPage';
import { VerifyEmailScreen } from './components/VerifyEmailScreen';
import { isFirebaseConfigured } from './firebase/config';
import './styles/material-web-theme.css';
import './styles/animations.css';

const TAB_INZICHTEN = 1;
const TAB_SCHEMAS = 2;
const TAB_PROFIEL = 3;
const TAB_BEHEER = 4;
const TAB_VOEDING = 5;
const TAB_METINGEN = 6;
const TAB_ASSISTENT = 7;
const TAB_LESSEN = 9;

/**
 * De actieve tab staat in de URL (#beheer, #lessen, …) en in de browser. Zo brengt een refresh je
 * terug waar je was, en werkt de terug-knop tussen tabs. Zonder hash: de laatst gebruikte tab.
 */
const TAB_SLUGS: Record<number, string> = {
  [TAB_INZICHTEN]: 'inzichten',
  [TAB_SCHEMAS]: 'workouts',
  [TAB_PROFIEL]: 'profiel',
  [TAB_BEHEER]: 'beheer',
  [TAB_VOEDING]: 'voeding',
  [TAB_METINGEN]: 'metingen',
  [TAB_ASSISTENT]: 'assistent',
  [TAB_LESSEN]: 'lessen',
};
const TAB_STORAGE_KEY = 'vorm.tab';

function tabFromSlug(slug: string | null | undefined): number | null {
  if (!slug) return null;
  const found = Object.entries(TAB_SLUGS).find(([, v]) => v === slug);
  return found ? Number(found[0]) : null;
}

function initialTab(): number {
  if (typeof window === 'undefined') return TAB_INZICHTEN;
  const fromHash = tabFromSlug(window.location.hash.replace(/^#/, ''));
  if (fromHash != null) return fromHash;
  try {
    const remembered = tabFromSlug(localStorage.getItem(TAB_STORAGE_KEY));
    if (remembered != null) return remembered;
  } catch {
    /* privémodus */
  }
  return TAB_INZICHTEN;
}

function AppContent() {
  const [activeTab, setActiveTab] = useState(initialTab);

  // Tab → URL en browser; en de terug-knop (hashchange) → tab.
  useEffect(() => {
    const slug = TAB_SLUGS[activeTab];
    if (!slug) return;
    if (window.location.hash !== `#${slug}`) {
      // Eerste keer zonder hash: vervangen, anders staat er een lege stap in de geschiedenis.
      const method = window.location.hash ? 'pushState' : 'replaceState';
      window.history[method](null, '', `#${slug}`);
    }
    try {
      localStorage.setItem(TAB_STORAGE_KEY, slug);
    } catch {
      /* privémodus */
    }
  }, [activeTab]);
  useEffect(() => {
    const onHash = () => {
      const tab = tabFromSlug(window.location.hash.replace(/^#/, ''));
      if (tab != null) setActiveTab(tab);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const [addOpen, setAddOpen] = useState(false);
  const [requestedInsightsSubTab, setRequestedInsightsSubTab] = useState<number | null>(null);
  const [requestedOpenSessionLogDialog, setRequestedOpenSessionLogDialog] = useState(false);
  const [fabAnchorEl, setFabAnchorEl] = useState<null | HTMLElement>(null);
  const fabMenuOpen = Boolean(fabAnchorEl);
  const profile = useProfile();
  const branding = useBranding();
  const { t } = useI18n();
  const auth = useAuth();
  // Rol direct uit profiel (zelfde bron als in menu); fallback tot profile?.role uit context
  const role = (profile?.profile?.role ?? profile?.role ?? 'sporter') as 'sporter' | 'trainer' | 'admin';
  const isAdmin = role === 'admin';
  const isTrainer = role === 'trainer' || isAdmin;
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

  const handleAddNutritionFromFab = useCallback(() => {
    handleFabMenuClose();
    setActiveTab(TAB_VOEDING);
  }, [handleFabMenuClose]);

  const handleAddMeasurementFromFab = useCallback(() => {
    handleFabMenuClose();
    setActiveTab(TAB_METINGEN);
  }, [handleFabMenuClose]);

  useEffect(() => {
  }, []);

  const handleExerciseAdded = useCallback((opts?: { returnToSchema?: boolean }) => {
    setAddOpen(false);
    if (opts?.returnToSchema) {
      // Log kwam uit een lopende workout: blijf in de Workouts-tab (sessie heropent zichzelf)
      setActiveTab(TAB_SCHEMAS);
      return;
    }
    setActiveTab(TAB_INZICHTEN);
    setRequestedInsightsSubTab(INZICHTEN_SUB.LOGS);
  }, []);

  // Vijf bestemmingen, zoals in het ontwerp. Wat daar niet in past staat op een groot scherm in
  // de zijbalk onder een lijn en op de telefoon onder Profiel.
  const destinations: ShellDestination[] = [
    { label: t('nav.insights'), icon: <DonutLargeRoundedIcon fontSize="small" />, tabIndex: TAB_INZICHTEN },
    { label: t('nav.workouts'), icon: <FitnessCenterRoundedIcon fontSize="small" />, tabIndex: TAB_SCHEMAS },
    { label: t('nav.classes'), icon: <CalendarMonthRoundedIcon fontSize="small" />, tabIndex: TAB_LESSEN },
    { label: t('nav.nutrition'), icon: <RestaurantRoundedIcon fontSize="small" />, tabIndex: TAB_VOEDING },
    { label: t('nav.profile'), icon: <PersonRoundedIcon fontSize="small" />, tabIndex: TAB_PROFIEL },
  ];
  const secondary: ShellDestination[] = [
    { label: t('nav.assistant'), icon: <AutoAwesomeRoundedIcon fontSize="small" />, tabIndex: TAB_ASSISTENT },
    { label: t('nav.measurements'), icon: <MonitorWeightRoundedIcon fontSize="small" />, tabIndex: TAB_METINGEN },
    ...(isTrainer ? [{ label: t('nav.admin'), icon: <GroupRoundedIcon fontSize="small" />, tabIndex: TAB_BEHEER }] : []),
  ];
  const handleLogout = useCallback(() => {
    void auth?.logout();
  }, [auth]);

  const renderPage = () => {
    switch (activeTab) {
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
      case TAB_ASSISTENT:
        return <AssistentPage />;
      case TAB_LESSEN:
        return <LessenPage />;
      case TAB_PROFIEL:
        return (
          <ProfielPage onLogout={handleLogout} />
        );
      case TAB_VOEDING:
        return <NutritionPage />;
      case TAB_METINGEN:
        return <MetingenPage />;
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

  return (
      <AddFromSchemaProvider
        onSwitchToAddTab={openAdd}
        onSwitchToSchemasTab={switchToSchemasTab}
        onSwitchToLogsTab={switchToLogsTab}
      >
        <AppShell
          activeTab={activeTab}
          onNavigate={setActiveTab}
          destinations={destinations}
          secondary={secondary}
          onLog={openAdd}
          onLogout={handleLogout}
          brand={{ name: branding?.name ?? 'VORM', logoUrl: branding?.logoUrl ?? null }}
          profileTabIndex={TAB_PROFIEL}
        >
          <Box
            sx={{
              flex: 1,
              p: 3,
              pb: { xs: 12, md: 4 },
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
                  <Button color="inherit" size="small" onClick={() => profile?.refreshProfile()}>
                    Vernieuwen
                  </Button>
                }
              >
                <strong>Je trainer-aanvraag wacht op goedkeuring.</strong> Een beheerder keurt de aanvraag goed onder Beheer.
              </Alert>
            )}
            <StudioSwitcher />
            <Suspense fallback={<LoadingBlock />}>{renderPage()}</Suspense>
          </Box>

          {!addOpen && (
            <>
              <Fab
                aria-label="Log toevoegen"
                sx={{
                  display: { xs: 'inline-flex', md: 'none' },
                  position: 'fixed',
                  bottom: 92,
                  right: 16,
                  zIndex: 1001,
                  bgcolor: 'primary.light',
                  color: 'primary.dark',
                  transition: 'transform 0.2s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.2s ease',
                  '&:hover': {
                    bgcolor: 'primary.light',
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
                  Oefening loggen
                </MenuItem>
                <MenuItem onClick={handleAddTrainingLogFromFab}>
                  <EventNoteRoundedIcon sx={{ mr: 1.5 }} fontSize="small" />
                  Training loggen
                </MenuItem>
                <MenuItem onClick={handleAddNutritionFromFab}>
                  <RestaurantRoundedIcon sx={{ mr: 1.5 }} fontSize="small" />
                  Voeding loggen
                </MenuItem>
                <MenuItem onClick={handleAddMeasurementFromFab}>
                  <MonitorWeightRoundedIcon sx={{ mr: 1.5 }} fontSize="small" />
                  Meting loggen
                </MenuItem>
              </Menu>
            </>
          )}

        </AppShell>

        {addOpen && (
          <AddPage
            useDialog
            onExerciseAdded={handleExerciseAdded}
            onClose={closeAdd}
          />
        )}
      </AddFromSchemaProvider>
  );
}

/**
 * Inloggen, en daarna de providers óm de schil heen.
 *
 * De schil (AppContent) leest profiel en huisstijl uit de context. Stonden de providers in zijn
 * eigen return, dan las hij die contexten buiten de provider: rol "sporter", naam "VORM", geen
 * Beheer in het menu — terwijl de pagina's erbinnen wél de echte rol zagen.
 */
function AuthedApp() {
  const auth = useAuth();
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
      <NotifyProvider>
      <ProfileProvider>
      <I18nProvider>
      <BrandingProvider>
      <BrandedTheme>
      <ViewAsProvider>
      <VerificationGate>
      <LeaderboardAutoSync />
      <AppContent />
      </VerificationGate>
      </ViewAsProvider>
      </BrandedTheme>
      </BrandingProvider>
      </I18nProvider>
      </ProfileProvider>
      </NotifyProvider>
    </ThemeProvider>
  );
}

/** Het thema van de studio over dat van VORM heen, zodra de huisstijl bekend is. */
function BrandedTheme({ children }: { children: React.ReactNode }) {
  const branding = useBranding();
  return (
    <ThemeProvider theme={branding?.theme ?? lightTheme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}

/** Blokkeert de app tot een e-mail/wachtwoord-account is geverifieerd; admin-accounts slaan dit over. */
function VerificationGate({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const profile = useProfile();
  const user = auth?.user;
  const isPassword = user?.providerData.some((pr) => pr.providerId === 'password') ?? false;
  if (user && isPassword && !user.emailVerified) {
    // Wacht tot het profiel geladen is voordat we beslissen (admin-accounts hoeven niet te verifiëren).
    if (profile?.loading && !profile.profile) return null;
    if (!profile?.profile?.createdByAdmin) {
      return <VerifyEmailScreen />;
    }
  }
  return <>{children}</>;
}

function App() {
  return (
    <AuthProvider>
      <AuthedApp />
    </AuthProvider>
  );
}

export default App;
