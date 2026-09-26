/**
 * Beheer → Facturatie, onder de posten: alles wat op de factuur staat en hoe er betaald wordt.
 * Bedrijfsgegevens met een voorbeeld van de factuur, en de koppeling met Mollie.
 */
import { useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, TextField, Typography } from '@mui/material';
import { ContentCard } from '../layout';
import { PaymentsSettings } from './PaymentsSettings';
import { useI18n } from '../../context/I18nContext';
import { useProfile } from '../../context/ProfileContext';
import { useBranding } from '../../context/BrandingContext';
import { useNotify } from '../../context/NotifyContext';
import { getOrg, saveOrgBusiness, toPaymentsStatus } from '../../services/orgService';
import type { OrgBusiness, OrgPaymentsStatus } from '../../types';

/** Lege bedrijfsgegevens: naam van de studio, voorvoegsel met het jaar, teller op 1. */
const emptyBusiness = (orgName: string): OrgBusiness => ({
  legalName: orgName,
  street: '',
  postcode: '',
  city: '',
  kvk: '',
  vatNumber: '',
  iban: '',
  invoiceEmail: '',
  phone: '',
  invoicePrefix: `${new Date().getFullYear()}-`,
  nextInvoiceNumber: 1,
});

const pad4 = (n: number) => String(Math.max(1, Math.trunc(n) || 1)).padStart(4, '0');

