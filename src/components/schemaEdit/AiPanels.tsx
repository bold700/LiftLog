/**
 * AI-panelen van SchemaEditView: de Formule 7-wizard (casus → vragen → genereren) die
 * de editor eerst verbergt, en het generatiepaneel boven de editor (vrij of Formule 7
 * opnieuw genereren, incl. aanvullende vragen en rationale).
 */
import {
  Typography,
  Box,
  Button,
  Alert,
  CircularProgress,
  TextField,
  Stepper,
  Step,
  StepLabel,
} from '@mui/material';
import type { AiSchemaGeneration } from './useAiSchemaGeneration';

const AI_PANEL_SHELL_SX = {
  p: 2,
  mb: 2,
  borderRadius: 2,
  backgroundColor: 'rgba(0,0,0,0.03)',
  border: '1px solid rgba(0,0,0,0.08)',
} as const;

export interface AiFormule7WizardProps {
  ai: AiSchemaGeneration;
}

/** Stappenplan voor een nieuwe Formule 7-workout met AI (zolang de editor nog niet ontgrendeld is). */
export function AiFormule7Wizard({ ai }: AiFormule7WizardProps) {
  const {
    aiPrompt,
    setAiPrompt,
    aiGenerating,
    aiQuestionsLoading,
    aiError,
    aiQuestions,
    aiAnswers,
    setAiAnswers,
    aiWizardStep,
    setAiWizardStep,
    setAiEditorUnlocked,
    handleGenerateWithAi,
    handleGetFollowUpQuestions,
  } = ai;
  return (
            <Box sx={AI_PANEL_SHELL_SX}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                Stappenplan
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Eerst je casus, daarna eventuele aanvullende vragen, daarna vult de AI de routekaart en
                het weekschema in — hetzelfde als bij een handmatige routekaart, maar sneller.
              </Typography>
              <Stepper activeStep={aiWizardStep} sx={{ mb: 3 }}>
                <Step>
                  <StepLabel>Casus</StepLabel>
                </Step>
                <Step>
                  <StepLabel>Vragen & genereren</StepLabel>
                </Step>
              </Stepper>

              {aiWizardStep === 0 && (
                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                    Beschrijf cliënt, doel, activiteit/belastbaarheid, route (G/U/S/…), frequentie per week,
                    duur sessie, rust- en max-hartslag, beperkingen en materiaal. Minimaal 10 tekens.
                  </Typography>
                  <TextField
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="Bijv. Man 42, casus obesitas, low mover, route GS, 3× per week, 45 min, rust-HF 75, max-HF 185, knie minder diep buigen, thuisgym met dumbbells en weerstandsband."
                    multiline
                    minRows={4}
                    fullWidth
                    disabled={aiGenerating}
                    label="Casus voor de AI"
                  />
                  {aiError && (
                    <Alert severity="error" sx={{ mt: 1.5 }}>
                      {aiError}
                    </Alert>
                  )}
                  <Box
                    sx={{
                      mt: 2,
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 1,
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <Button variant="text" color="inherit" onClick={() => setAiEditorUnlocked(true)}>
                      Overslaan — zelf routekaart invullen
                    </Button>
                    <Button
                      variant="contained"
                      disabled={aiGenerating || aiQuestionsLoading || aiPrompt.trim().length < 10}
                      onClick={async () => {
                        const ok = await handleGetFollowUpQuestions();
                        if (ok) setAiWizardStep(1);
                      }}
                      startIcon={
                        aiQuestionsLoading ? (
                          <CircularProgress size={16} color="inherit" />
                        ) : undefined
                      }
                    >
                      {aiQuestionsLoading ? 'Vragen ophalen…' : 'Volgende: aanvullende vragen'}
                    </Button>
                  </Box>
                </Box>
              )}

              {aiWizardStep === 1 && (
                <Box>
                  <Button size="small" onClick={() => setAiWizardStep(0)} sx={{ mb: 2 }}>
                    ← Terug naar casus
                  </Button>
                  {aiQuestions.length > 0 ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, mb: 2 }}>
                      <Alert severity="info">
                        Beantwoord deze vragen; daarna wordt de routekaart zo compleet mogelijk ingevuld.
                      </Alert>
                      {aiQuestions.map((q) => (
                        <Box key={q.id} sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                          <Typography
                            variant="subtitle2"
                            component="label"
                            htmlFor={`ai-followup-${q.id}`}
                            sx={{ fontWeight: 600, lineHeight: 1.45 }}
                          >
                            {q.question}
                          </Typography>
                          <TextField
                            id={`ai-followup-${q.id}`}
                            value={aiAnswers[q.id] ?? ''}
                            onChange={(e) =>
                              setAiAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                            }
                            fullWidth
                            multiline
                            minRows={2}
                            disabled={aiGenerating}
                            placeholder="Typ je antwoord"
                            inputProps={{ 'aria-label': q.question }}
                          />
                        </Box>
                      ))}
                    </Box>
                  ) : (
                    <Alert severity="info" sx={{ mb: 2 }}>
                      Geen extra vragen nodig op basis van je casus. Je kunt direct genereren.
                    </Alert>
                  )}
                  {aiError && (
                    <Alert severity="error" sx={{ mt: 1.5 }}>
                      {aiError}
                    </Alert>
                  )}
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'space-between' }}>
                    <Button variant="text" color="inherit" onClick={() => setAiEditorUnlocked(true)}>
                      Overslaan — zelf invullen
                    </Button>
                    <Button
                      variant="contained"
                      onClick={handleGenerateWithAi}
                      disabled={aiGenerating || aiPrompt.trim().length < 10}
                      startIcon={
                        aiGenerating ? <CircularProgress size={16} color="inherit" /> : undefined
                      }
                    >
                      {aiGenerating ? 'Genereren…' : 'Genereer routekaart & weekschema'}
                    </Button>
                  </Box>
                </Box>
              )}
            </Box>
  );
}

