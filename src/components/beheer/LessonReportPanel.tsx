/**
 * Beheer → Gegeven lessen: per periode welke lessen er waren, wie ze gaf, of de trainer ze als
 * gegeven heeft gemeld en wie er was en wie niet. De eigenaar ziet alles (en kan per trainer
 * filteren); een trainer ziet alleen zijn eigen lessen. Met export naar CSV (Excel).
 */
import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, MenuItem, TextField, Typography } from '@mui/material';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import { designTokens } from '../../theme/designTokens';
import { getTrainerNames } from '../../services/classService';
import { getLessonReport, type LessonReportRow } from '../../services/attendanceService';

type Period = 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth';
const PERIODS: { value: Period; label: string }[] = [
  { value: 'thisWeek', label: 'Deze week' },
  { value: 'lastWeek', label: 'Vorige week' },
  { value: 'thisMonth', label: 'Deze maand' },
  { value: 'lastMonth', label: 'Vorige maand' },
];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Van t/m voor een periode (week begint op maandag). */
export function periodRange(period: Period, today = new Date()): { from: string; until: string } {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (period === 'thisWeek' || period === 'lastWeek') {
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7) - (period === 'lastWeek' ? 7 : 0));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { from: iso(monday), until: iso(sunday) };
  }
  const first = new Date(d.getFullYear(), d.getMonth() - (period === 'lastMonth' ? 1 : 0), 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  return { from: iso(first), until: iso(last) };
}

