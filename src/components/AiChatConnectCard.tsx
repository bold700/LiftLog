/**
 * Profiel-kaart: koppel VORM aan ChatGPT, Claude of Gemini via een koppel-URL (MCP).
 * De URL bevat een geheime sleutel; hij wordt één keer getoond (en op dit apparaat onthouden).
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, IconButton, List, ListItem, ListItemText, Stack, Typography } from '@mui/material';
import SmartToyRoundedIcon from '@mui/icons-material/SmartToyRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import { ContentCard } from './layout';
import { createMcpKey, getCachedMcpUrl, listMcpKeys, revokeMcpKey, type McpKeyInfo } from '../services/mcpKeyService';

interface Props {
  userId: string;
}

function fmtDate(iso: string | null): string {
  if (!iso) return 'onbekend';
  return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function AiChatConnectCard({ userId }: Props) {
  const [keys, setKeys] = useState<McpKeyInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState<{ id: string; url: string } | null>(() => getCachedMcpUrl());
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listMcpKeys(userId);
      setKeys(list);
      // Gecachte URL alleen tonen als de sleutel nog bestaat.
      setShown((cur) => (cur && list.some((k) => k.id === cur.id) ? cur : null));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Koppelingen laden mislukt.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await createMcpKey(userId);
      setShown(created);
      setCopied(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Koppeling aanmaken mislukt.');
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!window.confirm('Deze koppeling intrekken? Chats die deze URL gebruiken werken dan niet meer.')) return;
    setBusy(true);
    setError(null);
    try {
      await revokeMcpKey(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Intrekken mislukt.');
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    if (!shown) return;
    try {
      await navigator.clipboard.writeText(shown.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Kopiëren lukte niet. Selecteer de URL en kopieer hem handmatig.');
    }
  };

  return (
    <ContentCard>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <SmartToyRoundedIcon sx={{ color: 'text.secondary' }} />
        <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 600 }}>
          Koppel met ChatGPT, Claude of Gemini
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Vraag in je AI-chat "wat is mijn workout vandaag", log sets of voeding, en bekijk je voortgang. Maak een koppel-URL en plak die
        als MCP-server in de chat van je keuze.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 1.5 }}>
          {error}
        </Alert>
      )}

      {shown && (
        <Box sx={{ mb: 2, p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'action.hover' }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Jouw koppel-URL
          </Typography>
          <Box component="code" sx={{ display: 'block', wordBreak: 'break-all', fontSize: 12, fontFamily: 'monospace' }}>
            {shown.url}
          </Box>
          <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            <Button size="small" variant="outlined" onClick={handleCopy} startIcon={copied ? <CheckRoundedIcon /> : <ContentCopyRoundedIcon />}>
              {copied ? 'Gekopieerd' : 'Kopieer URL'}
            </Button>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            Behandel deze URL als een wachtwoord: wie hem heeft, kan jouw gegevens lezen en loggen. Hij wordt alleen op dit apparaat
            onthouden.
          </Typography>
        </Box>
      )}

      <Box sx={{ mb: 2, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        <Button size="small" variant="contained" onClick={handleCreate} disabled={busy} startIcon={<AutoAwesomeRoundedIcon />}>
          {busy ? 'Bezig…' : keys.length ? 'Nieuwe koppel-URL maken' : 'Koppel-URL maken'}
        </Button>
      </Box>

      {loading ? (
        <Typography variant="body2" color="text.secondary">
          Koppelingen laden…
        </Typography>
      ) : keys.length > 0 ? (
        <List disablePadding sx={{ mb: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
          {keys.map((k, i) => (
            <ListItem
              key={k.id}
              divider={i < keys.length - 1}
              sx={{ px: 1.5, py: 1, gap: 1 }}
              secondaryAction={
                <IconButton size="small" edge="end" onClick={() => handleRevoke(k.id)} disabled={busy} aria-label="Koppeling intrekken">
                  <DeleteOutlineRoundedIcon fontSize="small" color="error" />
                </IconButton>
              }
            >
              <ListItemText
                primary={k.label}
                secondary={`Aangemaakt ${fmtDate(k.createdAt)}${k.lastUsedAt ? ` · laatst gebruikt ${fmtDate(k.lastUsedAt)}` : ' · nog niet gebruikt'}`}
                primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }}
                secondaryTypographyProps={{ variant: 'caption' }}
                sx={{ minWidth: 0, my: 0 }}
              />
            </ListItem>
          ))}
        </List>
      ) : null}

      <Box component="details" sx={{ fontSize: 14 }}>
        <Box component="summary" sx={{ cursor: 'pointer', fontWeight: 500 }}>
          Zo koppel je het
        </Box>
        <Stack spacing={1.5} sx={{ mt: 1, color: 'text.secondary' }}>
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary' }}>
              ChatGPT (Plus, Pro of Team)
            </Typography>
            <Typography variant="body2">
              Op de website: Instellingen → Connectors → Geavanceerd → Developer mode aan. Klik op "Create", geef een naam
              (bijv. VORM), plak de koppel-URL bij "MCP Server URL", kies "No authentication" en sla op. Daarna werkt het ook in de
              ChatGPT-app op je telefoon.
            </Typography>
          </Box>
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary' }}>
              Claude (Pro of Max)
            </Typography>
            <Typography variant="body2">
              Instellingen → Connectors → "Add custom connector". Naam VORM, plak de koppel-URL, en voeg toe. Daarna in een chat
              VORM aanzetten onder de connector-knop.
            </Typography>
          </Box>
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary' }}>
              Daarna
            </Typography>
            <Typography variant="body2">
              Vraag bijvoorbeeld: "Wat is mijn workout vandaag?", "Log 3×8 bankdrukken op 80 kg" of "Hoeveel eiwit heb ik vandaag gehad?"
            </Typography>
          </Box>
        </Stack>
      </Box>
    </ContentCard>
  );
}
