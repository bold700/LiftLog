import { useCallback, useState } from 'react';
import { MailCheck, CheckCircle2, AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '../context/AuthContext';

/** Blokkeert de app tot een e-mail/wachtwoord-account zijn e-mailadres heeft bevestigd. */
export function VerifyEmailScreen() {
  const auth = useAuth();
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const email = auth?.user?.email ?? '';

  const handleReload = useCallback(async () => {
    if (!auth) return;
    setBusy(true);
    setMsg(null);
    try {
      await auth.reloadUser();
      if (!auth.user?.emailVerified) {
        setMsg({ type: 'error', text: 'Nog niet bevestigd. Klik de link in de e-mail en probeer opnieuw.' });
      }
    } finally {
      setBusy(false);
    }
  }, [auth]);

  const handleResend = useCallback(async () => {
    if (!auth) return;
    setBusy(true);
    setMsg(null);
    try {
      await auth.resendVerification();
      setMsg({ type: 'success', text: 'Nieuwe verificatiemail verstuurd. Check ook je spam.' });
    } catch {
      setMsg({ type: 'error', text: 'Versturen mislukt. Probeer het straks opnieuw.' });
    } finally {
      setBusy(false);
    }
  }, [auth]);

  return (
    <div className="dark flex min-h-[100dvh] items-center justify-center bg-background px-4 py-6">
      <Card className="w-full max-w-md rounded-3xl">
        <CardContent className="p-6 text-center sm:p-8">
          <MailCheck className="mx-auto mb-3 h-12 w-12 text-foreground" strokeWidth={1.75} />
          <h1 className="mb-2 text-2xl font-semibold text-foreground">Bevestig je e-mail</h1>
          <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
            We hebben een verificatielink gestuurd naar{' '}
            <strong className="font-semibold text-foreground">{email}</strong>. Klik die link om je account te
            activeren.
          </p>

          {msg && (
            <Alert
              variant={msg.type === 'error' ? 'destructive' : 'default'}
              className="mb-5 text-left"
            >
              {msg.type === 'success' ? (
                <CheckCircle2 className="h-4 w-4 text-success" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <AlertDescription>{msg.text}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-3">
            <Button size="lg" disabled={busy} onClick={handleReload} className="w-full">
              Ik heb mijn e-mail bevestigd
            </Button>
            <Button size="lg" variant="outline" disabled={busy} onClick={handleResend} className="w-full">
              Verstuur opnieuw
            </Button>
            <Button size="lg" variant="ghost" onClick={() => auth?.logout()} className="w-full">
              Uitloggen
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
