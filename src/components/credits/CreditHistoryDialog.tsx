// Creditgeschiedenis van één lid, in een venster. Het lid opent het vanaf Profiel (eigen saldo), de
// staf vanuit Beheer → lid. Bovenaan het saldo en een korte optelling, daaronder elke wijziging.
import { useEffect, useState } from 'react';
import { Alert, Box, CircularProgress, Dialog, DialogContent, Typography, useMediaQuery, useTheme } from '@mui/material';
import { FullScreenDialogTitle } from '../beheer/FullScreenDialogTitle';
import { CreditHistoryList } from './CreditHistoryList';
import { getCreditHistory, type CreditHistory } from '../../services/creditHistoryService';
import { creditsLabel } from '../../utils/creditHistory';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Lid van wie je de geschiedenis bekijkt; leeg = jezelf. */
  userId?: string;
  /** Naam in de titel (staf); zonder naam leest het lid zijn eigen geschiedenis. */
  name?: string;
}

export function CreditHistoryDialog({ open, onClose, userId, name }: Props) {
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up('sm'));
  const [data, setData] = useState<CreditHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const you = !name;

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setData(null);
    setError(null);
    getCreditHistory(userId).then(
      (d) => alive && setData(d),
      (e) => alive && setError(e instanceof Error ? e.message : 'Geschiedenis laden mislukt.')
    );
    return () => {
      alive = false;
    };
  }, [open, userId]);

  const t = data?.totals;
  const summary = t
    ? [
        t.used ? `${creditsLabel(t.used)} ingezet voor lessen` : null,
        t.noShows ? `${t.noShows}× niet gekomen` : null,
        t.refunded ? `${creditsLabel(t.refunded)} terug na afmelden` : null,
        t.expired ? `${creditsLabel(t.expired)} verlopen` : null,
      ].filter(Boolean)
    : [];

  return (
    <Dialog open={open} onClose={onClose} fullScreen={!wide} maxWidth="sm" fullWidth>
      <FullScreenDialogTitle title={name ? `Creditgeschiedenis · ${name}` : 'Mijn credits'} onClose={onClose} />
      <DialogContent sx={{ pt: 2 }}>
        {error && <Alert severity="error">{error}</Alert>}
        {!data && !error && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={24} />
          </Box>
        )}
        {data && (
          <>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Saldo nu: {creditsLabel(data.balance ?? 0)}
            </Typography>
            {summary.length > 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Totaal: {summary.join(' · ')}.
              </Typography>
            )}
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Nieuwste bovenaan. Bij elke les zie je wanneer de credit is ingezet en of {you ? 'je' : 'het lid'} er was.
            </Typography>
            {data.rows.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                Nog geen wijzigingen in credits.
              </Typography>
            ) : (
              <CreditHistoryList rows={data.rows} you={you} />
            )}
            {!!data.opening && (
              <Typography variant="body2" color="text.secondary" sx={{ pt: 1.5, borderTop: 1, borderColor: 'divider' }}>
                Beginsaldo: {creditsLabel(data.opening)} (van vóór de geschiedenis in de app, bijvoorbeeld overgenomen uit het vorige systeem).
              </Typography>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
