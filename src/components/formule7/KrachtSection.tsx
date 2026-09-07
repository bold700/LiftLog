// Sectie 3 van de Formule 7-routekaart: krachttraining (neuromusculair): doel S1–S4.3, aantal oefeningen,
// voorschrift-tip, en het inhaakpunt voor de dagkaarten/oefeningen (childrenAfterNeuromuscular).
import { useState } from 'react';
import { Alert, Box, Typography, TextField, Autocomplete, Tooltip } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import type { Formule7Routekaart, Formule7MoverType, Formule7StrengthGoal } from '../../types';
import {
  FORMULE7_STRENGTH_GOAL_OPTIONS,
  NMT_PRESETS_BY_GOAL,
  ALLOWED_NMT_GOALS_BY_MOVER_TYPE,
  getFormule7MoverLabel,
} from '../../utils/formule7Defaults';
import { EmptyState } from '../layout';
import { FORM_ROW, HelperText, Formule7SectionAccordion } from './sectionShared';

const NMT_TIP_STORAGE_KEY = 'liftlog.formule7NmtTipDismissed';

interface KrachtSectionProps {
  value: Formule7Routekaart['neuromuscular'];
  onChange: (upd: Partial<Formule7Routekaart['neuromuscular']>) => void;
  moverType: Formule7MoverType | null;
  /** Geselecteerde dag (per-dag weergave); doorgegeven aan childrenAfterNeuromuscular als functie. */
  selectedDayIndex: number;
  /** Optioneel: blok getoond vóór de dagkaarten (bijv. filter "Oefeningen tonen"). */
  slotBeforeDayCards?: React.ReactNode;
  /** Inhoud na sectie 3: oefeningen. Bij per-dag weergave: functie (dayIndex) => oefeningen voor die dag. */
  childrenAfterNeuromuscular?: React.ReactNode | ((dayIndex: number) => React.ReactNode);
  expanded: boolean;
  onToggle: () => void;
}

export function KrachtSection({
  value: neuromuscular,
  onChange: setNeuromuscular,
  moverType,
  selectedDayIndex,
  slotBeforeDayCards,
  childrenAfterNeuromuscular,
  expanded,
  onToggle,
}: KrachtSectionProps) {
  const [showNmtTip, setShowNmtTip] = useState(
    () => !localStorage.getItem(NMT_TIP_STORAGE_KEY)
  );
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

  return (
    <Formule7SectionAccordion title="3. Krachttraining" expanded={expanded} onToggle={onToggle}>
        <HelperText>
          Neuromusculair trainen (Formule 7). Kies eerst de activiteit in sectie 1; alleen doelen die bij die
          belastbaarheid horen zijn beschikbaar. Bij keuze van een doel worden sets, reps, % 1RM, rusttijd en aantal
          oefeningen automatisch ingevuld.
        </HelperText>
        <Box sx={{ ...FORM_ROW, mt: 0.5, mb: 2 }}>
          <Autocomplete
            options={
              moverType
                ? FORMULE7_STRENGTH_GOAL_OPTIONS.filter((o) =>
                    ALLOWED_NMT_GOALS_BY_MOVER_TYPE[moverType!].includes(o.value)
                  )
                : FORMULE7_STRENGTH_GOAL_OPTIONS
            }
            value={
              (() => {
                const goal = neuromuscular.goal;
                if (!goal) return null;
                const allowed = moverType
                  ? ALLOWED_NMT_GOALS_BY_MOVER_TYPE[moverType]
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
                placeholder={moverType ? undefined : 'Kies eerst activiteit (sectie 1)'}
                InputProps={{
                  ...params.InputProps,
                  endAdornment: (
                    <>
                      {params.InputProps.endAdornment}
                      <Tooltip
                        title={
                          moverType
                            ? `Toegestaan bij "${getFormule7MoverLabel(moverType)}": ${ALLOWED_NMT_GOALS_BY_MOVER_TYPE[moverType].join(', ')}`
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
          {neuromuscular.goal && (
            <Autocomplete
              options={[4, 6, 7, 8, 9] as const}
              value={neuromuscular.desiredExerciseCount ?? null}
              onChange={(_, v) => setNeuromuscular({ desiredExerciseCount: (v as 4 | 6 | 7 | 8 | 9) ?? null })}
              getOptionLabel={(v) => String(v)}
              renderInput={(params) => {
                const goal = neuromuscular.goal;
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
        {!neuromuscular.goal ? (
          <EmptyState>
            Kies een doel (S1–S4.3) om de oefeningen te zien en in te vullen. Het aantal oefeningen en de parameters worden dan automatisch ingevuld.
          </EmptyState>
        ) : neuromuscular.desiredExerciseCount == null ? (
          <EmptyState>
            Selecteer aantal oefeningen in het veld hierboven (4–9 oefeningen).
          </EmptyState>
        ) : (
          <Box sx={{ py: 1, mt: 0.5 }}>
            {(() => {
              const preset = neuromuscular.goal
                ? NMT_PRESETS_BY_GOAL[neuromuscular.goal]
                : null;
              if (!preset) return null;
              return showNmtTip ? (
                <Alert
                  severity="info"
                  onClose={dismissNmtTip}
                  sx={{ alignItems: 'flex-start', '& .MuiAlert-message': { flex: 1 } }}
                >
                  <Typography variant="body2" component="span">
                    <strong>Voorschrift:</strong> {neuromuscular.desiredExerciseCount} oefeningen, standaard {preset.percent1RM}% 1RM, {preset.sets} sets, {preset.reps} reps, {preset.restSeconds} s rust (bereiken: sets {preset.setsMin}–{preset.setsMax}, reps {preset.repsMin}–{preset.repsMax}, rust {preset.restSecMin}–{preset.restSecMax} s).
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
    </Formule7SectionAccordion>
  );
}
