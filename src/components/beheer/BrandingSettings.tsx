/**
 * Huisstijl van de studio, voor de beheerder. Volgt het scherm "Branding" uit het ontwerp:
 * logo, naam, merkkleur met de afgeleide stalen, en een voorbeeld dat meteen meebeweegt.
 *
 * Twee manieren om aan kleuren te komen. De gewone: één merkkleur kiezen, de rest rolt eruit.
 * De precieze: een export van Google's Material Theme Builder plakken; die gaat dan voor.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, FormControlLabel, Switch, TextField, Typography } from '@mui/material';
import UploadRoundedIcon from '@mui/icons-material/UploadRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import { ContentCard } from '../layout';
import { PaymentsSettings } from './PaymentsSettings';
import { AccountRetentionSettings } from './AccountRetentionSettings';
import { useI18n } from '../../context/I18nContext';
import { useProfile } from '../../context/ProfileContext';
import { useBranding } from '../../context/BrandingContext';
import { useNotify } from '../../context/NotifyContext';
import { getOrg, saveOrg, saveOrgBookingPolicy, saveOrgBranding, saveOrgBusiness, toPaymentsStatus } from '../../services/orgService';
import { deleteOrgLogo, makePrintLogoFromUrl, uploadOrgLogo } from '../../services/orgLogoService';
import { isHexColor, parseThemeBuilderExport, resolveScheme, SWATCH_KEYS, type LightScheme } from '../../theme/brandingTheme';
import type { OrgBranding, OrgBusiness, OrgPaymentsStatus } from '../../types';

/** Standaard bij een studio die het nog niet heeft ingesteld: zelfde aantal uur als de server. */
const DEFAULT_FREE_CANCEL_HOURS = 12;

const THEME_BUILDER_URL = 'https://material-foundation.github.io/material-theme-builder/';

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