const dayLabel = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('nl-NL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

function downloadCsv(rows: LessonReportRow[], from: string, until: string) {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [['Datum', 'Tijd', 'Les', 'Trainer', 'Gegeven', 'Aanwezig', 'Niet gekomen', 'Niet gemeld'].map(esc).join(';')];
  for (const r of [...rows].reverse()) {
    const by = (a: string | null) =>
      r.people
        .filter((p) => p.attendance === a)
        .map((p) => p.name)
        .join(', ');
    lines.push(
      [r.date, `${r.startTime}${r.endTime ? `-${r.endTime}` : ''}`, r.title, r.trainerName ?? '', r.given ? 'ja' : 'nee', by('present'), by('absent'), by(null)]
        .map(esc)
        .join(';')
    );
  }
  const blob = new Blob([`\uFEFF${lines.join('\n')}`], {
    type: 'text/csv;charset=utf-8',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `gegeven-lessen-${from}-${until}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function LessonReportPanel({ isAdmin }: { isAdmin: boolean }) {
  const [period, setPeriod] = useState<Period>('thisWeek');
  const [trainerId, setTrainerId] = useState('');
  const [names, setNames] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<LessonReportRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const range = useMemo(() => periodRange(period), [period]);

  useEffect(() => {
    if (!isAdmin) return;
    getTrainerNames()
      .then(setNames)
      .catch(() => undefined);
  }, [isAdmin]);

  useEffect(() => {
    let alive = true;
    setRows(null);
    setError(null);
    getLessonReport({ ...range, ...(trainerId ? { trainerId } : {}) }).then(
      (r) => alive && setRows(r.rows),
      (e) => alive && setError(e instanceof Error ? e.message : 'Overzicht laden mislukt.')
    );
    return () => {
      alive = false;
    };
  }, [range, trainerId]);

  // Per trainer: lessen, gegeven gemeld, aanwezig en niet gekomen.
  const totals = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        lessons: number;
        given: number;
        present: number;
        absent: number;
      }
    >();
    for (const r of rows ?? []) {
      const key = r.trainerId ?? '-';
      const t = map.get(key) ?? {
        name: r.trainerName ?? 'Zonder trainer',
        lessons: 0,
        given: 0,
        present: 0,
        absent: 0,
      };
      t.lessons++;
      if (r.given) t.given++;
      t.present += r.people.filter((p) => p.attendance === 'present').length;
      t.absent += r.people.filter((p) => p.attendance === 'absent').length;
      map.set(key, t);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box
        sx={{
          display: 'flex',
          gap: 1.5,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <TextField
          select
          size="small"
          label="Periode"
          value={period}
          onChange={(e) => setPeriod(e.target.value as Period)}
          sx={{ minWidth: 140, flex: { xs: 1, sm: 'none' } }}
        >
          {PERIODS.map((p) => (
            <MenuItem key={p.value} value={p.value}>
              {p.label}
            </MenuItem>
          ))}
        </TextField>
        {isAdmin && (
          <TextField
            select
            size="small"
            label="Trainer"
            value={trainerId}
            onChange={(e) => setTrainerId(e.target.value)}
            SelectProps={{ displayEmpty: true }}
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 140, flex: { xs: 1, sm: 'none' } }}
          >
            <MenuItem value="">Alle trainers</MenuItem>
            {Object.entries(names)
              .sort((a, b) => a[1].localeCompare(b[1]))
              .map(([id, name]) => (
                <MenuItem key={id} value={id}>
                  {name}
                </MenuItem>
              ))}
          </TextField>
        )}
        <Button
          size="small"
          startIcon={<DownloadRoundedIcon />}
          disabled={!rows?.length}
          onClick={() => rows && downloadCsv(rows, range.from, range.until)}
          sx={{ ml: 'auto' }}
        >
          Exporteren
        </Button>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}
      {!rows && !error && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
          <CircularProgress size={24} />
        </Box>
      )}

      {rows && totals.length > 0 && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(auto-fill, minmax(220px, 1fr))',
            },
            gap: 1.5,
          }}
        >
          {totals.map((t) => (
            <Box
              key={t.name}
              sx={{
                p: 1.5,
                borderRadius: `${designTokens.cardRadius}px`,
                bgcolor: designTokens.cardBackground,
              }}
            >
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {t.name}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t.given} van {t.lessons} {t.lessons === 1 ? 'les' : 'lessen'} gegeven gemeld · {t.present} aanwezig · {t.absent} niet gekomen
              </Typography>
            </Box>
          ))}
        </Box>
      )}

      {rows && rows.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          Geen lessen in deze periode.
        </Typography>
      )}

      {rows && rows.length > 0 && (
        <Box
          sx={{
            borderRadius: `${designTokens.cardRadius}px`,
            bgcolor: designTokens.cardBackground,
            px: 2,
          }}
        >
          {rows.map((r, i) => {
            const absent = r.people.filter((p) => p.attendance === 'absent');
            const present = r.people.filter((p) => p.attendance === 'present');
            const open = r.people.filter((p) => !p.attendance);
            return (
              <Box
                key={r.classId}
                sx={{
                  py: 1.5,
                  borderTop: i ? `1px solid ${designTokens.cardBackgroundHigh}` : 'none',
                }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    flexWrap: 'wrap',
                  }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 600, flex: 1, minWidth: 200 }}>
                    {dayLabel(r.date)} {r.startTime} · {r.title}
                    <Typography component="span" variant="body2" color="text.secondary">
                      {r.trainerName ? ` · ${r.trainerName}` : ''}
                    </Typography>
                  </Typography>
                  <Chip
                    size="small"
                    label={r.given ? 'Gegeven' : 'Nog niet gemeld'}
                    sx={{
                      bgcolor: r.given ? designTokens.primaryContainer : designTokens.tertiaryContainer,
                      color: r.given ? designTokens.onPrimaryContainer : designTokens.onTertiaryContainer,
                    }}
                  />
                </Box>
                <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5 }}>
                  {r.people.length === 0
                    ? 'Niemand ingeschreven'
                    : [
                        present.length ? `Aanwezig: ${present.map((p) => p.name).join(', ')}` : '',
                        absent.length ? `Niet gekomen: ${absent.map((p) => p.name).join(', ')}` : '',
                        open.length ? `Niet gemeld: ${open.map((p) => p.name).join(', ')}` : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                </Typography>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