export interface AiGenerationPanelProps {
  ai: AiSchemaGeneration;
  isFormule7Template: boolean;
}

/** Paneel boven de editor: workout (opnieuw) genereren met AI, vrij of Formule 7. */
export function AiGenerationPanel({ ai, isFormule7Template }: AiGenerationPanelProps) {
  const {
    aiPrompt,
    setAiPrompt,
    aiGenerating,
    aiQuestionsLoading,
    aiError,
    aiQuestions,
    aiAnswers,
    setAiAnswers,
    aiRationale,
    handleGenerateWithAi,
    handleGetFollowUpQuestions,
  } = ai;
  return (
            <Box sx={AI_PANEL_SHELL_SX}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                {isFormule7Template
                  ? 'Genereer opnieuw met AI (Formule 7)'
                  : 'Genereer workout met AI'}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                {isFormule7Template
                  ? 'Pas de casus of antwoorden aan en genereer opnieuw. De AI vult routekaart én trainingsdagen.'
                  : 'Beschrijf doel, niveau, aantal dagen, beschikbare apparatuur en eventuele blessures.'}
              </Typography>
              <TextField
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder={
                  isFormule7Template
                    ? 'Bijv. Man 42, casus obesitas, low mover, route GS, 3× per week, 45 min, rust-HF 75, max-HF 185, knie minder diep buigen, thuisgym met dumbbells en weerstandsband.'
                    : 'Bijv. 3-daags schema voor spieropbouw, beginner, vooral dumbbells en kabels, geen squats i.v.m. knie.'
                }
                multiline
                minRows={3}
                fullWidth
                disabled={aiGenerating}
              />
              {isFormule7Template && (
                <Box sx={{ mt: 1.25, display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    variant="outlined"
                    onClick={() => {
                      void handleGetFollowUpQuestions();
                    }}
                    disabled={aiGenerating || aiQuestionsLoading || aiPrompt.trim().length < 10}
                    startIcon={
                      aiQuestionsLoading ? (
                        <CircularProgress size={16} color="inherit" />
                      ) : undefined
                    }
                  >
                    {aiQuestionsLoading
                      ? 'Vragen ophalen…'
                      : 'Aanvullende vragen laten stellen'}
                  </Button>
                </Box>
              )}
              {isFormule7Template && aiQuestions.length > 0 && (
                <Box sx={{ mt: 1.5, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                  <Alert severity="info">
                    Beantwoord deze vragen zodat AI zoveel mogelijk Formule 7-velden kan invullen.
                  </Alert>
                  {aiQuestions.map((q) => (
                    <Box key={q.id} sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                      <Typography
                        variant="subtitle2"
                        component="label"
                        htmlFor={`ai-followup-panel-${q.id}`}
                        sx={{ fontWeight: 600, lineHeight: 1.45 }}
                      >
                        {q.question}
                      </Typography>
                      <TextField
                        id={`ai-followup-panel-${q.id}`}
                        value={aiAnswers[q.id] ?? ''}
                        onChange={(e) =>
                          setAiAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                        }
                        fullWidth
                        multiline
                        minRows={2}
                        disabled={aiGenerating}
                        placeholder="Typ je antwoord"
                        inputProps={{ 'aria-label': q.question }}
                      />
                    </Box>
                  ))}
                </Box>
              )}
              {aiError && (
                <Alert severity="error" sx={{ mt: 1.5 }}>
                  {aiError}
                </Alert>
              )}
              {aiRationale?.overall && (
                <Box sx={{ mt: 1.5 }}>
                  <Alert severity="info" sx={{ mb: 1.25 }}>
                    Waarom dit schema:
                  </Alert>
                  <Typography variant="body2" color="text.secondary">
                    {aiRationale.overall}
                  </Typography>
                  {aiRationale.whyByDay?.length > 0 && (
                    <Box sx={{ mt: 1 }}>
                      {aiRationale.whyByDay
                        .filter((x) => x.why && x.why.trim().length > 0)
                        .slice(0, 7)
                        .map((x) => (
                          <Typography key={x.dayLabel} variant="body2" sx={{ mt: 0.75 }}>
                            <strong>{x.dayLabel}:</strong> {x.why}
                          </Typography>
                        ))}
                    </Box>
                  )}
                </Box>
              )}
              <Box sx={{ mt: 1.5, display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                  variant="contained"
                  onClick={handleGenerateWithAi}
                  disabled={aiGenerating || aiPrompt.trim().length < 10}
                  startIcon={aiGenerating ? <CircularProgress size={16} color="inherit" /> : undefined}
                >
                  {aiGenerating ? 'Genereren…' : 'Genereer met AI'}
                </Button>
              </Box>
            </Box>
  );
}
