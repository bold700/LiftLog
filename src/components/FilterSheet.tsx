/**
 * Filters op de telefoon: één filter-icoonknop (met een badge zodra er iets aanstaat) die een M3
 * bottom sheet opent. Op een groot scherm staan de filters gewoon op één regel; dit is alleen voor
 * een smal scherm, waar losse pillen de inhoud naar beneden duwen.
 */
import { useState, type ReactNode } from 'react';
import { Badge, Box, Button, Drawer, IconButton, Typography } from '@mui/material';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import { designTokens } from '../theme/designTokens';

interface FilterSheetProps {
  /** Hoeveel filters afwijken van de standaard; > 0 toont een badge op de knop. */
  activeCount: number;
  /** "Wissen": alles terug naar de standaard. Zonder deze prop geen wisknop. */
  onReset?: () => void;
  children: ReactNode;
  title?: string;
}

export function FilterSheet({ activeCount, onReset, children, title = 'Filters' }: FilterSheetProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton
        onClick={() => setOpen(true)}
        aria-label={activeCount > 0 ? `${title} (${activeCount} actief)` : title}
        sx={{
          width: 40,
          height: 40,
          flexShrink: 0,
          border: `1px solid ${activeCount > 0 ? designTokens.secondaryContainer : designTokens.outline}`,
          bgcolor: activeCount > 0 ? designTokens.secondaryContainer : 'transparent',
          color: activeCount > 0 ? designTokens.onSecondaryContainer : 'text.secondary',
          '&:hover': { bgcolor: activeCount > 0 ? designTokens.secondaryContainer : designTokens.cardBackgroundHigh },
        }}
      >
        <Badge badgeContent={activeCount} color="primary" invisible={activeCount === 0}>
          <TuneRoundedIcon fontSize="small" />
        </Badge>
      </IconButton>
      <Drawer
        anchor="bottom"
        open={open}
        onClose={() => setOpen(false)}
        PaperProps={{
          sx: {
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            bgcolor: designTokens.cardBackground,
            maxHeight: '80vh',
            pb: 'calc(16px + env(safe-area-inset-bottom, 0px))',
          },
        }}
      >
        {/* Sleepgreep zoals een M3 bottom sheet. */}
        <Box sx={{ width: 32, height: 4, borderRadius: 2, bgcolor: designTokens.outline, mx: 'auto', mt: 2, mb: 1, opacity: 0.6 }} />
        <Box sx={{ display: 'flex', alignItems: 'center', px: 3, py: 1 }}>
          <Typography component="h2" sx={{ fontSize: 22, lineHeight: '28px', flex: 1 }}>
            {title}
          </Typography>
          {onReset && activeCount > 0 && (
            <Button onClick={onReset} sx={{ textTransform: 'none' }}>
              Wissen
            </Button>
          )}
        </Box>
        <Box sx={{ px: 3, pt: 1, pb: 2, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>{children}</Box>
        <Box sx={{ px: 3 }}>
          <Button
            variant="contained"
            disableElevation
            fullWidth
            onClick={() => setOpen(false)}
            sx={{ height: 48, borderRadius: '24px', textTransform: 'none', fontWeight: 500 }}
          >
            Klaar
          </Button>
        </Box>
      </Drawer>
    </>
  );
}

/** Eén groep in de sheet: kopje met daaronder de keuzes. */
export function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box role="group" aria-label={label}>
      <Typography sx={{ fontSize: 14, fontWeight: 500, lineHeight: '20px', mb: 1.25 }}>{label}</Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>{children}</Box>
    </Box>
  );
}
