/**
 * Huisstijl van de studio, voor de beheerder: logo, naam en merkkleur, met een voorbeeld dat meteen
 * meebeweegt, in licht en donker. Hoe de studio werkt staat bij Instellingen; bedrijfsgegevens en
 * betalingen bij Facturatie.
 *
 * Kleuren: één merkkleur kiezen, de rest rolt eruit (Material 3). Wie het precies wil, plakt onder
 * "Geavanceerd" een export van Google's Material Theme Builder; die gaat dan voor.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Chip,
  CircularProgress,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import UploadRoundedIcon from '@mui/icons-material/UploadRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import AddPhotoAlternateOutlinedIcon from '@mui/icons-material/AddPhotoAlternateOutlined';
import { ContentCard } from '../layout';
import { BrandLogo } from '../BrandLogo';
import { useI18n } from '../../context/I18nContext';
import { useProfile } from '../../context/ProfileContext';
import { useBranding } from '../../context/BrandingContext';
import { useNotify } from '../../context/NotifyContext';
import { getOrg, saveOrg, saveOrgBranding } from '../../services/orgService';
import { deleteOrgDarkLogo, deleteOrgLogo, makePrintLogoFromUrl, uploadOrgDarkLogo, uploadOrgLogo } from '../../services/orgLogoService';
import { isHexColor, parseThemeBuilderExport, resolveScheme, SWATCH_KEYS, type ColorMode, type LightScheme } from '../../theme/brandingTheme';
import { segmentedToggleSx } from '../../theme/segmentedToggle';
import type { OrgBranding } from '../../types';

const THEME_BUILDER_URL = 'https://material-foundation.github.io/material-theme-builder/';

/** Vak voor een logo: het logo zelf, of een gestippeld vak met een icoon als er nog geen is. */
function LogoSlot({ src, darkSrc, mode, bg }: { src: string | null; darkSrc?: string | null; mode: ColorMode; bg: string }) {
  return (
    <Box
      sx={{
        width: 56,
        height: 56,
        borderRadius: 3,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        bgcolor: bg,
        border: src ? 1 : '1px dashed',
        borderColor: 'divider',
        color: 'text.secondary',
      }}
    >
      {src ? (
        <BrandLogo src={src} darkSrc={darkSrc} mode={mode} sx={{ width: '100%', height: '100%', objectFit: 'contain', p: 0.5 }} />
      ) : (
        <AddPhotoAlternateOutlinedIcon />
      )}
    </Box>
  );
}

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
  const [logoDarkUrl, setLogoDarkUrl] = useState<string | null>(null);
  const [seed, setSeed] = useState('#426833');
  const [exportText, setExportText] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<'light' | 'dark' | null>(null);
  const [previewMode, setPreviewMode] = useState<ColorMode>('light');
  const fileRef = useRef<HTMLInputElement>(null);
  const darkFileRef = useRef<HTMLInputElement>(null);

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
      setLogoDarkUrl(org.branding?.logoDarkUrl ?? null);
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
      logoDarkUrl,
      seedColor: seedValid ? seed.trim().toUpperCase() : null,
      lightScheme: exportScheme,
    }),
    [logoUrl, logoPrintUrl, logoDarkUrl, seed, seedValid, exportScheme]
  );
  const preview: LightScheme = useMemo(() => resolveScheme(draft, previewMode), [draft, previewMode]);
  const lightPreview: LightScheme = useMemo(() => resolveScheme(draft, 'light'), [draft]);
  const darkPreview: LightScheme = useMemo(() => resolveScheme(draft, 'dark'), [draft]);

  const handleLogo = async (file: File | null) => {
    if (!file || !orgId) return;
    setUploading('light');
    try {
      const up = await uploadOrgLogo(orgId, file);
      setLogoUrl(up.logoUrl);
      setLogoPrintUrl(up.logoPrintUrl);
    } catch (e) {
      notify.error('Logo uploaden mislukt.', e);
    } finally {
      setUploading(null);
    }
  };

  const handleDarkLogo = async (file: File | null) => {
    if (!file || !orgId) return;
    setUploading('dark');
    try {
      setLogoDarkUrl(await uploadOrgDarkLogo(orgId, file));
      setPreviewMode('dark');
    } catch (e) {
      notify.error('Logo uploaden mislukt.', e);
    } finally {
      setUploading(null);
    }
  };

  const handleRemoveLogo = async () => {
    if (!orgId) return;
    await deleteOrgLogo(orgId);
    setLogoUrl(null);
    setLogoPrintUrl(null);
  };

  const handleRemoveDarkLogo = async () => {
    if (!orgId) return;
    await deleteOrgDarkLogo(orgId);
    setLogoDarkUrl(null);
  };

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
    setBusy(true);
    try {
      if (orgName.trim() !== savedOrgName) {
        await saveOrg(orgId, { name: orgName.trim(), ownerId, allowSelfSignup, staffFullClientAccess });
        setSavedOrgName(orgName.trim());
      }
      await saveOrgBranding(orgId, draft);
      await branding?.refresh();
      notify.success('Huisstijl opgeslagen. Leden zien hem bij hun volgende bezoek.');
    } catch (e) {
      notify.error('Huisstijl opslaan mislukt.', e);
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    if (!orgId) return;
    setBusy(true);
    try {
      await deleteOrgLogo(orgId);
      await deleteOrgDarkLogo(orgId);
      await saveOrgBranding(orgId, null);
      setLogoUrl(null);
      setLogoPrintUrl(null);
      setLogoDarkUrl(null);
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
  const logoRow = (opts: {
    title: string;
    hint: string;
    slot: React.ReactNode;
    onPick: () => void;
    busy: boolean;
    has: boolean;
    onRemove: () => void;
  }) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: { xs: 'wrap', sm: 'nowrap' }, mb: 2 }}>
      {opts.slot}
      <Box sx={{ flex: '1 1 160px', minWidth: 0 }}>
        <Typography fontWeight={600}>{opts.title}</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {opts.hint}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
        <Button variant="outlined" size="small" startIcon={opts.busy ? <CircularProgress size={14} /> : <UploadRoundedIcon />} disabled={opts.busy} onClick={opts.onPick}>
          {opts.has ? 'Vervangen' : 'Uploaden'}
        </Button>
        {opts.has && (
          <Button size="small" color="inherit" startIcon={<DeleteOutlineRoundedIcon />} onClick={opts.onRemove}>
            Verwijderen
          </Button>
        )}
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr) minmax(0, 1fr)' }, gap: 2, alignItems: 'start', '& .MuiCard-root': { mb: 0 } }}>
      <ContentCard>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
          Logo, naam en kleur van je studio. Wijzigingen gelden zodra je opslaat; leden zien ze bij hun volgende bezoek.
        </Typography>

        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.25 }}>
          Logo
        </Typography>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void handleLogo(e.target.files?.[0] ?? null)} />
        <input ref={darkFileRef} type="file" accept="image/*" hidden onChange={(e) => void handleDarkLogo(e.target.files?.[0] ?? null)} />
        {logoRow({
          title: logoUrl ? 'Logo' : 'Nog geen logo',
          hint: logoUrl && !logoPrintUrl ? t('billing.logoHint') : 'PNG of SVG, liefst zonder achtergrond. Max 2 MB.',
          slot: <LogoSlot src={logoUrl} mode="light" bg={lightPreview.surface} />,
          onPick: () => fileRef.current?.click(),
          busy: uploading === 'light',
          has: !!logoUrl,
          onRemove: () => void handleRemoveLogo(),
        })}
        {logoUrl &&
          logoRow({
            title: 'In de donkere modus',
            hint: logoDarkUrl
              ? 'Je eigen versie voor donker.'
              : 'Automatisch: donkere delen van je logo worden licht. Liever een eigen versie? Upload die hier.',
            slot: <LogoSlot src={logoUrl} darkSrc={logoDarkUrl} mode="dark" bg={darkPreview.surface} />,
            onPick: () => darkFileRef.current?.click(),
            busy: uploading === 'dark',
            has: !!logoDarkUrl,
            onRemove: () => void handleRemoveDarkLogo(),
          })}

        <TextField label="Naam van de studio" value={orgName} onChange={(e) => setOrgName(e.target.value)} fullWidth size="small" sx={{ mt: 0.5, mb: 2.5 }} />

        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.75 }}>
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
          <TextField
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            size="small"
            error={!seedValid}
            helperText={seedValid ? undefined : 'Een kleurcode zoals #4E6543'}
            sx={{ flex: 1 }}
            inputProps={{ spellCheck: false, style: { fontFamily: 'monospace' }, 'aria-label': 'Kleurcode' }}
          />
        </Box>
        <Box sx={{ display: 'flex', gap: 0.75, mb: 0.5 }}>
          {SWATCH_KEYS.map((k) => (
            <Box key={k} sx={{ flex: 1, height: 22, borderRadius: 1, bgcolor: preview[k], border: 1, borderColor: 'divider' }} />
          ))}
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
          {exportScheme
            ? 'Kleuren uit je eigen kleurenschema (zie Geavanceerd).'
            : 'Alle andere kleuren, ook voor de donkere modus, maakt de app zelf uit deze ene kleur.'}
        </Typography>

        {/* Voor wie het precies wil: een eigen kleurenschema uit de Material Theme Builder. */}
        <Accordion disableGutters elevation={0} defaultExpanded={!!exportText} sx={{ bgcolor: 'transparent', '&::before': { display: 'none' }, mb: 2 }}>
          <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />} sx={{ px: 0, minHeight: 40, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              Geavanceerd: eigen kleurenschema
            </Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ px: 0 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Heeft een ontwerper je kleuren al uitgewerkt in de Material Theme Builder? Exporteer daar als JSON en plak het
              hier. Dat gaat dan vóór de merkkleur.
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
              helperText={exportInvalid ? 'Dit herkennen we niet als export van de Theme Builder.' : exportScheme ? 'Herkend: deze kleuren worden gebruikt.' : undefined}
              inputProps={{ spellCheck: false, style: { fontFamily: 'monospace', fontSize: 12 }, 'aria-label': 'Export van de Theme Builder' }}
              sx={{ mb: 0.5 }}
            />
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
              <Button size="small" component="a" href={THEME_BUILDER_URL} target="_blank" rel="noopener noreferrer" sx={{ px: 0 }}>
                Open de Theme Builder
              </Button>
              {exportText && (
                <Button size="small" color="inherit" onClick={() => setExportText('')}>
                  Wissen
                </Button>
              )}
            </Box>
          </AccordionDetails>
        </Accordion>

        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button variant="contained" disableElevation onClick={() => void handleSave()} disabled={busy || uploading != null || exportInvalid || !seedValid}>
            {busy ? 'Bezig…' : 'Opslaan'}
          </Button>
          <Button color="inherit" onClick={() => void handleReset()} disabled={busy}>
            Terug naar VORM
          </Button>
        </Box>
      </ContentCard>

      {/* Voorbeeld, in licht en donker. */}
      <ContentCard>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1.5 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Voorbeeld
          </Typography>
          <ToggleButtonGroup size="small" exclusive value={previewMode} onChange={(_, v: ColorMode | null) => v && setPreviewMode(v)} sx={segmentedToggleSx} aria-label="Voorbeeld in">
            <ToggleButton value="light">Licht</ToggleButton>
            <ToggleButton value="dark">Donker</ToggleButton>
          </ToggleButtonGroup>
        </Box>
        <Box sx={{ mx: 'auto', maxWidth: 280, borderRadius: 5, border: `1px solid ${preview.outlineVariant}`, bgcolor: preview.surface, color: preview.onSurface, p: 2, minHeight: 360, display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            {logoUrl ? (
              <BrandLogo src={logoUrl} darkSrc={logoDarkUrl} mode={previewMode} lightColor={darkPreview.onSurface} sx={{ height: 24, width: 'auto', maxWidth: 72, objectFit: 'contain' }} />
            ) : (
              <Box sx={{ width: 24, height: 24, borderRadius: 1.5, bgcolor: preview.primary, flexShrink: 0 }} />
            )}
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
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 1.5 }}>
          Het inlogscherm toont nog VORM: daar weet de app nog niet bij welke studio iemand hoort.
        </Typography>
      </ContentCard>
    </Box>
  );
}
