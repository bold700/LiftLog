// Lijst met creditmutaties: per regel wat er gebeurde (les en datum), wanneer en door wie, hoe de
// les afliep, het aantal credits en het saldo daarna. Voor het lid zelf, Beheer → lid en het
// studio-overzicht (dan met de naam van het lid erbij).
import { Box, Chip, Typography } from '@mui/material';
import type { CreditHistoryRow } from '../../services/creditHistoryService';
import { creditRowDetail, creditRowTitle, deltaLabel, OUTCOME_COLOR, OUTCOME_LABEL } from '../../utils/creditHistory';

interface Props {
  rows: CreditHistoryRow[];
  /** Het lid leest zijn eigen geschiedenis ("door jezelf"). */
  you?: boolean;
  /** Studio-overzicht: naam van het lid bovenaan elke regel. */
  showMember?: boolean;
  /** Saldo na elke regel tonen (niet in het studio-overzicht met filters, daar klopt de volgorde per lid niet). */
  showBalance?: boolean;
}

export function CreditHistoryList({ rows, you = false, showMember = false, showBalance = true }: Props) {
  return (
    <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {rows.map((r) => {
        const outcome = r.outcome ? OUTCOME_LABEL[r.outcome] : null;
        return (
          <Box
            component="li"
            key={r.id}
            sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', py: 1.25, borderBottom: 1, borderColor: 'divider', '&:last-of-type': { borderBottom: 0 } }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              {showMember && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 600 }}>
                  {r.userName}
                </Typography>
              )}
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {creditRowTitle(r)}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                {creditRowDetail(r, you)}
              </Typography>
              {outcome && r.outcome && (
                <Chip size="small" variant="outlined" color={OUTCOME_COLOR[r.outcome]} label={outcome} sx={{ mt: 0.5, height: 22 }} />
              )}
            </Box>
            <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
              <Typography
                variant="body2"
                sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: r.delta > 0 ? 'success.main' : r.delta < 0 ? 'text.primary' : 'text.secondary' }}
              >
                {deltaLabel(r.delta)}
              </Typography>
              {showBalance && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontVariantNumeric: 'tabular-nums' }}>
                  saldo {r.balanceAfter.toLocaleString('nl-NL')}
                </Typography>
              )}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
