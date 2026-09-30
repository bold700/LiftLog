/**
 * Profiel (trainer of beheerder): Trainer beschikbaarheid. Per dag de uren waarop je kunt, zoals
 * maandag 06:00–12:00 en 16:00–21:00, en donderdag vrij. Het rooster biedt alleen momenten aan
 * binnen die uren, met eerst de momenten die aansluiten op je andere lessen.
 *
 * Nog niets ingevuld: dan geldt de standaard van de studio. Een beheerder kan via "Bekijk als" de
 * beschikbaarheid van een trainer invullen.
 */
import { useEffect, useState } from 'react';
import { Box, Button, FormControlLabel, IconButton, Switch, TextField, Typography } from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import { designTokens } from '../theme/designTokens';
import { useNotify } from '../context/NotifyContext';
import { getAvailability, saveAvailability, type AvailabilityDays } from '../services/availabilityService';

/** Maandag eerst, zoals een werkweek. */
const DAYS: { weekday: number; label: string }[] = [
  { weekday: 1, label: 'Maandag' },
  { weekday: 2, label: 'Dinsdag' },
  { weekday: 3, label: 'Woensdag' },
  { weekday: 4, label: 'Donderdag' },
  { weekday: 5, label: 'Vrijdag' },
  { weekday: 6, label: 'Zaterdag' },
  { weekday: 0, label: 'Zondag' },
];
const NEW_WINDOW = { from: '06:00', to: '21:00' };

const emptyWeek = (): AvailabilityDays => Object.fromEntries(DAYS.map((d) => [String(d.weekday), []]));

export function AvailabilityCard({ userId }: { userId: string }) {
  const notify = useNotify();
  const [days, setDays] = useState<AvailabilityDays | null>(null);
  const [saved, setSaved] = useState('');
  const [notSet, setNotSet] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getAvailability(userId).then(
      (r) => {
        if (cancelled) return;
        const week = { ...emptyWeek(), ...(r.days ?? {}) };
        setNotSet(!r.days);
        setDays(week);
        setSaved(JSON.stringify(week));
      },
      () => {
        if (!cancelled) setDays(null);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!days) return null;

  const setDay = (weekday: number, list: AvailabilityDays[string]) => setDays({ ...days, [String(weekday)]: list });
  const dirty = JSON.stringify(days) !== saved;
  const invalid = Object.values(days).some((list) => list.some((w) => !w.from || !w.to || w.to <= w.from));

  const save = async () => {
    setSaving(true);
    try {
      const r = await saveAvailability(userId, days);
      const week = { ...emptyWeek(), ...r.days };
      setDays(week);
      setSaved(JSON.stringify(week));
      setNotSet(false);
      notify.success('Beschikbaarheid opgeslagen.');
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Opslaan mislukt.', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ bgcolor: designTokens.cardBackground, borderRadius: `${designTokens.cardRadius}px`, px: 3, py: 2.5 }}>
      {/* Zelfde kaart en kop als de andere kaarten op de profielpagina. */}
      <Typography component="h2" sx={{ fontSize: 14, fontWeight: 500, lineHeight: '20px', mb: 1 }}>
        Trainer beschikbaarheid
      </Typography>
      <Typography sx={{ fontSize: 13, color: 'text.secondary', mb: 2 }}>
        Per dag de uren waarop je kunt. Het rooster biedt alleen momenten aan binnen deze uren, en eerst de momenten die
        aansluiten op je andere lessen.
        {notSet && ' Nog niets ingevuld: dan geldt de standaard van de studio (06:00 tot een laatste les om 21:00).'}
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {DAYS.map(({ weekday, label }) => {
          const list = days[String(weekday)] ?? [];
          const available = list.length > 0;
          return (
            <Box key={weekday} sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <FormControlLabel
                sx={{ width: 128, m: 0 }}
                control={<Switch size="small" checked={available} onChange={(e) => setDay(weekday, e.target.checked ? [{ ...NEW_WINDOW }] : [])} />}
                label={<Typography variant="body2" sx={{ fontWeight: 500 }}>{label}</Typography>}
              />
              {!available && (
                <Typography variant="body2" color="text.secondary" sx={{ pt: 0.75 }}>
                  Vrij
                </Typography>
              )}
              {available && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minWidth: 250 }}>
                  {list.map((w, i) => (
                    <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                      <TextField
                        type="time"
                        size="small"
                        label="Van"
                        value={w.from}
                        onChange={(e) => setDay(weekday, list.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)))}
                        InputLabelProps={{ shrink: true }}
                        sx={{ flex: 1, minWidth: 104 }}
                      />
                      <TextField
                        type="time"
                        size="small"
                        label="Tot"
                        value={w.to}
                        error={!!w.from && !!w.to && w.to <= w.from}
                        onChange={(e) => setDay(weekday, list.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)))}
                        InputLabelProps={{ shrink: true }}
                        sx={{ flex: 1, minWidth: 104 }}
                      />
                      <IconButton size="small" aria-label="Blok verwijderen" onClick={() => setDay(weekday, list.filter((_, j) => j !== i))}>
                        <DeleteOutlineRoundedIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  ))}
                  {list.length < 4 && (
                    <Button
                      size="small"
                      startIcon={<AddRoundedIcon />}
                      sx={{ alignSelf: 'flex-start', textTransform: 'none' }}
                      onClick={() => setDay(weekday, [...list, { from: list[list.length - 1]?.to ?? '16:00', to: '21:00' }])}
                    >
                      Blok toevoegen
                    </Button>
                  )}
                </Box>
              )}
            </Box>
          );
        })}
      </Box>
      <Box sx={{ mt: 2 }}>
        <Button variant="contained" disableElevation onClick={() => void save()} disabled={saving || !dirty || invalid}>
          {saving ? 'Bezig…' : 'Opslaan'}
        </Button>
      </Box>
    </Box>
  );
}
