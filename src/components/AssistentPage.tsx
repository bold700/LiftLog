import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Typography, TextField, IconButton, Chip, CircularProgress, Button } from '@mui/material';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import { PageLayout, ContentCard, PageTitle } from './layout';
import { useProfile } from '../context/ProfileContext';
import { askAssistant, labelForStep, type AssistantMessage } from '../services/assistantService';
import { designTokens } from '../theme/designTokens';

/** Eén bericht in het scherm; assistentberichten dragen ook wat er onderweg is gedaan. */
type ChatItem = AssistantMessage & { steps?: { tool: string; ok: boolean }[]; failed?: boolean };

/** Voorbeeldvragen: laten meteen zien wat de assistent kan, per rol iets anders. */
const SUGGESTIONS_STAFF = [
  'Wat is mijn training vandaag?',
  'Hoe gaat het met mijn sporters deze week?',
  'Maak een 3-daags krachtschema voor Bas',
  'Leg voor Bas een meting vast: 84 kg',
];
const SUGGESTIONS_ATHLETE = [
  'Wat is mijn training vandaag?',
  'Hoeveel heb ik vandaag gegeten?',
  'Log 3 sets squat op 80 kg',
  'Hoe gaat mijn bankdrukken vooruit?',
];

export function AssistentPage() {
  const profile = useProfile();
  const role = profile?.profile?.role ?? 'sporter';
  const isStaff = role === 'trainer' || role === 'admin';
  const suggestions = useMemo(() => (isStaff ? SUGGESTIONS_STAFF : SUGGESTIONS_ATHLETE), [isStaff]);

  const [items, setItems] = useState<ChatItem[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [items, busy]);

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || busy) return;
      setError(null);
      setDraft('');

      const history: ChatItem[] = [...items, { role: 'user', content: message }];
      setItems(history);
      setBusy(true);
      try {
        const answer = await askAssistant(history.map(({ role: r, content }) => ({ role: r, content })));
        setItems([...history, { role: 'assistant', content: answer.reply, steps: answer.steps }]);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'De assistent is even niet bereikbaar.';
        setError(msg);
        setItems([...history, { role: 'assistant', content: msg, failed: true }]);
      } finally {
        setBusy(false);
      }
    },
    [busy, items]
  );

  const retry = useCallback(() => {
    // Laatste antwoord weggooien en de vraag opnieuw stellen.
    const lastUser = [...items].reverse().find((i) => i.role === 'user');
    if (!lastUser) return;
    setItems(items.slice(0, items.findIndex((i) => i === lastUser)));
    void send(lastUser.content);
  }, [items, send]);

  return (
    <PageLayout>
      <PageTitle>Assistent</PageTitle>
      <Typography variant="body2" color="text.secondary" sx={{ mt: -2, mb: 2, px: 0.5 }}>
        {isStaff
          ? 'Vraag naar je sporters, maak schema’s of leg metingen vast — in gewone taal.'
          : 'Vraag je training op, log je sets of check je voeding — in gewone taal.'}
      </Typography>

      <ContentCard>
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 1.5,
            minHeight: 280,
            maxHeight: '55vh',
            overflowY: 'auto',
            pr: 0.5,
          }}
        >
          {items.length === 0 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 4, px: 2 }}>
              <AutoAwesomeRoundedIcon sx={{ fontSize: 40, color: 'text.disabled' }} />
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', maxWidth: 380 }}>
                De assistent kent je schema’s, logs, voeding en metingen. Hij ziet alleen wat jij mag zien.
              </Typography>
            </Box>
          )}

          {items.map((item, i) => (
            <Box
              key={i}
              sx={{
                alignSelf: item.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '88%',
                bgcolor: item.role === 'user' ? 'primary.main' : designTokens.cardBackground,
                color: item.role === 'user' ? 'primary.contrastText' : 'text.primary',
                border: item.role === 'user' ? 'none' : `1px solid ${designTokens.cardBorder}`,
                borderRadius: 2,
                px: 1.75,
                py: 1.25,
              }}
            >
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {item.content}
              </Typography>
              {item.steps && item.steps.length > 0 && (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
                  {item.steps.map((s, j) => (
                    <Chip
                      key={j}
                      size="small"
                      variant="outlined"
                      label={labelForStep(s.tool)}
                      color={s.ok ? 'default' : 'warning'}
                      sx={{ height: 22, fontSize: 11 }}
                    />
                  ))}
                </Box>
              )}
              {item.failed && (
                <Button size="small" startIcon={<RefreshRoundedIcon />} onClick={retry} sx={{ mt: 0.5 }}>
                  Opnieuw proberen
                </Button>
              )}
            </Box>
          ))}

          {busy && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, alignSelf: 'flex-start', px: 0.5 }}>
              <CircularProgress size={16} />
              <Typography variant="caption" color="text.secondary">
                Even kijken…
              </Typography>
            </Box>
          )}
          <div ref={bottomRef} />
        </Box>

        {items.length === 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 2 }}>
            {suggestions.map((s) => (
              <Chip key={s} label={s} size="small" onClick={() => void send(s)} disabled={busy} />
            ))}
          </Box>
        )}

        <Box
          component="form"
          onSubmit={(e) => {
            e.preventDefault();
            void send(draft);
          }}
          sx={{ display: 'flex', gap: 1, alignItems: 'flex-end', mt: 2 }}
        >
          <TextField
            fullWidth
            multiline
            maxRows={4}
            size="small"
            placeholder="Stel je vraag…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send(draft);
              }
            }}
            disabled={busy}
            inputProps={{ 'aria-label': 'Bericht aan de assistent' }}
          />
          <IconButton type="submit" color="primary" disabled={busy || !draft.trim()} aria-label="Versturen">
            <SendRoundedIcon />
          </IconButton>
        </Box>

        {error && (
          <Typography variant="caption" color="error" sx={{ display: 'block', mt: 1 }}>
            {error}
          </Typography>
        )}
      </ContentCard>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5, px: 1 }}>
        De assistent gebruikt een AI-model van een externe partij. Deel hier geen gegevens die daar niet horen.
      </Typography>
    </PageLayout>
  );
}
