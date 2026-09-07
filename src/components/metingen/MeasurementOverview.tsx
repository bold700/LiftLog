// Overzichtspanelen bovenaan de Metingen-pagina: huidige waarden, voortgang naar doel + tempo, en de trendgrafieken.
// Alle afgeleide cijfers (laatste/eerste waarde, verschil, per week, doelvoortgang) worden hier uit de metingen berekend.
import { useMemo } from 'react';
import { Box, Typography, LinearProgress } from '@mui/material';
import { OutlineCard } from '../layout';
import { skinfoldSum, type Measurement } from '../../services/measurementService';
import { fatFreeMassKg, bmi } from '../../utils/bodyFat';
import { TrendChart, type TrendPoint } from './TrendChart';
import { PANEL_SX } from './styles';

interface MeasurementOverviewProps {
  /** Metingen, oud → nieuw gesorteerd. */
  items: Measurement[];
  /** Doelgewicht uit het profiel (kg), of null. */
  goalWeight: number | null;
  /** Lengte uit het profiel (cm) voor BMI. */
  heightCm: number | null | undefined;
}

export function MeasurementOverview({ items, goalWeight, heightCm }: MeasurementOverviewProps) {
  const weightPoints = useMemo(
    () => items.filter((m) => m.weightKg != null).map((m) => ({ id: m.id, date: m.date, value: m.weightKg as number })),
    [items]
  );
  const latestWeight = weightPoints.length ? weightPoints[weightPoints.length - 1].value : null;
  const firstWeight = weightPoints.length ? weightPoints[0].value : null;
  const weightDelta = latestWeight != null && firstWeight != null ? Math.round((latestWeight - firstWeight) * 10) / 10 : null;
  const bfPoints = items.filter((m) => m.bodyFatPct != null);
  const latestBf = bfPoints.length ? bfPoints[bfPoints.length - 1] : null;
  const skinPoints = useMemo(
    () =>
      items
        .map((m) => ({ id: m.id, date: m.date, value: skinfoldSum(m) }))
        .filter((p): p is TrendPoint => p.value != null),
    [items]
  );
  const latestSkin = skinPoints.length ? skinPoints[skinPoints.length - 1].value : null;
  // Vetvrije massa uit de laatste meting die gewicht én vetpercentage heeft; BMI uit laatste gewicht + lengte (profiel).
  const latestWithBoth = [...items].reverse().find((m) => m.weightKg != null && m.bodyFatPct != null) ?? null;
  const latestFfm = latestWithBoth ? fatFreeMassKg(latestWithBoth.weightKg as number, latestWithBoth.bodyFatPct as number) : null;
  const firstWithBoth = items.find((m) => m.weightKg != null && m.bodyFatPct != null) ?? null;
  const firstFfm = firstWithBoth ? fatFreeMassKg(firstWithBoth.weightKg as number, firstWithBoth.bodyFatPct as number) : null;
  const ffmDelta = latestFfm != null && firstFfm != null && latestWithBoth !== firstWithBoth ? Math.round((latestFfm - firstFfm) * 10) / 10 : null;
  const latestBmi = latestWeight != null ? bmi(latestWeight, heightCm) : null;
  const firstSkin = skinPoints.length ? skinPoints[0].value : null;
  const skinDelta = latestSkin != null && firstSkin != null ? Math.round((latestSkin - firstSkin) * 10) / 10 : null;

  const wMin = weightPoints.length ? Math.min(...weightPoints.map((p) => p.value)) : 0;
  const wMax = weightPoints.length ? Math.max(...weightPoints.map((p) => p.value)) : 1;
  const sMin = skinPoints.length ? Math.min(...skinPoints.map((p) => p.value)) : 0;
  const sMax = skinPoints.length ? Math.max(...skinPoints.map((p) => p.value)) : 1;

  const toGoal = goalWeight != null && latestWeight != null ? Math.round((latestWeight - goalWeight) * 10) / 10 : null;
  const firstDate = weightPoints.length ? weightPoints[0].date : null;
  const lastDate = weightPoints.length ? weightPoints[weightPoints.length - 1].date : null;
  const spanDays = firstDate && lastDate ? Math.max(1, (Date.parse(lastDate) - Date.parse(firstDate)) / 86400000) : 0;
  const perWeek = weightDelta != null && spanDays >= 1 ? Math.round((weightDelta / (spanDays / 7)) * 10) / 10 : null;
  const goalProgress =
    goalWeight != null && firstWeight != null && latestWeight != null && firstWeight !== goalWeight
      ? Math.max(0, Math.min(100, ((firstWeight - latestWeight) / (firstWeight - goalWeight)) * 100))
      : null;

  return (
    <>
      {/* Huidige waarden */}
      <OutlineCard sx={PANEL_SX}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'repeat(3, 1fr)', sm: 'repeat(5, 1fr)' },
            columnGap: 1,
            rowGap: 2,
            textAlign: 'center',
          }}
        >
          <Box>
            <Typography variant="h6" fontWeight={700}>
              {latestWeight != null ? `${latestWeight} kg` : '—'}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              gewicht{weightDelta != null ? ` (${weightDelta > 0 ? '+' : ''}${weightDelta} kg)` : ''}
            </Typography>
          </Box>
          <Box>
            <Typography variant="h6" fontWeight={700}>
              {latestBf?.bodyFatPct != null ? `${latestBf.bodyFatPct}%` : '—'}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              vetpercentage{latestBf?.bodyFatMethod === 'durnin-womersley' ? ' (berekend)' : ''}
            </Typography>
          </Box>
          <Box>
            <Typography variant="h6" fontWeight={700}>
              {latestFfm != null ? `${latestFfm} kg` : '—'}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              vetvrije massa{ffmDelta != null ? ` (${ffmDelta > 0 ? '+' : ''}${ffmDelta} kg)` : ''}
            </Typography>
          </Box>
          <Box>
            <Typography variant="h6" fontWeight={700}>
              {latestBmi != null ? latestBmi : '—'}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              BMI
            </Typography>
          </Box>
          <Box>
            <Typography variant="h6" fontWeight={700}>
              {latestSkin != null ? `${latestSkin} mm` : '—'}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              plooien{skinDelta != null ? ` (${skinDelta > 0 ? '+' : ''}${skinDelta} mm)` : ''}
            </Typography>
          </Box>
        </Box>
      </OutlineCard>

      {/* Voortgang naar doel + tempo */}
      {(goalWeight != null || perWeek != null) && (
        <OutlineCard sx={PANEL_SX}>
          {goalWeight != null && (
            <>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="caption" color="text.secondary">
                  Naar doel ({goalWeight} kg)
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {toGoal != null ? (Math.abs(toGoal) < 0.05 ? 'behaald 🎉' : `nog ${Math.abs(toGoal)} kg`) : ''}
                </Typography>
              </Box>
              {goalProgress != null && (
                <LinearProgress variant="determinate" value={goalProgress} sx={{ height: 8, borderRadius: 1, mb: perWeek != null ? 1 : 0 }} />
              )}
            </>
          )}
          {perWeek != null && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              Gemiddeld {perWeek > 0 ? '+' : ''}
              {perWeek} kg per week
            </Typography>
          )}
        </OutlineCard>
      )}

      {/* Gewicht-trend */}
      {weightPoints.length >= 2 && (
        <OutlineCard sx={PANEL_SX}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            Gewicht ({wMin}–{wMax} kg)
          </Typography>
          <TrendChart points={weightPoints} unit="kg" goal={goalWeight} />
        </OutlineCard>
      )}

      {/* Huidplooi-trend: de som is betrouwbaarder dan het absolute vetpercentage */}
      {skinPoints.length >= 2 && (
        <OutlineCard sx={PANEL_SX}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            Som huidplooien ({sMin}–{sMax} mm)
          </Typography>
          <TrendChart points={skinPoints} unit="mm" />
        </OutlineCard>
      )}
    </>
  );
}
