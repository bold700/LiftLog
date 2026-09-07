import { useEffect, useMemo, useRef, useState } from 'react';
import { Box } from '@mui/material';
import type { Formule7Routekaart, SchemaDay, Profile } from '../types';
import {
  FORMULE7_ORGANISATION_OPTIONS,
  WARMUP_BY_MOVER_TYPE,
  NMT_PRESETS_BY_GOAL,
  ALLOWED_NMT_GOALS_BY_MOVER_TYPE,
  CARDIO_ORGANISATION_BY_MOVER_TYPE,
  CARDIO_ZONE_HR_PERCENT,
  collectCardioOrganisationsUsed,
  pickWarmupOrganisationAvoidingCardio,
} from '../utils/formule7Defaults';
import type { Formule7StrengthGoal } from '../types';
import { TrainingsdagSelect } from './formule7/TrainingsdagSelect';
import { AnamneseSection } from './formule7/AnamneseSection';
import { WarmingUpSection } from './formule7/WarmingUpSection';
import { KrachtSection } from './formule7/KrachtSection';
import { CardioSection } from './formule7/CardioSection';
import { CoolingDownSection } from './formule7/CoolingDownSection';
import { StretchingSection } from './formule7/StretchingSection';
import { BijzonderhedenSection } from './formule7/BijzonderhedenSection';

interface Formule7RoutekaartFormProps {
  formule7: Formule7Routekaart;
  setFormule7: (value: Formule7Routekaart | null) => void;
  /** Per trainingsdag (sectie 2–6); alleen bij Formule 7. */
  days?: SchemaDay[];
  updateDay?: (dayIndex: number, upd: Partial<SchemaDay>) => void;
  /** Inhoud na sectie 3: oefeningen. Bij per-dag weergave: functie (dayIndex) => oefeningen voor die dag. */
  childrenAfterNeuromuscular?: React.ReactNode | ((dayIndex: number) => React.ReactNode);
  /** Optioneel: blok getoond vóór de dagkaarten in sectie 3 (bijv. filter "Oefeningen tonen"). */
  slotBeforeDayCards?: React.ReactNode;
  /** Optioneel: periode van het schema, getoond in blok 1 Intake (schema is altijd 4–8 weken) */
  startDate?: string;
  durationWeeks?: number;
  onStartDateChange?: (value: string) => void;
  onDurationWeeksChange?: (value: number) => void;
  /** Oefennamen uit het schema; gebruikt om stretching-spiergroepen voor te stellen */
  schemaExerciseNames?: string[];
  /** Opties voor oefening-autocomplete (bij per-dag weergave). */
  exerciseOptions?: string[];
  /** Lijst sporters om workout aan toe te wijzen; bij aanwezigheid wordt "Naam cliënt" een profielkiezer. */
  sporters?: Profile[];
  /** Geselecteerd profiel (userId) voor koppeling schema–cliënt. */
  selectedClientId?: string | null;
  /** Callback wanneer een andere sporter wordt gekozen; vult ook clientName in de routekaart. */
  onClientIdChange?: (userId: string | null) => void;
}

const ROUTEKAART_SECTION_IDS = ['1', '2', '3', '4', '5', '6', '7'] as const;

