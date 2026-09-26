/**
 * Workout-detailweergave (Figma "Workout detail"). Desktop: drie kolommen — alle workouts om snel
 * te wisselen, de trainingsdagen, en de oefeningen van de gekozen dag als tabel. Telefoon: pil met
 * voor wie en tot wanneer, dagen als pillen, oefeningen als kaarten en onderaan "Training starten".
 * Knoppen voor PDF en starten staan op desktop in de paginakop.
 */
import { useMemo, useState } from 'react';
import { Box, Button, IconButton, InputBase, Menu, MenuItem, Typography } from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import type { Profile, Schema, SchemaExercise } from '../../types';
import { designTokens } from '../../theme/designTokens';
import { HeaderActions } from '../layout';
import { ExerciseDbDemo } from '../ExerciseDbDemo';
import { SchemaPeriodSummary } from './SchemaPeriodSummary';
import { audiencePill, schemaEndLabel } from './SchemaListCard';
import { getLastSessionDateForDay, formatLastTrained } from '../../utils/schemaSessionUtils';
import { getExerciseProgressInPeriod } from '../../utils/schemaProgressUtils';
import { formatWarmupSummary, formatCardioSummary, formatCooldownSummary, formatStretchingSummary } from '../../utils/format';

interface SchemaDetailViewProps {
  schema: Schema;
  /** Alle workouts, voor de lijst links op desktop. */
  allSchemas: Schema[];
  /** Voor wie een workout is, als korte tekst onder de naam in de lijst links. */
  assigneeOf: (s: Schema) => { text: string; avatars: Profile[] };
  isStaff: boolean;
  /** Dagen in de volgorde waarin ze getoond worden. */
  dayOrder: number[];
  /** Welke dag eerst gekozen is (bijv. die van deze week). */
  initialDayIndex: number;
  isCurrentWeekDay: (dayIndex: number) => boolean;
  pdfBusy: boolean;
  onSelectSchema: (s: Schema) => void;
  onStart: (dayIndex: number) => void;
  onPdf: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onBack: () => void;
}

const dayLabelOf = (schema: Schema, i: number) => schema.days[i]?.dayLabel || `Dag ${i + 1}`;
const countLabel = (n: number) => `${n} ${n === 1 ? 'oefening' : 'oefeningen'}`;
const setsReps = (ex: SchemaExercise) => `${ex.setsTarget} × ${ex.repsTarget}`;
const target = (ex: SchemaExercise) => (ex.targetWeight != null && ex.targetWeight > 0 ? `${String(ex.targetWeight).replace('.', ',')} kg` : '–');
const rest = (ex: SchemaExercise) => (ex.restSeconds != null && ex.restSeconds > 0 ? `${ex.restSeconds}s` : '–');

/** Voortgang binnen de periode als korte regel: "70 → 75 kg · doel 80 kg". */
function progressLine(schema: Schema, ex: SchemaExercise): string | null {
  if (!schema.startDate || !schema.endDate) return null;
  const p = getExerciseProgressInPeriod(schema, ex.exerciseName, schema.startDate, schema.endDate);
  if (!p || (p.firstWeight == null && p.lastWeight == null)) return null;
  const from = p.firstWeight != null ? `${p.firstWeight}` : '–';
  const to = p.lastWeight != null ? `${p.lastWeight} kg` : '–';
  return `${from} → ${to}${p.targetWeight != null ? ` · doel ${p.targetWeight} kg` : ''}`;
}

/** Warming-up, cardio, cooling-down en stretching van een dag, alleen wat er is. */
function extraSections(schema: Schema, dayIndex: number): { label: string; text: string }[] {
  const day = schema.days[dayIndex];
  if (!day) return [];
  const f = schema.formule7;
  const rows: { label: string; text: string | null }[] = [
    { label: 'Warming-up', text: formatWarmupSummary(day.warmup ?? f?.warmup) },
    { label: 'Cardio', text: formatCardioSummary(day.cardio ?? f?.cardio) },
    { label: 'Cooling-down', text: formatCooldownSummary(day.cooldown ?? f?.cooldown) },
    { label: 'Stretching', text: formatStretchingSummary(day.stretching ?? f?.stretching) },
  ];
  return rows.filter((r): r is { label: string; text: string } => !!r.text);
}

