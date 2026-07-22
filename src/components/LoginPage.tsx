import { useState, useCallback } from 'react';
import { Mail, Lock, User, Eye, EyeOff } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '../context/AuthContext';

const LOGO_TINT =
  'brightness(0) saturate(100%) invert(94%) sepia(6%) saturate(800%) hue-rotate(340deg) brightness(98%) contrast(94%)';

export function LoginPage() {
  const auth = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  const emailValid = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!auth) return;
      setLocalError(null);
      setResetMsg(null);
      if (!emailValid(email)) {
        setLocalError('Vul een geldig e-mailadres in.');
        return;
      }
      if (password.length < 6) {
        setLocalError('Wachtwoord moet minstens 6 tekens zijn.');
        return;
      }
      setSubmitting(true);
      auth.clearError();
      try {
        if (isRegister) {
          await auth.register(email.trim(), password, 'sporter', displayName || null);
        } else {
          await auth.login(email.trim(), password);
        }
      } catch {
        // error staat in auth.error
      } finally {
        setSubmitting(false);
      }
    },
    [auth, email, password, displayName, isRegister]
  );

  const handleForgotPassword = useCallback(async () => {
    if (!auth) return;
    setLocalError(null);
    setResetMsg(null);
    auth.clearError();
    if (!emailValid(email)) {
      setLocalError('Vul eerst je e-mailadres in om je wachtwoord te resetten.');
      return;
    }
    try {
      await auth.resetPassword(email.trim());
      setResetMsg('Reset-link verstuurd. Check je e-mail (ook je spam-map).');
    } catch {
      setLocalError('Reset-mail versturen mislukt. Controleer het e-mailadres.');
    }
  }, [auth, email]);

  const handleGoogle = useCallback(async () => {
    if (!auth) return;
    setSubmitting(true);
    auth.clearError();
    try {
      await auth.signInWithGoogle();
    } catch {
      // error in auth.error
    } finally {
      setSubmitting(false);
    }
  }, [auth]);

  if (!auth) return null;

  return (
    <div className="dark flex min-h-[100dvh] items-center justify-center bg-background px-4 py-6">
      <Card className="w-full max-w-sm rounded-3xl shadow-2xl">
        <CardContent className="p-6 sm:p-8">
          <div className="mb-4 flex justify-center">
            <img
              src="/va-logo.svg"
              alt="Van As Personal Training"
              className="h-14 w-auto"
              style={{ filter: LOGO_TINT }}
            />
          </div>
          <h1 className="text-center text-2xl font-semibold text-foreground">
            {isRegister ? 'Account aanmaken' : 'Inloggen'}
          </h1>
          <p className="mb-5 mt-1 text-center text-sm text-muted-foreground">Van As Personal Training Logs</p>

          {(auth.error || localError) && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{localError || auth.error}</AlertDescription>
            </Alert>
          )}
          {resetMsg && (
            <Alert className="mb-4">
              <AlertDescription>{resetMsg}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {isRegister && (
              <div className="space-y-1.5">
                <Label htmlFor="login-name">Naam</Label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="login-name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    autoComplete="name"
                    placeholder="Voor je profiel"
                    className="pl-9"
                  />
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="login-email">E-mail</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="jij@voorbeeld.nl"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="login-password">Wachtwoord</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                  className="px-9"
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Wachtwoord verbergen' : 'Wachtwoord tonen'}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" size="lg" disabled={submitting} className="w-full">
              {submitting ? 'Even geduld…' : isRegister ? 'Account aanmaken' : 'Inloggen'}
            </Button>
            {!isRegister && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleForgotPassword}
                className="self-center text-muted-foreground"
              >
                Wachtwoord vergeten?
              </Button>
            )}
          </form>

          <div className="mt-5 border-t border-border pt-5">
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={submitting}
              onClick={handleGoogle}
              className="w-full"
            >
              Doorgaan met Google
            </Button>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-3 w-full text-muted-foreground"
            onClick={() => {
              auth.clearError();
              setIsRegister((v) => !v);
            }}
          >
            {isRegister ? 'Al een account? Inloggen' : 'Geen account? Account aanmaken'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
