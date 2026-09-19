/**
 * Twee knoppen onder een gegenereerde tekst: openen in WhatsApp, of kopiëren.
 *
 * De app verstuurt niets zelf. Hij schrijft de tekst; wie hem krijgt bepaalt de gebruiker in
 * WhatsApp, waar het gesprek toch al loopt.
 */
import { useState } from 'react';
import { Box, Button, Tooltip } from '@mui/material';
import type { SxProps, Theme } from '@mui/material';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import { copyText, whatsappUrl } from '../utils/share';

const buttonSx = { textTransform: 'none', borderRadius: '24px' } as const;

export function ShareTextButtons({
  text,
  label = 'Deel via WhatsApp',
  sx,
}: {
  text: string;
  label?: string;
  sx?: SxProps<Theme>;
}) {
  const [copied, setCopied] = useState(false);
  const trimmed = text.trim();
  const disabled = trimmed.length === 0;

  const handleCopy = async () => {
    if (await copyText(trimmed)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1, ...sx }}>
      <Button
        component="a"
        href={disabled ? undefined : whatsappUrl(trimmed)}
        target="_blank"
        rel="noopener noreferrer"
        disabled={disabled}
        size="small"
        variant="outlined"
        startIcon={<WhatsAppIcon />}
        sx={buttonSx}
      >
        {label}
      </Button>
      <Tooltip title={copied ? 'Gekopieerd' : 'Kopieer de tekst'}>
        <span>
          <Button
            onClick={() => void handleCopy()}
            disabled={disabled}
            size="small"
            startIcon={copied ? <CheckRoundedIcon /> : <ContentCopyRoundedIcon />}
            sx={buttonSx}
          >
            {copied ? 'Gekopieerd' : 'Kopieer'}
          </Button>
        </span>
      </Tooltip>
    </Box>
  );
}
