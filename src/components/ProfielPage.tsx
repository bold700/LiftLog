/**
 * Pagina om eigen profielgegevens te beheren (naam, e-mail tonen).
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { User, Mail, EyeOff, Camera, CheckCircle2, AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
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
import { useAuth } from '../context/AuthContext';
import { updateProfile } from '../services/profileService';
import { uploadAvatar, deleteAvatar } from '../services/avatarService';
import type { LeaderboardVisibility } from '../types';
import { UserAvatar } from './UserAvatar';

export function ProfielPage() {
  const profile = useProfile();
  const auth = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [leaderboardVisibility, setLeaderboardVisibility] = useState<LeaderboardVisibility>('named');
  const [heightCm, setHeightCm] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [gender, setGender] = useState<'man' | 'vrouw' | 'anders' | ''>('');
  const [restingHr, setRestingHr] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [currentPwd, setCurrentPwd] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);
  const [pwdDialogOpen, setPwdDialogOpen] = useState(false);
  const [pwdCurrent, setPwdCurrent] = useState('');
  const [pwdNew, setPwdNew] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);
  const isPasswordAccount = auth?.user?.providerData?.some((pr) => pr.providerId === 'password') ?? false;

  const handleChangePassword = useCallback(async () => {
    if (!auth) return;
    if (pwdNew.length < 6) {
      setMessage({ type: 'error', text: 'Nieuw wachtwoord moet minstens 6 tekens zijn.' });
      return;
    }
    if (!pwdCurrent) {
      setMessage({ type: 'error', text: 'Vul je huidige wachtwoord in.' });
      return;
    }
    setPwdSaving(true);
    setMessage(null);
    try {
      await auth.changePassword(pwdCurrent, pwdNew);
      setPwdDialogOpen(false);
      setPwdCurrent('');
      setPwdNew('');
      setMessage({ type: 'success', text: 'Wachtwoord gewijzigd.' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Wachtwoord wijzigen mislukt.';
      setMessage({ type: 'error', text: msg.includes('wrong-password') || msg.includes('invalid-credential') ? 'Onjuist huidig wachtwoord.' : msg });
    } finally {
      setPwdSaving(false);
    }
  }, [auth, pwdCurrent, pwdNew]);

  const handleChangeEmail = useCallback(async () => {
    if (!auth) return;
    const target = newEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
      setMessage({ type: 'error', text: 'Vul een geldig nieuw e-mailadres in.' });
      return;
    }
    if (!currentPwd) {
      setMessage({ type: 'error', text: 'Vul je huidige wachtwoord in.' });
      return;
    }
    setEmailSaving(true);
    setMessage(null);
    try {
      await auth.changeEmail(currentPwd, target);
      setEmailDialogOpen(false);
      setNewEmail('');
      setCurrentPwd('');
      setMessage({ type: 'success', text: `Verificatiemail verstuurd naar ${target}. Klik de link om je e-mail te wijzigen.` });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'E-mail wijzigen mislukt.';
      setMessage({ type: 'error', text: msg.includes('wrong-password') || msg.includes('invalid-credential') ? 'Onjuist wachtwoord.' : msg });
    } finally {
      setEmailSaving(false);
    }
  }, [auth, newEmail, currentPwd]);

  const p = profile?.profile;
  const uid = auth?.user?.uid ?? p?.userId;

  const handlePhotoSelected = useCallback(
    async (file: File | null) => {
      if (!file || !uid || !profile) return;
      if (!file.type.startsWith('image/')) {
        setMessage({ type: 'error', text: 'Kies een afbeelding.' });
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setMessage({ type: 'error', text: 'Foto is te groot (max 5 MB).' });
        return;
      }
      setUploadingPhoto(true);
      setMessage(null);
      try {
        const url = await uploadAvatar(uid, file);
        await updateProfile(uid, { photoURL: url });
        await profile.refreshProfile();
        setMessage({ type: 'success', text: 'Profielfoto bijgewerkt.' });
      } catch (e) {
        setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Uploaden mislukt.' });
      } finally {
        setUploadingPhoto(false);
      }
    },
    [uid, profile]
  );

  const handleRemovePhoto = useCallback(async () => {
    if (!uid || !profile) return;
    setUploadingPhoto(true);
    setMessage(null);
    try {
      await deleteAvatar(uid);
      await updateProfile(uid, { photoURL: null });
      await profile.refreshProfile();
      setMessage({ type: 'success', text: 'Profielfoto verwijderd.' });
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Verwijderen mislukt.' });
    } finally {
      setUploadingPhoto(false);
    }
  }, [uid, profile]);

  useEffect(() => {
    if (p?.displayName != null) setDisplayName(p.displayName);
    else if (p !== undefined) setDisplayName('');
    setLeaderboardVisibility(p?.leaderboardVisibility ?? 'named');
    setHeightCm(p?.heightCm != null ? String(p.heightCm) : '');
    setBirthDate(p?.birthDate ?? '');
    setGender(p?.gender ?? '');
    setRestingHr(p?.restingHrBpm != null ? String(p.restingHrBpm) : '');
  }, [p?.displayName, p?.leaderboardVisibility, p?.heightCm, p?.birthDate, p?.gender, p?.restingHrBpm, p]);

  const handleSave = useCallback(async () => {
    if (!uid || !profile) return;
    setSaving(true);
    setMessage(null);
    try {
      await updateProfile(uid, {
        displayName: displayName.trim() || null,
        leaderboardVisibility,
        heightCm: heightCm.trim() ? Number(heightCm) : null,
        birthDate: birthDate || null,
        gender: gender || null,
        restingHrBpm: restingHr.trim() ? Number(restingHr) : null,
      });
      await profile.refreshProfile();
      setMessage({ type: 'success', text: 'Profiel opgeslagen.' });
    } catch (e) {
      setMessage({
        type: 'error',
        text: e instanceof Error ? e.message : 'Opslaan mislukt.',
      });
    } finally {
      setSaving(false);
    }
  }, [uid, profile, displayName, leaderboardVisibility, heightCm, birthDate, gender, restingHr]);

  const email = auth?.user?.email ?? p?.email ?? '';

  return (
    <div className="animate-fade-in-up mx-auto w-full max-w-3xl pb-6">
      <Card>
        <CardContent className="p-5 sm:p-6">
          <h1 className="mb-2 text-2xl font-semibold">Mijn profiel</h1>
          <p className="mb-5 text-sm text-muted-foreground">
            Beheer je gegevens. Je naam wordt gebruikt in de app en in beheeroverzichten.
          </p>

          <div className="mb-6 flex flex-wrap items-center gap-4">
            <UserAvatar name={displayName || p?.displayName} photoURL={p?.photoURL} size={72} />
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  handlePhotoSelected(e.target.files?.[0] ?? null);
                  e.target.value = '';
                }}
              />
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" disabled={uploadingPhoto} onClick={() => fileInputRef.current?.click()} className="gap-2">
                  <Camera className="h-4 w-4" />
                  {uploadingPhoto ? 'Bezig…' : p?.photoURL ? 'Foto wijzigen' : 'Foto toevoegen'}
                </Button>
                {p?.photoURL && (
                  <Button variant="ghost" size="sm" disabled={uploadingPhoto} onClick={handleRemovePhoto}>
                    Verwijderen
                  </Button>
                )}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Zichtbaar op de ranglijst. Zonder foto tonen we je initialen. (max 5 MB)
              </p>
            </div>
          </div>

          {message && (
            <Alert variant={message.type === 'error' ? 'destructive' : 'default'} className="mb-4">
              {message.type === 'success' ? (
                <CheckCircle2 className="h-4 w-4 text-success" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <AlertDescription>{message.text}</AlertDescription>
            </Alert>
          )}

          <div className="flex w-full flex-col gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="profile-name">Profielnaam</Label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="profile-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Bijv. Jan Jansen"
                  className="pl-9"
                />
              </div>
            </div>

            <div className="mt-1">
              <h2 className="text-sm font-semibold">Persoonlijke gegevens</h2>
              <p className="text-xs text-muted-foreground">
                Wordt gebruikt om de AI-routekaart alvast in te vullen (leeftijd, geslacht, e.d.).
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="profile-height">Lengte (cm)</Label>
                <Input id="profile-height" type="number" min={0} value={heightCm} onChange={(e) => setHeightCm(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="profile-birth">Geboortedatum</Label>
                <Input id="profile-birth" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="profile-gender">Geslacht</Label>
                <Select value={gender || 'none'} onValueChange={(v) => setGender(v === 'none' ? '' : (v as typeof gender))}>
                  <SelectTrigger id="profile-gender">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Niet opgegeven</SelectItem>
                    <SelectItem value="man">Man</SelectItem>
                    <SelectItem value="vrouw">Vrouw</SelectItem>
                    <SelectItem value="anders">Anders</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="profile-hr">Rusthartslag (bpm)</Label>
                <Input id="profile-hr" type="number" min={0} value={restingHr} onChange={(e) => setRestingHr(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="profile-email">E-mail</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="profile-email" value={email} disabled className="pl-9" />
              </div>
              <p className="text-xs text-muted-foreground">
                {isPasswordAccount
                  ? 'Klik op "E-mail wijzigen" om je e-mailadres te veranderen.'
                  : 'E-mail wordt beheerd via je aanbieder (Google, etc.).'}
              </p>
            </div>
            {isPasswordAccount && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setEmailDialogOpen(true)}>
                  E-mail wijzigen
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPwdDialogOpen(true)}>
                  Wachtwoord wijzigen
                </Button>
              </div>
            )}

            <fieldset className="mt-1 w-full">
              <legend className="mb-1 text-sm font-semibold">Ranglijst (privacy)</legend>
              <p className="mb-3 text-sm text-muted-foreground">
                Standaard tonen we je <strong>profielnaam</strong> op de ranglijst. Je kunt anoniem gaan of jezelf uitzetten.
              </p>
              <RadioGroup
                value={leaderboardVisibility}
                onValueChange={(v) => setLeaderboardVisibility(v as LeaderboardVisibility)}
                className="gap-3"
              >
                <div className="flex items-center gap-2.5">
                  <RadioGroupItem value="named" id="lb-named" />
                  <Label htmlFor="lb-named" className="font-normal">Met mijn profielnaam op de ranglijst (standaard)</Label>
                </div>
                <div className="flex items-center gap-2.5">
                  <RadioGroupItem value="anonymous" id="lb-anon" />
                  <Label htmlFor="lb-anon" className="font-normal">Anoniem op de ranglijst</Label>
                </div>
                <div className="flex items-center gap-2.5">
                  <RadioGroupItem value="hidden" id="lb-hidden" />
                  <Label htmlFor="lb-hidden" className="flex items-center gap-1.5 font-normal">
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                    Niet op de ranglijst
                  </Label>
                </div>
              </RadioGroup>
            </fieldset>

            <Button onClick={handleSave} disabled={saving} className="self-start">
              {saving ? 'Bezig…' : 'Opslaan'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>E-mail wijzigen</DialogTitle>
            <DialogDescription>
              Je krijgt een verificatiemail op het nieuwe adres. Je e-mail wijzigt pas nadat je die link hebt bevestigd.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="new-email">Nieuw e-mailadres</Label>
              <Input id="new-email" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} autoComplete="email" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email-current-pwd">Huidig wachtwoord</Label>
              <Input id="email-current-pwd" type="password" value={currentPwd} onChange={(e) => setCurrentPwd(e.target.value)} autoComplete="current-password" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEmailDialogOpen(false)}>Annuleren</Button>
            <Button onClick={handleChangeEmail} disabled={emailSaving}>
              {emailSaving ? 'Bezig…' : 'Verzenden'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pwdDialogOpen} onOpenChange={setPwdDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Wachtwoord wijzigen</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="pwd-current">Huidig wachtwoord</Label>
              <Input id="pwd-current" type="password" value={pwdCurrent} onChange={(e) => setPwdCurrent(e.target.value)} autoComplete="current-password" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pwd-new">Nieuw wachtwoord</Label>
              <Input id="pwd-new" type="password" value={pwdNew} onChange={(e) => setPwdNew(e.target.value)} autoComplete="new-password" />
              <p className="text-xs text-muted-foreground">Minstens 6 tekens.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPwdDialogOpen(false)}>Annuleren</Button>
            <Button onClick={handleChangePassword} disabled={pwdSaving}>
              {pwdSaving ? 'Bezig…' : 'Opslaan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
