/**
 * Beheer → Abonnementen → Creditoverzicht: alle creditmutaties van de studio in een periode. Wie
 * kreeg credits (en van wie), waar zijn ze ingezet, wie kwam niet opdagen, wat verliep. Te
 * filteren op lid en soort, met export naar Excel. Zo is er achteraf geen discussie.
 */
import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, MenuItem, TextField, Typography } from '@mui/material';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import { designTokens } from '../../theme/designTokens';
import { periodRange } from './LessonReportPanel';
import { CreditHistoryList } from '../credits/CreditHistoryList';
import { getStudioCreditHistory, type CreditHistoryRow } from '../../services/creditHistoryService';
import { atLabel, classWhen, creditRowBy, creditRowTitle, creditsLabel, OUTCOME_LABEL } from '../../utils/creditHistory';
import { toCsv } from '../../utils/csv';

type Period = 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth';
const PERIODS: { value: Period; label: string }[] = [
  { value: 'thisWeek', label: 'Deze week' },
  { value: 'lastWeek', label: 'Vorige week' },
  { value: 'thisMonth', label: 'Deze maand' },
  { value: 'lastMonth', label: 'Vorige maand' },
];

type Filter = 'all' | 'used' | 'absent' | 'late_cancel' | 'refund' | 'granted' | 'expiry';
const FILTERS: { value: Filter; label: string; match: (r: CreditHistoryRow) => boolean }[] = [
  { value: 'all', label: 'Alles', match: () => true },
  { value: 'used', label: 'Ingezet voor lessen', match: (r) => r.kind === 'booking' },
  { value: 'absent', label: 'Niet gekomen', match: (r) => r.outcome === 'absent' },
  { value: 'late_cancel', label: 'Te laat afgemeld', match: (r) => r.outcome === 'late_cancel' },
  { value: 'refund', label: 'Terug na afmelden', match: (r) => r.kind === 'refund' },
  { value: 'granted', label: 'Toegekend of gekocht', match: (r) => r.delta > 0 && r.kind !== 'refund' },
  { value: 'expiry', label: 'Verlopen', match: (r) => r.kind === 'expiry' },
];

const PAGE = 100;

function downloadCsv(rows: CreditHistoryRow[], from: string, until: string) {
  const csv = toCsv(
    ['Moment', 'Lid', 'Wat', 'Les', 'Lesdatum', 'Afloop', 'Credits', 'Saldo na', 'Door', 'Notitie'],
    [...rows].reverse().map((r) => [
      atLabel(r.at),
      r.userName,
      creditRowTitle(r),
      r.class?.title ?? '',
      r.class ? classWhen(r.class.date, r.class.startTime) : '',
      r.outcome ? OUTCOME_LABEL[r.outcome] ?? '' : '',
      String(r.delta).replace('.', ','),
      String(r.balanceAfter).replace('.', ','),
      creditRowBy(r, false),
      r.note ?? '',
    ])
  );
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
  a.download = `credits-${from}-${until}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function StudioCreditsPanel() {
  const [period, setPeriod] = useState<Period>('thisMonth');
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<CreditHistoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);
  const range = useMemo(() => periodRange(period), [period]);

  useEffect(() => {
    let alive = true;
    setRows(null);
    setError(null);
    getStudioCreditHistory(range).then(
      (d) => alive && setRows(d.rows),
      (e) => alive && setError(e instanceof Error ? e.message : 'Creditoverzicht laden mislukt.')
    );
    return () => {
      alive = false;
    };
  }, [range]);

  const visible = useMemo(() => {
    const match = FILTERS.find((f) => f.value === filter)?.match ?? (() => true);
    const q = query.trim().toLowerCase();
    return (rows ?? []).filter((r) => match(r) && (!q || r.userName.toLowerCase().includes(q)));
  }, [rows, filter, query]);

  useEffect(() => setShown(PAGE), [visible]);

  const totals = useMemo(() => {
    const t = { granted: 0, used: 0, noShows: 0, refunded: 0, expired: 0 };
    for (const r of visible) {
      if (r.kind === 'booking') {
        t.used += -r.delta;
        if (r.outcome === 'absent') t.noShows++;
      } else if (r.kind === 'refund') t.refunded += r.delta;
      else if (r.kind === 'expiry') t.expired += -r.delta;
      else if (r.delta > 0) t.granted += r.delta;
    }
    return t;
  }, [visible]);

  return (
    <Box sx={{ bgcolor: designTokens.cardBackground, borderRadius: `${designTokens.cardRadius}px`, p: { xs: 2, md: 3 }, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          Creditoverzicht
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Elke wijziging in credits: wie, welke les, wanneer, door wie, en of het lid er was. Het lid ziet zijn eigen lijst onder Profiel.
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField select size="small" label="Periode" value={period} onChange={(e) => setPeriod(e.target.value as Period)} sx={{ minWidth: 140, flex: { xs: 1, sm: 'none' } }}>
          {PERIODS.map((p) => (
            <MenuItem key={p.value} value={p.value}>
              {p.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label="Soort" value={filter} onChange={(e) => setFilter(e.target.value as Filter)} sx={{ minWidth: 170, flex: { xs: 1, sm: 'none' } }}>
          {FILTERS.map((f) => (
            <MenuItem key={f.value} value={f.value}>
              {f.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField size="small" label="Lid zoeken" value={query} onChange={(e) => setQuery(e.target.value)} sx={{ minWidth: 160, flex: 1 }} />
        <Button size="small" startIcon={<DownloadRoundedIcon />} disabled={!visible.length} onClick={() => downloadCsv(visible, range.from, range.until)}>
          Exporteren
        </Button>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}
      {!rows && !error && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
          <CircularProgress size={24} />
        </Box>
      )}

      {rows && (
        <>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Chip size="small" label={`Toegekend of gekocht: ${creditsLabel(totals.granted)}`} />
            <Chip size="small" label={`Ingezet: ${creditsLabel(totals.used)}`} />
            <Chip size="small" color={totals.noShows ? 'error' : 'default'} variant="outlined" label={`Niet gekomen: ${totals.noShows}×`} />
            <Chip size="small" label={`Terug na afmelden: ${creditsLabel(totals.refunded)}`} />
            <Chip size="small" label={`Verlopen: ${creditsLabel(totals.expired)}`} />
          </Box>
          {visible.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Geen wijzigingen in deze periode.
            </Typography>
          ) : (
            <>
              <CreditHistoryList rows={visible.slice(0, shown)} showMember />
              {visible.length > shown && (
                <Button size="small" onClick={() => setShown((n) => n + PAGE)} sx={{ alignSelf: 'center' }}>
                  Meer tonen ({visible.length - shown})
                </Button>
              )}
            </>
          )}
        </>
      )}
    </Box>
  );
}
