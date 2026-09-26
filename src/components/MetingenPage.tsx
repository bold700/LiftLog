import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Alert,
  Typography,
  TextField,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import { PageLayout } from './layout';
import { designTokens } from '../theme/designTokens';
import { WeeklyCheckinDialog } from './WeeklyCheckinDialog';
import { GiveHealthConsentDialog, HEALTH_CONSENT_WHY } from './HealthConsentDialog';
import { NumberField } from './NumberField';
import { useProfile } from '../context/ProfileContext';
import { useViewAs } from '../context/ViewAsContext';
import { useNotify } from '../context/NotifyContext';
import { updateProfile } from '../services/profileService';
import {
  saveMeasurement,
  deleteMeasurement,
  getMeasurementsForUser,
  CIRCUMFERENCE_FIELDS,
  SKINFOLD_FIELDS,
  skinfoldSum,
  type Measurement,
  type CircumferenceKey,
  type SkinfoldKey,
  type BodyFatMethod,
  newMeasurementId,
} from '../services/measurementService';
import {
  PHOTO_VIEWS,
  uploadProgressPhoto,
  deleteProgressPhoto,
  deleteAllProgressPhotos,
  type PhotoView,
  type PhotoUrlKey,
} from '../services/progressPhotoService';
import { ageOnDate, bodyFatDurninWomersley, toSkinfoldSex, DW_MIN_AGE, fatFreeMassKg, bmi } from '../utils/bodyFat';
import { todayIso } from '../utils/format';
import { PRIMARY_BUTTON_SX } from './metingen/styles';
import { PhotoProgressPanel } from './metingen/PhotoProgressPanel';
import { SporterProfileFix } from './metingen/SporterProfileFix';
import { ProgressPhotoSlots, type PhotoSlot } from './metingen/ProgressPhotoSlots';
import { WeightGoalDialog } from './metingen/WeightGoalDialog';
import { CompositionCard, HistoryRows, LatestWeightCard, ScanBanner } from './metingen/BodySummary';
import { BodyScanSection } from './metingen/BodyScanSection';
import { BodyScanDialog } from './metingen/BodyScanDialog';
import {
  bodyScanFromDraft,
  draftFromBodyScan,
  draftHasValues,
  emptyBodyScanDraft,
  measuredDate,
  type BodyScan,
  type BodyScanDraft,
} from '../utils/bodyScan';

const EMPTY_CIRC = Object.fromEntries(CIRCUMFERENCE_FIELDS.map((f) => [f.key, ''])) as Record<CircumferenceKey, string>;
const EMPTY_SKIN = Object.fromEntries(SKINFOLD_FIELDS.map((f) => [f.key, ''])) as Record<SkinfoldKey, string>;

const EMPTY_PHOTO: PhotoSlot = { existingUrl: null, file: null, previewUrl: null, remove: false };
const EMPTY_PHOTOS = Object.fromEntries(PHOTO_VIEWS.map((v) => [v.view, EMPTY_PHOTO])) as Record<PhotoView, PhotoSlot>;

/** Zelfde sectie-look als de Formule 7-routekaart in het workout-scherm. */
const ACCORDION_SX = {
  margin: 0,
  p: 1.5,
  borderRadius: 4,
  border: `1px solid ${designTokens.cardBorder}`,
  backgroundColor: designTokens.cardBackgroundHigh,
  '&:before': { display: 'none' },
  boxShadow: 'none',
  '& .MuiAccordionSummary-root': { py: 0.5, minHeight: 44, px: 0 },
  '& .MuiAccordionSummary-content': { my: 0.75, minWidth: 0 },
} as const;

/** Twee kolommen op tablet/desktop, één op mobiel (invoervelden). */
const FIELD_GRID_SX = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
  gap: 1.5,
} as const;

type SectionKey = 'scan' | 'circ' | 'skin' | 'photos';

export interface MetingenPageProps {
  /** Open direct het invoervenster (bijv. vanuit "+ Log → Meting loggen"). */
  openFormRequested?: boolean;
  onConsumeOpenForm?: () => void;
}