export function Formule7RoutekaartForm({
  formule7,
  setFormule7,
  days = [],
  updateDay,
  childrenAfterNeuromuscular,
  slotBeforeDayCards,
  startDate,
  durationWeeks = 6,
  onStartDateChange,
  onDurationWeeksChange,
  schemaExerciseNames = [],
  exerciseOptions: _exerciseOptions = [],
  sporters = [],
  selectedClientId = null,
  onClientIdChange,
}: Formule7RoutekaartFormProps) {
  void _exerciseOptions; // passed for childrenAfterNeuromuscular / future use
  const isPerDay = days.length > 0 && typeof updateDay === 'function';
  const [expandedSections, setExpandedSections] = useState<string[]>(() => [...ROUTEKAART_SECTION_IDS]);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const toggleSection = (id: string) =>
    setExpandedSections((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  const set = (upd: Partial<Formule7Routekaart>) =>
    setFormule7({ ...formule7, ...upd });

  const setWarmup = (upd: Partial<Formule7Routekaart['warmup']>) =>
    set({ warmup: { ...formule7.warmup, ...upd } });
  const setCardio = (upd: Partial<Formule7Routekaart['cardio']>) =>
    set({ cardio: { ...formule7.cardio, ...upd } });
  const setCooldown = (upd: Partial<Formule7Routekaart['cooldown']>) =>
    set({ cooldown: { ...formule7.cooldown, ...upd } });

  // Bij per-dag weergave: data voor de geselecteerde dag
  const selDay = isPerDay && days[selectedDayIndex] ? days[selectedDayIndex] : null;
  const effectiveWarmup = isPerDay && selDay ? (selDay.warmup ?? formule7.warmup) : formule7.warmup;
  const setEffectiveWarmup = isPerDay && updateDay
    ? (upd: Partial<Formule7Routekaart['warmup']>) => updateDay(selectedDayIndex, { warmup: { ...(selDay?.warmup ?? formule7.warmup), ...upd } })
    : setWarmup;
  const effectiveCardio = isPerDay && selDay ? (selDay.cardio ?? formule7.cardio) : formule7.cardio;
  const setEffectiveCardio = isPerDay && updateDay
    ? (upd: Partial<Formule7Routekaart['cardio']>) => updateDay(selectedDayIndex, { cardio: { ...(selDay?.cardio ?? formule7.cardio), ...upd } })
    : setCardio;

  const effectiveCooldown = isPerDay && selDay ? (selDay.cooldown ?? formule7.cooldown) : formule7.cooldown;
  const setEffectiveCooldown = isPerDay && updateDay
    ? (upd: Partial<Formule7Routekaart['cooldown']>) => updateDay(selectedDayIndex, { cooldown: { ...(selDay?.cooldown ?? formule7.cooldown), ...upd } })
    : setCooldown;
  const effectiveStretching = isPerDay && selDay && selDay.stretching?.length ? selDay.stretching : formule7.stretching;
  const setEffectiveStretching = isPerDay && updateDay
    ? (next: Formule7Routekaart['stretching']) => updateDay(selectedDayIndex, { stretching: next })
    : (next: Formule7Routekaart['stretching']) => set({ stretching: next });

  const setNeuromuscular = (upd: Partial<Formule7Routekaart['neuromuscular']>) =>
    set({ neuromuscular: { ...formule7.neuromuscular, ...upd } });

  const setCardioZone = (zoneIndex: 0 | 1 | 2, upd: Partial<Formule7Routekaart['cardio']['zones'][0]>) => {
    const source = isPerDay ? effectiveCardio : formule7.cardio;
    const setter = isPerDay ? setEffectiveCardio : setCardio;
    const zones = [...source.zones];
    zones[zoneIndex] = { ...zones[zoneIndex], ...upd };
    setter({ zones });
  };

  /** Warming-up opties: toegestaan voor activiteit, en niet dezelfde organisatie als cardio (hoofd/zones). */
  const warmupOrganisationChoices = useMemo(() => {
    if (!formule7.moverType) return FORMULE7_ORGANISATION_OPTIONS;
    const allowed = new Set(WARMUP_BY_MOVER_TYPE[formule7.moverType].organisations);
    const used = collectCardioOrganisationsUsed(effectiveCardio);
    const filtered = FORMULE7_ORGANISATION_OPTIONS.filter(
      (o) => allowed.has(o.value) && !used.has(o.value)
    );
    if (filtered.length > 0) return filtered;
    return FORMULE7_ORGANISATION_OPTIONS.filter((o) => allowed.has(o.value));
  }, [
    formule7.moverType,
    effectiveCardio.organisation,
    effectiveCardio.zones[0]?.organisation,
    effectiveCardio.zones[1]?.organisation,
    effectiveCardio.zones[2]?.organisation,
  ]);

  const computeTrainingHr = (percent?: number | null): number | null => {
    if (!formule7.ageYears || !percent || percent <= 0) return null;
    const maxHr = 220 - Number(formule7.ageYears);
    const resting = formule7.restingHr ?? 60;
    const fraction = percent / 100;
    const value = (maxHr - resting) * fraction + resting;
    if (!Number.isFinite(value)) return null;
    return Math.round(value);
  };

  // Auto-bereken theoretische maximale HF op basis van leeftijd (220 - leeftijd); bij laden en bij wijziging leeftijd
  const computedMaxHr =
    formule7.ageYears != null && formule7.ageYears > 0 && formule7.ageYears < 120
      ? 220 - Number(formule7.ageYears)
      : null;
  useEffect(() => {
    if (computedMaxHr == null) return;
    if (formule7.theoreticalMaxHr !== computedMaxHr) {
      set({ theoreticalMaxHr: computedMaxHr });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formule7.ageYears, computedMaxHr]);

  // Auto-bereken trainings-HF voor warming-up en cooling-down wanneer leeftijd, rustHF of intensiteit wijzigen
  useEffect(() => {
    const warmupPercent = formule7.warmup.intensityPercentOfMaxHr ?? null;
    const warmupHr = computeTrainingHr(warmupPercent);
    if (warmupHr !== null && warmupHr !== formule7.warmup.trainingHr) {
      setWarmup({ trainingHr: warmupHr });
    }

    const cooldownPercent = formule7.cooldown.intensityPercentOfMaxHr ?? null;
    const cooldownHr = computeTrainingHr(cooldownPercent);
    if (cooldownHr !== null && cooldownHr !== formule7.cooldown.trainingHr) {
      setCooldown({ trainingHr: cooldownHr });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    formule7.ageYears,
    formule7.restingHr,
    formule7.warmup.intensityPercentOfMaxHr,
    formule7.cooldown.intensityPercentOfMaxHr,
  ]);

  // Warming-up automatisch invullen zodra mover type wordt gekozen of gewijzigd (Tabel 2)
  const lastMoverTypeForWarmup = useRef<Formule7Routekaart['moverType']>(null);
  useEffect(() => {
    const moverType = formule7.moverType;
    if (!moverType) {
      lastMoverTypeForWarmup.current = null;
      return;
    }
    const preset = WARMUP_BY_MOVER_TYPE[moverType];
    const allowed = preset.organisations;
    const currentOrg = formule7.warmup.organisation;
    const baseOrg = currentOrg && allowed.includes(currentOrg) ? currentOrg : allowed[0];
    const organisation =
      pickWarmupOrganisationAvoidingCardio(moverType, formule7.cardio, baseOrg) ??
      allowed.find((o) => !collectCardioOrganisationsUsed(formule7.cardio).has(o)) ??
      allowed[0];
    const currentIntensity = formule7.warmup.intensityPercentOfMaxHr;
    const clampedIntensity =
      currentIntensity != null
        ? Math.min(preset.intensityPercentMax, Math.max(preset.intensityPercentMin, currentIntensity))
        : preset.intensityPercent;
    const currentDuration = formule7.warmup.durationMinutes;
    const clampedDuration =
      currentDuration != null
        ? Math.min(preset.durationMax, Math.max(preset.durationMin, currentDuration))
        : preset.durationMinutes;
    if (lastMoverTypeForWarmup.current === moverType) {
      const intensityOutOfRange =
        currentIntensity != null &&
        (currentIntensity < preset.intensityPercentMin || currentIntensity > preset.intensityPercentMax);
      const durationOutOfRange =
        currentDuration != null && (currentDuration < preset.durationMin || currentDuration > preset.durationMax);
      if (intensityOutOfRange || durationOutOfRange) {
        setWarmup({
          ...(intensityOutOfRange ? { intensityPercentOfMaxHr: clampedIntensity } : {}),
          ...(durationOutOfRange ? { durationMinutes: clampedDuration } : {}),
        });
      }
      return;
    }
    lastMoverTypeForWarmup.current = moverType;
    setWarmup({
      organisation,
      intensityPercentOfMaxHr: preset.intensityPercent,
      durationMinutes: preset.durationMinutes,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    formule7.moverType,
    formule7.warmup.intensityPercentOfMaxHr,
    formule7.warmup.durationMinutes,
    formule7.cardio.organisation,
    formule7.cardio.zones[0]?.organisation,
    formule7.cardio.zones[1]?.organisation,
    formule7.cardio.zones[2]?.organisation,
  ]);

  // Warming-up organisatie mag niet gelijk zijn aan cardio (hoofd of zone); cooling-down vrij.
  useEffect(() => {
    const moverType = formule7.moverType;
    if (!moverType) return;
    const cardio = effectiveCardio;
    const warmup = effectiveWarmup;
    const wOrg = warmup.organisation;
    if (!wOrg) return;
    if (!collectCardioOrganisationsUsed(cardio).has(wOrg)) return;
    const alt =
      pickWarmupOrganisationAvoidingCardio(moverType, cardio, null) ??
      WARMUP_BY_MOVER_TYPE[moverType].organisations.find((o) => !collectCardioOrganisationsUsed(cardio).has(o)) ??
      null;
    if (!alt || alt === wOrg) return;
    if (isPerDay && updateDay) {
      updateDay(selectedDayIndex, { warmup: { ...warmup, organisation: alt } });
    } else {
      setWarmup({ organisation: alt });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    formule7.moverType,
    selectedDayIndex,
    isPerDay,
    effectiveCardio.organisation,
    effectiveCardio.zones[0]?.organisation,
    effectiveCardio.zones[1]?.organisation,
    effectiveCardio.zones[2]?.organisation,
    effectiveWarmup.organisation,
  ]);

  const lastNmtGoal = useRef<Formule7StrengthGoal | null>(null);

  // Cardio zone trainingshartslag automatisch invullen volgens Tabel 9 + Formule 2 wanneer leeftijd/max HF bekend is
  useEffect(() => {
    const maxHr = formule7.theoreticalMaxHr ?? (formule7.ageYears != null ? 220 - Number(formule7.ageYears) : null);
    if (maxHr == null || maxHr <= 0) return;
    const zones = formule7.cardio.zones;
    let updated = false;
    const nextZones = zones.map((z, idx) => {
      const zoneNum = (idx + 1) as 1 | 2 | 3;
      const preset = CARDIO_ZONE_HR_PERCENT[zoneNum];
      if (z.trainingHr != null) return z;
      const suggested = Math.round((maxHr * preset.defaultPercent) / 100);
      updated = true;
      return { ...z, trainingHr: suggested };
    });
    if (updated) setCardio({ zones: nextZones });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formule7.theoreticalMaxHr, formule7.ageYears]);

  // Bij wijziging mover type: cardio-organisatie (en per zone) legen als niet meer toegestaan (Tabel 8)
  useEffect(() => {
    const moverType = formule7.moverType;
    if (!moverType) return;
    const allowed = CARDIO_ORGANISATION_BY_MOVER_TYPE[moverType];
    let cardioUpd: Partial<Formule7Routekaart['cardio']> | null = null;
    if (formule7.cardio.organisation != null && !allowed.includes(formule7.cardio.organisation)) {
      cardioUpd = { ...(cardioUpd ?? {}), organisation: null };
    }
    const zones = formule7.cardio.zones.map((z) => {
      const org = z.organisation;
      if (org != null && !allowed.includes(org)) return { ...z, organisation: null };
      return z;
    });
    if (zones.some((z, i) => z.organisation !== formule7.cardio.zones[i]?.organisation)) {
      cardioUpd = { ...(cardioUpd ?? {}), zones };
    }
    if (cardioUpd) setCardio(cardioUpd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formule7.moverType]);

  // Bij wijziging mover type: NMT-doel legen als het niet meer toegestaan is
  useEffect(() => {
    const moverType = formule7.moverType;
    const goal = formule7.neuromuscular.goal;
    if (!moverType || !goal) return;
    const allowed = ALLOWED_NMT_GOALS_BY_MOVER_TYPE[moverType];
    if (!allowed.includes(goal)) {
      setNeuromuscular({ goal: null });
      lastNmtGoal.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formule7.moverType]);

  // NMT automatisch invullen op basis van gekozen doel S1/S2/S3/S4.x (Tabel 4)
  useEffect(() => {
    const goal = formule7.neuromuscular.goal;
    if (!goal) {
      lastNmtGoal.current = null;
      return;
    }
    const moverType = formule7.moverType;
    if (moverType && !ALLOWED_NMT_GOALS_BY_MOVER_TYPE[moverType].includes(goal)) return;
    if (lastNmtGoal.current === goal) return;
    lastNmtGoal.current = goal;
    const preset = NMT_PRESETS_BY_GOAL[goal];
    const existing = formule7.neuromuscular.exercises;
    const exercises = Array.from({ length: 9 }, (_, i) => ({
      name: existing[i]?.name ?? '',
      intensityPercent1RM: preset.percent1RM,
      sets: preset.sets,
      reps: preset.reps,
      restSeconds: preset.restSeconds,
    }));
    setNeuromuscular({
      trainingForm: preset.trainingMethod,
      desiredExerciseCount: preset.desiredExerciseCount,
      exercises,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formule7.neuromuscular.goal]);


  /** Stretching-rijen voor de sectie (per dag of algemeen). */
  const stretchingRows = effectiveStretching ?? [];
  /** Max. HF voor cardio-zones: theoretische max. HF, anders 220 − leeftijd. */
  const cardioMaxHr = formule7.theoreticalMaxHr ?? (formule7.ageYears != null ? 220 - Number(formule7.ageYears) : null);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0 }}>
      {/* --- Anamnese / Intake (algemeen) --- */}
      <AnamneseSection
        value={formule7}
        onChange={set}
        computedMaxHr={computedMaxHr}
        sporters={sporters}
        selectedClientId={selectedClientId}
        onClientIdChange={onClientIdChange}
        startDate={startDate}
        durationWeeks={durationWeeks}
        onStartDateChange={onStartDateChange}
        onDurationWeeksChange={onDurationWeeksChange}
        expanded={expandedSections.includes('1')}
        onToggle={() => toggleSection('1')}
      />

      {isPerDay && days.length > 0 && (
        <TrainingsdagSelect days={days} selectedDayIndex={selectedDayIndex} onChange={setSelectedDayIndex} />
      )}

      {/* --- Warming-up --- */}
      <WarmingUpSection
        value={effectiveWarmup}
        onChange={setEffectiveWarmup}
        moverType={formule7.moverType}
        organisationChoices={warmupOrganisationChoices}
        computeTrainingHr={computeTrainingHr}
        expanded={expandedSections.includes('2')}
        onToggle={() => toggleSection('2')}
      />

      {/* --- Krachttraining (neuromusculair) --- */}
      <KrachtSection
        value={formule7.neuromuscular}
        onChange={setNeuromuscular}
        moverType={formule7.moverType}
        selectedDayIndex={selectedDayIndex}
        slotBeforeDayCards={slotBeforeDayCards}
        childrenAfterNeuromuscular={childrenAfterNeuromuscular}
        expanded={expandedSections.includes('3')}
        onToggle={() => toggleSection('3')}
      />

      {/* --- Cardiotraining (cardiovasculair) --- */}
      <CardioSection
        value={effectiveCardio}
        onChange={setEffectiveCardio}
        onZoneChange={setCardioZone}
        moverType={formule7.moverType}
        maxHr={cardioMaxHr}
        expanded={expandedSections.includes('4')}
        onToggle={() => toggleSection('4')}
      />

      {/* --- Cooling-down --- */}
      <CoolingDownSection
        value={effectiveCooldown}
        onChange={setEffectiveCooldown}
        expanded={expandedSections.includes('5')}
        onToggle={() => toggleSection('5')}
      />

      {/* --- Stretching --- */}
      <StretchingSection
        value={stretchingRows}
        onChange={setEffectiveStretching}
        schemaExerciseNames={schemaExerciseNames}
        expanded={expandedSections.includes('6')}
        onToggle={() => toggleSection('6')}
      />

      {/* --- Bijzonderheden --- */}
      <BijzonderhedenSection
        value={formule7.notes}
        onChange={(notes) => set({ notes })}
        expanded={expandedSections.includes('7')}
        onToggle={() => toggleSection('7')}
      />
    </Box>
  );
}
