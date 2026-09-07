import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  MenuItem,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Button,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { PageLayout, ContentCard } from './layout';
import { useProfile } from '../context/ProfileContext';
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
import { MeasurementOverview } from './metingen/MeasurementOverview';
import { PhotoProgressPanel } from './metingen/PhotoProgressPanel';
import { SporterProfileFix } from './metingen/SporterProfileFix';
import { ProgressPhotoSlots, type PhotoSlot } from './metingen/ProgressPhotoSlots';
import { MeasurementHistory } from './metingen/MeasurementHistory';
import { WeightGoalDialog } from './metingen/WeightGoalDialog';

const EMPTY_CIRC = Object.fromEntries(CIRCUMFERENCE_FIELDS.map((f) => [f.key, ''])) as Record<CircumferenceKey, string>;
const EMPTY_SKIN = Object.fromEntries(SKINFOLD_FIELDS.map((f) => [f.key, ''])) as Record<SkinfoldKey, string>;

const EMPTY_PHOTO: PhotoSlot = { existingUrl: null, file: null, previewUrl: null, remove: false };
const EMPTY_PHOTOS = Object.fromEntries(PHOTO_VIEWS.map((v) => [v.view, EMPTY_PHOTO])) as Record<PhotoView, PhotoSlot>;

/** Zelfde sectie-look als de Formule 7-routekaart in het workout-scherm. */
const ACCORDION_SX = {
  margin: 0,
  p: 1.5,
  borderRadius: 2,
  border: '1px solid rgba(0,0,0,0.08)',
  backgroundColor: 'rgba(0,0,0,0.02)',
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

type SectionKey = 'circ' | 'skin' | 'photos';

export function MetingenPage() {
  const profileCtx = useProfile();
  const notify = useNotify();
  const isTrainer = profileCtx?.isTrainer ?? false;
  const sporters = profileCtx?.allSporters ?? [];
  const selfUid = profileCtx?.profile?.userId ?? '';
  const selfTrainerId = profileCtx?.profile?.trainerId ?? null;

  const [targetId, setTargetId] = useState('');
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
  const [saving, setSaving] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [goalInput, setGoalInput] = useState('');

  const effectiveUserId = targetId || selfUid;
  const targetProfile = targetId ? sporters.find((s) => s.userId === targetId) ?? null : profileCtx?.profile ?? null;
  const effectiveTrainerId = targetId ? targetProfile?.trainerId ?? null : selfTrainerId;

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
    setOpenSections([]);
    setPhotos((p) => {
      for (const v of PHOTO_VIEWS) if (p[v.view].previewUrl) URL.revokeObjectURL(p[v.view].previewUrl as string);
      return EMPTY_PHOTOS;
    });
  };

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
    const w = weight.trim() !== '' ? Number(weight) : null;
    const bf = bodyFatValue.trim() !== '' ? Number(bodyFatValue) : null;
    const cn = circNumbers();
    const hasCirc = CIRCUMFERENCE_FIELDS.some((f) => cn[f.key] != null);
    const hasSkin = SKINFOLD_FIELDS.some((f) => skinNumbers[f.key] != null);
    const hasPhoto = PHOTO_VIEWS.some((v) => photos[v.view].file != null || (photos[v.view].existingUrl != null && !photos[v.view].remove));
    if (w == null && bf == null && !hasCirc && !hasSkin && !hasPhoto) return;
    const bodyFatMethod: BodyFatMethod | null = bf == null ? null : fatIsComputed ? 'durnin-womersley' : bodyFatMethodStored ?? 'manual';
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
        ...cn,
        ...skinNumbers,
        ...photoUrls,
        note: note.trim(),
      });
      resetForm();
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
    setPhotos((p) => {
      for (const v of PHOTO_VIEWS) if (p[v.view].previewUrl) URL.revokeObjectURL(p[v.view].previewUrl as string);
      return Object.fromEntries(
        PHOTO_VIEWS.map((v) => [v.view, { existingUrl: m[v.key], file: null, previewUrl: null, remove: false }])
      ) as Record<PhotoView, PhotoSlot>;
    });
    const open: SectionKey[] = [];
    if (CIRCUMFERENCE_FIELDS.some((f) => m[f.key] != null)) open.push('circ');
    if (SKINFOLD_FIELDS.some((f) => m[f.key] != null)) open.push('skin');
    if (PHOTO_VIEWS.some((v) => m[v.key] != null)) open.push('photos');
    setOpenSections(open);
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
    if (editingId === id) resetForm();
    await load();
  };

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
    <PageLayout>
      <ContentCard>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          <Typography variant="h5" fontWeight={600}>
            Metingen
          </Typography>
          <Button
            size="small"
            variant="text"
            sx={{ textTransform: 'none' }}
            onClick={() => {
              setGoalInput(goalWeight != null ? String(goalWeight) : '');
              setGoalOpen(true);
            }}
          >
            {goalWeight != null ? `Doel: ${goalWeight} kg` : 'Doelgewicht instellen'}
          </Button>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Houd je gewicht, vetpercentage, omtrekmaten en huidplooien bij en volg je voortgang.
        </Typography>

        {isTrainer && sporters.length > 0 && (
          <TextField
            select
            fullWidth
            size="small"
            label="Voor wie?"
            value={targetId || 'self'}
            onChange={(e) => setTargetId(e.target.value === 'self' ? '' : e.target.value)}
            sx={{ mb: 2 }}
          >
            <MenuItem value="self">Mijzelf</MenuItem>
            {sporters.map((s) => (
              <MenuItem key={s.userId} value={s.userId}>
                {s.displayName?.trim() || s.email || s.userId}
              </MenuItem>
            ))}
          </TextField>
        )}

        {/* Huidige waarden, voortgang naar doel + tempo, gewicht- en huidplooi-trend */}
        <MeasurementOverview items={items} goalWeight={goalWeight} heightCm={targetProfile?.heightCm} />

        {/* Foto-voortgang: eerste foto naast de laatste, per aanzicht */}
        <PhotoProgressPanel items={items} />

        {/* Invoer */}
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
          {editingId ? 'Meting bewerken' : 'Nieuwe meting'}
        </Typography>
        <Box sx={{ ...FIELD_GRID_SX, mb: 1.5 }}>
          <TextField
            label="Datum"
            type="date"
            size="small"
            fullWidth
            value={date}
            onChange={(e) => setDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Gewicht (kg)"
            type="number"
            size="small"
            fullWidth
            inputProps={{ step: 0.1, min: 0, inputMode: 'decimal' }}
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            helperText={formBmi != null ? `BMI ${formBmi}` : weightNum != null && !targetProfile?.heightCm ? 'Vul lengte in bij Profiel voor BMI' : ' '}
          />
        </Box>

        {/* Profiel van de sporter aanvullen (alleen trainer, alleen als het ontbreekt) */}
        {canFixProfile && <SporterProfileFix targetId={targetId} targetProfile={targetProfile} />}

        {/* Omtrekken, huidplooien en foto's ingeklapt: optioneel, samen 16 velden. Zelfde secties als de routekaart. */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 1.5 }}>
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
                  <TextField
                    key={f.key}
                    label={f.label}
                    type="number"
                    size="small"
                    fullWidth
                    inputProps={{ step: 0.5, min: 0, inputMode: 'decimal' }}
                    value={circ[f.key]}
                    onChange={(e) => setCirc((c) => ({ ...c, [f.key]: e.target.value }))}
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
                  <TextField
                    key={f.key}
                    label={f.label}
                    type="number"
                    size="small"
                    fullWidth
                    inputProps={{ step: 0.5, min: 0, inputMode: 'decimal' }}
                    value={skin[f.key]}
                    onChange={(e) => setSkin((s) => ({ ...s, [f.key]: e.target.value }))}
                    helperText={f.hint}
                  />
                ))}
              </Box>
              <Box sx={{ mt: 1, p: 1.5, borderRadius: 2, bgcolor: 'rgba(0,0,0,0.04)', fontSize: 14 }} aria-live="polite">
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

        <TextField label="Notitie (optioneel)" size="small" fullWidth value={note} onChange={(e) => setNote(e.target.value)} sx={{ mb: 2 }} />
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="contained" onClick={handleSave} disabled={saving} sx={PRIMARY_BUTTON_SX}>
            {saving ? 'Bezig…' : editingId ? 'Opslaan' : 'Toevoegen'}
          </Button>
          {editingId && (
            <Button variant="text" onClick={resetForm} sx={{ textTransform: 'none' }}>
              Annuleren
            </Button>
          )}
        </Box>

        {/* Historie */}
        <MeasurementHistory loading={loading} items={items} onEdit={handleEdit} onDelete={handleDelete} />
      </ContentCard>

      <WeightGoalDialog open={goalOpen} value={goalInput} onChange={setGoalInput} onClose={() => setGoalOpen(false)} onSave={handleSaveGoal} />
    </PageLayout>
  );
}
