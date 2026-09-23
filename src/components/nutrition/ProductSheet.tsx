/**
 * Productscherm bij het loggen van voeding: foto, naam, de vier macro's voor wat je gaat eten,
 * aantal × portie, het eetmoment, en wat het etiket verder zegt.
 *
 * Eén principe: alles wat je ziet slaat op de gekozen hoeveelheid, niet op "per 100 g". Die 100 g
 * staat er wel, maar klein en onderaan, voor wie het wil narekenen.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Chip,
  Dialog,
  IconButton,
  MenuItem,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import RemoveRoundedIcon from '@mui/icons-material/RemoveRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import RestaurantRoundedIcon from '@mui/icons-material/RestaurantRounded';
import { NumberField } from '../NumberField';
import { useI18n } from '../../context/I18nContext';
import { designTokens } from '../../theme/designTokens';
import { portionsFor, type Portion } from '../../utils/portions';
import { MEAL_ORDER, NEVO_ATTRIBUTION, macrosForGrams, type FoodProduct, type MealMoment } from '../../services/nutritionService';

const CUSTOM = 'custom';

export interface PortionChoice {
  label: string;
  quantity: number;
}

interface ProductSheetProps {
  product: FoodProduct | null;
  /** Gram als tekst, de bron van waarheid voor het opslaan; het scherm rekent er zelf naartoe. */
  grams: string;
  setGrams: (v: string) => void;
  meal: MealMoment;
  setMeal: (m: MealMoment) => void;
  /** Hoe de hoeveelheid is gekozen ("2× Bakje"), of null bij losse grammen. */
  onPortion: (choice: PortionChoice | null) => void;
  saving: boolean;
  isEditing: boolean;
  onClose: () => void;
  onSave: () => void;
}

const NUTRISCORE_COLOR: Record<NonNullable<FoodProduct['nutriscore']>, string> = {
  a: '#038141',
  b: '#85BB2F',
  c: '#FECB02',
  d: '#EE8100',
  e: '#E63E11',
};

const fmt1 = (v: number) => (Math.round(v * 10) / 10).toLocaleString('nl-NL');

