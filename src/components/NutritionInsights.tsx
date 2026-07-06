import { useEffect, useMemo, useState } from 'react';
import { Box, Typography, Card, CardContent, CircularProgress } from '@mui/material';
import { PageLayout, ContentCard } from './layout';
import { useProfile } from '../context/ProfileContext';
import { getNutritionLogsForUser, type NutritionLog } from '../services/nutritionService';
import { getMeasurementsForUser, latestWeight } from '../services/measurementService';

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
  const uid = profileCtx?.profile?.userId ?? '';
  const goal = profileCtx?.profile?.nutritionGoal ?? null;

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
    const loggedDates = Object.keys(byDay);
    const nLogged = loggedDates.length;
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
    const maxKcal = Math.max(1, ...trend.map((t) => t.kcal), goal?.kcal ?? 0);

    return { nLogged, avg, split, onTarget, trend, maxKcal };
  }, [logs, goal]);

  if (loading) {
    return (
      <PageLayout>
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
      <PageLayout>
        <ContentCard>
          <Typography variant="h6" fontWeight={600} sx={{ mb: 1 }}>
            Voedingspatroon
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Nog geen voeding gelogd in de laatste 30 dagen. Log je voeding via Menu → Voeding om hier inzichten te zien.
          </Typography>
        </ContentCard>
      </PageLayout>
    );
  }

  const macroBar = [
    { key: 'protein', label: 'Eiwit', pct: stats.split.protein, color: 'success.main' },
    { key: 'carbs', label: 'Koolhydraten', pct: stats.split.carbs, color: 'info.main' },
    { key: 'fat', label: 'Vet', pct: stats.split.fat, color: 'warning.main' },
  ];

  return (
    <PageLayout>
      <ContentCard>
        <Typography variant="h6" fontWeight={600} sx={{ mb: 0.5 }}>
          Voedingspatroon
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Op basis van {stats.nLogged} geloggde {stats.nLogged === 1 ? 'dag' : 'dagen'} in de laatste 30 dagen.
        </Typography>

        {/* Gemiddelde per dag */}
        <Card sx={{ backgroundColor: 'transparent', border: '1px solid', borderColor: 'divider', boxShadow: 'none', borderRadius: 2, mb: 2 }}>
          <CardContent sx={{ '&:last-child': { pb: 2 } }}>
            <Typography variant="caption" color="text.secondary">
              Gemiddeld per geloggde dag
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center', flexWrap: 'wrap', gap: 1, mt: 1 }}>
              {[
                { v: stats.avg.kcal, l: 'kcal' },
                { v: `${stats.avg.protein} g`, l: 'eiwit' },
                { v: `${stats.avg.carbs} g`, l: 'koolh.' },
                { v: `${stats.avg.fat} g`, l: 'vet' },
              ].map((x) => (
                <Box key={x.l}>
                  <Typography variant="h6" fontWeight={700}>
                    {x.v}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {x.l}
                  </Typography>
                </Box>
              ))}
            </Box>
            {weightKg ? (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 1.5 }}>
                ≈ {Math.round((stats.avg.protein / weightKg) * 10) / 10} g eiwit per kg lichaamsgewicht ({weightKg} kg)
              </Typography>
            ) : null}
          </CardContent>
        </Card>

        {/* Macro-verdeling */}
        <Card sx={{ backgroundColor: 'transparent', border: '1px solid', borderColor: 'divider', boxShadow: 'none', borderRadius: 2, mb: 2 }}>
          <CardContent sx={{ '&:last-child': { pb: 2 } }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Verdeling calorieën
            </Typography>
            <Box sx={{ display: 'flex', height: 14, borderRadius: 1, overflow: 'hidden', mb: 1 }}>
              {macroBar.map((m) => (
                <Box key={m.key} sx={{ width: `${m.pct}%`, bgcolor: m.color }} />
              ))}
            </Box>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              {macroBar.map((m) => (
                <Box key={m.key} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: '2px', bgcolor: m.color }} />
                  <Typography variant="caption" color="text.secondary">
                    {m.label} {m.pct}%
                  </Typography>
                </Box>
              ))}
            </Box>
          </CardContent>
        </Card>

        {/* Doel-consistentie */}
        {goal?.kcal ? (
          <Card sx={{ backgroundColor: 'transparent', border: '1px solid', borderColor: 'divider', boxShadow: 'none', borderRadius: 2, mb: 2 }}>
            <CardContent sx={{ '&:last-child': { pb: 2 } }}>
              <Typography variant="caption" color="text.secondary">
                Op koers (kcal binnen 10% van je doel van {goal.kcal})
              </Typography>
              <Typography variant="h6" fontWeight={700}>
                {stats.onTarget} / {stats.nLogged} dagen
              </Typography>
            </CardContent>
          </Card>
        ) : null}

        {/* 14-daagse kcal-trend */}
        <Card sx={{ backgroundColor: 'transparent', border: '1px solid', borderColor: 'divider', boxShadow: 'none', borderRadius: 2 }}>
          <CardContent sx={{ '&:last-child': { pb: 2 } }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              kcal per dag (14 dagen)
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'stretch', gap: 0.5, height: 110 }}>
              {stats.trend.map((t) => (
                <Box key={t.date} sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', gap: 0.5, minWidth: 0, height: '100%' }}>
                  <Box
                    title={`${t.date}: ${t.kcal} kcal`}
                    sx={{
                      width: '78%',
                      height: `${Math.round((t.kcal / stats.maxKcal) * 100)}%`,
                      minHeight: t.kcal > 0 ? 2 : 0,
                      bgcolor: goal?.kcal && t.kcal > goal.kcal ? 'warning.main' : 'success.main',
                      borderRadius: 1,
                    }}
                  />
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem' }}>
                    {t.date.slice(8)}
                  </Typography>
                </Box>
              ))}
            </Box>
          </CardContent>
        </Card>
      </ContentCard>
    </PageLayout>
  );
}
