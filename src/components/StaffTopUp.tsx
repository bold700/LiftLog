/**
 * Moment inplannen (staf): heeft het lid geen credits of geen abonnement, dan regelt de trainer het
 * hier meteen, zonder eerst naar Beheer → lid → Abonnement en credits te gaan. Gratis credits vanuit
 * de studio, of direct een abonnement koppelen (vandaag in, zoals in Beheer). De trainer beslist.
 */
import { useEffect, useState } from 'react';
import { Alert, Box, Button, MenuItem, TextField, Typography } from '@mui/material';
import { useNotify } from '../context/NotifyContext';
import { grantCredits } from '../services/classService';
import { assignPlan, getPlans } from '../services/planService';
import type { Plan } from '../types';

const PERIOD: Record<Plan['period'], string> = { once: 'eenmalig', week: 'per week', fourWeeks: 'per 4 weken', month: 'per maand' };

const planLine = (p: Plan) =>
  [p.credits == null ? 'onbeperkt' : `${p.credits} credits`, p.price ? `€ ${p.price.toFixed(2).replace('.', ',')} ${PERIOD[p.period]}` : 'gratis']
    .filter(Boolean)
    .join(' · ');

interface Props {
  userId: string;
  name: string;
  /** Creditsaldo; null bij een abonnement zonder creditlimiet. */
  credits: number | null;
  hasPlan: boolean;
  /** Hoeveel credits er voor deze afspraak nodig zijn (voorstel bij gratis toekennen). */
  suggested: number;
  /** Na toekennen of koppelen: saldo en abonnement opnieuw laden. */
  onChanged: () => void;
}

export function StaffTopUp({ userId, name, credits, hasPlan, suggested, onChanged }: Props) {
  const notify = useNotify();
  const [mode, setMode] = useState<'credits' | 'plan' | null>(null);
  const [amount, setAmount] = useState(String(suggested));
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [planId, setPlanId] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMode(null);
    setAmount(String(suggested));
  }, [userId, suggested]);

  useEffect(() => {
    if (mode !== 'plan' || plans) return;
    getPlans().then(
      (list) => {
        const open = list.filter((p) => p.status === 'active');
        setPlans(open);
        setPlanId((id) => id || open[0]?.id || '');
      },
      () => setPlans([])
    );
  }, [mode, plans]);

  const n = Number(amount);
  const amountOk = Number.isInteger(n) && n > 0 && n <= 100;

  const giveCredits = async () => {
    setSaving(true);
    try {
      const r = await grantCredits(userId, n, 'Gratis toegekend bij inplannen');
      notify.success(`${n} ${n === 1 ? 'credit' : 'credits'} toegekend. ${name} heeft er nu ${r.balance}.`);
      setMode(null);
      onChanged();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Credits toekennen mislukt.', e);
    } finally {
      setSaving(false);
    }
  };

  const linkPlan = async () => {
    const plan = plans?.find((p) => p.id === planId);
    if (!plan) return;
    setSaving(true);
    try {
      const r = await assignPlan(userId, plan.id);
      notify.success(`${plan.name} gekoppeld${r.balance != null ? `. ${name} heeft nu ${r.balance} credits` : ''}.`);
      setMode(null);
      onChanged();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Abonnement koppelen mislukt.', e);
    } finally {
      setSaving(false);
    }
  };

  const empty = credits != null && credits <= 0;
  const message =
    empty
      ? `${name} heeft geen credits${hasPlan ? '' : ' en geen abonnement'}. Zonder credits wordt de afspraak niet geboekt. Regel het hier meteen:`
      : `${name} heeft geen abonnement. Een losse afspraak kost een credit${credits != null ? ` (nog ${credits})` : ''}; elke week kan ook.`;

  return (
    <Alert severity={empty ? 'warning' : 'info'} sx={{ '& .MuiAlert-message': { width: '100%' } }}>
      <Typography variant="body2">{message}</Typography>
      {!mode && (
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
          <Button size="small" variant="outlined" onClick={() => setMode('credits')}>
            Gratis credits
          </Button>
          {!hasPlan && (
            <Button size="small" variant="outlined" onClick={() => setMode('plan')}>
              Abonnement koppelen
            </Button>
          )}
        </Box>
      )}

      {mode === 'credits' && (
        <Box sx={{ mt: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField
              size="small"
              type="number"
              label="Credits"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              error={!amountOk}
              inputProps={{ min: 1, max: 100, step: 1 }}
              sx={{ width: 96 }}
            />
            <Button size="small" variant="contained" disableElevation disabled={saving || !amountOk} onClick={() => void giveCredits()}>
              {saving ? 'Bezig…' : 'Toekennen'}
            </Button>
            <Button size="small" onClick={() => setMode(null)}>
              Annuleren
            </Button>
          </Box>
          <Typography variant="caption">Vanuit de studio, zonder factuur. Het staat in het creditoverzicht van {name}.</Typography>
        </Box>
      )}

      {mode === 'plan' && (
        <Box sx={{ mt: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {plans && plans.length === 0 ? (
            <Typography variant="body2">Er zijn nog geen abonnementen. Maak er een in Beheer → Abonnementen.</Typography>
          ) : (
            <TextField select size="small" label="Abonnement" value={planId} onChange={(e) => setPlanId(e.target.value)} disabled={!plans} fullWidth>
              {(plans ?? []).map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  <Box>
                    <Typography variant="body2">{p.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {planLine(p)}
                    </Typography>
                  </Box>
                </MenuItem>
              ))}
            </TextField>
          )}
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button size="small" variant="contained" disableElevation disabled={saving || !planId} onClick={() => void linkPlan()}>
              {saving ? 'Bezig…' : 'Koppelen'}
            </Button>
            <Button size="small" onClick={() => setMode(null)}>
              Annuleren
            </Button>
          </Box>
          <Typography variant="caption">Gaat vandaag in, net als in Beheer: de credits staan er meteen en de factuur volgt zoals gewoonlijk.</Typography>
        </Box>
      )}
    </Alert>
  );
}
