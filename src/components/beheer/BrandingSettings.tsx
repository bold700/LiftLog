/**
 * Huisstijl van de studio, voor de beheerder. Volgt het scherm "Branding" uit het ontwerp:
 * logo, naam, merkkleur met de afgeleide stalen, en een voorbeeld dat meteen meebeweegt.
 *
 * Twee manieren om aan kleuren te komen. De gewone: één merkkleur kiezen, de rest rolt eruit.
 * De precieze: een export van Google's Material Theme Builder plakken; die gaat dan voor.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, TextField, Typography } from '@mui/material';
import UploadRoundedIcon from '@mui/icons-material/UploadRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import { ContentCard } from '../layout';
import { useProfile } from '../../context/ProfileContext';
import { useBranding } from '../../context/BrandingContext';
import { useNotify } from '../../context/NotifyContext';
import { getOrg, saveOrg, saveOrgBranding } from '../../services/orgService';
import { deleteOrgLogo, uploadOrgLogo } from '../../services/orgLogoService';
import { isHexColor, parseThemeBuilderExport, resolveScheme, SWATCH_KEYS, type LightScheme } from '../../theme/brandingTheme';
import type { OrgBranding } from '../../types';

const THEME_BUILDER_URL = 'https://material-foundation.github.io/material-theme-builder/';

export function BrandingSettings() {
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
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [seed, setSeed] = useState('#426833');
  const [exportText, setExportText] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
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
      setLogoUrl(org.branding?.logoUrl ?? null);
      setSeed(org.branding?.seedColor ?? '#426833');
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
      seedColor: seedValid ? seed.trim().toUpperCase() : null,
      lightScheme: exportScheme,
    }),
    [logoUrl, seed, seedValid, exportScheme]
  );
  const preview: LightScheme = useMemo(() => resolveScheme(draft), [draft]);

  const handleLogo = async (file: File | null) => {
    if (!file || !orgId) return;
    setUploading(true);
    try {
      setLogoUrl(await uploadOrgLogo(orgId, file));
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
        await saveOrg(orgId, { name: orgName.trim(), ownerId, allowSelfSignup });
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
      await saveOrgBranding(orgId, null);
      setLogoUrl(null);
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
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, alignItems: 'start' }}>
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
              PNG of SVG, liefst zonder achtergrond. Max 2 MB.
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
            <Box key={k} title={k} sx={{ flex: 1, height: 22, borderRadius: 1, bgcolor: preview[k], border: '1px solid rgba(0,0,0,0.08)' }} />
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

        <Box sx={{ display: 'flex', gap: 1, mt: 2.5, flexWrap: 'wrap' }}>
          <Button variant="contained" onClick={() => void handleSave()} disabled={busy || uploading || exportInvalid || !seedValid}>
            {busy ? 'Bezig…' : 'Opslaan'}
          </Button>
          <Button color="inherit" onClick={() => void handleReset()} disabled={busy}>
            Terug naar VORM
          </Button>
        </Box>
      </ContentCard>

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
      </ContentCard>
    </Box>
  );
}
