/**
 * Profiel-kaart: koppel LiftLog aan ChatGPT, Claude of Gemini via een koppel-URL (MCP).
 * De URL bevat een geheime sleutel; hij wordt één keer getoond (en op dit apparaat onthouden).
 */
import { useCallback, useEffect, useState } from 'react';
import { Bot, Copy, Check, Trash2, Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
    <Card>
      <CardContent className="pt-6">
        <div className="mb-1 flex items-center gap-2">
          <Bot className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-base font-semibold">Koppel met ChatGPT, Claude of Gemini</h2>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Vraag in je AI-chat "wat is mijn workout vandaag", log sets of voeding, en bekijk je voortgang. Maak een koppel-URL en plak die
          als MCP-server in de chat van je keuze.
        </p>

        {error && (
          <Alert variant="destructive" className="mb-3">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {shown && (
          <div className="mb-4 rounded-lg border bg-muted/40 p-3">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Jouw koppel-URL</p>
            <code className="block break-all text-xs">{shown.url}</code>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={handleCopy}>
                {copied ? <Check className="mr-1 h-4 w-4" /> : <Copy className="mr-1 h-4 w-4" />}
                {copied ? 'Gekopieerd' : 'Kopieer URL'}
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Behandel deze URL als een wachtwoord: wie hem heeft, kan jouw gegevens lezen en loggen. Hij wordt alleen op dit apparaat
              onthouden.
            </p>
          </div>
        )}

        <div className="mb-4 flex flex-wrap gap-2">
          <Button size="sm" onClick={handleCreate} disabled={busy}>
            <Sparkles className="mr-1 h-4 w-4" />
            {busy ? 'Bezig…' : keys.length ? 'Nieuwe koppel-URL maken' : 'Koppel-URL maken'}
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Koppelingen laden…</p>
        ) : keys.length > 0 ? (
          <ul className="mb-4 divide-y rounded-lg border text-sm">
            {keys.map((k) => (
              <li key={k.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <div className="font-medium">{k.label}</div>
                  <div className="text-xs text-muted-foreground">
                    Aangemaakt {fmtDate(k.createdAt)}
                    {k.lastUsedAt ? ` · laatst gebruikt ${fmtDate(k.lastUsedAt)}` : ' · nog niet gebruikt'}
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => handleRevoke(k.id)} disabled={busy} aria-label="Koppeling intrekken">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
        ) : null}

        <details className="text-sm">
          <summary className="cursor-pointer font-medium">Zo koppel je het</summary>
          <div className="mt-2 space-y-3 text-muted-foreground">
            <div>
              <p className="font-medium text-foreground">ChatGPT (Plus, Pro of Team)</p>
              <p>
                Op de website: Instellingen → Connectors → Geavanceerd → Developer mode aan. Klik op "Create", geef een naam
                (bijv. LiftLog), plak de koppel-URL bij "MCP Server URL", kies "No authentication" en sla op. Daarna werkt het ook in de
                ChatGPT-app op je telefoon.
              </p>
            </div>
            <div>
              <p className="font-medium text-foreground">Claude (Pro of Max)</p>
              <p>
                Instellingen → Connectors → "Add custom connector". Naam LiftLog, plak de koppel-URL, en voeg toe. Daarna in een chat
                LiftLog aanzetten onder de connector-knop.
              </p>
            </div>
            <div>
              <p className="font-medium text-foreground">Daarna</p>
              <p>Vraag bijvoorbeeld: "Wat is mijn workout vandaag?", "Log 3×8 bankdrukken op 80 kg" of "Hoeveel eiwit heb ik vandaag gehad?"</p>
            </div>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
