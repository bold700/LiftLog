import { lazy, Suspense, useEffect, useState } from 'react';
import { Box, Tab, Tabs, useMediaQuery, useTheme } from '@mui/material';
import { LoadingBlock } from './layout/LoadingBlock';

// Grafiekpagina's (recharts) pas laden als het tabblad opent.
const SpiergroepenPage = lazy(() => import('./SpiergroepenPage').then((m) => ({ default: m.SpiergroepenPage })));
const OefeningenPage = lazy(() => import('./OefeningenPage').then((m) => ({ default: m.OefeningenPage })));
const MetingenPage = lazy(() => import('./MetingenPage').then((m) => ({ default: m.MetingenPage })));
import { LogsPage } from './LogsPage';
import { LeaderboardPage } from './LeaderboardPage';
import { NutritionInsights } from './NutritionInsights';
import { OverzichtPage } from './OverzichtPage';
import { LEADERBOARD_ENABLED } from '../config/features';
import { tabsOverflowHintSx } from '../theme/tabs';

export const INZICHTEN_SUB = {
  INZICHTEN: 0,
  OEFENINGEN: 1,
  LOGS: 2,
  LEADERBOARD: 3,
  VOEDING: 4,
  METINGEN: 5,
  OVERZICHT: 6,
} as const;

export interface InzichtenPageProps {
  /** Bij navigatie vanaf schema "Gelogd" → toon direct Logs sub-tab */
  initialSubTab?: number | null;
  onConsumeInitialSubTab?: () => void;
  /** Open direct het dialoog "Training log toevoegen" op de Logs-tab (bijv. na FAB → Training log). */
  initialOpenSessionLogDialog?: boolean;
  /** Open op Metingen direct het invoervenster ("+ Log → Meting loggen"). */
  initialOpenMeasurementForm?: boolean;
  onConsumeInitialOpenMeasurementForm?: () => void;
  onConsumeInitialOpenSessionLogDialog?: () => void;
}

export const InzichtenPage = ({
  initialSubTab = null,
  onConsumeInitialSubTab,
  initialOpenSessionLogDialog,
  initialOpenMeasurementForm,
  onConsumeInitialOpenMeasurementForm,
  onConsumeInitialOpenSessionLogDialog,
}: InzichtenPageProps) => {
  const [subTab, setSubTab] = useState<number>(INZICHTEN_SUB.OVERZICHT);
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up('sm'));

  useEffect(() => {
    if (initialSubTab !== null && initialSubTab >= 0 && initialSubTab <= 6) {
      setSubTab(initialSubTab);
      onConsumeInitialSubTab?.();
    }
  }, [initialSubTab, onConsumeInitialSubTab]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
      <Tabs
        value={subTab}
        onChange={(_, v: number) => setSubTab(v)}
        variant={wide ? 'fullWidth' : 'scrollable'}
        // Geen pijltjes: die reserveren links ruimte, en in Figma lopen de tabs vanaf de rand (swipen).
        scrollButtons={false}
        sx={{
          ...(!wide ? tabsOverflowHintSx : {}),
          minHeight: 48,
          mb: 2,
          width: '100%',
          borderBottom: 1,
          borderColor: 'divider',
          '& .MuiTab-root': {
            minHeight: 48,
            minWidth: 'auto',
            px: 2,
            textTransform: 'none',
            fontWeight: 600,
            transition: 'color 0.2s ease',
          },
          '& .MuiTabs-indicator': {
            height: 3,
            borderRadius: '3px 3px 0 0',
            transition: 'left 0.25s cubic-bezier(0.22, 1, 0.36, 1), width 0.25s cubic-bezier(0.22, 1, 0.36, 1)',
          },
        }}
      >
        <Tab value={6} label="Overzicht" id="inzichten-tab-6" aria-controls="inzichten-panel-6" />
        <Tab value={0} label="Spieren" id="inzichten-tab-0" aria-controls="inzichten-panel-0" />
        <Tab value={1} label="Oefeningen" id="inzichten-tab-1" aria-controls="inzichten-panel-1" />
        <Tab value={5} label="Metingen" id="inzichten-tab-5" aria-controls="inzichten-panel-5" />
        <Tab value={4} label="Voeding" id="inzichten-tab-4" aria-controls="inzichten-panel-4" />
        <Tab value={2} label="Logs" id="inzichten-tab-2" aria-controls="inzichten-panel-2" />
        {LEADERBOARD_ENABLED && <Tab value={3} label="Ranglijst" id="inzichten-tab-3" aria-controls="inzichten-panel-3" />}
      </Tabs>
      <Box role="tabpanel" id="inzichten-panel-6" hidden={subTab !== 6} sx={{ flex: 1, minHeight: 0 }}>
        {subTab === 6 && (
          <OverzichtPage
            onOpenMuscles={() => setSubTab(INZICHTEN_SUB.INZICHTEN)}
            onOpenLogs={() => setSubTab(INZICHTEN_SUB.LOGS)}
          />
        )}
      </Box>
      <Box role="tabpanel" id="inzichten-panel-0" hidden={subTab !== 0} sx={{ flex: 1, minHeight: 0 }}>
        {subTab === 0 && (
          <Suspense fallback={<LoadingBlock />}>
            <SpiergroepenPage />
          </Suspense>
        )}
      </Box>
      <Box role="tabpanel" id="inzichten-panel-1" hidden={subTab !== 1} sx={{ flex: 1, minHeight: 0 }}>
        {subTab === 1 && (
          <Suspense fallback={<LoadingBlock />}>
            <OefeningenPage />
          </Suspense>
        )}
      </Box>
      <Box role="tabpanel" id="inzichten-panel-2" hidden={subTab !== 2} sx={{ flex: 1, minHeight: 0 }}>
        {subTab === 2 && (
          <LogsPage
            openSessionLogDialogRequested={initialOpenSessionLogDialog}
            onConsumeOpenSessionLogDialog={onConsumeInitialOpenSessionLogDialog}
          />
        )}
      </Box>
      <Box role="tabpanel" id="inzichten-panel-3" hidden={subTab !== 3} sx={{ flex: 1, minHeight: 0 }}>
        {LEADERBOARD_ENABLED && subTab === 3 && <LeaderboardPage />}
      </Box>
      <Box role="tabpanel" id="inzichten-panel-4" hidden={subTab !== 4} sx={{ flex: 1, minHeight: 0 }}>
        {subTab === 4 && <NutritionInsights />}
      </Box>
      <Box role="tabpanel" id="inzichten-panel-5" hidden={subTab !== 5} sx={{ flex: 1, minHeight: 0 }}>
        {subTab === 5 && (
          <Suspense fallback={<LoadingBlock />}>
            <MetingenPage
              openFormRequested={initialOpenMeasurementForm}
              onConsumeOpenForm={onConsumeInitialOpenMeasurementForm}
            />
          </Suspense>
        )}
      </Box>
    </Box>
  );
};
