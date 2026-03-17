/**
 * Beheeromgeving voor trainers en admins: trainer-aanvragen goedkeuren, alle accounts, sporter toevoegen op e-mail, rol wijzigen.
 */
import { useState, useCallback, useEffect } from 'react';
import {
  Box,
  Card,
  Typography,
  TextField,
  Button,
  Alert,
  List,
  ListItem,
  ListItemText,
  FormControl,
  Select,
  MenuItem,
  Chip,
} from '@mui/material';
import PersonAddRoundedIcon from '@mui/icons-material/PersonAddRounded';
import EmailRoundedIcon from '@mui/icons-material/EmailRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import { useProfile } from '../context/ProfileContext';
import { getProfileByEmail, assignTrainerToSporter, updateProfile, getAllProfiles } from '../services/profileService';
import type { Profile, ProfileRole } from '../types';
import { PageLayout, ContentCard } from './layout';

export function BeheerPage() {
  const profile = useProfile();
  const [allAccounts, setAllAccounts] = useState<Profile[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [adding, setAdding] = useState(false);
  const [updatingRoleFor, setUpdatingRoleFor] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadAllAccounts = useCallback(async () => {
    setAccountsLoading(true);
    try {
      const list = await getAllProfiles();
      setAllAccounts(list.sort((a, b) => (a.displayName || a.email || a.userId).localeCompare(b.displayName || b.email || b.userId, undefined, { sensitivity: 'base' })));
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Accounts laden mislukt.' });
    } finally {
      setAccountsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (profile?.isTrainer) loadAllAccounts();
  }, [profile?.isTrainer, loadAllAccounts]);

  const handleRoleChange = useCallback(
    async (userId: string, newRole: ProfileRole) => {
      if (!profile?.isTrainer || !profile.profile?.userId) return;
      setUpdatingRoleFor(userId);
      setMessage(null);
      try {
        const updates =
          newRole === 'trainer'
            ? { role: 'trainer' as const, trainerId: null }
            : newRole === 'admin'
              ? { role: 'admin' as const }
              : { role: 'sporter' as const, trainerId: null };
        await updateProfile(userId, updates);
        await profile.refreshProfile();
        await loadAllAccounts();
        setMessage({ type: 'success', text: `Rol gewijzigd naar ${newRole}.` });
      } catch (e) {
        setMessage({
          type: 'error',
          text: e instanceof Error ? e.message : 'Rol wijzigen mislukt.',
        });
      } finally {
        setUpdatingRoleFor(null);
      }
    },
    [profile, loadAllAccounts]
  );

  const handleAddSporter = useCallback(async () => {
    if (!profile?.isTrainer || !profile.profile?.userId) return;
    const trimmed = email.trim();
    if (!trimmed) {
      setMessage({ type: 'error', text: 'Vul een e-mailadres in.' });
      return;
    }
    setAdding(true);
    setMessage(null);
    try {
      const sporterProfile = await getProfileByEmail(trimmed);
      if (!sporterProfile) {
        setMessage({ type: 'error', text: 'Geen account gevonden met dit e-mailadres. De sporter moet eerst een account aanmaken.' });
        setAdding(false);
        return;
      }
      if (sporterProfile.role !== 'sporter') {
        setMessage({ type: 'error', text: 'Dit account is een trainer. Je kunt alleen sporters toevoegen.' });
        setAdding(false);
        return;
      }
      if (sporterProfile.trainerId === profile.profile.userId) {
        setMessage({ type: 'success', text: 'Deze sporter staat al in je lijst.' });
        setAdding(false);
        return;
      }
      await assignTrainerToSporter(sporterProfile.userId, profile.profile.userId);
      await profile.refreshProfile();
      await loadAllAccounts();
      setEmail('');
      setMessage({ type: 'success', text: `${sporterProfile.displayName || sporterProfile.email || 'Sporter'} is toegevoegd.` });
    } catch (e) {
      setMessage({
        type: 'error',
        text: e instanceof Error ? e.message : 'Toevoegen mislukt.',
      });
    } finally {
      setAdding(false);
    }
  }, [profile, email, loadAllAccounts]);

  if (!profile?.isTrainer) {
    return (
      <PageLayout>
        <ContentCard>
          <Typography color="text.secondary">Alleen trainers en beheerders hebben toegang tot Beheer.</Typography>
        </ContentCard>
      </PageLayout>
    );
  }

  const isAdmin = profile?.role === 'admin';

  return (
    <PageLayout>
      <ContentCard>
        <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
          Beheer
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Overzicht van alle accounts. Je kunt rollen wijzigen (sporter, trainer, beheerder).
        </Typography>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <Typography variant="subtitle2" color="text.secondary">
            Alle accounts ({allAccounts.length})
          </Typography>
          <Button
            size="small"
            startIcon={<RefreshRoundedIcon />}
            onClick={loadAllAccounts}
            disabled={accountsLoading}
          >
            {accountsLoading ? 'Laden…' : 'Vernieuwen'}
          </Button>
        </Box>

        {message && (
          <Alert severity={message.type} sx={{ mb: 2 }} onClose={() => setMessage(null)}>
            {message.text}
          </Alert>
        )}

        <Card variant="outlined" sx={{ borderRadius: 2, mb: 3 }}>
          {accountsLoading && allAccounts.length === 0 ? (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Typography color="text.secondary">Accounts laden…</Typography>
            </Box>
          ) : allAccounts.length === 0 ? (
            <Box sx={{ p: 3 }}>
              <Typography color="text.secondary">Geen accounts gevonden.</Typography>
            </Box>
          ) : (
            <List dense disablePadding>
              {allAccounts.map((p) => (
                <ListItem key={p.userId} divider sx={{ gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                  <ListItemText
                    primary={p.displayName || p.email || p.userId}
                    secondary={p.email ?? undefined}
                    sx={{ flex: '1 1 200px', minWidth: 0 }}
                  />
                  {p.trainerRequested && (
                    <Chip label="Aanvraag trainer" size="small" color="warning" sx={{ mr: 0.5 }} />
                  )}
                  <FormControl size="small" sx={{ minWidth: 130 }}>
                    <Select
                      value={p.role}
                      onChange={(e) => handleRoleChange(p.userId, e.target.value as ProfileRole)}
                      disabled={updatingRoleFor === p.userId}
                      displayEmpty
                    >
                      <MenuItem value="sporter">Sporter</MenuItem>
                      <MenuItem value="trainer">Trainer</MenuItem>
                      {isAdmin && <MenuItem value="admin">Beheerder</MenuItem>}
                    </Select>
                  </FormControl>
                </ListItem>
              ))}
            </List>
          )}
        </Card>

        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
          Sporter toevoegen op e-mail
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <TextField
            label="E-mail sporter"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddSporter()}
            placeholder="sporter@voorbeeld.nl"
            size="small"
            sx={{ minWidth: 260 }}
            InputProps={{
              startAdornment: <EmailRoundedIcon sx={{ mr: 1, color: 'action.active' }} fontSize="small" />,
            }}
          />
          <Button
            variant="contained"
            startIcon={<PersonAddRoundedIcon />}
            onClick={handleAddSporter}
            disabled={adding}
          >
            {adding ? 'Bezig…' : 'Sporter toevoegen'}
          </Button>
        </Box>
      </ContentCard>
    </PageLayout>
  );
}