const pillSx = (bg: string, fg: string, outlined?: boolean) => ({
  display: 'inline-block',
  px: 1,
  borderRadius: '8px',
  bgcolor: bg,
  color: fg,
  border: outlined ? `1px solid ${designTokens.outline}` : 'none',
  fontSize: 11,
  fontWeight: 500,
  lineHeight: '20px',
  whiteSpace: 'nowrap' as const,
});

/** Functie, geen constante: designTokens volgt het actieve thema en moet bij elke render gelezen worden. */
const weekBadge = () => (
  <Box component="span" sx={{ ...pillSx(designTokens.primary, designTokens.onPrimary), fontSize: 10, lineHeight: '16px', px: 0.75, ml: 1 }}>
    Deze week
  </Box>
);

export function SchemaDetailView({
  schema,
  allSchemas,
  assigneeOf,
  isStaff,
  dayOrder,
  initialDayIndex,
  isCurrentWeekDay,
  pdfBusy,
  onSelectSchema,
  onStart,
  onPdf,
  onEdit,
  onDuplicate,
  onDelete,
  onBack,
}: SchemaDetailViewProps) {
  const [dayIndex, setDayIndex] = useState(initialDayIndex);
  const [search, setSearch] = useState('');
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const day = schema.days[dayIndex];
  const exercises = day?.exercises ?? [];
  const canStart = exercises.length > 0;
  const pill = audiencePill(schema, assigneeOf(schema), isStaff);
  const extras = extraSections(schema, dayIndex);
  const last = day ? getLastSessionDateForDay(schema.id, dayIndex) : null;

  const listed = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? allSchemas.filter((s) => s.name.toLowerCase().includes(q)) : allSchemas;
  }, [allSchemas, search]);

  const closeMenu = () => setMenuAnchor(null);
  const menu = (
    <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={closeMenu} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
      {/* Op desktop staat PDF als knop in de kop; op een telefoon alleen hier. */}
      <MenuItem
        sx={{ display: { md: 'none' } }}
        disabled={pdfBusy}
        onClick={() => {
          closeMenu();
          onPdf();
        }}
      >
        Download PDF
      </MenuItem>
      {isStaff && [
        <MenuItem
          key="edit"
          onClick={() => {
            closeMenu();
            onEdit();
          }}
        >
          Bewerken
        </MenuItem>,
        <MenuItem
          key="dup"
          onClick={() => {
            closeMenu();
            onDuplicate();
          }}
        >
          Dupliceren
        </MenuItem>,
        <MenuItem
          key="del"
          sx={{ color: 'error.main' }}
          onClick={() => {
            closeMenu();
            onDelete();
          }}
        >
          Verwijderen
        </MenuItem>,
      ]}
    </Menu>
  );

  const dayMeta = (
    <>
      {day?.notes && (
        <Typography sx={{ fontSize: 13, lineHeight: '18px', fontStyle: 'italic', mb: 0.5 }}>{day.notes}</Typography>
      )}
      <Typography sx={{ fontSize: 12, lineHeight: '16px', color: 'text.secondary', mb: 1.5 }}>
        {last ? `Laatst getraind: ${formatLastTrained(last)}` : 'Nog niet getraind'}
      </Typography>
    </>
  );

  const extraRow = (x: { label: string; text: string }) => (
    <Box key={x.label} sx={{ bgcolor: designTokens.cardBackground, borderRadius: 3, px: 2.5, py: 1.25 }}>
      <Typography sx={{ fontSize: 12, fontWeight: 600, lineHeight: '16px', color: 'text.secondary' }}>{x.label}</Typography>
      <Typography sx={{ fontSize: 13, lineHeight: '18px' }}>{x.text}</Typography>
    </Box>
  );

  return (
    <>
      {/* Alleen desktop: op een telefoon staat "Training starten" onderaan en PDF in het menu. */}
      <HeaderActions>
        <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 1.5 }}>
          <Button variant="outlined" disabled={pdfBusy} onClick={onPdf} sx={{ borderRadius: '20px', textTransform: 'none', height: 40, px: 2, borderColor: designTokens.outline, color: 'text.primary' }}>
            Download PDF
          </Button>
          <Button
            variant="contained"
            disableElevation
            disabled={!canStart}
            onClick={() => onStart(dayIndex)}
            sx={{ borderRadius: '20px', textTransform: 'none', height: 40, px: 2.5, fontWeight: 500 }}
          >
            Training starten
          </Button>
          {isStaff && (
            <IconButton aria-label="Meer acties" onClick={(e) => setMenuAnchor(e.currentTarget)}>
              <MoreVertIcon />
            </IconButton>
          )}
        </Box>
      </HeaderActions>
      {menu}

      {/* Kruimelpad: "Workouts › Push Pull Legs". Alleen op desktop: op de telefoon staat de naam
          al in de bovenbalk, met een terugpijl. */}
      <Box component="nav" aria-label="Kruimelpad" sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 0.75, mb: { xs: 1.5, md: 2.5 }, fontSize: 12, lineHeight: '16px', minWidth: 0 }}>
        <Box
          component="button"
          type="button"
          onClick={onBack}
          sx={{ all: 'unset', cursor: 'pointer', color: designTokens.primary, fontWeight: 500, '&:hover': { textDecoration: 'underline' } }}
        >
          Workouts
        </Box>
        <Box component="span" sx={{ color: 'text.secondary' }}>
          ›
        </Box>
        <Box component="span" sx={{ color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {schema.name}
        </Box>
      </Box>

      {/* ---------- Telefoon ---------- */}
      <Box sx={{ display: { xs: 'block', md: 'none' } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, minWidth: 0 }}>
          <Box component="span" sx={{ ...pillSx(pill.bg, pill.fg, pill.outlined), overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
            {pill.label}
          </Box>
          <Typography sx={{ fontSize: 12, lineHeight: '16px', color: 'text.secondary', whiteSpace: 'nowrap' }}>
            {schema.days.length} {schema.days.length === 1 ? 'dag' : 'dagen'} · {schemaEndLabel(schema).toLowerCase()}
          </Typography>
          <IconButton size="small" aria-label="Meer acties" onClick={(e) => setMenuAnchor(e.currentTarget)} sx={{ ml: 'auto', mr: -0.5 }}>
            <MoreVertIcon fontSize="small" />
          </IconButton>
        </Box>
        {dayOrder.length > 0 && (
          <Box role="tablist" aria-label="Trainingsdagen" sx={{ display: 'flex', gap: 1, overflowX: 'auto', mx: -3, px: 3, pb: 0.5, mb: 1.5, scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}>
            {dayOrder.map((i) => {
              const selected = i === dayIndex;
              return (
                <Box
                  key={i}
                  role="tab"
                  aria-selected={selected}
                  tabIndex={0}
                  onClick={() => setDayIndex(i)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setDayIndex(i)}
                  sx={{
                    flexShrink: 0,
                    px: 1.75,
                    height: 32,
                    display: 'flex',
                    alignItems: 'center',
                    borderRadius: '16px',
                    fontSize: 13,
                    fontWeight: selected ? 600 : 500,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    bgcolor: selected ? designTokens.secondaryContainer : designTokens.cardBackground,
                    color: selected ? designTokens.onSecondaryContainer : 'text.primary',
                  }}
                >
                  {dayLabelOf(schema, i)}
                </Box>
              );
            })}
          </Box>
        )}
        {dayMeta}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {exercises.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
              {schema.days.length === 0 ? 'Nog geen dagen. Kies Bewerken om dagen en oefeningen toe te voegen.' : 'Geen oefeningen op deze dag.'}
            </Typography>
          ) : (
            exercises.map((ex, i) => {
              const prog = progressLine(schema, ex);
              return (
                <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, bgcolor: designTokens.cardBackground, borderRadius: 3, p: 1.75 }}>
                  <ExerciseDbDemo exerciseName={ex.exerciseName} variant="thumb" />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: 15, fontWeight: 500, lineHeight: '20px' }}>{ex.exerciseName}</Typography>
                    <Typography sx={{ fontSize: 12, lineHeight: '16px', color: 'text.secondary' }}>
                      {[setsReps(ex), ex.targetWeight ? target(ex) : null, ex.restSeconds ? `${ex.restSeconds}s rust` : null].filter(Boolean).join(' · ')}
                    </Typography>
                    {ex.notes && <Typography sx={{ fontSize: 12, lineHeight: '16px', color: 'text.secondary', fontStyle: 'italic' }}>{ex.notes}</Typography>}
                    {prog && <Typography sx={{ fontSize: 11, lineHeight: '16px', color: 'text.secondary' }}>{prog}</Typography>}
                  </Box>
                </Box>
              );
            })
          )}
          {extras.map(extraRow)}
        </Box>
        <Button
          fullWidth
          variant="contained"
          disableElevation
          disabled={!canStart}
          onClick={() => onStart(dayIndex)}
          sx={{ mt: 2, height: 56, borderRadius: '28px', textTransform: 'none', fontSize: 16, fontWeight: 500 }}
        >
          Training starten
        </Button>
        {schema.startDate && schema.endDate && (
          <Box sx={{ mt: 2 }}>
            <SchemaPeriodSummary schema={schema} startDate={schema.startDate} endDate={schema.endDate} />
          </Box>
        )}
      </Box>

      {/* ---------- Desktop: drie kolommen ---------- */}
      <Box sx={{ display: { xs: 'none', md: 'grid' }, gridTemplateColumns: { md: '220px 190px minmax(0, 1fr)', lg: '250px 220px minmax(0, 1fr)' }, gap: 3, alignItems: 'start' }}>
        {/* Alle workouts */}
        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 1 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 500, lineHeight: '18px' }}>Alle workouts</Typography>
            <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>{allSchemas.length}</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, bgcolor: designTokens.cardBackgroundHigh, borderRadius: '10px', px: 1.5, height: 30, mb: 1 }}>
            <SearchRoundedIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
            <InputBase
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Zoeken"
              inputProps={{ 'aria-label': 'Workouts zoeken' }}
              sx={{ fontSize: 12, flex: 1 }}
            />
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            {listed.map((s) => {
              const selected = s.id === schema.id;
              const sub = s.audience === 'group' ? `${s.participantIds?.length ?? 0} personen` : s.audience === 'open' ? 'Open' : isStaff ? assigneeOf(s).text : 'Voor jou';
              return (
                <Box
                  key={s.id}
                  role="button"
                  tabIndex={0}
                  aria-current={selected ? 'page' : undefined}
                  onClick={() => !selected && onSelectSchema(s)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !selected && onSelectSchema(s)}
                  sx={{
                    px: 1.5,
                    py: 0.875,
                    borderRadius: 2,
                    cursor: selected ? 'default' : 'pointer',
                    bgcolor: selected ? designTokens.secondaryContainer : designTokens.cardBackground,
                    color: selected ? designTokens.onSecondaryContainer : 'text.primary',
                    '&:hover': selected ? undefined : { bgcolor: designTokens.cardBackgroundHigh },
                  }}
                >
                  <Typography sx={{ fontSize: 12, fontWeight: 500, lineHeight: '16px' }} noWrap>
                    {s.name}
                  </Typography>
                  <Typography sx={{ fontSize: 10, lineHeight: '14px', opacity: 0.75 }} noWrap>
                    {sub}
                  </Typography>
                </Box>
              );
            })}
          </Box>
        </Box>

        {/* Trainingsdagen */}
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 500, lineHeight: '18px', mb: 1 }}>Trainingsdagen</Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {dayOrder.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                Nog geen dagen.
              </Typography>
            )}
            {dayOrder.map((i) => {
              const selected = i === dayIndex;
              return (
                <Box
                  key={i}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selected}
                  onClick={() => setDayIndex(i)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setDayIndex(i)}
                  sx={{
                    px: 2,
                    py: 1.25,
                    borderRadius: 3,
                    cursor: 'pointer',
                    bgcolor: selected ? designTokens.secondaryContainer : designTokens.cardBackground,
                    color: selected ? designTokens.onSecondaryContainer : 'text.primary',
                    '&:hover': selected ? undefined : { bgcolor: designTokens.cardBackgroundHigh },
                  }}
                >
                  <Typography sx={{ fontSize: 14, fontWeight: 500, lineHeight: '20px' }} noWrap>
                    {dayLabelOf(schema, i)}
                    {isCurrentWeekDay(i) && weekBadge()}
                  </Typography>
                  <Typography sx={{ fontSize: 12, lineHeight: '16px', opacity: 0.8 }} noWrap>
                    {countLabel(schema.days[i]?.exercises.length ?? 0)}
                    {(() => {
                      const at = getLastSessionDateForDay(schema.id, i);
                      return at ? ` · ${formatLastTrained(at).toLowerCase()}` : '';
                    })()}
                  </Typography>
                </Box>
              );
            })}
          </Box>
          {schema.startDate && schema.endDate && (
            <Box sx={{ mt: 2 }}>
              <SchemaPeriodSummary schema={schema} startDate={schema.startDate} endDate={schema.endDate} />
            </Box>
          )}
        </Box>

        {/* Oefeningen van de gekozen dag */}
        <Box sx={{ minWidth: 0 }}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: '38px minmax(0, 2.2fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 0.8fr)',
              columnGap: 2,
              px: 2.5,
              mb: 1,
              '& > *': { fontSize: 11, fontWeight: 500, lineHeight: '18px', color: 'text.secondary' },
            }}
          >
            <span />
            <span>Oefening</span>
            <span>Sets × reps</span>
            <span>Doel</span>
            <span>Rust</span>
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {exercises.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ px: 0.5 }}>
                {schema.days.length === 0 ? 'Nog geen dagen. Kies Bewerken om dagen en oefeningen toe te voegen.' : 'Geen oefeningen op deze dag.'}
              </Typography>
            ) : (
              exercises.map((ex, i) => {
                const prog = progressLine(schema, ex);
                return (
                  <Box
                    key={i}
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: '38px minmax(0, 2.2fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 0.8fr)',
                      columnGap: 2,
                      alignItems: 'center',
                      minHeight: 62,
                      px: 2.5,
                      py: 1,
                      bgcolor: designTokens.cardBackground,
                      borderRadius: 3,
                    }}
                  >
                    <Box sx={{ width: 38, height: 38, borderRadius: 2, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <ExerciseDbDemo exerciseName={ex.exerciseName} variant="thumb" />
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontSize: 14, fontWeight: 500, lineHeight: '20px' }} noWrap>
                        {ex.exerciseName}
                      </Typography>
                      {(ex.notes || prog) && (
                        <Typography sx={{ fontSize: 11, lineHeight: '16px', color: 'text.secondary' }} noWrap>
                          {[ex.notes, prog].filter(Boolean).join(' · ')}
                        </Typography>
                      )}
                    </Box>
                    <Typography sx={{ fontSize: 13, lineHeight: '18px' }}>{setsReps(ex)}</Typography>
                    <Typography sx={{ fontSize: 13, lineHeight: '18px' }}>{target(ex)}</Typography>
                    <Typography sx={{ fontSize: 13, lineHeight: '18px' }}>{rest(ex)}</Typography>
                  </Box>
                );
              })
            )}
            {extras.map(extraRow)}
            {day?.notes && (
              <Typography sx={{ fontSize: 13, lineHeight: '18px', fontStyle: 'italic', px: 0.5 }}>{day.notes}</Typography>
            )}
          </Box>
        </Box>
      </Box>
    </>
  );
}