export function MetingenPage({ openFormRequested, onConsumeOpenForm }: MetingenPageProps = {}) {
  const theme = useTheme();
  const fullScreenForm = useMediaQuery(theme.breakpoints.down('sm'));
  const [formOpen, setFormOpen] = useState(false);
  const profileCtx = useProfile();
  const notify = useNotify();
  const isTrainer = profileCtx?.isTrainer ?? false;
  const sporters = profileCtx?.allSporters ?? [];
  const selfUid = profileCtx?.profile?.userId ?? '';
  const selfTrainerId = profileCtx?.profile?.trainerId ?? null;

  const [weeklyOpen, setWeeklyOpen] = useState(false);
  // Wie je bekijkt, komt uit "Bekijk als" (avatarmenu); een eigen keuzelijst per pagina is er niet meer.
  const { viewed } = useViewAs();
  const targetId = viewed.isOther ? viewed.userId : '';
  const [items, setItems] = useState<Measurement[]>([]);
  const [loading, setLoading] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [date, setDate] = useState(todayIso());
  const [weight, setWeight] = useState('');
  /** Handmatig/extern vetpercentage van een bestaand record (bijv. bodyscan). Alleen bewaard bij bewerken, niet meer invoerbaar. */
  const [bodyFat, setBodyFat] = useState('');
  const [bodyFatMethodStored, setBodyFatMethodStored] = useState<BodyFatMethod | null>(null);
  const [openSections, setOpenSections] = useState<SectionKey[]>([]);
  const toggleSection = (k: SectionKey) => setOpenSections((o) => (o.includes(k) ? o.filter((x) => x !== k) : [...o, k]));
  const [photos, setPhotos] = useState<Record<PhotoView, PhotoSlot>>(EMPTY_PHOTOS);
  const photoInputs = useRef<Record<PhotoView, HTMLInputElement | null>>({ front: null, side: null, back: null });
  const [note, setNote] = useState('');
  const [circ, setCirc] = useState<Record<CircumferenceKey, string>>(EMPTY_CIRC);
  const [skin, setSkin] = useState<Record<SkinfoldKey, string>>(EMPTY_SKIN);
  const [scanDraft, setScanDraft] = useState<BodyScanDraft>(emptyBodyScanDraft);
  const [viewScan, setViewScan] = useState<Measurement | null>(null);
  const [saving, setSaving] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [goalInput, setGoalInput] = useState('');
  const [consentOpen, setConsentOpen] = useState(false);

  const effectiveUserId = targetId || selfUid;
  const targetProfile = targetId ? sporters.find((s) => s.userId === targetId) ?? null : profileCtx?.profile ?? null;
  const effectiveTrainerId = targetId ? targetProfile?.trainerId ?? null : selfTrainerId;
  // Nee gezegd tegen gezondheidsgegevens (AVG): dan leggen we ook geen nieuwe metingen vast.
  const healthBlocked = targetProfile?.healthConsent?.given === false;

  const load = useCallback(async () => {
    if (!effectiveUserId) return;
    setLoading(true);
    try {
      setItems(await getMeasurementsForUser(effectiveUserId));
    } catch (err) {
      setItems([]);
      notify.error('Metingen laden mislukt. Controleer je verbinding.', err);
    } finally {
      setLoading(false);
    }
  }, [effectiveUserId, notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setEditingId(null);
    setDate(todayIso());
    setWeight('');
    setBodyFat('');
    setBodyFatMethodStored(null);
    setNote('');
    setCirc(EMPTY_CIRC);
    setSkin(EMPTY_SKIN);
    setScanDraft(emptyBodyScanDraft());
    setOpenSections([]);
    setPhotos((p) => {
      for (const v of PHOTO_VIEWS) if (p[v.view].previewUrl) URL.revokeObjectURL(p[v.view].previewUrl as string);
      return EMPTY_PHOTOS;
    });
  };

  /** Invoervenster openen voor een nieuwe meting; `sections` staan meteen open (bijv. de bodyscan). */
  const openNew = (sections: SectionKey[] = []) => {
    resetForm();
    setOpenSections(sections);
    setFormOpen(true);
  };

  const closeForm = () => {
    resetForm();
    setFormOpen(false);
  };

  useEffect(() => {
    if (!openFormRequested) return;
    openNew();
    onConsumeOpenForm?.();
    // Alleen reageren op het verzoek zelf; openNew is elke render nieuw.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openFormRequested]);

  const pickPhoto = (view: PhotoView, file: File | null) => {
    setPhotos((p) => {
      const prev = p[view];
      if (prev.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return { ...p, [view]: { ...prev, file, previewUrl: file ? URL.createObjectURL(file) : null, remove: false } };
    });
  };

  const clearPhoto = (view: PhotoView) => {
    setPhotos((p) => {
      const prev = p[view];
      if (prev.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return { ...p, [view]: { ...prev, file: null, previewUrl: null, remove: prev.existingUrl != null } };
    });
    const el = photoInputs.current[view];
    if (el) el.value = '';
  };

  /** Herkende bodyscan overnemen: het concept vullen en gewicht, vetpercentage en datum meenemen. */
  const handleScanRecognized = (scan: BodyScan) => {
    setScanDraft(draftFromBodyScan(scan));
    if (scan.values.weightKg != null) setWeight(String(scan.values.weightKg));
    if (scan.values.bodyFatPct != null) {
      setBodyFat(String(scan.values.bodyFatPct));
      setBodyFatMethodStored('bodyscan');
    }
    const d = measuredDate(scan);
    if (d && !editingId) setDate(d);
  };

  const handleScanClear = () => {
    setScanDraft(emptyBodyScanDraft());
    if (bodyFatMethodStored === 'bodyscan') {
      setBodyFat('');
      setBodyFatMethodStored(null);
    }
  };

  const circNumbers = (): Record<CircumferenceKey, number | null> => {
    const o = {} as Record<CircumferenceKey, number | null>;
    for (const f of CIRCUMFERENCE_FIELDS) {
      const v = circ[f.key].trim();
      o[f.key] = v !== '' ? Number(v) : null;
    }
    return o;
  };

  const skinNumbers = useMemo((): Record<SkinfoldKey, number | null> => {
    const o = {} as Record<SkinfoldKey, number | null>;
    for (const f of SKINFOLD_FIELDS) {
      const v = skin[f.key].trim();
      const n = v !== '' ? Number(v) : NaN;
      o[f.key] = Number.isFinite(n) ? n : null;
    }
    return o;
  }, [skin]);

  // Berekend vetpercentage uit de vier Durnin & Womersley-plooien + leeftijd/geslacht uit het profiel.
  const sex = toSkinfoldSex(targetProfile?.gender);
  const age = ageOnDate(targetProfile?.birthDate, date);
  const formulaFilled = SKINFOLD_FIELDS.filter((f) => f.inFormula).every((f) => skinNumbers[f.key] != null);
  const computedFat = useMemo(() => {
    if (!formulaFilled || sex == null || age == null) return null;
    return bodyFatDurninWomersley({
      bicepsMm: skinNumbers.skinfoldBicepsMm ?? 0,
      tricepsMm: skinNumbers.skinfoldTricepsMm ?? 0,
      subscapularMm: skinNumbers.skinfoldSubscapularMm ?? 0,
      suprailiacMm: skinNumbers.skinfoldSuprailiacMm ?? 0,
      sex,
      ageYears: age,
    });
  }, [formulaFilled, sex, age, skinNumbers]);
  const fatIsComputed = computedFat != null;
  const bodyFatValue = fatIsComputed ? String(computedFat.pct) : bodyFat;
  const currentSkinSum = skinfoldSum(skinNumbers);
  const weightNum = weight.trim() !== '' && Number.isFinite(Number(weight)) ? Number(weight) : null;
  const formFfm = weightNum != null && computedFat ? fatFreeMassKg(weightNum, computedFat.pct) : null;
  const formBmi = weightNum != null ? bmi(weightNum, targetProfile?.heightCm) : null;
  const circFilled = CIRCUMFERENCE_FIELDS.filter((f) => circ[f.key].trim() !== '').length;
  const skinFilled = SKINFOLD_FIELDS.filter((f) => skin[f.key].trim() !== '').length;
  let formulaHint: string | null = null;
  if (formulaFilled && computedFat == null) {
    if (sex == null && targetProfile?.gender === 'anders') formulaHint = 'De formule kent alleen man/vrouw; vul het vetpercentage handmatig in.';
    else if (sex == null || age == null) formulaHint = 'Vul geboortedatum en geslacht in bij Profiel om het vetpercentage te berekenen.';
    else if (age < DW_MIN_AGE) formulaHint = `De formule is gevalideerd vanaf ${DW_MIN_AGE} jaar; vul het vetpercentage handmatig in.`;
    else formulaHint = 'Deze plooien geven geen bruikbaar percentage; controleer de waarden.';
  }

  const profileIncomplete = !!targetProfile && (!targetProfile.birthDate || !targetProfile.gender);
  const canFixProfile = isTrainer && !!targetId && profileIncomplete;

  const handleSave = async () => {
    if (!effectiveUserId) return;
    let w = weight.trim() !== '' ? Number(weight) : null;
    let bf = bodyFatValue.trim() !== '' ? Number(bodyFatValue) : null;
    const cn = circNumbers();
    const hasCirc = CIRCUMFERENCE_FIELDS.some((f) => cn[f.key] != null);
    const hasSkin = SKINFOLD_FIELDS.some((f) => skinNumbers[f.key] != null);
    const hasPhoto = PHOTO_VIEWS.some((v) => photos[v.view].file != null || (photos[v.view].existingUrl != null && !photos[v.view].remove));
    const bodyScan = draftHasValues(scanDraft) ? bodyScanFromDraft(scanDraft) : null;
    // De bodyscan is leidend voor gewicht en vetpercentage (de velden zijn er al mee gevuld, maar de scan kan nog bijgewerkt zijn).
    if (bodyScan?.values.weightKg != null) w = bodyScan.values.weightKg;
    if (bodyScan?.values.bodyFatPct != null && !fatIsComputed) bf = bodyScan.values.bodyFatPct;
    if (w == null && bf == null && !hasCirc && !hasSkin && !hasPhoto && !bodyScan) return;
    if (healthBlocked) {
      notify.error(
        targetId
          ? 'Deze sporter heeft geen toestemming gegeven voor gezondheidsgegevens. Metingen vastleggen kan pas als die er is.'
          : 'Je hebt geen toestemming gegeven voor gezondheidsgegevens. Zet die aan om metingen vast te leggen.'
      );
      return;
    }
    const bodyFatMethod: BodyFatMethod | null =
      bf == null ? null : fatIsComputed ? 'durnin-womersley' : bodyScan?.values.bodyFatPct != null ? 'bodyscan' : bodyFatMethodStored ?? 'manual';
    setSaving(true);
    try {
      const editing = items.find((m) => m.id === editingId);
      const id = editing?.id ?? newMeasurementId();
      // Foto's: nieuw bestand uploaden, verwijderde weghalen, rest laten staan.
      const photoUrls = {} as Record<PhotoUrlKey, string | null>;
      await Promise.all(
        PHOTO_VIEWS.map(async (v) => {
          const slot = photos[v.view];
          if (slot.file) {
            photoUrls[v.key] = await uploadProgressPhoto(effectiveUserId, id, v.view, slot.file);
          } else if (slot.remove) {
            await deleteProgressPhoto(effectiveUserId, id, v.view);
            photoUrls[v.key] = null;
          } else {
            photoUrls[v.key] = slot.existingUrl;
          }
        })
      );
      await saveMeasurement({
        id,
        createdAt: editing?.createdAt,
        userId: effectiveUserId,
        loggedBy: selfUid || effectiveUserId,
        trainerId: effectiveTrainerId,
        date,
        weightKg: w,
        bodyFatPct: bf,
        bodyFatMethod,
        bodyScan,
        ...cn,
        ...skinNumbers,
        ...photoUrls,
        note: note.trim(),
      });
      resetForm();
      setFormOpen(false);
      await load();
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (m: Measurement) => {
    setEditingId(m.id);
    setDate(m.date || todayIso());
    setWeight(m.weightKg != null ? String(m.weightKg) : '');
    // Een eerder handmatig/extern percentage blijft bewaard; een berekend percentage wordt opnieuw berekend uit de plooien.
    setBodyFat(m.bodyFatPct != null && m.bodyFatMethod !== 'durnin-womersley' ? String(m.bodyFatPct) : '');
    setBodyFatMethodStored(m.bodyFatMethod);
    setNote(m.note);
    const c = {} as Record<CircumferenceKey, string>;
    for (const f of CIRCUMFERENCE_FIELDS) {
      const v = m[f.key];
      c[f.key] = v != null ? String(v) : '';
    }
    setCirc(c);
    const s = {} as Record<SkinfoldKey, string>;
    for (const f of SKINFOLD_FIELDS) {
      const v = m[f.key];
      s[f.key] = v != null ? String(v) : '';
    }
    setSkin(s);
    setScanDraft(m.bodyScan ? draftFromBodyScan(m.bodyScan) : emptyBodyScanDraft());
    setPhotos((p) => {
      for (const v of PHOTO_VIEWS) if (p[v.view].previewUrl) URL.revokeObjectURL(p[v.view].previewUrl as string);
      return Object.fromEntries(
        PHOTO_VIEWS.map((v) => [v.view, { existingUrl: m[v.key], file: null, previewUrl: null, remove: false }])
      ) as Record<PhotoView, PhotoSlot>;
    });
    const open: SectionKey[] = [];
    if (m.bodyScan) open.push('scan');
    if (CIRCUMFERENCE_FIELDS.some((f) => m[f.key] != null)) open.push('circ');
    if (SKINFOLD_FIELDS.some((f) => m[f.key] != null)) open.push('skin');
    if (PHOTO_VIEWS.some((v) => m[v.key] != null)) open.push('photos');
    setOpenSections(open);
    setFormOpen(true);
  };

  const handleDelete = async (id: string) => {
    const m = items.find((x) => x.id === id);
    if (!window.confirm(`Meting van ${m?.date ?? 'deze datum'} verwijderen? Bijbehorende foto's worden ook verwijderd.`)) return;
    try {
      await deleteMeasurement(id);
      if (m && PHOTO_VIEWS.some((v) => m[v.key] != null)) await deleteAllProgressPhotos(m.userId, id);
    } catch (err) {
      notify.error('Meting verwijderen mislukt. Probeer het opnieuw.', err);
    }
    if (editingId === id) closeForm();
    await load();
  };

  const scanFilled = draftHasValues(scanDraft);

  const goalWeight = targetId ? targetProfile?.weightGoalKg ?? null : profileCtx?.profile?.weightGoalKg ?? null;

  const handleSaveGoal = async () => {
    if (!effectiveUserId) return;
    const g = goalInput.trim() !== '' ? Number(goalInput) : null;
    try {
      await updateProfile(effectiveUserId, { weightGoalKg: g && g > 0 ? g : null });
    } catch (err) {
      notify.error('Doelgewicht opslaan mislukt. Probeer het opnieuw.', err);
      return;
    }
    await profileCtx?.refreshProfile();
    setGoalOpen(false);
  };

  return (
    <PageLayout maxWidth="none">
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
        {healthBlocked && (
          <Alert
            severity="info"
            action={
              targetId ? undefined : (
                <Button color="inherit" size="small" sx={{ textTransform: 'none', whiteSpace: 'nowrap' }} onClick={() => setConsentOpen(true)}>
                  Zet aan
                </Button>
              )
            }
          >
            {targetId
              ? 'Deze sporter heeft geen toestemming gegeven voor gezondheidsgegevens, dus nieuwe metingen kunnen niet worden vastgelegd. Vraag de sporter om het aan te zetten in Profiel → Account: zonder is goede begeleiding lastig.'
              : HEALTH_CONSENT_WHY}
          </Alert>
        )}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: { xs: 0.5, sm: 1 } }}>
          {!isTrainer && profileCtx?.profile && (
            <Button size="small" variant="text" sx={{ textTransform: 'none' }} onClick={() => setWeeklyOpen(true)}>
              <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
                Wekelijkse check-in
              </Box>
              <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>
                Check-in
              </Box>
            </Button>
          )}
          <Button
            size="small"
            variant="text"
            sx={{ textTransform: 'none', mr: { xs: 'auto', sm: 0 } }}
            onClick={() => {
              setGoalInput(goalWeight != null ? String(goalWeight) : '');
              setGoalOpen(true);
            }}
          >
            {goalWeight != null ? `Doel: ${goalWeight} kg` : 'Doelgewicht instellen'}
          </Button>
          <Button variant="contained" disableElevation startIcon={<AddRoundedIcon />} onClick={() => openNew()} sx={PRIMARY_BUTTON_SX}>
            Meting
            <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
              &nbsp;toevoegen
            </Box>
          </Button>
        </Box>

        <ScanBanner onClick={() => openNew(['scan'])} />

        {/* Figma "Body": links het laatste gewicht met de trend, rechts de samenstelling en de historie.
            Op mobiel onder elkaar in dezelfde volgorde. */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 13fr) minmax(0, 15fr)' }, gap: 2.5 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, minWidth: 0 }}>
            <LatestWeightCard items={items} goalWeight={goalWeight} />
            <PhotoProgressPanel items={items} />
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <CompositionCard items={items} heightCm={targetProfile?.heightCm} onViewScan={setViewScan} />
            <HistoryRows loading={loading} items={items} onEdit={handleEdit} onDelete={handleDelete} onViewScan={setViewScan} />
          </Box>
        </Box>
      </Box>

      <Dialog open={formOpen} onClose={closeForm} fullScreen={fullScreenForm} fullWidth maxWidth="sm">
        <DialogTitle>{editingId ? 'Meting bewerken' : 'Nieuwe meting'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
              <Box sx={FIELD_GRID_SX}>
                <TextField
                  label="Datum"
                  type="date"
                  size="small"
                  fullWidth
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
                <NumberField
                  label="Gewicht (kg)"
                  decimal
                  size="small"
                  fullWidth
                  value={weight}
                  onChange={setWeight}
                  helperText={formBmi != null ? `BMI ${formBmi}` : weightNum != null && !targetProfile?.heightCm ? 'Vul lengte in bij Profiel voor BMI' : ' '}
                />
              </Box>

              {/* Profiel van de sporter aanvullen (alleen trainer, alleen als het ontbreekt) */}
              {canFixProfile && <SporterProfileFix targetId={targetId} targetProfile={targetProfile} />}

              {/* Bodyscan, omtrekken, huidplooien en foto's ingeklapt: optioneel. Zelfde secties als de routekaart. */}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Accordion disableGutters expanded={openSections.includes('scan')} onChange={() => toggleSection('scan')} sx={ACCORDION_SX}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Box sx={{ display: 'flex', minWidth: 0, flex: 1, alignItems: 'center', justifyContent: 'space-between', gap: 1, pr: 1 }}>
                      <Typography variant="subtitle1" fontWeight={600}>
                        Bodyscan (weegschaal)
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {scanFilled ? 'ingevuld' : 'foto → waarden'}
                      </Typography>
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails sx={{ px: 0, pt: 0.5, pb: 0.5 }}>
                    <BodyScanSection
                      draft={scanDraft}
                      onDraftChange={setScanDraft}
                      onRecognized={handleScanRecognized}
                      onClear={handleScanClear}
                      profileAge={age}
                      profileHeightCm={targetProfile?.heightCm}
                    />
                  </AccordionDetails>
                </Accordion>

                <Accordion disableGutters expanded={openSections.includes('circ')} onChange={() => toggleSection('circ')} sx={ACCORDION_SX}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Box sx={{ display: 'flex', minWidth: 0, flex: 1, alignItems: 'center', justifyContent: 'space-between', gap: 1, pr: 1 }}>
                      <Typography variant="subtitle1" fontWeight={600}>
                        Omtrekken (cm)
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {circFilled > 0 ? `${circFilled} ingevuld` : 'optioneel'}
                      </Typography>
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails sx={{ px: 0, pt: 0.5, pb: 0.5 }}>
                    <Box sx={FIELD_GRID_SX}>
                      {CIRCUMFERENCE_FIELDS.map((f) => (
                        <NumberField
                          key={f.key}
                          label={f.label}
                          decimal
                          size="small"
                          fullWidth
                          value={circ[f.key]}
                          onChange={(v) => setCirc((c) => ({ ...c, [f.key]: v }))}
                        />
                      ))}
                    </Box>
                  </AccordionDetails>
                </Accordion>

                <Accordion disableGutters expanded={openSections.includes('skin')} onChange={() => toggleSection('skin')} sx={ACCORDION_SX}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Box sx={{ display: 'flex', minWidth: 0, flex: 1, alignItems: 'center', justifyContent: 'space-between', gap: 1, pr: 1 }}>
                      <Typography variant="subtitle1" fontWeight={600}>
                        Huidplooien (mm)
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {currentSkinSum != null ? `som ${currentSkinSum} mm${computedFat ? ` · ${computedFat.pct}%` : ''}` : 'optioneel'}
                      </Typography>
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails sx={{ px: 0, pt: 0.5, pb: 0.5 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                      Meet rechts, met dezelfde caliper en op hetzelfde moment van de dag. Biceps, triceps, rug en heup samen geven het vetpercentage (Durnin &amp; Womersley); buik telt alleen mee in de som.
                    </Typography>
                    <Box sx={FIELD_GRID_SX}>
                      {SKINFOLD_FIELDS.map((f) => (
                        <NumberField
                          key={f.key}
                          label={f.label}
                          decimal
                          size="small"
                          fullWidth
                          value={skin[f.key]}
                          onChange={(v) => setSkin((s) => ({ ...s, [f.key]: v }))}
                          helperText={f.hint}
                        />
                      ))}
                    </Box>
                    <Box sx={{ mt: 1, p: 1.5, borderRadius: 2, bgcolor: 'action.hover', fontSize: 14 }} aria-live="polite">
                      {computedFat ? (
                        <>
                          <Box component="span" sx={{ fontWeight: 500 }}>
                            Vetpercentage: {computedFat.pct}%
                          </Box>
                          <Box component="span" sx={{ color: 'text.secondary' }}>
                            {' '}
                            · som {computedFat.sumMm} mm · berekend
                          </Box>
                          {formFfm != null ? (
                            <Box sx={{ mt: 0.5 }}>
                              <Box component="span" sx={{ fontWeight: 500 }}>
                                Vetvrije massa: {formFfm} kg
                              </Box>
                              <Box component="span" sx={{ color: 'text.secondary' }}>
                                {' '}
                                · gewicht min vet
                              </Box>
                            </Box>
                          ) : (
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                              Vul gewicht in voor de vetvrije massa.
                            </Typography>
                          )}
                        </>
                      ) : formulaHint ? (
                        <Box component="span" sx={{ color: 'text.secondary' }}>
                          {formulaHint}
                        </Box>
                      ) : (
                        <Box component="span" sx={{ color: 'text.secondary' }}>
                          {skinFilled > 0 ? `Som ${currentSkinSum} mm. ` : ''}Vul biceps, triceps, rug en heup in voor het vetpercentage.
                        </Box>
                      )}
                      {!computedFat && bodyFat && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                          Opgeslagen vetpercentage van deze meting: {bodyFat}% (blijft bewaard).
                        </Typography>
                      )}
                    </Box>
                  </AccordionDetails>
                </Accordion>

                <Accordion disableGutters expanded={openSections.includes('photos')} onChange={() => toggleSection('photos')} sx={ACCORDION_SX}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Box sx={{ display: 'flex', minWidth: 0, flex: 1, alignItems: 'center', justifyContent: 'space-between', gap: 1, pr: 1 }}>
                      <Typography variant="subtitle1" fontWeight={600}>
                        Foto's
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {(() => {
                          const n = PHOTO_VIEWS.filter((v) => photos[v.view].file || (photos[v.view].existingUrl && !photos[v.view].remove)).length;
                          return n > 0 ? `${n} van 3` : 'optioneel';
                        })()}
                      </Typography>
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails sx={{ px: 0, pt: 0.5, pb: 0.5 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                      Voor, zij en achter. Zelfde plek, zelfde licht, zelfde houding: dan zie je het verschil echt.
                    </Typography>
                    <ProgressPhotoSlots photos={photos} inputsRef={photoInputs} onPick={pickPhoto} onClear={clearPhoto} />
                  </AccordionDetails>
                </Accordion>
              </Box>

              <TextField label="Notitie (optioneel)" size="small" fullWidth value={note} onChange={(e) => setNote(e.target.value)} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="text" onClick={closeForm} sx={{ textTransform: 'none' }}>
            Annuleren
          </Button>
          <Button variant="contained" onClick={handleSave} disabled={saving} sx={PRIMARY_BUTTON_SX}>
            {saving ? 'Bezig…' : editingId ? 'Opslaan' : 'Toevoegen'}
          </Button>
        </DialogActions>
      </Dialog>

      <WeightGoalDialog open={goalOpen} value={goalInput} onChange={setGoalInput} onClose={() => setGoalOpen(false)} onSave={handleSaveGoal} />
      <BodyScanDialog measurement={viewScan} onClose={() => setViewScan(null)} />
      {!isTrainer && profileCtx?.profile && (
        <WeeklyCheckinDialog
          open={weeklyOpen}
          onClose={() => setWeeklyOpen(false)}
          me={profileCtx.profile}
          onSaved={() => void load()}
        />
      )}
      <GiveHealthConsentDialog open={consentOpen} onClose={() => setConsentOpen(false)} />
    </PageLayout>
  );
}
