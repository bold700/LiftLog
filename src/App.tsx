import { useState, useEffect, useCallback } from 'react';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { lightTheme } from './theme';
import { NavigationBar } from './components/NavigationBar';
import { SpiergroepenPage } from './components/SpiergroepenPage';
import { OefeningenPage } from './components/OefeningenPage';
import { LogsPage } from './components/LogsPage';
import { AddPage } from './components/AddPage';
import { Box } from '@mui/material';
import './styles/material-web-theme.css';

function App() {
  const [activeTab, setActiveTab] = useState(0);

  // Zorg ervoor dat de document title altijd correct is (voor PWA)
  useEffect(() => {
    document.title = 'Van As Personal Training - LiftLog';
  }, []);

  const handleExerciseAdded = useCallback(() => {
    // Na het toevoegen van een oefening, ga naar de Logs pagina
    setActiveTab(2);
  }, []);

  const tabs = [
    { label: 'Spiergroepen', icon: 'fitness_center' },
    { label: 'Oefeningen', icon: 'analytics' },
    { label: 'Logs', icon: 'list' },
    { label: 'Toevoegen', icon: 'add' },
  ];

  const renderPage = () => {
    switch (activeTab) {
      case 0:
        return <SpiergroepenPage />;
      case 1:
        return <OefeningenPage />;
      case 2:
        return <LogsPage />;
      case 3:
        return <AddPage onExerciseAdded={handleExerciseAdded} />;
      default:
        return <SpiergroepenPage />;
    }
  };

  return (
    <ThemeProvider theme={lightTheme}>
      <CssBaseline />
      <Box sx={{ 
        display: 'flex', 
        flexDirection: 'column', 
        minHeight: '100vh',
        pb: 8, // Ruimte voor navigation bar
      }}>
        <Box sx={{ flex: 1, p: 3, overflow: 'auto' }}>
          {renderPage()}
        </Box>
        <NavigationBar value={activeTab} onChange={setActiveTab} tabs={tabs} />
      </Box>
    </ThemeProvider>
  );
}

export default App;
