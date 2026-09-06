/**
 * Hartslagzones als tabel (Z1–Z5 met bpm en doel), voor elk profiel waarvan leeftijd
 * en eventueel rusthartslag bekend zijn. Gebruikt door de trainer in het profieldialoog
 * op Profielen; het eigen profiel heeft dezelfde tabel in de eigen opmaak.
 */
import { Box, Typography } from '@mui/material';
import type { HeartRateZonesResult } from '../utils/heartRate';

interface HeartRateZonesTableProps {
  zones: HeartRateZonesResult | null;
  /** Tekst als er nog geen zones berekend kunnen worden (geen geboortedatum). */
  emptyText?: string;
}

export function HeartRateZonesTable({ zones, emptyText }: HeartRateZonesTableProps) {
  return (
    <Box sx={{ mt: 2, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 1, mb: 0.5 }}>
        <Typography variant="subtitle2" fontWeight={600}>
          Hartslagzones
        </Typography>
        {zones && (
          <Typography variant="caption" color="text.secondary">
            max {zones.maxHr} bpm (220 − leeftijd)
            {zones.restingHr != null ? ` · rust ${zones.restingHr} bpm` : ''}
          </Typography>
        )}
      </Box>
      {zones ? (
        <>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
            {zones.method === 'karvonen'
              ? 'Berekend met de hartslagreserve (Karvonen): rust + (max − rust) × percentage.'
              : 'Berekend als percentage van de maximale hartslag. Vul de rusthartslag in voor zones op maat (Karvonen).'}
          </Typography>
          <Box sx={{ overflowX: 'auto' }}>
            <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <Box component="thead">
                <Box component="tr" sx={{ textAlign: 'left', color: 'text.secondary', fontSize: 12 }}>
                  <Box component="th" sx={{ py: 0.5, pr: 1, fontWeight: 500 }}>Zone</Box>
                  <Box component="th" sx={{ py: 0.5, pr: 1, fontWeight: 500 }}>bpm</Box>
                  <Box component="th" sx={{ py: 0.5, fontWeight: 500 }}>Waarvoor</Box>
                </Box>
              </Box>
              <Box component="tbody">
                {zones.zones.map((z) => (
                  <Box component="tr" key={z.zone} sx={{ borderTop: '1px solid', borderColor: 'divider' }}>
                    <Box component="td" sx={{ py: 0.75, pr: 1.5, whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                      <Box component="span" sx={{ fontWeight: 600 }}>Z{z.zone}</Box>{' '}
                      <Box component="span" sx={{ color: 'text.secondary' }}>{z.name}</Box>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        {Math.round(z.low * 100)}–{Math.round(z.high * 100)}%
                      </Typography>
                    </Box>
                    <Box component="td" sx={{ py: 0.75, pr: 1, whiteSpace: 'nowrap', verticalAlign: 'top', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                      {z.lowBpm}–{z.highBpm}
                    </Box>
                    <Box component="td" sx={{ py: 0.75, verticalAlign: 'top', fontSize: 12, color: 'text.secondary' }}>
                      {z.purpose}
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            De 220-formule wijkt per persoon tot zo'n 10 bpm af. Een gemeten maximum uit een test is nauwkeuriger.
          </Typography>
        </>
      ) : (
        <Typography variant="body2" color="text.secondary">
          {emptyText ?? 'Vul de geboortedatum in om de hartslagzones te zien. Met rusthartslag worden ze op maat berekend.'}
        </Typography>
      )}
    </Box>
  );
}
