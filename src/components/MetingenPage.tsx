import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pencil, Trash2, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { useProfile } from '../context/ProfileContext';
import { updateProfile } from '../services/profileService';
import {
  saveMeasurement,
  deleteMeasurement,
  getMeasurementsForUser,
  CIRCUMFERENCE_FIELDS,
  type Measurement,
  type CircumferenceKey,
} from '../services/measurementService';

const EMPTY_CIRC = Object.fromEntries(CIRCUMFERENCE_FIELDS.map((f) => [f.key, ''])) as Record<CircumferenceKey, string>;

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function MetingenPage() {
  const profileCtx = useProfile();
  const isTrainer = profileCtx?.isTrainer ?? false;
  const sporters = profileCtx?.allSporters ?? [];
  const selfUid = profileCtx?.profile?.userId ?? '';
  const selfTrainerId = profileCtx?.profile?.trainerId ?? null;

  const [targetId, setTargetId] = useState('');
  const [items, setItems] = useState<Measurement[]>([]);
  const [loading, setLoading] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [date, setDate] = useState(todayIso());
  const [weight, setWeight] = useState('');
  const [bodyFat, setBodyFat] = useState('');
  const [note, setNote] = useState('');
  const [circ, setCirc] = useState<Record<CircumferenceKey, string>>(EMPTY_CIRC);
  const [saving, setSaving] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [goalInput, setGoalInput] = useState('');

  const effectiveUserId = targetId || selfUid;
  const effectiveTrainerId = targetId ? sporters.find((s) => s.userId === targetId)?.trainerId ?? null : selfTrainerId;

  const load = useCallback(async () => {
    if (!effectiveUserId) return;
    setLoading(true);
    try {
      setItems(await getMeasurementsForUser(effectiveUserId));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [effectiveUserId]);

  useEffect(() => {
    load();
  }, [load]);

  const resetForm = () => {
    setEditingId(null);
    setDate(todayIso());
    setWeight('');
    setBodyFat('');
    setNote('');
    setCirc(EMPTY_CIRC);
  };

  const circNumbers = (): Record<CircumferenceKey, number | null> => {
    const o = {} as Record<CircumferenceKey, number | null>;
    for (const f of CIRCUMFERENCE_FIELDS) {
      const v = circ[f.key].trim();
      o[f.key] = v !== '' ? Number(v) : null;
    }
    return o;
  };

  const handleSave = async () => {
    if (!effectiveUserId) return;
    const w = weight.trim() !== '' ? Number(weight) : null;
    const bf = bodyFat.trim() !== '' ? Number(bodyFat) : null;
    const cn = circNumbers();
    const hasCirc = CIRCUMFERENCE_FIELDS.some((f) => cn[f.key] != null);
    if (w == null && bf == null && !hasCirc) return;
    setSaving(true);
    try {
      const editing = items.find((m) => m.id === editingId);
      await saveMeasurement({
        id: editing?.id,
        createdAt: editing?.createdAt,
        userId: effectiveUserId,
        loggedBy: selfUid || effectiveUserId,
        trainerId: effectiveTrainerId,
        date,
        weightKg: w,
        bodyFatPct: bf,
        ...cn,
        note: note.trim(),
      });
      resetForm();
      await load();
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (m: Measurement) => {
    setEditingId(m.id);
    setDate(m.date || todayIso());
    setWeight(m.weightKg != null ? String(m.weightKg) : '');
    setBodyFat(m.bodyFatPct != null ? String(m.bodyFatPct) : '');
    setNote(m.note);
    const c = {} as Record<CircumferenceKey, string>;
    for (const f of CIRCUMFERENCE_FIELDS) {
      const v = m[f.key];
      c[f.key] = v != null ? String(v) : '';
    }
    setCirc(c);
  };

  const handleDelete = async (id: string) => {
    await deleteMeasurement(id).catch(() => {});
    if (editingId === id) resetForm();
    await load();
  };

  const weightPoints = useMemo(() => items.filter((m) => m.weightKg != null) as (Measurement & { weightKg: number })[], [items]);
  const latestWeight = weightPoints.length ? weightPoints[weightPoints.length - 1].weightKg : null;
  const firstWeight = weightPoints.length ? weightPoints[0].weightKg : null;
  const weightDelta = latestWeight != null && firstWeight != null ? Math.round((latestWeight - firstWeight) * 10) / 10 : null;
  const bfPoints = items.filter((m) => m.bodyFatPct != null);
  const latestBf = bfPoints.length ? bfPoints[bfPoints.length - 1].bodyFatPct : null;

  const wMin = weightPoints.length ? Math.min(...weightPoints.map((p) => p.weightKg)) : 0;
  const wMax = weightPoints.length ? Math.max(...weightPoints.map((p) => p.weightKg)) : 1;

  const goalWeight = targetId
    ? sporters.find((s) => s.userId === targetId)?.weightGoalKg ?? null
    : profileCtx?.profile?.weightGoalKg ?? null;
  const toGoal = goalWeight != null && latestWeight != null ? Math.round((latestWeight - goalWeight) * 10) / 10 : null;
  const firstDate = weightPoints.length ? weightPoints[0].date : null;
  const lastDate = weightPoints.length ? weightPoints[weightPoints.length - 1].date : null;
  const spanDays = firstDate && lastDate ? Math.max(1, (Date.parse(lastDate) - Date.parse(firstDate)) / 86400000) : 0;
  const perWeek = weightDelta != null && spanDays >= 1 ? Math.round((weightDelta / (spanDays / 7)) * 10) / 10 : null;
  const goalProgress =
    goalWeight != null && firstWeight != null && latestWeight != null && firstWeight !== goalWeight
      ? Math.max(0, Math.min(100, ((firstWeight - latestWeight) / (firstWeight - goalWeight)) * 100))
      : null;

  const handleSaveGoal = async () => {
    if (!effectiveUserId) return;
    const g = goalInput.trim() !== '' ? Number(goalInput) : null;
    await updateProfile(effectiveUserId, { weightGoalKg: g && g > 0 ? g : null }).catch(() => {});
    await profileCtx?.refreshProfile();
    setGoalOpen(false);
  };

  // Lijngrafiek-geometrie voor het gewicht (viewBox = echte pixelbreedte, geen vervorming)
  const chartRef = useRef<HTMLDivElement | null>(null);
  const [chartW, setChartW] = useState(320);
  useEffect(() => {
    const el = chartRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setChartW(Math.round(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const chartPts = weightPoints.slice(-20);
  const CW = chartW;
  const CH = 130;
  const cpad = 14;
  const cMin = Math.min(wMin, goalWeight ?? wMin);
  const cMax = Math.max(wMax, goalWeight ?? wMax);
  const cRange = cMax - cMin || 1;
  const cx = (i: number) => (chartPts.length > 1 ? (i * (CW - 2 * cpad)) / (chartPts.length - 1) : (CW - 2 * cpad) / 2) + cpad;
  const cy = (w: number) => CH - cpad - ((w - cMin) / cRange) * (CH - 2 * cpad);
  const linePoints = chartPts.map((p, i) => `${cx(i)},${cy(p.weightKg)}`).join(' ');
  const goalY = goalWeight != null ? cy(goalWeight) : null;

  return (
    <div className="animate-fade-in-up mx-auto w-full max-w-3xl pb-6">
      <Card>
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-2xl font-semibold">Metingen</h1>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setGoalInput(goalWeight != null ? String(goalWeight) : '');
                setGoalOpen(true);
              }}
            >
              {goalWeight != null ? `Doel: ${goalWeight} kg` : 'Doelgewicht instellen'}
            </Button>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            Houd je gewicht, vetpercentage en omtrekmaten bij en volg je voortgang.
          </p>

          {isTrainer && sporters.length > 0 && (
            <div className="mb-4 max-w-xs space-y-1.5">
              <Label htmlFor="meting-target">Voor wie?</Label>
              <Select value={targetId || 'self'} onValueChange={(v) => setTargetId(v === 'self' ? '' : v)}>
                <SelectTrigger id="meting-target">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="self">Mijzelf</SelectItem>
                  {sporters.map((s) => (
                    <SelectItem key={s.userId} value={s.userId}>
                      {s.displayName?.trim() || s.email || s.userId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Huidige waarden */}
          <div className="mb-4 flex flex-wrap justify-around gap-2 rounded-xl border border-border p-4 text-center">
            <div>
              <div className="text-lg font-bold">{latestWeight != null ? `${latestWeight} kg` : '—'}</div>
              <div className="text-xs text-muted-foreground">
                gewicht{weightDelta != null ? ` (${weightDelta > 0 ? '+' : ''}${weightDelta} kg)` : ''}
              </div>
            </div>
            <div>
              <div className="text-lg font-bold">{latestBf != null ? `${latestBf}%` : '—'}</div>
              <div className="text-xs text-muted-foreground">vetpercentage</div>
            </div>
          </div>

          {/* Voortgang naar doel + tempo */}
          {(goalWeight != null || perWeek != null) && (
            <div className="mb-4 rounded-xl border border-border p-4">
              {goalWeight != null && (
                <>
                  <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                    <span>Naar doel ({goalWeight} kg)</span>
                    <span>{toGoal != null ? (Math.abs(toGoal) < 0.05 ? 'behaald 🎉' : `nog ${Math.abs(toGoal)} kg`) : ''}</span>
                  </div>
                  {goalProgress != null && <Progress value={goalProgress} className={perWeek != null ? 'mb-2 h-2' : 'h-2'} />}
                </>
              )}
              {perWeek != null && (
                <div className="text-xs text-muted-foreground">
                  Gemiddeld {perWeek > 0 ? '+' : ''}
                  {perWeek} kg per week
                </div>
              )}
            </div>
          )}

          {/* Gewicht-trend */}
          {weightPoints.length >= 2 && (
            <div className="mb-4 rounded-xl border border-border p-4">
              <div className="mb-2 text-xs text-muted-foreground">
                Gewicht ({wMin}–{wMax} kg)
              </div>
              <div ref={chartRef} className="w-full text-primary">
                <svg viewBox={`0 0 ${CW} ${CH}`} className="block h-[130px] w-full">
                  {goalY != null && (
                    <line x1={0} y1={goalY} x2={CW} y2={goalY} stroke="#9e9e9e" strokeWidth={1} strokeDasharray="4 4" />
                  )}
                  <polyline points={linePoints} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                  {chartPts.map((p, i) => (
                    <circle key={p.id} cx={cx(i)} cy={cy(p.weightKg)} r={3} fill="currentColor">
                      <title>{`${p.date}: ${p.weightKg} kg`}</title>
                    </circle>
                  ))}
                </svg>
              </div>
            </div>
          )}

          {/* Invoer */}
          <h2 className="mb-2 text-base font-semibold">{editingId ? 'Meting bewerken' : 'Nieuwe meting'}</h2>
          <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="meting-date">Datum</Label>
              <Input id="meting-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="meting-weight">Gewicht (kg)</Label>
              <Input id="meting-weight" type="number" step={0.1} min={0} value={weight} onChange={(e) => setWeight(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="meting-fat">Vet (%)</Label>
              <Input id="meting-fat" type="number" step={0.1} min={0} value={bodyFat} onChange={(e) => setBodyFat(e.target.value)} />
            </div>
          </div>

          {/* Omtrekken (cm) — altijd zichtbaar, optioneel */}
          <div className="mb-1 mt-1 text-sm font-medium text-muted-foreground">Omtrekken (cm) — optioneel</div>
          <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {CIRCUMFERENCE_FIELDS.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label htmlFor={`circ-${f.key}`} className="text-xs">
                  {f.label}
                </Label>
                <Input
                  id={`circ-${f.key}`}
                  type="number"
                  step={0.5}
                  min={0}
                  value={circ[f.key]}
                  onChange={(e) => setCirc((c) => ({ ...c, [f.key]: e.target.value }))}
                />
              </div>
            ))}
          </div>

          <div className="mb-2 space-y-1.5">
            <Label htmlFor="meting-note">Notitie (optioneel)</Label>
            <Input id="meting-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Bezig…' : editingId ? 'Opslaan' : 'Toevoegen'}
            </Button>
            {editingId && (
              <Button variant="ghost" onClick={resetForm}>
                Annuleren
              </Button>
            )}
          </div>

          {/* Historie */}
          <h2 className="mb-2 mt-6 text-base font-semibold">Historie</h2>
          {loading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nog geen metingen.</p>
          ) : (
            <ul className="divide-y divide-border">
              {[...items].reverse().map((m) => {
                const circSummary = CIRCUMFERENCE_FIELDS.filter((f) => m[f.key] != null)
                  .map((f) => `${f.label} ${m[f.key]}`)
                  .join(' · ');
                const secondary = [circSummary || null, m.note || null].filter(Boolean).join(' — ');
                return (
                  <li key={m.id} className="flex items-start justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">
                        {`${m.date} · ${m.weightKg != null ? `${m.weightKg} kg` : ''}${m.weightKg != null && m.bodyFatPct != null ? ' · ' : ''}${m.bodyFatPct != null ? `${m.bodyFatPct}%` : ''}`}
                      </div>
                      {secondary && <div className="mt-0.5 text-xs text-muted-foreground">{secondary}</div>}
                    </div>
                    <div className="flex shrink-0 gap-0.5">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(m)} aria-label="Bewerken">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(m.id)} aria-label="Verwijderen">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={goalOpen} onOpenChange={setGoalOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Doelgewicht</DialogTitle>
            <DialogDescription>Vul je streefgewicht in. Laat leeg om geen doel te gebruiken.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label htmlFor="goal-input">Doelgewicht (kg)</Label>
            <Input id="goal-input" type="number" step={0.1} min={0} value={goalInput} onChange={(e) => setGoalInput(e.target.value)} autoFocus />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setGoalOpen(false)}>
              Annuleren
            </Button>
            <Button onClick={handleSaveGoal}>Opslaan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
