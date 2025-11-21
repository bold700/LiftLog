import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Zorg ervoor dat de document title correct is
if (typeof document !== 'undefined') {
  document.title = 'Van As Personal Training Logs';
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