export function BusinessSettings() {
  const { t } = useI18n();
  const profile = useProfile();
  const branding = useBranding();
  const notify = useNotify();
  const orgId = profile?.activeOrgId ?? null;
  const firstName = profile?.profile?.displayName?.trim().split(/\s+/)[0] || 'Jan';

  const [loaded, setLoaded] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [business, setBusiness] = useState<OrgBusiness>(() => emptyBusiness(''));
  const [saving, setSaving] = useState(false);
  const [payments, setPayments] = useState<OrgPaymentsStatus>(() => toPaymentsStatus(null));

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    void getOrg(orgId).then((org) => {
      if (cancelled || !org) return;
      setOrgName(org.name);
      setLogoUrl(org.branding?.logoUrl ?? null);
      setBusiness(org.business ?? emptyBusiness(org.name));
      setPayments(org.payments);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  if (!orgId) return null;
  if (!loaded) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  const primary = branding?.scheme.primary ?? '#426833';
  const setBiz = (patch: Partial<OrgBusiness>) => setBusiness((b) => ({ ...b, ...patch }));

  const save = async () => {
    setSaving(true);
    try {
      await saveOrgBusiness(orgId, business);
      notify.success(t('business.saved'));
    } catch (e) {
      notify.error(t('business.failed'), e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr) minmax(0, 1fr)' }, gap: 2, alignItems: 'start', '& .MuiCard-root': { mb: 0 } }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <ContentCard>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
            {t('business.title')}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
            {t('business.intro')}
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField label={t('business.legalName')} size="small" fullWidth value={business.legalName} onChange={(e) => setBiz({ legalName: e.target.value })} />
            <TextField label={t('business.street')} size="small" fullWidth value={business.street} onChange={(e) => setBiz({ street: e.target.value })} />
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <TextField label={t('business.postcode')} size="small" fullWidth value={business.postcode} onChange={(e) => setBiz({ postcode: e.target.value })} />
              <TextField label={t('business.city')} size="small" fullWidth value={business.city} onChange={(e) => setBiz({ city: e.target.value })} />
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <TextField label={t('business.kvk')} size="small" fullWidth value={business.kvk} onChange={(e) => setBiz({ kvk: e.target.value })} inputProps={{ inputMode: 'numeric' }} />
              <TextField label={t('business.vatNumber')} size="small" fullWidth value={business.vatNumber} onChange={(e) => setBiz({ vatNumber: e.target.value })} placeholder="NL001234567B01" />
            </Box>
            <TextField label={t('business.iban')} size="small" fullWidth value={business.iban} onChange={(e) => setBiz({ iban: e.target.value })} placeholder="NL12 RABO 0123 4567 89" />
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <TextField label={t('business.invoiceEmail')} type="email" size="small" fullWidth value={business.invoiceEmail} onChange={(e) => setBiz({ invoiceEmail: e.target.value })} />
              <TextField label={t('business.phone')} type="tel" size="small" fullWidth value={business.phone} onChange={(e) => setBiz({ phone: e.target.value })} />
            </Box>
            <Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                <TextField label={t('business.invoicePrefix')} size="small" fullWidth value={business.invoicePrefix} onChange={(e) => setBiz({ invoicePrefix: e.target.value })} inputProps={{ spellCheck: false }} />
                <TextField
                  label={t('business.nextNumber')}
                  size="small"
                  fullWidth
                  value={String(business.nextInvoiceNumber)}
                  onChange={(e) => setBiz({ nextInvoiceNumber: Math.max(1, Math.trunc(Number(e.target.value) || 1)) })}
                  inputProps={{ inputMode: 'numeric' }}
                />
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
                {t('business.numberingHelp', { example: `${business.invoicePrefix}${pad4(business.nextInvoiceNumber)}` })}
              </Typography>
            </Box>
            <Alert severity="info" icon={false}>
              {t('business.vatNote')}
            </Alert>
            <Box>
              <Button variant="contained" disableElevation onClick={() => void save()} disabled={saving}>
                {saving ? t('common.saving') : t('common.save')}
              </Button>
            </Box>
          </Box>
        </ContentCard>

        {/* Betalingen: elk bedrijf koppelt zijn eigen Mollie-account. */}
        <PaymentsSettings orgId={orgId} payments={payments} onChange={setPayments} />
      </Box>

      {/* Voorbeeld van de factuur: zo landen logo en bedrijfsgegevens op de PDF. Een factuur is altijd wit. */}
      <ContentCard>
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 1.5 }}>
          {t('business.preview')}
        </Typography>
        <Box sx={{ mx: 'auto', maxWidth: 420, borderRadius: 3, border: 1, borderColor: 'divider', bgcolor: '#fff', color: '#191d17', p: 3, fontSize: 11 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
            <Box sx={{ width: 32, height: 32, borderRadius: 2, bgcolor: logoUrl ? '#fff' : primary, overflow: 'hidden', flexShrink: 0 }}>
              {logoUrl && <Box component="img" src={logoUrl} alt="" sx={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" fontWeight={600} noWrap>
                {business.legalName || orgName}
              </Typography>
              <Typography variant="caption" sx={{ color: '#43483f' }} noWrap>
                {[business.street, [business.postcode, business.city].filter(Boolean).join(' ')].filter(Boolean).join(' · ') || '—'}
              </Typography>
            </Box>
            <Typography sx={{ fontWeight: 700, fontSize: 16, color: primary }}>FACTUUR</Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 3, mb: 2 }}>
            {[
              ['Factuurnummer', `${business.invoicePrefix}${pad4(business.nextInvoiceNumber)}`],
              ['Factuurdatum', new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })],
              ['Aan', firstName],
            ].map(([k, v]) => (
              <Box key={k}>
                <Typography sx={{ fontSize: 9, fontWeight: 600, color: '#43483f' }}>{k}</Typography>
                <Typography sx={{ fontSize: 11 }}>{v}</Typography>
              </Box>
            ))}
          </Box>
          <Box sx={{ borderTop: '1px solid #c3c8bd', borderBottom: '1px solid #c3c8bd', py: 1, display: 'flex', justifyContent: 'space-between' }}>
            <span>Abonnement · periode</span>
            <span>€ 0,00</span>
          </Box>
          <Typography sx={{ fontSize: 9, color: '#43483f', mt: 2 }} noWrap>
            {[business.kvk && `KvK ${business.kvk}`, business.vatNumber && `btw ${business.vatNumber}`, business.iban].filter(Boolean).join(' · ') || '—'}
          </Typography>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 1 }}>
          {t('business.previewHint')}
        </Typography>
      </ContentCard>
    </Box>
  );
}
