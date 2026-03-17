import { useEffect, useState } from 'react';
import { Box, Tab, Tabs } from '@mui/material';
import { SpiergroepenPage } from './SpiergroepenPage';
import { OefeningenPage } from './OefeningenPage';
import { LogsPage } from './LogsPage';

export const INZICHTEN_SUB = {
  INZICHTEN: 0,
  OEFENINGEN: 1,
  LOGS: 2,
} as const;

export interface InzichtenPageProps {
  /** Bij navigatie vanaf schema "Gelogd" → toon direct Logs sub-tab */
  initialSubTab?: number | null;
  onConsumeInitialSubTab?: () => void;
  /** Open direct het dialoog "Training log toevoegen" op de Logs-tab (bijv. na FAB → Training log). */
  initialOpenSessionLogDialog?: boolean;
  onConsumeInitialOpenSessionLogDialog?: () => void;
}

export const InzichtenPage = ({
  initialSubTab = null,
  onConsumeInitialSubTab,
  initialOpenSessionLogDialog,
  onConsumeInitialOpenSessionLogDialog,
}: InzichtenPageProps) => {
  const [subTab, setSubTab] = useState(0);

  useEffect(() => {
    if (initialSubTab !== null && initialSubTab >= 0 && initialSubTab <= 2) {
      setSubTab(initialSubTab);
      onConsumeInitialSubTab?.();
    }
  }, [initialSubTab, onConsumeInitialSubTab]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
      <Tabs
        value={subTab}
        onChange={(_, v: number) => setSubTab(v)}
        variant="fullWidth"
        sx={{
          minHeight: 48,
          mb: 2,
          '& .MuiTab-root': {
            minHeight: 48,
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
        <Tab label="Inzichten" id="inzichten-tab-0" aria-controls="inzichten-panel-0" />
        <Tab label="Oefeningen" id="inzichten-tab-1" aria-controls="inzichten-panel-1" />
        <Tab label="Logs" id="inzichten-tab-2" aria-controls="inzichten-panel-2" />
      </Tabs>
      <Box role="tabpanel" id="inzichten-panel-0" hidden={subTab !== 0} sx={{ flex: 1, minHeight: 0 }}>
        {subTab === 0 && <SpiergroepenPage />}
      </Box>
      <Box role="tabpanel" id="inzichten-panel-1" hidden={subTab !== 1} sx={{ flex: 1, minHeight: 0 }}>
        {subTab === 1 && <OefeningenPage />}
      </Box>
      <Box role="tabpanel" id="inzichten-panel-2" hidden={subTab !== 2} sx={{ flex: 1, minHeight: 0 }}>
        {subTab === 2 && (
          <LogsPage
            openSessionLogDialogRequested={initialOpenSessionLogDialog}
            onConsumeOpenSessionLogDialog={onConsumeInitialOpenSessionLogDialog}
          />
        )}
      </Box>
    </Box>
  );
};