export function ProductSheet({ product, grams, setGrams, meal, setMeal, onPortion, saving, isEditing, onClose, onSave }: ProductSheetProps) {
  const { t } = useI18n();
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));

  const portions = useMemo<Portion[]>(
    () => (product ? portionsFor(product.name, product.servingGrams, product.packageGrams ?? null) : []),
    [product]
  );

  const [quantity, setQuantity] = useState(1);
  const [portionKey, setPortionKey] = useState<string>(CUSTOM);

  // Bij openen: de portie die bij de meegegeven grammen past. Past er geen, dan bij een nieuw
  // product de eerste echte portie ("1× Schaaltje") — bij bewerken blijven de grammen zoals ze
  // waren, want die zijn dan bewust zo ingevoerd.
  useEffect(() => {
    if (!product) return;
    const g = Number(grams);
    const idx = portions.findIndex((p) => p.grams === g);
    if (idx >= 0) {
      setQuantity(1);
      setPortionKey(String(idx));
      onPortion({ label: portions[idx].label, quantity: 1 });
    } else if (!isEditing && portions.length > 0) {
      choose('0', 1);
    } else {
      setQuantity(1);
      setPortionKey(CUSTOM);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.code]);

  const choose = (key: string, qty: number) => {
    setPortionKey(key);
    setQuantity(qty);
    if (key === CUSTOM) {
      onPortion(null);
      return;
    }
    const p = portions[Number(key)];
    if (!p) return;
    setGrams(String(Math.round(p.grams * qty)));
    onPortion({ label: p.label, quantity: qty });
  };

  const totalGrams = Number(grams) || 0;
  const macros = product ? macrosForGrams(product.per100g, totalGrams) : null;
  const details = product?.details ?? null;
  const factor = totalGrams / 100;
  const detailRows: { label: string; per100: number }[] = details
    ? [
        { label: t('nutrition.sheet.sugars'), per100: details.sugars },
        { label: t('nutrition.sheet.fiber'), per100: details.fiber },
        { label: t('nutrition.sheet.saturatedFat'), per100: details.saturatedFat },
        { label: t('nutrition.sheet.salt'), per100: details.salt },
      ].filter((r): r is { label: string; per100: number } => r.per100 != null)
    : [];
  // Voorproefje in de kop, dicht bij het ontwerp ("Nutrition info · sugars, fibre, salt") —
  // zonder open te klappen al zien wat erin staat.
  const detailPreview = detailRows.map((r) => r.label.toLowerCase()).join(', ');

  return (
    <Dialog
      open={product != null}
      onClose={onClose}
      fullScreen={fullScreen}
      maxWidth="xs"
      fullWidth
      PaperProps={{ sx: { bgcolor: 'background.default', borderRadius: fullScreen ? 0 : `${designTokens.cardRadius}px` } }}
    >
      {product && (
        <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: fullScreen ? '100%' : undefined }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pl: 2.5, pr: 1, pt: 1.5 }}>
            <Typography variant="h6" fontWeight={700}>
              {isEditing ? t('nutrition.sheet.editTitle') : t('nutrition.sheet.addTitle')}
            </Typography>
            <IconButton onClick={onClose} aria-label={t('nutrition.sheet.close')}>
              <CloseRoundedIcon />
            </IconButton>
          </Box>

          <Box sx={{ flex: 1, overflowY: 'auto', px: 2.5, pb: 2 }}>
            {/* Foto */}
            <Box
              sx={{
                mx: 'auto',
                width: 168,
                height: 168,
                borderRadius: 6,
                bgcolor: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                mb: 2,
              }}
            >
              {product.imageLargeUrl || product.imageUrl ? (
                <Box component="img" src={product.imageLargeUrl || product.imageUrl || undefined} alt="" sx={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              ) : (
                <RestaurantRoundedIcon sx={{ fontSize: 56, color: 'rgba(0,0,0,0.25)' }} />
              )}
            </Box>

            <Typography variant="h5" fontWeight={700} textAlign="center" sx={{ lineHeight: 1.2 }}>
              {product.name}
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 1, mt: 0.5, mb: 2, minHeight: 24 }}>
              {product.brand && (
                <Typography variant="body2" color="text.secondary">
                  {product.brand}
                </Typography>
              )}
              {product.nutriscore && (
                <Chip
                  label={`Nutri-Score ${product.nutriscore.toUpperCase()}`}
                  size="small"
                  sx={{ bgcolor: NUTRISCORE_COLOR[product.nutriscore], color: product.nutriscore === 'c' ? '#000' : '#fff', fontWeight: 700 }}
                />
              )}
            </Box>

            {/* Macro's voor wat je gaat eten — vlakke tegels zonder kleurcodering, zoals het ontwerp */}
            {macros && (
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, mb: 2 }}>
                <MacroTile label={t('nutrition.sheet.kcal')} value={macros.kcal.toLocaleString('nl-NL')} />
                <MacroTile label={t('nutrition.sheet.carbs')} value={`${fmt1(macros.carbs)} g`} />
                <MacroTile label={t('nutrition.sheet.protein')} value={`${fmt1(macros.protein)} g`} />
                <MacroTile label={t('nutrition.sheet.fat')} value={`${fmt1(macros.fat)} g`} />
              </Box>
            )}

            {/* Aantal × portie */}
            <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', bgcolor: designTokens.cardBackground, borderRadius: 3, px: 0.5 }}>
                <IconButton size="small" aria-label={t('nutrition.sheet.less')} disabled={portionKey === CUSTOM || quantity <= 0.5} onClick={() => choose(portionKey, Math.max(0.5, quantity - (quantity <= 1 ? 0.5 : 1)))}>
                  <RemoveRoundedIcon fontSize="small" />
                </IconButton>
                <Typography fontWeight={700} sx={{ minWidth: 34, textAlign: 'center' }}>
                  {portionKey === CUSTOM ? '–' : `${quantity.toLocaleString('nl-NL')}×`}
                </Typography>
                <IconButton size="small" aria-label={t('nutrition.sheet.more')} disabled={portionKey === CUSTOM} onClick={() => choose(portionKey, quantity < 1 ? 1 : quantity + 1)}>
                  <AddRoundedIcon fontSize="small" />
                </IconButton>
              </Box>
              <TextField
                select
                size="small"
                fullWidth
                value={portionKey}
                onChange={(e) => choose(e.target.value, portionKey === CUSTOM ? 1 : quantity)}
                sx={{ '& .MuiOutlinedInput-root': { bgcolor: designTokens.cardBackground, borderRadius: 3 } }}
              >
                {portions.map((p, i) => (
                  <MenuItem key={p.label} value={String(i)}>
                    {p.label} ({p.grams} gram)
                  </MenuItem>
                ))}
                <MenuItem value={CUSTOM}>{t('nutrition.sheet.customAmount')}</MenuItem>
              </TextField>
            </Box>
            {portionKey === CUSTOM && (
              <NumberField label={t('nutrition.sheet.amountGrams')} size="small" fullWidth value={grams} onChange={setGrams} sx={{ mb: 1.5 }} autoFocus />
            )}

            {/* Eetmoment */}
            <TextField
              select
              size="small"
              fullWidth
              label={t('nutrition.sheet.eatenFor')}
              value={meal}
              onChange={(e) => setMeal(e.target.value as MealMoment)}
              sx={{ mb: 2, '& .MuiOutlinedInput-root': { bgcolor: designTokens.cardBackground, borderRadius: 3 } }}
            >
              {MEAL_ORDER.map((m) => (
                <MenuItem key={m} value={m}>
                  {t(`nutrition.meals.${m}`)}
                </MenuItem>
              ))}
            </TextField>

            {/* Wat het etiket verder zegt */}
            <Accordion disableGutters elevation={0} sx={{ bgcolor: designTokens.cardBackground, mb: 1 }}>
              <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />}>
                <Typography fontWeight={600}>
                  {t('nutrition.sheet.nutritionValues')}
                  {detailPreview && (
                    <Typography component="span" color="text.secondary" fontWeight={400}>
                      {' · '}
                      {detailPreview}
                    </Typography>
                  )}
                </Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ pt: 0 }}>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', rowGap: 0.5, columnGap: 2 }}>
                  <DetailRow label={t('nutrition.sheet.energy')} value={`${Math.round((macros?.kcal ?? 0) * 4.184).toLocaleString('nl-NL')} kJ`} />
                  {detailRows.map((r) => (
                    <DetailRow key={r.label} label={r.label} value={`${fmt1(r.per100 * factor)} g`} />
                  ))}
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                  {t('nutrition.sheet.per100Note', {
                    unit: product.unit === 'ml' ? 'ml' : 'g',
                    kcal: product.per100g.kcal,
                    protein: fmt1(product.per100g.protein),
                    carbs: fmt1(product.per100g.carbs),
                    fat: fmt1(product.per100g.fat),
                  })}
                  {detailRows.length === 0 ? t('nutrition.sheet.noDetailsNote') : ''}
                </Typography>
                {product.source === 'nevo' && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                    {NEVO_ATTRIBUTION}
                  </Typography>
                )}
              </AccordionDetails>
            </Accordion>
          </Box>

          <Box sx={{ px: 2.5, pb: 2.5, pt: 1 }}>
            <Button
              fullWidth
              variant="contained"
              onClick={onSave}
              disabled={saving || totalGrams <= 0}
              sx={{ py: 1.5, borderRadius: '28px', textTransform: 'none', fontSize: 16, fontWeight: 700, bgcolor: 'primary.main', color: 'primary.contrastText', '&:hover': { bgcolor: 'primary.dark' } }}
            >
              {saving ? t('common.saving') : isEditing ? t('common.save') : t('nutrition.sheet.addToDiary')}
            </Button>
          </Box>
        </Box>
      )}
    </Dialog>
  );
}

function MacroTile({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ bgcolor: designTokens.cardBackground, borderRadius: 3, py: 1.25, px: 0.5, textAlign: 'center' }}>
      <Typography fontWeight={800} sx={{ fontSize: 17, lineHeight: 1.1 }}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </Box>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <Typography variant="body2" sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
      <Box component="span" sx={{ color: 'text.secondary' }}>
        {label}
      </Box>
      <Box component="span" sx={{ fontWeight: 600 }}>
        {value}
      </Box>
    </Typography>
  );
}
