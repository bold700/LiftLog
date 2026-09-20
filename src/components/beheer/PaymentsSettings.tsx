/**
 * Betalingen · Mollie (Beheer → Huisstijl), naar het ontwerp "Payments — Mollie". Elk bedrijf
 * koppelt zijn eigen Mollie-account: het geld gaat rechtstreeks naar hun rekening, dus dit is
 * geen platformbrede instelling zoals Resend maar iets per studio.
 *
 * De sleutel zelf komt nooit terug van de server nadat hij is opgeslagen — alleen de laatste
 * vier tekens en, als Mollie de sleutel herkent, de naam van de organisatie ("Verbonden met …").
 * Dat maakt dit scherm ook zonder een echt Mollie-account al bruikbaar om vast klaar te zetten.
 */
import { useState } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from '@mui/material';
import { useI18n } from '../../context/I18nContext';
import { useNotify } from '../../context/NotifyContext';
import { removePaymentKey, savePaymentKey, setPaymentMode } from '../../services/orgService';
import { ContentCard } from '../layout';
import type { OrgPaymentsStatus } from '../../types';

const MOLLIE_KEYS_URL = 'https://my.mollie.com/dashboard/developers/api-keys';

type Mode = 'test' | 'live';

interface PaymentsSettingsProps {
  orgId: string;
  payments: OrgPaymentsStatus;
  onChange: (payments: OrgPaymentsStatus) => void;
}

export function PaymentsSettings({ orgId, payments, onChange }: PaymentsSettingsProps) {
  const { t } = useI18n();
  const notify = useNotify();
  const [savingMode, setSavingMode] = useState(false);
  const [inputs, setInputs] = useState<Record<Mode, string>>({ test: '', live: '' });
  const [saving, setSaving] = useState<Mode | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<Mode | null>(null);
  const [removing, setRemoving] = useState<Mode | null>(null);

  const handleMode = async (mode: Mode) => {
    if (mode === payments.mode) return;
    setSavingMode(true);
    try {
      await setPaymentMode(orgId, mode);
      onChange({ ...payments, mode });
    } catch (e) {
      notify.error(t('payments.saveFailed'), e);
    } finally {
      setSavingMode(false);
    }
  };

  const handleSaveKey = async (mode: Mode) => {
    const apiKey = inputs[mode].trim();
    if (!apiKey) return;
    setSaving(mode);
    try {
      const r = await savePaymentKey(mode, apiKey);
      onChange({
        ...payments,
        testKeyLast4: mode === 'test' ? r.last4 : payments.testKeyLast4,
        liveKeyLast4: mode === 'live' ? r.last4 : payments.liveKeyLast4,
        testConnectedAt: mode === 'test' ? r.connectedAt : payments.testConnectedAt,
        liveConnectedAt: mode === 'live' ? r.connectedAt : payments.liveConnectedAt,
        testOrganizationName: mode === 'test' ? r.organizationName : payments.testOrganizationName,
        liveOrganizationName: mode === 'live' ? r.organizationName : payments.liveOrganizationName,
      });
      setInputs((v) => ({ ...v, [mode]: '' }));
      notify.success(t('payments.saved'));
    } catch (e) {
      notify.error(t('payments.saveFailed'), e);
    } finally {
      setSaving(null);
    }
  };

  const handleRemove = async (mode: Mode) => {
    setConfirmRemove(null);
    setRemoving(mode);
    try {
      await removePaymentKey(mode);
      onChange({
        ...payments,
        testKeyLast4: mode === 'test' ? null : payments.testKeyLast4,
        liveKeyLast4: mode === 'live' ? null : payments.liveKeyLast4,
        testConnectedAt: mode === 'test' ? null : payments.testConnectedAt,
        liveConnectedAt: mode === 'live' ? null : payments.liveConnectedAt,
        testOrganizationName: mode === 'test' ? null : payments.testOrganizationName,
        liveOrganizationName: mode === 'live' ? null : payments.liveOrganizationName,
      });
      notify.success(t('payments.removed'));
    } catch (e) {
      notify.error(t('payments.removeFailed'), e);
    } finally {
      setRemoving(null);
    }
  };

  const keyBlock = (mode: Mode) => {
    const last4 = mode === 'test' ? payments.testKeyLast4 : payments.liveKeyLast4;
    const orgName = mode === 'test' ? payments.testOrganizationName : payments.liveOrganizationName;
    const isSet = !!last4;
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {mode === 'live' && (
          <Alert severity="warning" icon={false}>
            {t('payments.liveWarning')}
          </Alert>
        )}
        <TextField
          label={mode === 'test' ? t('payments.testKey') : t('payments.liveKey')}
          size="small"
          fullWidth
          type="password"
          value={inputs[mode]}
          onChange={(e) => setInputs((v) => ({ ...v, [mode]: e.target.value }))}
          placeholder={`${mode}_...`}
          inputProps={{ spellCheck: false, autoComplete: 'off' }}
        />
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button size="small" variant="contained" disabled={!inputs[mode].trim() || saving === mode} onClick={() => void handleSaveKey(mode)}>
            {saving === mode ? t('common.saving') : isSet ? t('payments.replace') : t('common.save')}
          </Button>
          {isSet && (
            <Button size="small" color="error" disabled={removing === mode} onClick={() => setConfirmRemove(mode)}>
              {t('payments.remove')}
            </Button>
          )}
        </Box>
        <Typography variant="caption" color="text.secondary">
          {isSet ? (orgName ? t('payments.connectedWithOrg', { name: orgName, last4 }) : t('payments.connected', { last4 })) : t('payments.notConnected')}
        </Typography>
      </Box>
    );
  };

  return (
    <ContentCard>
      <Typography variant="h5" sx={{ fontWeight: 600, mb: 0.5 }}>
        {t('payments.title')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {t('payments.intro')}
      </Typography>
      <Button size="small" component="a" href={MOLLIE_KEYS_URL} target="_blank" rel="noopener noreferrer" sx={{ px: 0, mb: 2 }}>
        {t('payments.openMollie')}
      </Button>

      <Typography variant="subtitle2" sx={{ mb: 0.75 }}>
        {t('payments.mode')}
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, mb: 0.5 }}>
        <Button size="small" variant={payments.mode === 'test' ? 'contained' : 'outlined'} disabled={savingMode} onClick={() => void handleMode('test')}>
          {t('payments.modeTest')}
        </Button>
        <Button size="small" variant={payments.mode === 'live' ? 'contained' : 'outlined'} disabled={savingMode} onClick={() => void handleMode('live')}>
          {t('payments.modeLive')}
        </Button>
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2.5 }}>
        {t('payments.modeHelp')}
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
        {keyBlock('test')}
        {keyBlock('live')}
      </Box>

      <Dialog open={!!confirmRemove} onClose={() => setConfirmRemove(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('payments.removeConfirmTitle')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{t('payments.removeConfirmBody')}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmRemove(null)}>{t('common.cancel')}</Button>
          <Button color="error" variant="contained" onClick={() => confirmRemove && void handleRemove(confirmRemove)}>
            {t('payments.remove')}
          </Button>
        </DialogActions>
      </Dialog>
    </ContentCard>
  );
}
