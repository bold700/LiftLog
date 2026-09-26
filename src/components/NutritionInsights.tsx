import { useEffect, useMemo, useState } from 'react';
import { Box, Typography, CircularProgress } from '@mui/material';
import { PageLayout, ContentCard } from './layout';
import { useProfile } from '../context/ProfileContext';
import { useViewAs } from '../context/ViewAsContext';
import { getNutritionLogsForUser, type NutritionLog } from '../services/nutritionService';
import { getMeasurementsForUser, latestWeight } from '../services/measurementService';
import { designTokens } from '../theme/designTokens';
import { formatNumber } from '../utils/format';
import { KcalBars } from './nutrition/KcalBars';

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function lastNDays(n: number): string[] {
  const out: string[] = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    out.push(isoDay(d));
  }
  return out;
}

export function NutritionInsights() {
  const profileCtx = useProfile();
  const { viewed } = useViewAs();
  // "Bekijk als": voeding en doel van de gekozen sporter, niet die van de trainer.
  const viewedProfile = viewed.isOther ? (profileCtx?.members ?? []).find((s) => s.userId === viewed.userId) ?? null : profileCtx?.profile;
  const uid = viewed.isOther ? viewed.userId : profileCtx?.profile?.userId ?? '';
  const goal = viewedProfile?.nutritionGoal ?? null;

  const [logs, setLogs] = useState<NutritionLog[]>([]);
  const [weightKg, setWeightKg] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) return;
    setLoading(true);
    Promise.all([getNutritionLogsForUser(uid), getMeasurementsForUser(uid)])
      .then(([l, m]) => {
        setLogs(l);
        setWeightKg(latestWeight(m));
      })
      .catch(() => {
        setLogs([]);
        setWeightKg(null);
      })
      .finally(() => setLoading(false));
  }, [uid]);

  const stats = useMemo(() => {
    const days30 = lastNDays(30);
    const set30 = new Set(days30);
    const byDay: Record<string, { kcal: number; protein: number; carbs: number; fat: number }> = {};
    for (const l of logs) {
      if (!set30.has(l.date)) continue;
      const d = (byDay[l.date] ??= { kcal: 0, protein: 0, carbs: 0, fat: 0 });
      d.kcal += l.kcal;
      d.protein += l.protein;
      d.carbs += l.carbs;
      d.fat += l.fat;
    }
    // Vandaag is nog niet om: halverwege de dag zou die het gemiddelde omlaag trekken en "niet op
    // koers" geven. Vandaag telt pas mee als er verder nog niets is gelogd, en dan zeggen we dat erbij.
    const today = isoDay(new Date());
    const allDates = Object.keys(byDay);
    const fullDays = allDates.filter((d) => d !== today);
    const onlyToday = fullDays.length === 0 && allDates.length > 0;
    const loggedDates = onlyToday ? allDates : fullDays;
    const nLogged = loggedDates.length;
    const todayLogged = allDates.includes(today);
    const sum = loggedDates.reduce(
      (a, k) => ({
        kcal: a.kcal + byDay[k].kcal,
        protein: a.protein + byDay[k].protein,
        carbs: a.carbs + byDay[k].carbs,
        fat: a.fat + byDay[k].fat,
      }),
      { kcal: 0, protein: 0, carbs: 0, fat: 0 }
    );
    const avg = nLogged
      ? {
          kcal: Math.round(sum.kcal / nLogged),
          protein: Math.round((sum.protein / nLogged) * 10) / 10,
          carbs: Math.round((sum.carbs / nLogged) * 10) / 10,
          fat: Math.round((sum.fat / nLogged) * 10) / 10,
        }
      : { kcal: 0, protein: 0, carbs: 0, fat: 0 };

    // Macro-verdeling (% van calorieën)
    const pKcal = sum.protein * 4;
    const cKcal = sum.carbs * 4;
    const fKcal = sum.fat * 9;
    const macroTotal = pKcal + cKcal + fKcal || 1;
    const split = {
      protein: Math.round((pKcal / macroTotal) * 100),
      carbs: Math.round((cKcal / macroTotal) * 100),
      fat: Math.round((fKcal / macroTotal) * 100),
    };

    // Doel-consistentie (kcal binnen ±10%)
    let onTarget = 0;
    if (goal?.kcal) {
      for (const k of loggedDates) {
        const diff = Math.abs(byDay[k].kcal - goal.kcal);
        if (diff <= goal.kcal * 0.1) onTarget++;
      }
    }

    // 14-daagse trend
    const days14 = lastNDays(14);
    const trend = days14.map((d) => ({ date: d, kcal: byDay[d]?.kcal ?? 0 }));

    return { nLogged, onlyToday, todayLogged, avg, split, onTarget, trend };
  }, [logs, goal]);

  if (loading) {
    return (
      <PageLayout maxWidth="none">
        <ContentCard>
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress size={28} />
          </Box>
        </ContentCard>
      </PageLayout>
    );
  }

  if (stats.nLogged === 0) {
    return (
      <PageLayout maxWidth="none">
        <ContentCard>
          <Typography variant="body2" color="text.secondary">
            Nog geen voeding gelogd in de laatste 30 dagen. Log je voeding bij Voeding om hier inzichten te zien.
          </Typography>
        </ContentCard>
      </PageLayout>
    );
  }

  const macroBar = [
    { key: 'protein', label: 'Eiwit', pct: stats.split.protein, color: designTokens.primary },
    { key: 'carbs', label: 'Koolhydraten', pct: stats.split.carbs, color: designTokens.tertiary },
    { key: 'fat', label: 'Vet', pct: stats.split.fat, color: 'secondary.main' },
  ];
  const tile = { bgcolor: designTokens.cardBackground, borderRadius: `${designTokens.cardRadius}px`, p: { xs: 2, md: 3 }, minWidth: 0 } as const;
  const heading = (text: string) => (
    <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>
      {text}
    </Typography>
  );

  return (
    <PageLayout maxWidth="none">
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {stats.onlyToday
          ? 'Alleen vandaag is gelogd, en die dag is nog niet om. Dit is vandaag tot nu toe.'
          : `Op basis van ${stats.nLogged} gelogde ${stats.nLogged === 1 ? 'dag' : 'dagen'} in de afgelopen 30 dagen.${
              stats.todayLogged ? ' Vandaag telt mee zodra de dag voorbij is.' : ''
            }`}
      </Typography>

      {/* Zelfde tegels als Overzicht: het getal groot, eronder wat het is. */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: { xs: 1.25, md: 2 }, mb: { xs: 2, md: 2.5 } }}>
        {[
          { v: formatNumber(stats.avg.kcal, 0), l: 'kcal' },
          { v: `${formatNumber(stats.avg.protein)} g`, l: 'eiwit' },
          { v: `${formatNumber(stats.avg.carbs)} g`, l: 'koolhydraten' },
          { v: `${formatNumber(stats.avg.fat)} g`, l: 'vet' },
        ].map((x) => (
          <Box key={x.l} sx={{ ...tile, px: 2, py: 1.75 }}>
            <Typography sx={{ fontSize: 28, lineHeight: '36px', fontWeight: 500 }} noWrap>
              {x.v}
            </Typography>
            <Typography variant="body2" color="text.secondary" noWrap>
              {x.l}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
              {stats.onlyToday ? 'Vandaag tot nu toe' : 'Gemiddeld per dag'}
            </Typography>
          </Box>
        ))}
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr) minmax(0, 1fr)' }, gap: { xs: 2, md: 2.5 }, alignItems: 'start' }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: { xs: 2, md: 2.5 }, minWidth: 0 }}>
          <Box sx={tile}>
            {heading('Verdeling calorieën')}
            {/* Zelfde balk als "Trainingsbalans" bij Oefeningen: losse afgeronde delen met een kiertje. */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 0.75 }}>
              {macroBar.map((m) => (
                <Typography key={m.key} variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <Box component="span" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: m.color, flexShrink: 0 }} />
                  {`${m.label} ${m.pct}%`}
                </Typography>
              ))}
            </Box>
            <Box sx={{ display: 'flex', gap: '3px', height: 8 }}>
              {macroBar
                .filter((m) => m.pct > 0)
                .map((m) => (
                  <Box key={m.key} sx={{ flex: `${m.pct} 1 0`, minWidth: 0, bgcolor: m.color, borderRadius: 1 }} />
                ))}
            </Box>
            {weightKg ? (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                Eiwit: {formatNumber(stats.avg.protein / weightKg)} g per kg lichaamsgewicht ({formatNumber(weightKg)} kg)
              </Typography>
            ) : null}
          </Box>

          {/* Doel-consistentie; niet op een dag die nog niet om is. */}
          {goal?.kcal && !stats.onlyToday ? (
            <Box sx={tile}>
              {heading('Op koers')}
              <Typography sx={{ fontSize: 28, lineHeight: '36px', fontWeight: 500 }}>
                {stats.onTarget} van {stats.nLogged} {stats.nLogged === 1 ? 'dag' : 'dagen'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Binnen 10% van je doel van {formatNumber(goal.kcal, 0)} kcal.
              </Typography>
            </Box>
          ) : null}
        </Box>

        <Box sx={tile}>
          {heading('Kcal per dag · afgelopen 14 dagen')}
          <KcalBars days={stats.trend} goal={goal?.kcal ?? null} />
        </Box>
      </Box>
    </PageLayout>
  );
}
