import { useEffect } from 'react';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { lightTheme } from './theme';
import { Statistics } from './components/Statistics';
import { Box } from '@mui/material';
import './styles/material-web-theme.css';

function App() {
  // Zorg ervoor dat de document title altijd correct is (voor PWA)
  useEffect(() => {
    document.title = 'Van As Personal Training - LiftLog';
  }, []);

  return (
    <ThemeProvider theme={lightTheme}>
      <CssBaseline />
      <Box sx={{ 
        display: 'flex', 
        flexDirection: 'column', 
        minHeight: '100vh',
      }}>
        <Box sx={{ flex: 1, p: 3, overflow: 'auto' }}>
          <Statistics />
        </Box>
      </Box>
    </ThemeProvider>
  );
}

export default App;
