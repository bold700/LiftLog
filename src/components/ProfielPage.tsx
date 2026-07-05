/**
 * Pagina om eigen profielgegevens te beheren (naam, e-mail tonen).
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Alert,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
} from '@mui/material';
import PersonRoundedIcon from '@mui/icons-material/PersonRounded';
import EmailRoundedIcon from '@mui/icons-material/EmailRounded';
import VisibilityOffRoundedIcon from '@mui/icons-material/VisibilityOffRounded';
import PhotoCameraRoundedIcon from '@mui/icons-material/PhotoCameraRounded';
import { useProfile } from '../context/ProfileContext';
import { useAuth } from '../context/AuthContext';
import { updateProfile } from '../services/profileService';
import { uploadAvatar, deleteAvatar } from '../services/avatarService';
import type { LeaderboardVisibility } from '../types';
import { PageLayout, ContentCard } from './layout';
import { UserAvatar } from './UserAvatar';

export function ProfielPage() {
  const profile = useProfile();
  const auth = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [leaderboardVisibility, setLeaderboardVisibility] = useState<LeaderboardVisibility>('named');
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
  }, [p?.displayName, p?.leaderboardVisibility, p]);

  const handleSave = useCallback(async () => {
    if (!uid || !profile) return;
    setSaving(true);
    setMessage(null);
    try {
      await updateProfile(uid, {
        displayName: displayName.trim() || null,
        leaderboardVisibility,
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
  }, [uid, profile, displayName, leaderboardVisibility]);

  const email = auth?.user?.email ?? p?.email ?? '';

  return (
    <PageLayout>
      <ContentCard>
        <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
          Mijn profiel
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Beheer je gegevens. Je naam wordt gebruikt in de app en in beheeroverzichten.
        </Typography>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3, flexWrap: 'wrap' }}>
          <UserAvatar name={displayName || p?.displayName} photoURL={p?.photoURL} size={72} />
          <Box>
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
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<PhotoCameraRoundedIcon />}
                disabled={uploadingPhoto}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadingPhoto ? 'Bezig…' : p?.photoURL ? 'Foto wijzigen' : 'Foto toevoegen'}
              </Button>
              {p?.photoURL && (
                <Button variant="text" size="small" color="inherit" disabled={uploadingPhoto} onClick={handleRemovePhoto}>
                  Verwijderen
                </Button>
              )}
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              Zichtbaar op de ranglijst. Zonder foto tonen we je initialen. (max 5 MB)
            </Typography>
          </Box>
        </Box>

        <FormControl component="fieldset" sx={{ mb: 3, width: '100%' }}>
          <FormLabel component="legend" sx={{ fontWeight: 600, color: 'text.primary', mb: 1 }}>
            Ranglijst (privacy)
          </FormLabel>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Standaard tonen we je <strong>profielnaam</strong> op de ranglijst. Van dit apparaat delen we ook de{' '}
            <strong>oefening</strong> met het <strong>zwaarste gelogde gewicht</strong> (7 en 30 dagen). Geen sets of
            reps. Je kunt anoniem gaan of jezelf uitzetten via de opties hieronder.
          </Typography>
          <RadioGroup
            value={leaderboardVisibility}
            onChange={(e) => setLeaderboardVisibility(e.target.value as LeaderboardVisibility)}
          >
            <FormControlLabel
              value="named"
              control={<Radio />}
              label="Met mijn profielnaam op de ranglijst (standaard)"
            />
            <FormControlLabel
              value="anonymous"
              control={<Radio />}
              label="Anoniem op de ranglijst"
            />
            <FormControlLabel
              value="hidden"
              control={<Radio />}
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <VisibilityOffRoundedIcon fontSize="small" color="action" />
                  <span>Niet op de ranglijst</span>
                </Box>
              }
            />
          </RadioGroup>
        </FormControl>

        {message && (
          <Alert severity={message.type} sx={{ mb: 2 }} onClose={() => setMessage(null)}>
            {message.text}
          </Alert>
        )}

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, width: '100%' }}>
          <TextField
            label="Profielnaam"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Bijv. Jan Jansen"
            size="medium"
            fullWidth
            InputProps={{
              startAdornment: <PersonRoundedIcon sx={{ mr: 1, color: 'action.active' }} fontSize="small" />,
            }}
          />
          <TextField
            label="E-mail"
            value={email}
            disabled
            size="medium"
            fullWidth
            helperText="E-mail wijzigen kan via je accountinstellingen bij de aanbieder (Google, etc.)."
            InputProps={{
              startAdornment: <EmailRoundedIcon sx={{ mr: 1, color: 'action.disabled' }} fontSize="small" />,
            }}
          />
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving}
            sx={{ alignSelf: 'flex-start' }}
          >
            {saving ? 'Bezig…' : 'Opslaan'}
          </Button>
        </Box>
      </ContentCard>
    </PageLayout>
  );
}
