import { useEffect, useMemo, useRef, useState } from 'react';

const NMT_TIP_STORAGE_KEY = 'liftlog.formule7NmtTipDismissed';
import {
  Alert,
  Box,
  Typography,
  TextField,
  Autocomplete,
  IconButton,
  Tooltip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import type { Formule7Routekaart, Formule7Stretch, SchemaDay, Profile } from '../types';
import {
  FORMULE7_GOAL_OPTIONS,
  FORMULE7_MOVER_OPTIONS,
  FORMULE7_MOVER_LEVELS_HELP,
  FORMULE7_ORGANISATION_OPTIONS,
  FORMULE7_COOLDOWN_ORGANISATION_OPTIONS,
  FORMULE7_STRENGTH_GOAL_OPTIONS,
  WARMUP_BY_MOVER_TYPE,
  NMT_PRESETS_BY_GOAL,
  ALLOWED_NMT_GOALS_BY_MOVER_TYPE,
  CARDIO_ORGANISATION_BY_MOVER_TYPE,
  CARDIO_TRAINING_METHOD_OPTIONS_BY_MOVER,
  CARDIO_ZONE_HR_PERCENT,
  collectCardioOrganisationsUsed,
  pickWarmupOrganisationAvoidingCardio,
  getFormule7MoverLabel,
} from '../utils/formule7Defaults';
import type { Formule7StrengthGoal } from '../types';
import { getMuscleGroupsFromExerciseNames } from '../utils/stretchingSuggestions';
import { EmptyState } from './layout';

const SECTION_STYLE = {
  margin: 0,
  p: 1.5,
  borderRadius: 2,
  border: '1px solid rgba(0,0,0,0.08)',
  backgroundColor: 'rgba(0,0,0,0.02)',
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 1.5,
  '&.Mui-expanded': { margin: 0 },
};

/** Rij met invoervelden: vult de volle breedte; velden delen de ruimte gelijk. Op kleine schermen gestapeld. */
const FORM_ROW = {
  display: 'flex',
  flexWrap: 'wrap' as const,
  gap: 2,
  alignItems: 'flex-start' as const,
  width: '100%',
  minWidth: 0,
  '& > *': {
    flex: '1 1 100%',
    minWidth: 0,
    '@media (min-width: 600px)': { flex: '1 1 0%', minWidth: 80 },
  },
};

/** Rij voor stretching: volle breedte, Spiergroep groot, Duur/Herhalingen kleiner, delete-knop vast. */
const STRETCH_ROW = {
  display: 'flex',
  flexWrap: 'wrap' as const,
  gap: 2,
  alignItems: 'center' as const,
  minWidth: 0,
  width: '100%',
  '& > *:first-of-type': {
    flex: '2 1 0%',
    minWidth: 100,
  },
  '& > *:nth-of-type(2)': {
    flex: '1 1 0%',
    minWidth: 90,
  },
  '& > *:nth-of-type(3)': {
    flex: '1 1 0%',
    minWidth: 80,
  },
  '& > *:nth-of-type(4)': {
    flex: '0 0 auto',
    width: 40,
    height: 40,
  },
};

const HelperText = ({ children }: { children: React.ReactNode }) => (
  <Typography variant="body2" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
    {children}
  </Typography>
);

const SESSION_DURATION_OPTIONS = [
  { value: '<30' as const, label: 'Korter dan 30 min' },
  { value: '30-60' as const, label: '30–60 min' },
  { value: '>60' as const, label: 'Langer dan 60 min' },
];

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
  durationWeeks?: 4 | 5 | 6 | 7 | 8;
  onStartDateChange?: (value: string) => void;
  onDurationWeeksChange?: (value: 4 | 5 | 6 | 7 | 8) => void;
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
  const [showNmtTip, setShowNmtTip] = useState(
    () => !localStorage.getItem(NMT_TIP_STORAGE_KEY)
  );
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

  const dismissNmtTip = () => {
    setShowNmtTip(false);
    try {
      localStorage.setItem(NMT_TIP_STORAGE_KEY, 'true');
    } catch {
      // ignore
    }
  };
  const showNmtTipAgain = () => {
    setShowNmtTip(true);
    try {
      localStorage.removeItem(NMT_TIP_STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  const setNeuromuscular = (upd: Partial<Formule7Routekaart['neuromuscular']>) =>
    set({ neuromuscular: { ...formule7.neuromuscular, ...upd } });

  const setCardioZone = (zoneIndex: 0 | 1 | 2, upd: Partial<Formule7Routekaart['cardio']['zones'][0]>) => {
    const source = isPerDay ? effectiveCardio : formule7.cardio;
    const setter = isPerDay ? setEffectiveCardio : setCardio;
    const zones = [...source.zones];
    zones[zoneIndex] = { ...zones[zoneIndex], ...upd };
    setter({ zones });
  };

  const stretchingRows = effectiveStretching ?? [];

  const setStretch = (index: number, upd: Partial<Formule7Stretch>) => {
    const next = stretchingRows.map((s, i) => (i === index ? { ...s, ...upd } : s));
    setEffectiveStretching(next);
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

  const addStretchRow = () => {
    setEffectiveStretching([...stretchingRows, { muscleGroup: '', stretchDurationSeconds: null, repetitions: null }]);
  };

  const removeStretchRow = (index: number) => {
    setEffectiveStretching(stretchingRows.filter((_, i) => i !== index));
  };

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

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0 }}>
      {/* --- Anamnese / Intake (algemeen) --- */}
      <Accordion
        disableGutters
        expanded={expandedSections.includes('1')}
        onChange={() => toggleSection('1')}
        sx={{
          ...SECTION_STYLE,
          '&:before': { display: 'none' },
          boxShadow: 'none',
          '& .MuiAccordionSummary-root': { py: 0.5, minHeight: 44, px: 0 },
          '& .MuiAccordionSummary-content': { my: 0.75 },
        }}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle1" fontWeight={600}>
            1. Anamnese / Intakegesprek
          </Typography>
        </AccordionSummary>
        <AccordionDetails sx={{ py: 1.5, px: 0, minWidth: 0 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <HelperText>
          Basisgegevens van de cliënt en doelstelling volgens de Formule 7.
        </HelperText>
        <Box sx={FORM_ROW}>
          {sporters.length > 0 ? (
            <Autocomplete
              options={sporters}
              value={sporters.find((s) => s.userId === selectedClientId) ?? null}
              onChange={(_, profile) => {
                if (profile) {
                  set({ clientName: profile.displayName || profile.email || '' });
                  onClientIdChange?.(profile.userId);
                } else {
                  set({ clientName: '' });
                  onClientIdChange?.(null);
                }
              }}
              getOptionLabel={(p) => p.displayName || p.email || p.userId}
              renderInput={(params) => (
                <TextField {...params} label="Naam cliënt (toewijzen aan profiel)" size="small" fullWidth placeholder="Kies een sporter" />
              )}
              sx={{ width: '100%' }}
            />
          ) : (
            <TextField
              label="Naam cliënt"
              value={formule7.clientName}
              onChange={(e) => set({ clientName: e.target.value })}
              size="small"
              fullWidth
            />
          )}
        </Box>
        <TextField
          label="Casus"
          value={formule7.casus}
          onChange={(e) => set({ casus: e.target.value })}
          size="small"
          fullWidth
          multiline
          minRows={4}
          maxRows={12}
          placeholder="Korte omschrijving van de cliënt"
        />
        <Box sx={FORM_ROW}>
          <TextField
            label="Leeftijd (jaar)"
            type="number"
            value={formule7.ageYears ?? ''}
            onChange={(e) => set({ ageYears: e.target.value === '' ? null : Number(e.target.value) || null })}
            size="small"
            fullWidth
            inputProps={{ min: 0 }}
          />
          <Autocomplete
            options={['M', 'V']}
            value={formule7.gender}
            onChange={(_, v) => set({ gender: (v as 'M' | 'V' | null) ?? null })}
            renderInput={(params) => (
              <TextField {...params} label="Geslacht" size="small" fullWidth />
            )}
            sx={{ width: '100%' }}
          />
          <Autocomplete
            options={FORMULE7_MOVER_OPTIONS}
            value={FORMULE7_MOVER_OPTIONS.find((o) => o.value === formule7.moverType) ?? null}
            onChange={(_, v) => set({ moverType: v?.value ?? null })}
            getOptionLabel={(o) => o.label}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Activiteit / belastbaarheid"
                size="small"
                fullWidth
                InputProps={{
                  ...params.InputProps,
                  endAdornment: (
                    <>
                      {params.InputProps.endAdornment}
                      <Tooltip
                        title={FORMULE7_MOVER_LEVELS_HELP}
                        placement="top"
                        arrow
                        componentsProps={{
                          tooltip: {
                            sx: {
                              maxWidth: 320,
                              whiteSpace: 'pre-line',
                              textAlign: 'left',
                            },
                          },
                        }}
                      >
                        <span
                          style={{ display: 'inline-flex', cursor: 'help', marginRight: 4 }}
                          aria-label="Uitleg activiteitsniveaus"
                        >
                          <InfoOutlinedIcon sx={{ fontSize: 20, opacity: 0.65 }} />
                        </span>
                      </Tooltip>
                    </>
                  ),
                }}
              />
            )}
            sx={{ width: '100%' }}
          />
          <Autocomplete
            options={FORMULE7_GOAL_OPTIONS}
            value={FORMULE7_GOAL_OPTIONS.find((o) => o.value === formule7.goal) ?? null}
            onChange={(_, v) => set({ goal: v?.value ?? null })}
            getOptionLabel={(o) => o.label}
            renderInput={(params) => (
              <TextField {...params} label="Doelstelling (Formule 7)" size="small" fullWidth />
            )}
            sx={{ width: '100%' }}
          />
        </Box>
        <Box sx={FORM_ROW}>
          <Autocomplete
            options={[1, 2, 3, 4, 5, 6, 7] as const}
            value={formule7.sessionsPerWeek ?? null}
            onChange={(_, v) =>
              set({ sessionsPerWeek: typeof v === 'number' && v >= 1 && v <= 7 ? v : null })
            }
            getOptionLabel={(v) => String(v)}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Trainingsfrequentie per week"
                size="small"
                fullWidth
                InputProps={{
                  ...params.InputProps,
                  endAdornment: (
                    <>
                      {params.InputProps?.endAdornment}
                      <Tooltip
                        title="Hoe vaak de sporter per week wil trainen; hierop wordt het ideaal weekplan gebaseerd."
                        placement="top"
                      >
                        <span style={{ display: 'inline-flex', cursor: 'help', marginLeft: 4 }} aria-label="Uitleg trainingsfrequentie">
                          <InfoOutlinedIcon sx={{ fontSize: 18, opacity: 0.7 }} />
                        </span>
                      </Tooltip>
                    </>
                  ),
                }}
              />
            )}
            sx={{ width: '100%' }}
          />
          <Autocomplete
            options={SESSION_DURATION_OPTIONS}
            value={SESSION_DURATION_OPTIONS.find((o) => o.value === formule7.sessionDurationCategory) ?? null}
            onChange={(_, v) => set({ sessionDurationCategory: v?.value ?? null })}
            getOptionLabel={(o) => o.label}
            renderInput={(params) => (
              <TextField {...params} label="Trainingstijd per sessie" size="small" fullWidth />
            )}
            sx={{ width: '100%' }}
          />
          <TextField
            label="Rusthartfrequentie (sl/min)"
            type="number"
            value={formule7.restingHr ?? ''}
            onChange={(e) => set({ restingHr: e.target.value === '' ? null : Number(e.target.value) || null })}
            size="small"
            fullWidth
            inputProps={{ min: 0 }}
          />
          <TextField
            label="Theoretische max. hartfrequentie (sl/min)"
            type="number"
            value={formule7.theoreticalMaxHr ?? computedMaxHr ?? ''}
            size="small"
            fullWidth
            inputProps={{ min: 0, readOnly: true }}
            placeholder="Vul leeftijd in (220 − leeftijd)"
            InputProps={{
              endAdornment: (
                <Tooltip title="Automatisch: 220 − leeftijd (slagen per minuut)" placement="top">
                  <span style={{ display: 'inline-flex', cursor: 'help', marginLeft: 4 }} aria-label="Uitleg berekening">
                    <InfoOutlinedIcon sx={{ fontSize: 18, opacity: 0.7 }} />
                  </span>
                </Tooltip>
              ),
            }}
          />
        </Box>
        {onStartDateChange != null && onDurationWeeksChange != null && (
          <Box sx={FORM_ROW}>
            <TextField
              label="Startdatum periode"
              type="date"
              value={startDate ?? ''}
              onChange={(e) => onStartDateChange(e.target.value)}
              size="small"
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            <Autocomplete
              options={[4, 5, 6, 7, 8] as const}
              value={durationWeeks}
              onChange={(_, v) => v != null && onDurationWeeksChange(v as 4 | 5 | 6 | 7 | 8)}
              getOptionLabel={(v) => `${v} weken`}
              renderInput={(params) => (
                <TextField {...params} label="Duur (weken)" size="small" fullWidth />
              )}
              sx={{ minWidth: 0 }}
            />
          </Box>
        )}
        </Box>
        </AccordionDetails>
      </Accordion>

      {isPerDay && days.length > 0 && (
        <Box sx={{ ...SECTION_STYLE, minWidth: 0, width: '100%' }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 600 }}>
            Per trainingsdag
          </Typography>
          <FormControl
            size="small"
            fullWidth
            sx={{
              minWidth: 0,
              '& .MuiSelect-select': {
                minHeight: 40,
                boxSizing: 'border-box',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              },
            }}
          >
            <InputLabel id="formule7-day-select-label">Trainingsdag</InputLabel>
            <Select
              labelId="formule7-day-select-label"
              value={selectedDayIndex}
              label="Trainingsdag"
              onChange={(e) => setSelectedDayIndex(Number(e.target.value))}
              MenuProps={{
                disableScrollLock: true,
                PaperProps: { sx: { maxHeight: 'min(60vh, 400px)' } },
              }}
              renderValue={(v) => {
                const d = days[Number(v)];
                return d ? `Dag ${Number(v) + 1}${d.dayLabel ? `: ${d.dayLabel}` : ''}` : '';
              }}
            >
              {days.map((d, idx) => (
                <MenuItem key={idx} value={idx}>
                  Dag {idx + 1}{d.dayLabel ? `: ${d.dayLabel}` : ''}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
      )}

      {/* --- Warming-up --- */}
      <Accordion
        disableGutters
        expanded={expandedSections.includes('2')}
        onChange={() => toggleSection('2')}
        sx={{
          ...SECTION_STYLE,
          '&:before': { display: 'none' },
          boxShadow: 'none',
          '& .MuiAccordionSummary-root': { py: 0.5, minHeight: 44, px: 0 },
          '& .MuiAccordionSummary-content': { my: 0.75 },
        }}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle1" fontWeight={600}>
            2. Warming-up
          </Typography>
        </AccordionSummary>
        <AccordionDetails sx={{ py: 1.5, px: 0, minWidth: 0 }}>
        <HelperText>
          Op basis van de gekozen activiteit worden organisatie, intensiteit en duur automatisch ingevuld.
          De warming-up mag niet dezelfde organisatie (oefenvorm) hebben als de cardiotraining — die opties worden
          daarom uitgesloten. Trainingshartfrequentie volgt uit leeftijd en rusthartslag.
        </HelperText>
        <Box sx={FORM_ROW}>
          <Autocomplete
            options={warmupOrganisationChoices}
            value={warmupOrganisationChoices.find((o) => o.value === effectiveWarmup.organisation) ?? null}
            onChange={(_, v) => setEffectiveWarmup({ organisation: v?.value ?? null })}
            getOptionLabel={(o) => o.label}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Organisatie"
                size="small"
                fullWidth
                placeholder={formule7.moverType ? undefined : 'Kies eerst activiteit (sectie 1)'}
              />
            )}
            sx={{ width: '100%' }}
          />
          <TextField
            label="Intensiteit (% HFmax)"
            type="number"
            value={effectiveWarmup.intensityPercentOfMaxHr ?? ''}
            onChange={(e) => {
              const raw = e.target.value === '' ? null : Number(e.target.value);
              if (raw === null) {
                setEffectiveWarmup({ intensityPercentOfMaxHr: null });
                return;
              }
              if (formule7.moverType) {
                const { intensityPercentMin, intensityPercentMax } = WARMUP_BY_MOVER_TYPE[formule7.moverType];
                const clamped = Math.min(intensityPercentMax, Math.max(intensityPercentMin, raw));
                setEffectiveWarmup({ intensityPercentOfMaxHr: clamped });
              } else {
                setEffectiveWarmup({ intensityPercentOfMaxHr: raw });
              }
            }}
            size="small"
            fullWidth
            inputProps={
              formule7.moverType
                ? {
                    min: WARMUP_BY_MOVER_TYPE[formule7.moverType].intensityPercentMin,
                    max: WARMUP_BY_MOVER_TYPE[formule7.moverType].intensityPercentMax,
                  }
                : { min: 0, max: 100 }
            }
            InputProps={{
              endAdornment: formule7.moverType ? (
                <Tooltip
                  title={`Intensiteit: ${WARMUP_BY_MOVER_TYPE[formule7.moverType].intensityLabel} (alleen dit bereik toegestaan)`}
                  placement="left"
                >
                  <IconButton size="small" aria-label="Uitleg intensiteit">
                    <InfoOutlinedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              ) : undefined,
            }}
          />
          <Box sx={FORM_ROW}>
            <TextField
              label="Trainingshartfrequentie (sl/min)"
              type="text"
              value={(() => {
                const moverType = formule7.moverType;
                const preset = moverType ? WARMUP_BY_MOVER_TYPE[moverType] : null;
                if (preset && preset.intensityPercentMin !== preset.intensityPercentMax) {
                  const hrMin = computeTrainingHr(preset.intensityPercentMin);
                  const hrMax = computeTrainingHr(preset.intensityPercentMax);
                  if (hrMin != null && hrMax != null) return `${hrMin}-${hrMax}`;
                }
                return effectiveWarmup.trainingHr ?? '';
              })()}
              size="small"
              fullWidth
              sx={{ minWidth: 0 }}
              inputProps={{ readOnly: true }}
              InputProps={{
                endAdornment: (
                  <Tooltip
                    title={
                      <>
                        <Typography variant="caption" component="div" fontWeight={600}>
                          Formule
                        </Typography>
                        <Typography variant="caption" component="div">
                          ((220 − leeftijd − rustHF) × %HFmax) + rustHF
                        </Typography>
                        <Typography variant="caption" component="div" sx={{ mt: 0.5 }}>
                          RustHF onbekend = 60 sl/min (fallback).
                        </Typography>
                        {formule7.moverType && (
                          <>
                            <Typography variant="caption" component="div" fontWeight={600} sx={{ mt: 1 }}>
                              Intensiteit
                            </Typography>
                            <Typography variant="caption" component="div">
                              {WARMUP_BY_MOVER_TYPE[formule7.moverType].intensityLabel}
                            </Typography>
                            {WARMUP_BY_MOVER_TYPE[formule7.moverType].intensityPercentMin !==
                            WARMUP_BY_MOVER_TYPE[formule7.moverType].intensityPercentMax ? (
                              <Typography variant="caption" component="div">
                                Berekend: bij {WARMUP_BY_MOVER_TYPE[formule7.moverType].intensityPercentMin}% →{' '}
                                {computeTrainingHr(WARMUP_BY_MOVER_TYPE[formule7.moverType].intensityPercentMin) ?? '–'} sl/min,
                                bij {WARMUP_BY_MOVER_TYPE[formule7.moverType].intensityPercentMax}% →{' '}
                                {computeTrainingHr(WARMUP_BY_MOVER_TYPE[formule7.moverType].intensityPercentMax) ?? '–'} sl/min.
                              </Typography>
                            ) : (
                              <Typography variant="caption" component="div">
                                Berekend: {effectiveWarmup.trainingHr ?? '–'} sl/min.
                              </Typography>
                            )}
                          </>
                        )}
                      </>
                    }
                    placement="left"
                  >
                    <IconButton size="small" aria-label="Uitleg formule en uitkomst">
                      <InfoOutlinedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                ),
              }}
            />
            <TextField
              label="Duur (min)"
              type="number"
              value={effectiveWarmup.durationMinutes ?? ''}
              onChange={(e) => {
                const raw = e.target.value === '' ? null : Number(e.target.value);
                if (raw === null) {
                  setEffectiveWarmup({ durationMinutes: null });
                  return;
                }
                if (formule7.moverType) {
                  const { durationMin, durationMax } = WARMUP_BY_MOVER_TYPE[formule7.moverType];
                  const clamped = Math.min(durationMax, Math.max(durationMin, raw));
                  setEffectiveWarmup({ durationMinutes: clamped });
                } else {
                  setEffectiveWarmup({ durationMinutes: raw });
                }
              }}
              size="small"
              fullWidth
              sx={{ minWidth: 0 }}
              inputProps={
              formule7.moverType
                ? {
                    min: WARMUP_BY_MOVER_TYPE[formule7.moverType].durationMin,
                    max: WARMUP_BY_MOVER_TYPE[formule7.moverType].durationMax,
                  }
                : { min: 0 }
            }
            InputProps={{
              endAdornment: formule7.moverType ? (
                <Tooltip
                  title={`Duur: ${WARMUP_BY_MOVER_TYPE[formule7.moverType].durationMin}-${WARMUP_BY_MOVER_TYPE[formule7.moverType].durationMax} min`}
                  placement="left"
                >
                  <IconButton size="small" aria-label="Uitleg duur">
                    <InfoOutlinedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              ) : undefined,
            }}
          />
        </Box>
        </Box>
        </AccordionDetails>
      </Accordion>

      {/* --- Krachttraining (neuromusculair) --- */}
      <Accordion
        disableGutters
        expanded={expandedSections.includes('3')}
        onChange={() => toggleSection('3')}
        sx={{
          ...SECTION_STYLE,
          '&:before': { display: 'none' },
          boxShadow: 'none',
          '& .MuiAccordionSummary-root': { py: 0.5, minHeight: 44, px: 0 },
          '& .MuiAccordionSummary-content': { my: 0.75 },
        }}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle1" fontWeight={600}>
            3. Krachttraining
          </Typography>
        </AccordionSummary>
        <AccordionDetails sx={{ py: 1.5, px: 0, minWidth: 0 }}>
        <HelperText>
          Neuromusculair trainen (Formule 7). Kies eerst de activiteit in sectie 1; alleen doelen die bij die
          belastbaarheid horen zijn beschikbaar. Bij keuze van een doel worden sets, reps, % 1RM, rusttijd en aantal
          oefeningen automatisch ingevuld.
        </HelperText>
        <Box sx={{ ...FORM_ROW, mt: 0.5, mb: 2 }}>
          <Autocomplete
            options={
              formule7.moverType
                ? FORMULE7_STRENGTH_GOAL_OPTIONS.filter((o) =>
                    ALLOWED_NMT_GOALS_BY_MOVER_TYPE[formule7.moverType!].includes(o.value)
                  )
                : FORMULE7_STRENGTH_GOAL_OPTIONS
            }
            value={
              (() => {
                const goal = formule7.neuromuscular.goal;
                if (!goal) return null;
                const allowed = formule7.moverType
                  ? ALLOWED_NMT_GOALS_BY_MOVER_TYPE[formule7.moverType]
                  : FORMULE7_STRENGTH_GOAL_OPTIONS.map((o) => o.value);
                return allowed.includes(goal)
                  ? FORMULE7_STRENGTH_GOAL_OPTIONS.find((o) => o.value === goal) ?? null
                  : null;
              })()
            }
            onChange={(_, v) => setNeuromuscular({ goal: (v?.value as Formule7StrengthGoal) ?? null })}
            getOptionLabel={(o) => o.label}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Doel (S1–S4.3)"
                size="small"
                fullWidth
                placeholder={formule7.moverType ? undefined : 'Kies eerst activiteit (sectie 1)'}
                InputProps={{
                  ...params.InputProps,
                  endAdornment: (
                    <>
                      {params.InputProps.endAdornment}
                      <Tooltip
                        title={
                          formule7.moverType
                            ? `Toegestaan bij "${getFormule7MoverLabel(formule7.moverType)}": ${ALLOWED_NMT_GOALS_BY_MOVER_TYPE[formule7.moverType].join(', ')}`
                            : 'Alle doelen; kies activiteit voor beperkte keuze op belastbaarheid.'
                        }
                        placement="top"
                        arrow
                      >
                        <span style={{ display: 'inline-flex', cursor: 'help', marginLeft: 4 }}>
                          <InfoOutlinedIcon sx={{ fontSize: 18, opacity: 0.6 }} />
                        </span>
                      </Tooltip>
                    </>
                  ),
                }}
              />
            )}
            sx={{ width: '100%' }}
          />
          {formule7.neuromuscular.goal && (
            <Autocomplete
              options={[4, 6, 7, 8, 9] as const}
              value={formule7.neuromuscular.desiredExerciseCount ?? null}
              onChange={(_, v) => setNeuromuscular({ desiredExerciseCount: (v as 4 | 6 | 7 | 8 | 9) ?? null })}
              getOptionLabel={(v) => String(v)}
              renderInput={(params) => {
                const goal = formule7.neuromuscular.goal;
                const preset = goal ? NMT_PRESETS_BY_GOAL[goal] : null;
                return (
                  <TextField
                    {...params}
                    label="Aantal oefeningen"
                    size="small"
                    fullWidth
                    InputProps={{
                      ...params.InputProps,
                      endAdornment: preset ? (
                        <>
                          {params.InputProps.endAdornment}
                          <Tooltip
                            title={`${preset.minExercises}–${preset.maxExercises} oefeningen (standaard ${preset.desiredExerciseCount})`}
                            placement="top"
                            arrow
                          >
                            <span style={{ display: 'inline-flex', cursor: 'help', marginLeft: 4 }}>
                              <InfoOutlinedIcon sx={{ fontSize: 18, opacity: 0.6 }} />
                            </span>
                          </Tooltip>
                        </>
                      ) : params.InputProps.endAdornment,
                    }}
                  />
                );
              }}
              sx={{ width: '100%' }}
            />
          )}
        </Box>
        {!formule7.neuromuscular.goal ? (
          <EmptyState>
            Kies een doel (S1–S4.3) om de oefeningen te zien en in te vullen. Het aantal oefeningen en de parameters worden dan automatisch ingevuld.
          </EmptyState>
        ) : formule7.neuromuscular.desiredExerciseCount == null ? (
          <EmptyState>
            Selecteer aantal oefeningen in het veld hierboven (4–9 oefeningen).
          </EmptyState>
        ) : (
          <Box sx={{ py: 1, mt: 0.5 }}>
            {(() => {
              const preset = formule7.neuromuscular.goal
                ? NMT_PRESETS_BY_GOAL[formule7.neuromuscular.goal]
                : null;
              if (!preset) return null;
              return showNmtTip ? (
                <Alert
                  severity="info"
                  onClose={dismissNmtTip}
                  sx={{ alignItems: 'flex-start', '& .MuiAlert-message': { flex: 1 } }}
                >
                  <Typography variant="body2" component="span">
                    <strong>Voorschrift:</strong> {formule7.neuromuscular.desiredExerciseCount} oefeningen, standaard {preset.percent1RM}% 1RM, {preset.sets} sets, {preset.reps} reps, {preset.restSeconds} s rust (bereiken: sets {preset.setsMin}–{preset.setsMax}, reps {preset.repsMin}–{preset.repsMax}, rust {preset.restSecMin}–{preset.restSecMax} s).
                  </Typography>
                </Alert>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  <Box
                    component="span"
                    onClick={showNmtTipAgain}
                    sx={{ cursor: 'pointer', textDecoration: 'underline', color: 'primary.main' }}
                  >
                    Uitleg tonen
                  </Box>
                  {' – voorschrift voor deze sectie.'}
                </Typography>
              );
            })()}
          </Box>
        )}
        {slotBeforeDayCards}
        {typeof childrenAfterNeuromuscular === 'function'
          ? childrenAfterNeuromuscular(selectedDayIndex)
          : childrenAfterNeuromuscular}
        </AccordionDetails>
      </Accordion>

      {/* --- Cardiotraining (cardiovasculair) --- */}
      <Accordion
        disableGutters
        expanded={expandedSections.includes('4')}
        onChange={() => toggleSection('4')}
        sx={{
          ...SECTION_STYLE,
          '&:before': { display: 'none' },
          boxShadow: 'none',
          '& .MuiAccordionSummary-root': { py: 0.5, minHeight: 44, px: 0 },
          '& .MuiAccordionSummary-content': { my: 0.75 },
        }}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle1" fontWeight={600}>
            4. Cardiotraining
          </Typography>
        </AccordionSummary>
        <AccordionDetails sx={{ py: 1.5, px: 0, minWidth: 0 }}>
        <HelperText>
          Cardiovasculair trainen (Tabel 8, Formule 2): trainingsmethode, organisatie en per zone met
          trainingshartslag en duur (min). Organisatie en methode volgen uit de gekozen activiteit. Max. HF: 220 −
          leeftijd. De warming-up gebruikt een andere organisatie dan deze cardio.
        </HelperText>
        {!formule7.moverType && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Vul eerst sectie 1 (activiteit / belastbaarheid) in voor toegestane organisatie en trainingsmethodes.
          </Typography>
        )}
        <Box sx={{ ...FORM_ROW, mb: 2 }}>
          <Autocomplete
            freeSolo
            options={formule7.moverType ? CARDIO_TRAINING_METHOD_OPTIONS_BY_MOVER[formule7.moverType] : []}
            value={
              (() => {
                const method = effectiveCardio.trainingMethod ?? '';
                if (!method) return null;
                const opts = formule7.moverType ? CARDIO_TRAINING_METHOD_OPTIONS_BY_MOVER[formule7.moverType] : [];
                return opts.find((o) => o.value === method) ?? method;
              })()
            }
            onInputChange={(_, v) => setEffectiveCardio({ trainingMethod: v })}
            onChange={(_, v) => setEffectiveCardio({ trainingMethod: typeof v === 'string' ? v : (v as { value: string })?.value ?? '' })}
            getOptionLabel={(o) => (typeof o === 'string' ? o : (o as { label: string })?.label ?? '')}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Trainingsmethode"
                size="small"
                fullWidth
                placeholder={formule7.moverType ? 'Kies of typ' : 'Kies eerst activiteit (sectie 1)'}
              />
            )}
            sx={{ minWidth: 0 }}
          />
          <Autocomplete
            options={
              formule7.moverType
                ? CARDIO_ORGANISATION_BY_MOVER_TYPE[formule7.moverType].map((val) =>
                    FORMULE7_ORGANISATION_OPTIONS.find((o) => o.value === val)
                  ).filter(Boolean) as typeof FORMULE7_ORGANISATION_OPTIONS
                : []
            }
            value={
              formule7.moverType &&
              effectiveCardio.organisation &&
              CARDIO_ORGANISATION_BY_MOVER_TYPE[formule7.moverType].includes(effectiveCardio.organisation)
                ? FORMULE7_ORGANISATION_OPTIONS.find((o) => o.value === effectiveCardio.organisation) ?? null
                : null
            }
            onChange={(_, v) => setEffectiveCardio({ organisation: v?.value ?? null })}
            getOptionLabel={(o) => o.label}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Organisatie"
                size="small"
                fullWidth
                placeholder={formule7.moverType ? undefined : 'Kies eerst activiteit (sectie 1)'}
              />
            )}
            sx={{ minWidth: 0 }}
          />
        </Box>
        {([0, 1, 2] as const).map((i) => {
          const zoneNum = (i + 1) as 1 | 2 | 3;
          const zoneHrPreset = CARDIO_ZONE_HR_PERCENT[zoneNum];
          const maxHr = formule7.theoreticalMaxHr ?? (formule7.ageYears != null ? 220 - Number(formule7.ageYears) : null);
          const suggestedHr = maxHr != null ? Math.round((maxHr * zoneHrPreset.defaultPercent) / 100) : null;
          const allowedOrgOptions =
            formule7.moverType
              ? CARDIO_ORGANISATION_BY_MOVER_TYPE[formule7.moverType].map((val) =>
                  FORMULE7_ORGANISATION_OPTIONS.find((o) => o.value === val)
                ).filter(Boolean) as typeof FORMULE7_ORGANISATION_OPTIONS
              : [];
          return (
            <Box
              key={i}
              sx={{
                p: 1.5,
                borderRadius: 1,
                bgcolor: 'rgba(0,0,0,0.03)',
              }}
            >
              <Typography variant="body2" fontWeight={600} sx={{ mb: 1.5, display: 'block' }}>
                Zone {zoneNum} ({zoneHrPreset.zoneName})
              </Typography>
              <Box sx={FORM_ROW}>
                <Autocomplete
                  options={allowedOrgOptions}
                  value={
                    formule7.moverType &&
                    effectiveCardio.zones[i]?.organisation != null &&
                    CARDIO_ORGANISATION_BY_MOVER_TYPE[formule7.moverType].includes(effectiveCardio.zones[i]!.organisation!)
                      ? FORMULE7_ORGANISATION_OPTIONS.find((o) => o.value === effectiveCardio.zones[i]?.organisation) ?? null
                      : null
                  }
                  onChange={(_, v) => setCardioZone(i, { organisation: v?.value ?? null })}
                  getOptionLabel={(o) => o.label}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Organisatie"
                      size="small"
                      fullWidth
                      placeholder={formule7.moverType ? undefined : 'Kies eerst activiteit (sectie 1)'}
                    />
                  )}
                  sx={{ minWidth: 0 }}
                />
                <TextField
                  label="Trainingshartslag (sl/min)"
                  type="number"
                  value={effectiveCardio.zones[i]?.trainingHr ?? ''}
                  onChange={(e) => {
                    const raw = e.target.value === '' ? null : Number(e.target.value) || null;
                    if (raw == null) {
                      setCardioZone(i, { trainingHr: null });
                      return;
                    }
                    const minHr = maxHr != null ? Math.round((maxHr * zoneHrPreset.min) / 100) : 0;
                    const maxHrZone = maxHr != null ? Math.round((maxHr * zoneHrPreset.max) / 100) : 300;
                    setCardioZone(i, { trainingHr: Math.min(maxHrZone, Math.max(minHr, raw)) });
                  }}
                  size="small"
                  fullWidth
                  inputProps={{
                    min: maxHr != null ? Math.round((maxHr * zoneHrPreset.min) / 100) : 0,
                    max: maxHr != null ? Math.round((maxHr * zoneHrPreset.max) / 100) : 300,
                  }}
                  placeholder={suggestedHr != null ? `Standaard ${suggestedHr} (${zoneHrPreset.defaultPercent}% max HF)` : undefined}
                  InputProps={{
                    endAdornment: (
                      <Tooltip
                        title={
                          <>
                            <Typography variant="caption" component="div" fontWeight={600}>
                              Trainingshartslag
                            </Typography>
                            <Typography variant="caption" component="div">
                              {zoneHrPreset.zoneName}: {zoneHrPreset.min}–{zoneHrPreset.max}% HF-max. Berekening: 220 − leeftijd = max HF.
                            </Typography>
                            {maxHr != null && (
                              <Typography variant="caption" component="div" sx={{ mt: 0.5 }}>
                                Max HF ≈ {maxHr}. Standaard {zoneHrPreset.defaultPercent}% → {suggestedHr} sl/min (wordt automatisch ingevuld).
                              </Typography>
                            )}
                          </>
                        }
                        placement="left"
                      >
                        <IconButton size="small" aria-label="Uitleg trainingshartslag zone">
                          <InfoOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    ),
                  }}
                />
                <TextField
                  label="Duur (min)"
                  type="number"
                  value={effectiveCardio.zones[i]?.durationMinutes ?? ''}
                  onChange={(e) =>
                    setCardioZone(i, {
                      durationMinutes: e.target.value === '' ? null : Number(e.target.value) || null,
                    })
                  }
                  size="small"
                  fullWidth
                  inputProps={{ min: 0 }}
                />
              </Box>
            </Box>
          );
        })}
        </AccordionDetails>
      </Accordion>

      {/* --- Cooling-down --- */}
      <Accordion
        disableGutters
        expanded={expandedSections.includes('5')}
        onChange={() => toggleSection('5')}
        sx={{
          ...SECTION_STYLE,
          '&:before': { display: 'none' },
          boxShadow: 'none',
          '& .MuiAccordionSummary-root': { py: 0.5, minHeight: 44, px: 0 },
          '& .MuiAccordionSummary-content': { my: 0.75 },
        }}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle1" fontWeight={600}>
            5. Cooling-down
          </Typography>
        </AccordionSummary>
        <AccordionDetails sx={{ py: 1.5, px: 0, minWidth: 0 }}>
        <HelperText>
          Vul intensiteit in % HFmax in; de trainingshartfrequentie wordt automatisch berekend met je leeftijd en
          rusthartslag.
        </HelperText>
        <Box sx={FORM_ROW}>
          <Autocomplete
            options={FORMULE7_COOLDOWN_ORGANISATION_OPTIONS}
            value={
              FORMULE7_COOLDOWN_ORGANISATION_OPTIONS.find((o) => o.value === effectiveCooldown.organisation) ?? null
            }
            onChange={(_, v) => setEffectiveCooldown({ organisation: v?.value ?? null })}
            getOptionLabel={(o) => o.label}
            renderInput={(params) => (
              <TextField {...params} label="Organisatie" size="small" fullWidth />
            )}
            sx={{ minWidth: 0 }}
          />
          <TextField
            label="Intensiteit (% HFmax)"
            type="number"
            value={effectiveCooldown.intensityPercentOfMaxHr ?? ''}
            onChange={(e) =>
              setEffectiveCooldown({
                intensityPercentOfMaxHr: e.target.value === '' ? null : Number(e.target.value) || null,
              })
            }
            size="small"
            fullWidth
            sx={{ minWidth: 0 }}
            inputProps={{ min: 0, max: 100 }}
          />
          <TextField
            label="Trainingshartfrequentie (sl/min)"
            type="text"
            value={effectiveCooldown.trainingHr ?? ''}
            size="small"
            fullWidth
            sx={{ minWidth: 0 }}
            inputProps={{ readOnly: true }}
            InputProps={{
              endAdornment: (
                <Tooltip
                  title={
                    <>
                      <Typography variant="caption" component="div" fontWeight={600}>
                        Formule
                      </Typography>
                      <Typography variant="caption" component="div">
                        ((220 − leeftijd − rustHF) × %HFmax) + rustHF
                      </Typography>
                      <Typography variant="caption" component="div" sx={{ mt: 0.5 }}>
                        RustHF onbekend = 60 sl/min (fallback). Berekend: {effectiveCooldown.trainingHr ?? '–'} sl/min.
                      </Typography>
                    </>
                  }
                  placement="left"
                >
                  <IconButton size="small" aria-label="Uitleg formule en uitkomst">
                    <InfoOutlinedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              ),
            }}
          />
          <TextField
            label="Duur (min)"
            type="number"
            value={effectiveCooldown.durationMinutes ?? ''}
            onChange={(e) =>
              setEffectiveCooldown({ durationMinutes: e.target.value === '' ? null : Number(e.target.value) || null })
            }
            size="small"
            fullWidth
            sx={{ minWidth: 0 }}
            inputProps={{ min: 0 }}
          />
        </Box>
        </AccordionDetails>
      </Accordion>

      {/* --- Stretching --- */}
      <Accordion
        disableGutters
        expanded={expandedSections.includes('6')}
        onChange={() => toggleSection('6')}
        sx={{
          ...SECTION_STYLE,
          '&:before': { display: 'none' },
          boxShadow: 'none',
          '& .MuiAccordionSummary-root': { py: 0.5, minHeight: 44, px: 0 },
          '& .MuiAccordionSummary-content': { my: 0.75 },
        }}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle1" fontWeight={600}>
            6. Stretching
          </Typography>
        </AccordionSummary>
        <AccordionDetails sx={{ py: 1.5, px: 0, minWidth: 0 }}>
        <HelperText>
          Per spiergroep: duur van de stretch (sec) en aantal herhalingen. Je kunt de spiergroepen laten vullen op basis van de oefeningen in je workout.
        </HelperText>
        {schemaExerciseNames.length > 0 && (
          <Box sx={{ mb: 1.5 }}>
            <md-text-button
              onClick={() => {
                const groups = getMuscleGroupsFromExerciseNames(schemaExerciseNames);
                const newStretching = groups.map((muscleGroup) => ({
                  muscleGroup,
                  stretchDurationSeconds: null as number | null,
                  repetitions: null as number | null,
                }));
                setEffectiveStretching(newStretching);
              }}
            >
              Vul stretching op basis van oefeningen
            </md-text-button>
          </Box>
        )}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0 }}>
          {stretchingRows.map((row, idx) => (
            <Box
              key={idx}
              sx={{
                ...STRETCH_ROW,
                p: 1.5,
                borderRadius: 1,
                bgcolor: 'rgba(0,0,0,0.03)',
              }}
            >
              <TextField
                label="Spiergroep"
                value={row.muscleGroup}
                onChange={(e) => setStretch(idx, { muscleGroup: e.target.value })}
                size="small"
                fullWidth
                sx={{ minWidth: 0 }}
                placeholder="Spiergroep"
              />
              <TextField
                label="Duur stretch (sec)"
                type="number"
                value={row.stretchDurationSeconds ?? ''}
                onChange={(e) =>
                  setStretch(idx, {
                    stretchDurationSeconds:
                      e.target.value === '' ? null : Number(e.target.value) || null,
                  })
                }
                size="small"
                fullWidth
                sx={{ minWidth: 0 }}
                inputProps={{ min: 0 }}
              />
              <TextField
                label="Herhalingen"
                type="number"
                value={row.repetitions ?? ''}
                onChange={(e) =>
                  setStretch(idx, {
                    repetitions: e.target.value === '' ? null : Number(e.target.value) || null,
                  })
                }
                size="small"
                fullWidth
                sx={{ minWidth: 0 }}
                inputProps={{ min: 0 }}
              />
              <Box sx={{ flex: '0 0 40px', width: 40, height: 40, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <IconButton
                  size="small"
                  onClick={() => removeStretchRow(idx)}
                  aria-label="Rij verwijderen"
                  color="error"
                  sx={{
                    width: 40,
                    height: 40,
                    minWidth: 40,
                    padding: 0,
                    '& .MuiSvgIcon-root': { fontSize: 22 },
                  }}
                >
                  <DeleteOutlineIcon />
                </IconButton>
              </Box>
            </Box>
          ))}
          <Box sx={{ mt: 0.5 }}>
            <md-text-button onClick={addStretchRow}>
              Rij toevoegen
            </md-text-button>
          </Box>
        </Box>
        </AccordionDetails>
      </Accordion>

      {/* --- Bijzonderheden --- */}
      <Accordion
        disableGutters
        expanded={expandedSections.includes('7')}
        onChange={() => toggleSection('7')}
        sx={{
          ...SECTION_STYLE,
          '&:before': { display: 'none' },
          boxShadow: 'none',
          '& .MuiAccordionSummary-root': { py: 0.5, minHeight: 44, px: 0 },
          '& .MuiAccordionSummary-content': { my: 0.75 },
        }}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle1" fontWeight={600}>
            7. Bijzonderheden
          </Typography>
        </AccordionSummary>
        <AccordionDetails sx={{ py: 1.5, px: 0, minWidth: 0 }}>
        <HelperText>
          Eventuele opmerkingen, contra-indicaties of aandachtspunten voor deze workout.
        </HelperText>
        <TextField
          label="Bijzonderheden"
          value={formule7.notes}
          onChange={(e) => set({ notes: e.target.value })}
          size="small"
          fullWidth
          multiline
          rows={3}
          placeholder="Vrije notities…"
        />
        </AccordionDetails>
      </Accordion>
    </Box>
  );
}
