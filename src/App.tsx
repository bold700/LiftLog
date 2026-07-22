import { useState, useEffect, useCallback } from 'react';
import { ThemeProvider, CssBaseline, Box, Alert, Button } from '@mui/material';
import { Activity, Dumbbell, UtensilsCrossed, Scale, User, ClipboardList, NotebookPen } from 'lucide-react';
import { lightTheme } from './theme';
import { AppShell, type ShellNavItem, type ShellLogAction } from './components/AppShell';
import { InzichtenPage } from './components/InzichtenPage';
import { AddPage } from './components/AddPage';
import { SchemasPage } from './components/SchemasPage';
import { BeheerPage } from './components/BeheerPage';
import { ProfielPage } from './components/ProfielPage';
import { NutritionPage } from './components/NutritionPage';
import { MetingenPage } from './components/MetingenPage';
import { LeaderboardAutoSync } from './components/LeaderboardAutoSync';
import { AddFromSchemaProvider } from './context/AddFromSchemaContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProfileProvider, useProfile } from './context/ProfileContext';
import { INZICHTEN_SUB } from './components/InzichtenPage';
import { LoginPage } from './components/LoginPage';
import { VerifyEmailScreen } from './components/VerifyEmailScreen';
import { isFirebaseConfigured } from './firebase/config';
import { updateProfile } from './services/profileService';
import './styles/material-web-theme.css';
import './styles/animations.css';

const TAB_INZICHTEN = 1;
const TAB_SCHEMAS = 2;
const TAB_PROFIEL = 3;
const TAB_BEHEER = 4;
const TAB_VOEDING = 5;
const TAB_METINGEN = 6;

function AppContent() {
  const [activeTab, setActiveTab] = useState(TAB_INZICHTEN);
  const [addOpen, setAddOpen] = useState(false);
  const [requestedInsightsSubTab, setRequestedInsightsSubTab] = useState<number | null>(null);
  const [requestedOpenSessionLogDialog, setRequestedOpenSessionLogDialog] = useState(false);
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

  const logActions: ShellLogAction[] = [
    { label: 'Oefening loggen', icon: <Dumbbell className="h-4 w-4" />, onClick: openAdd },
    {
      label: 'Training loggen',
      icon: <NotebookPen className="h-4 w-4" />,
      onClick: () => {
        setActiveTab(TAB_INZICHTEN);
        setRequestedInsightsSubTab(INZICHTEN_SUB.LOGS);
        setRequestedOpenSessionLogDialog(true);
      },
    },
    { label: 'Voeding loggen', icon: <UtensilsCrossed className="h-4 w-4" />, onClick: () => setActiveTab(TAB_VOEDING) },
    { label: 'Meting loggen', icon: <Scale className="h-4 w-4" />, onClick: () => setActiveTab(TAB_METINGEN) },
  ];

  useEffect(() => {
    document.title = 'Van As Personal Training Logs';
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

  const navItems: ShellNavItem[] = [
    { label: 'Inzichten', icon: <Activity className="h-5 w-5" />, tabIndex: TAB_INZICHTEN },
    { label: 'Workouts', icon: <Dumbbell className="h-5 w-5" />, tabIndex: TAB_SCHEMAS },
    { label: 'Voeding', icon: <UtensilsCrossed className="h-5 w-5" />, tabIndex: TAB_VOEDING },
    { label: 'Metingen', icon: <Scale className="h-5 w-5" />, tabIndex: TAB_METINGEN },
    { label: 'Profiel', icon: <User className="h-5 w-5" />, tabIndex: TAB_PROFIEL },
    ...(isTrainer ? [{ label: 'Beheer', icon: <ClipboardList className="h-5 w-5" />, tabIndex: TAB_BEHEER }] : []),
  ];

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
      case TAB_PROFIEL:
        return <ProfielPage />;
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

  const firebaseConfigured = isFirebaseConfigured();
  const showLogin = firebaseConfigured && !auth?.loading && !auth?.user;

  if (showLogin) {
    return <LoginPage />;
  }

  // E-mail/wachtwoord-accounts moeten hun e-mail bevestigen voordat ze de app in mogen
  const needsVerification =
    firebaseConfigured &&
    auth?.user &&
    auth.user.providerData.some((pr) => pr.providerId === 'password') &&
    !auth.user.emailVerified;

  if (needsVerification) {
    return <VerifyEmailScreen />;
  }

  return (
    <ThemeProvider theme={lightTheme}>
      <CssBaseline />
      <ProfileProvider>
      <LeaderboardAutoSync />
      <AddFromSchemaProvider
        onSwitchToAddTab={openAdd}
        onSwitchToSchemasTab={switchToSchemasTab}
        onSwitchToLogsTab={switchToLogsTab}
      >
        <AppShell navItems={navItems} activeTab={activeTab} onNavigate={setActiveTab} logActions={logActions}>
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
        </AppShell>

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