export function BrandingSettings() {
  const { t } = useI18n();
  const profile = useProfile();
  const branding = useBranding();
  const notify = useNotify();
  const orgId = profile?.activeOrgId ?? null;
  const firstName = profile?.profile?.displayName?.trim().split(/\s+/)[0] || 'Jan';

  const [loaded, setLoaded] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [savedOrgName, setSavedOrgName] = useState('');
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [allowSelfSignup, setAllowSelfSignup] = useState(false);
  const [staffFullClientAccess, setStaffFullClientAccess] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoPrintUrl, setLogoPrintUrl] = useState<string | null>(null);
  const [seed, setSeed] = useState('#426833');
  const [exportText, setExportText] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [business, setBusiness] = useState<OrgBusiness>(() => emptyBusiness(''));
  const [savingBusiness, setSavingBusiness] = useState(false);
  const [freeCancelHours, setFreeCancelHours] = useState(String(DEFAULT_FREE_CANCEL_HOURS));
  const [payments, setPayments] = useState<OrgPaymentsStatus>(() => toPaymentsStatus(null));
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    void getOrg(orgId).then((org) => {
      if (cancelled || !org) return;
      setOrgName(org.name);
      setSavedOrgName(org.name);
      setOwnerId(org.ownerId);
      setAllowSelfSignup(org.allowSelfSignup);
      setStaffFullClientAccess(org.staffFullClientAccess);
      setLogoUrl(org.branding?.logoUrl ?? null);
      setLogoPrintUrl(org.branding?.logoPrintUrl ?? null);
      setSeed(org.branding?.seedColor ?? '#426833');
      // Logo van vóór de drukversie: die alsnog maken, zodat hij op de factuur komt.
      if (org.branding?.logoUrl && !org.branding.logoPrintUrl) {
        void makePrintLogoFromUrl(orgId, org.branding.logoUrl).then(async (url) => {
          if (cancelled || !url) return;
          setLogoPrintUrl(url);
          await saveOrgBranding(orgId, { ...org.branding, logoPrintUrl: url }).catch(() => undefined);
        });
      }
      setExportText(org.branding?.lightScheme ? JSON.stringify({ schemes: { light: org.branding.lightScheme } }, null, 2) : '');
      setBusiness(org.business ?? emptyBusiness(org.name));
      setPayments(org.payments);
      setFreeCancelHours(String(org.bookingPolicy?.freeCancelHours ?? DEFAULT_FREE_CANCEL_HOURS));
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const exportScheme = useMemo(() => (exportText.trim() ? parseThemeBuilderExport(exportText) : null), [exportText]);
  const exportInvalid = exportText.trim().length > 0 && !exportScheme;
  const seedValid = isHexColor(seed);

  const draft: OrgBranding = useMemo(
    () => ({
      logoUrl,
      logoPrintUrl,
      seedColor: seedValid ? seed.trim().toUpperCase() : null,
      lightScheme: exportScheme,
    }),
    [logoUrl, logoPrintUrl, seed, seedValid, exportScheme]
  );
  const preview: LightScheme = useMemo(() => resolveScheme(draft), [draft]);

  const handleLogo = async (file: File | null) => {
    if (!file || !orgId) return;
    setUploading(true);
    try {
      const up = await uploadOrgLogo(orgId, file);
      setLogoUrl(up.logoUrl);
      setLogoPrintUrl(up.logoPrintUrl);
    } catch (e) {
      notify.error('Logo uploaden mislukt.', e);
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveLogo = async () => {
    if (!orgId) return;
    await deleteOrgLogo(orgId);
    setLogoUrl(null);
    setLogoPrintUrl(null);
  };

  const freeCancelHoursNum = Number(freeCancelHours);
  const freeCancelHoursValid = Number.isInteger(freeCancelHoursNum) && freeCancelHoursNum >= 0;

  const handleSave = async () => {
    if (!orgId) return;
    if (exportInvalid) {
      notify.error('De geplakte export is geen Theme Builder-schema.');
      return;
    }
    if (!orgName.trim()) {
      notify.error('Geef de studio een naam.');
      return;
    }
    if (!freeCancelHoursValid) {
      notify.error('Vul een geldig aantal uur in bij het boekingsbeleid.');
      return;
    }
    setBusy(true);
    try {
      if (orgName.trim() !== savedOrgName) {
        await saveOrg(orgId, { name: orgName.trim(), ownerId, allowSelfSignup, staffFullClientAccess });
        setSavedOrgName(orgName.trim());
      }
      await saveOrgBranding(orgId, draft);
      await saveOrgBookingPolicy(orgId, { freeCancelHours: freeCancelHoursNum });
      await branding?.refresh();
      notify.success('Huisstijl opgeslagen. Leden zien hem bij hun volgende bezoek.');
    } catch (e) {
      notify.error('Huisstijl opslaan mislukt.', e);
    } finally {
      setBusy(false);
    }
  };

  const setBiz = (patch: Partial<OrgBusiness>) => setBusiness((b) => ({ ...b, ...patch }));

  const handleSaveBusiness = async () => {
    if (!orgId) return;
    setSavingBusiness(true);
    try {
      await saveOrgBusiness(orgId, business);
      notify.success(t('business.saved'));
    } catch (e) {
      notify.error(t('business.failed'), e);
    } finally {
      setSavingBusiness(false);
    }
  };

  const handleReset = async () => {
    if (!orgId) return;
    setBusy(true);
    try {
      await deleteOrgLogo(orgId);
      await saveOrgBranding(orgId, null);
      setLogoUrl(null);
      setLogoPrintUrl(null);
      setSeed('#426833');
      setExportText('');
      await branding?.refresh();
      notify.success('Terug naar de huisstijl van VORM.');
    } catch (e) {
      notify.error('Terugzetten mislukt.', e);
    } finally {
      setBusy(false);
    }
  };

  if (!orgId) return null;
  if (!loaded) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  const shownName = orgName.trim() || savedOrgName;

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr) minmax(0, 1fr)' }, gap: 2, alignItems: 'start' }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <ContentCard>
        <Typography variant="h5" sx={{ fontWeight: 600, mb: 0.5 }}>
          Huisstijl
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Wijzigingen gelden overal zodra je opslaat. Leden zien ze bij hun volgende bezoek.
        </Typography>

        {/* Logo */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2.5 }}>
          <Box
            sx={{
              width: 56,
              height: 56,
              borderRadius: 3,
              bgcolor: preview.primary,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              flexShrink: 0,
            }}
          >
            {logoUrl ? <Box component="img" src={logoUrl} alt="" sx={{ width: '100%', height: '100%', objectFit: 'contain', bgcolor: '#fff' }} /> : null}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography fontWeight={600}>{logoUrl ? 'Huidig logo' : 'Nog geen logo'}</Typography>
            <Typography variant="caption" color="text.secondary">
              {logoUrl && !logoPrintUrl ? t('billing.logoHint') : 'PNG of SVG, liefst zonder achtergrond. Max 2 MB.'}
            </Typography>
          </Box>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void handleLogo(e.target.files?.[0] ?? null)} />
          <Button variant="outlined" size="small" startIcon={uploading ? <CircularProgress size={14} /> : <UploadRoundedIcon />} disabled={uploading} onClick={() => fileRef.current?.click()}>
            {logoUrl ? 'Vervangen' : 'Uploaden'}
          </Button>
          {logoUrl && (
            <Button size="small" color="inherit" startIcon={<DeleteOutlineRoundedIcon />} onClick={() => void handleRemoveLogo()}>
              Weg
            </Button>
          )}
        </Box>

        <TextField
          label="Studionaam"
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          fullWidth
          size="small"
          sx={{ mb: 2.5 }}
        />

        {/* Merkkleur */}
        <Typography variant="subtitle2" sx={{ mb: 0.75 }}>
          Merkkleur
        </Typography>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', mb: 1 }}>
          <Box
            component="input"
            type="color"
            value={seedValid ? seed : '#426833'}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSeed(e.target.value.toUpperCase())}
            aria-label="Merkkleur kiezen"
            sx={{ width: 48, height: 48, p: 0, border: 0, borderRadius: 3, bgcolor: 'transparent', cursor: 'pointer', '&::-webkit-color-swatch-wrapper': { p: 0 }, '&::-webkit-color-swatch': { border: 0, borderRadius: 12 } }}
          />
          <TextField value={seed} onChange={(e) => setSeed(e.target.value)} size="small" error={!seedValid} helperText={seedValid ? undefined : 'Een hexkleur zoals #4E6543'} sx={{ flex: 1 }} inputProps={{ spellCheck: false, style: { fontFamily: 'monospace' } }} />
        </Box>
        <Box sx={{ display: 'flex', gap: 0.75, mb: 0.5 }}>
          {SWATCH_KEYS.map((k) => (
            <Box key={k} title={k} sx={{ flex: 1, height: 22, borderRadius: 1, bgcolor: preview[k], border: 1, borderColor: 'divider' }} />
          ))}
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2.5 }}>
          {exportScheme ? 'Uit de geplakte Theme Builder-export.' : 'Automatisch afgeleid · Material 3 · zelfde rekensom als de Theme Builder.'}
        </Typography>

        {/* Theme Builder */}
        <Typography variant="subtitle2" sx={{ mb: 0.75 }}>
          Material Theme Builder · optioneel
        </Typography>
        <TextField
          value={exportText}
          onChange={(e) => setExportText(e.target.value)}
          multiline
          minRows={3}
          maxRows={10}
          fullWidth
          size="small"
          placeholder='{ "schemes": { "light": { "primary": "#4E6543", … } } }'
          error={exportInvalid}
          helperText={
            exportInvalid
              ? 'Dit is geen Theme Builder-schema (verwacht schemes.light met hexkleuren).'
              : exportScheme
                ? 'Schema herkend · gaat vóór de merkkleur.'
                : 'Plak de JSON-export · gaat vóór de merkkleur.'
          }
          inputProps={{ spellCheck: false, style: { fontFamily: 'monospace', fontSize: 12 } }}
          sx={{ mb: 0.5 }}
        />
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <Button size="small" component="a" href={THEME_BUILDER_URL} target="_blank" rel="noopener noreferrer" sx={{ px: 0 }}>
            Open Material Theme Builder →
          </Button>
          {exportText && (
            <Button size="small" color="inherit" onClick={() => setExportText('')}>
              Export wissen
            </Button>
          )}
        </Box>

        {/* Boekingsbeleid: tot wanneer afmelden gratis is (ontwerp "Booking policy"). */}
        <Box sx={{ mt: 2.5 }}>
          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
            Boekingsbeleid
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            Gratis afmelden tot dit aantal uur voor de les begint. Meldt iemand zich later af, dan kost het nog steeds een
            credit — maar we moedigen afmelden wel aan, zodat de plek vrijkomt.
          </Typography>
          <TextField
            label="Vrije annuleertermijn (uren)"
            size="small"
            value={freeCancelHours}
            onChange={(e) => setFreeCancelHours(e.target.value)}
            error={!freeCancelHoursValid}
            helperText={freeCancelHoursValid ? undefined : 'Vul een geheel getal in, 0 of hoger.'}
            inputProps={{ inputMode: 'numeric' }}
            sx={{ maxWidth: 220 }}
          />
        </Box>

        {/* Toegang tussen trainers: standaard uit, per organisatie te kiezen (bijv. voor een dienst-overdracht). */}
        <Box sx={{ mt: 2.5 }}>
          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
            Toegang tussen trainers
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            Staat dit uit, dan ziet een trainer alleen de schema's van de eigen cliënten. Staat dit aan, dan mag elke
            trainer of beheerder in de studio het schema van iedere cliënt inzien — bijvoorbeeld handig bij het
            overnemen van een dienst, maar het geldt dan voor iedereen, altijd.
          </Typography>
          <FormControlLabel
            control={<Switch checked={staffFullClientAccess} onChange={(e) => setStaffFullClientAccess(e.target.checked)} />}
            label="Trainers mogen elkaars cliënten zien"
          />
        </Box>

        <Box sx={{ display: 'flex', gap: 1, mt: 2.5, flexWrap: 'wrap' }}>
          <Button variant="contained" onClick={() => void handleSave()} disabled={busy || uploading || exportInvalid || !seedValid || !freeCancelHoursValid}>
            {busy ? 'Bezig…' : 'Opslaan'}
          </Button>
          <Button color="inherit" onClick={() => void handleReset()} disabled={busy}>
            Terug naar VORM
          </Button>
        </Box>
      </ContentCard>

      {/* Bedrijfsgegevens voor op de factuur (ontwerp "Business details") */}
      <ContentCard>
        <Typography variant="h5" sx={{ fontWeight: 600, mb: 0.5 }}>
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
            <Button variant="contained" onClick={() => void handleSaveBusiness()} disabled={savingBusiness}>
              {savingBusiness ? t('common.saving') : t('common.save')}
            </Button>
          </Box>
        </Box>
      </ContentCard>

      {/* Betalingen: elk bedrijf koppelt zijn eigen Mollie-account (ontwerp "Payments — Mollie") */}
      <PaymentsSettings orgId={orgId} payments={payments} onChange={setPayments} />
      <AccountRetentionSettings orgId={orgId} myUid={profile?.profile?.userId} />
      </Box>

      {/* Voorbeeld */}
      <ContentCard>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mb: 1.5 }}>
          Voorbeeld
        </Typography>
        <Box sx={{ mx: 'auto', maxWidth: 280, borderRadius: 5, border: `1px solid ${preview.outlineVariant}`, bgcolor: preview.surface, color: preview.onSurface, p: 2, minHeight: 360, display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Box sx={{ width: 24, height: 24, borderRadius: 1.5, bgcolor: preview.primary, overflow: 'hidden', flexShrink: 0 }}>
              {logoUrl && <Box component="img" src={logoUrl} alt="" sx={{ width: '100%', height: '100%', objectFit: 'contain', bgcolor: '#fff' }} />}
            </Box>
            <Typography fontWeight={600} noWrap>
              {shownName}
            </Typography>
          </Box>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 1.5 }}>
            Welkom terug, {firstName}
          </Typography>
          <Box sx={{ bgcolor: preview.primary, color: preview.onPrimary, borderRadius: 99, py: 1.25, textAlign: 'center', fontWeight: 600, fontSize: 14, mb: 1.5 }}>Training starten</Box>
          <Box sx={{ display: 'flex', gap: 0.75, mb: 1.5 }}>
            <Chip label="Toegewezen" size="small" sx={{ bgcolor: preview.primaryContainer, color: preview.onPrimaryContainer, fontWeight: 600 }} />
            <Chip label="Groepsles" size="small" sx={{ bgcolor: preview.tertiaryContainer, color: preview.onTertiaryContainer, fontWeight: 600 }} />
          </Box>
          <Box sx={{ bgcolor: preview.surfaceContainerLow, borderRadius: 3, p: 1.5, mb: 1 }}>
            <Typography variant="body2" fontWeight={600}>
              Barbell Bench Press
            </Typography>
            <Typography variant="caption" sx={{ color: preview.onSurfaceVariant }}>
              80 kg · 4 × 8 · vandaag
            </Typography>
          </Box>
          <Box sx={{ flex: 1 }} />
          <Box sx={{ bgcolor: preview.surfaceContainer, borderRadius: 3, display: 'flex', justifyContent: 'space-around', py: 1, mt: 1 }}>
            {['Inzichten', 'Workouts', 'Lessen'].map((l, i) => (
              <Box key={l} sx={{ fontSize: 11, px: 1, py: 0.25, borderRadius: 99, bgcolor: i === 0 ? preview.secondaryContainer : 'transparent', color: i === 0 ? preview.onSecondaryContainer : preview.onSurfaceVariant, fontWeight: i === 0 ? 700 : 500 }}>
                {l}
              </Box>
            ))}
          </Box>
        </Box>
        <Alert severity="info" icon={false} sx={{ mt: 2 }}>
          Het inlogscherm blijft VORM: daar is nog niet bekend bij welke studio iemand hoort.
        </Alert>

        {/* Voorbeeld van de factuur: zo landen logo en bedrijfsgegevens op de PDF. */}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 3, mb: 1.5 }}>
          {t('business.preview')}
        </Typography>
        <Box sx={{ mx: 'auto', maxWidth: 420, borderRadius: 3, border: `1px solid ${preview.outlineVariant}`, bgcolor: '#fff', color: '#191d17', p: 3, fontSize: 11 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
            <Box sx={{ width: 32, height: 32, borderRadius: 2, bgcolor: preview.primary, overflow: 'hidden', flexShrink: 0 }}>
              {logoUrl && <Box component="img" src={logoUrl} alt="" sx={{ width: '100%', height: '100%', objectFit: 'contain', bgcolor: '#fff' }} />}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" fontWeight={600} noWrap>
                {business.legalName || shownName}
              </Typography>
              <Typography variant="caption" sx={{ color: '#43483f' }} noWrap>
                {[business.street, [business.postcode, business.city].filter(Boolean).join(' ')].filter(Boolean).join(' · ') || '—'}
              </Typography>
            </Box>
            <Typography sx={{ fontWeight: 700, fontSize: 16, color: preview.primary }}>FACTUUR</Typography>
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
