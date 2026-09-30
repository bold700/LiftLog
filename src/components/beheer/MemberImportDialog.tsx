/**
 * Beheer → Leden → "Leden importeren": een studio die overstapt naar VORM kan hun ledenlijst in één
 * keer aanmaken via een CSV-sjabloon (naam, e-mail, rol, trainer, credits), in plaats van elk account
 * apart in te tikken. Hergebruikt dezelfde paden als één account aanmaken (auth.adminCreateAccount,
 * grantCredits) — geen nieuwe server-endpoint nodig.
 */
import { useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  LinearProgress,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import { useAuth } from '../../context/AuthContext';
import { grantCredits } from '../../services/classService';
import { importMembers } from '../../services/adminAccountService';
import { updateProfile } from '../../services/profileService';
import { assignPlan } from '../../services/planService';
import { parseCsv, toCsv, type ParsedCsv } from '../../utils/csv';
import { buildMemberImportRows, detectCreditColumns, fillForExisting, fillSummary, importOutcome, MEMBER_IMPORT_TEMPLATE, MAX_IMPORT_ROWS, type ImportFill, type ImportOutcome, type MemberImportRow } from '../../utils/memberImport';
import { generatePassword } from '../../utils/account';
import type { Plan, Profile, ProfileRole } from '../../types';

const OUTCOME: Record<ImportOutcome, { label: string; color: 'success' | 'default' | 'warning' | 'error' }> = {
  create: { label: 'Nieuw', color: 'success' },
  createInactive: { label: 'Nieuw, inactief', color: 'default' },
  skip: { label: 'Overgeslagen', color: 'warning' },
  error: { label: 'Fout', color: 'error' },
};

/** Excel-werkmap (xlsx), op naam of type. De lezer zelf laden we pas als er zo'n bestand komt. */
const isXlsxFile = (file: File) => /\.xlsx$/i.test(file.name) || file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** "bootcamp", "small group training" → "Bootcamp en Small group training" */
function creditColumnsLabel(columns: string[]): string {
  const names = columns.map((c) => `"${c.charAt(0).toUpperCase()}${c.slice(1)}"`);
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} en ${names[names.length - 1]}`;
}

const ROLE_LABEL: Record<ProfileRole, string> = { sporter: 'sporter', trainer: 'trainer', admin: 'beheerder' };

interface TrainerOption {
  userId: string;
  email: string | null;
  name: string;
}

interface ImportResult extends MemberImportRow {
  password: string;
  outcome: 'ok' | 'failed';
  failureReason?: string;
}

type Step = 'upload' | 'preview' | 'importing' | 'done';

interface MemberImportDialogProps {
  open: boolean;
  onClose: () => void;
  existingEmails: ReadonlySet<string>;
  trainers: TrainerOption[];
  /** Trainer die aan een sporter-rij wordt gekoppeld als de CSV geen (herkenbare) trainer opgeeft. */
  defaultTrainerId: string;
  /** Ververst de ledenlijst in Beheer nadat er accounts zijn aangemaakt. */
  onImported: () => void;
  /** Abonnementen van de studio: de kolom "abonnement" koppelt op naam. */
  plans?: Plan[];
  /** Leden van de studio: wie al een account heeft, krijgt lege velden aangevuld uit het bestand. */
  existingMembers?: Profile[];
}

export function MemberImportDialog({ open, onClose, existingEmails, trainers, defaultTrainerId, onImported, plans = [], existingMembers = [] }: MemberImportDialogProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const auth = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [step, setStep] = useState<Step>('upload');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [rows, setRows] = useState<MemberImportRow[]>([]);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<ImportResult[]>([]);
  /** Per regel: wat er bij een bestaand lid wordt aangevuld (alleen lege velden). */
  const [fills, setFills] = useState<Record<number, { uid: string; fill: ImportFill }>>({});
  const [updated, setUpdated] = useState<{ ok: number; failed: number }>({ ok: 0, failed: 0 });
  /** De ingelezen rijen, om het voorbeeld opnieuw op te bouwen als de schakelaar voor credits omgaat. */
  const [sourceRows, setSourceRows] = useState<Record<string, string>[]>([]);
  /** Creditkolommen in een Virtuagym-export (bijv. "bootcamp"); leeg bij andere bestanden. */
  const [creditColumns, setCreditColumns] = useState<string[]>([]);
  const [takeCredits, setTakeCredits] = useState(false);

  const reset = () => {
    setStep('upload');
    setUploadError(null);
    setRows([]);
    setProgress(0);
    setResults([]);
    setSourceRows([]);
    setCreditColumns([]);
    setTakeCredits(false);
  };

  const handleClose = () => {
    if (step === 'importing') return;
    reset();
    onClose();
  };

  const handleDownloadTemplate = () => {
    const csv = toCsv(MEMBER_IMPORT_TEMPLATE.headers, [MEMBER_IMPORT_TEMPLATE.example]);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'leden-sjabloon.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const buildPreview = (source: Record<string, string>[], columns: string[]) => {
    const built = buildMemberImportRows(source, existingEmails, undefined, { creditColumns: columns });
    for (const r of built) {
      if (r.planName && !planByName.has(r.planName.toLowerCase())) r.warnings.push(`Abonnement "${r.planName}" bestaat niet; zonder abonnement geïmporteerd.`);
    }
    const byEmail = new Map(existingMembers.filter((m) => m.email).map((m) => [m.email!.toLowerCase(), m]));
    const nextFills: Record<number, { uid: string; fill: ImportFill }> = {};
    for (const r of built) {
      if (r.skipReason !== 'Heeft al een account') continue;
      const m = byEmail.get(r.email);
      if (!m) continue;
      const fill = fillForExisting(r, m);
      if (Object.keys(fill).length) nextFills[r.line] = { uid: m.userId, fill };
    }
    setFills(nextFills);
    setRows(built);
  };

  const handleFile = async (file: File) => {
    setUploadError(null);
    let parsed: ParsedCsv;
    try {
      if (isXlsxFile(file)) {
        const { parseXlsx } = await import('../../utils/xlsx');
        parsed = parseXlsx(new Uint8Array(await file.arrayBuffer()));
      } else {
        parsed = parseCsv(await file.text());
      }
    } catch {
      setUploadError('Dit bestand kon niet worden gelezen. Kies een CSV- of Excel-bestand (.xlsx).');
      return;
    }
    if (parsed.rows.length === 0) {
      setUploadError('Geen rijen gevonden in dit bestand. Gebruik het sjabloon als voorbeeld.');
      return;
    }
    if (parsed.rows.length > MAX_IMPORT_ROWS) {
      setUploadError(`Dit bestand heeft ${parsed.rows.length} rijen; meer dan ${MAX_IMPORT_ROWS} in één keer wordt niet ondersteund.`);
      return;
    }
    setSourceRows(parsed.rows);
    setCreditColumns(detectCreditColumns(parsed.headers, parsed.rows));
    setTakeCredits(false);
    buildPreview(parsed.rows, []);
    setStep('preview');
  };

  const handleTakeCredits = (on: boolean) => {
    setTakeCredits(on);
    buildPreview(sourceRows, on ? creditColumns : []);
  };

  const trainerIdByEmail = new Map(trainers.filter((t) => t.email).map((t) => [t.email!.toLowerCase(), t.userId]));
  const resolveTrainerId = (row: MemberImportRow): string | null => {
    if (row.role !== 'sporter') return null;
    if (row.trainerEmail) return trainerIdByEmail.get(row.trainerEmail) ?? (defaultTrainerId || null);
    return defaultTrainerId || null;
  };

  const planByName = new Map(plans.map((p) => [p.name.trim().toLowerCase(), p]));
  const validRows = rows.filter((r) => ['create', 'createInactive'].includes(importOutcome(r)));
  const counts = rows.reduce<Record<ImportOutcome, number>>((acc, r) => ({ ...acc, [importOutcome(r)]: acc[importOutcome(r)] + 1 }), { create: 0, createInactive: 0, skip: 0, error: 0 });
  const fillCount = Object.keys(fills).length;
  const workCount = validRows.length + fillCount;

  const handleImport = async () => {
    if (!auth?.user) return;
    const caller = auth.user;
    setStep('importing');
    setProgress(0);
    const done: ImportResult[] = [];

    /** Na het aanmaken: abonnement en startsaldo (lopen via de boekingsserver, geen limiet). */
    const finish = async (row: MemberImportRow, uid: string, password: string) => {
      const problems: string[] = [];
      const plan = row.planName ? planByName.get(row.planName.toLowerCase()) : undefined;
      if (plan && !row.inactive) await assignPlan(uid, plan.id).catch(() => problems.push('abonnement'));
      if (row.credits) await grantCredits(uid, row.credits, 'Geïmporteerd bij overstap').catch(() => problems.push('startsaldo'));
      done.push({ ...row, password, outcome: 'ok', ...(problems.length ? { failureReason: `Account aangemaakt, maar niet gelukt: ${problems.join(', ')}.` } : {}) });
    };

    // Sporters: in groepjes op de server aanmaken. In de browser laat Firebase maar ~100 nieuwe
    // accounts per uur toe ("te veel pogingen"); op de server geldt die grens niet.
    const sporters = validRows.filter((r) => r.role === 'sporter');
    for (let i = 0; i < sporters.length; i += 20) {
      const batch = sporters.slice(i, i + 20);
      try {
        const results = await importMembers(
          caller,
          batch.map((r) => ({
            email: r.email,
            displayName: r.displayName || null,
            trainerId: resolveTrainerId(r),
            birthDate: r.birthDate,
            gender: r.gender,
            phone: r.phone,
            address: r.address,
            memberSince: r.memberSince,
            inactive: r.inactive,
          }))
        );
        const byEmail = new Map(results.map((x) => [x.email, x]));
        for (const row of batch) {
          const r = byEmail.get(row.email);
          if (r?.status === 'created' && r.uid) await finish(row, r.uid, r.password ?? '');
          else done.push({ ...row, password: '', outcome: 'failed', failureReason: r?.error ?? 'Account aanmaken mislukt.' });
        }
      } catch (e) {
        for (const row of batch) done.push({ ...row, password: '', outcome: 'failed', failureReason: e instanceof Error ? e.message : 'Importeren mislukt.' });
      }
      setProgress((p) => p + batch.length);
    }

    // Trainers en beheerders (zelden in een import): zoals één account aanmaken.
    for (const row of validRows.filter((r) => r.role !== 'sporter')) {
      const password = generatePassword();
      try {
        const created = await auth.adminCreateAccount(row.email, password, row.role, row.displayName, { trainerId: null });
        await updateProfile(created.uid, { birthDate: row.birthDate, gender: row.gender, phone: row.phone, address: row.address, memberSince: row.memberSince }).catch(() => undefined);
        await finish(row, created.uid, password);
      } catch (e) {
        done.push({ ...row, password: '', outcome: 'failed', failureReason: e instanceof Error ? e.message : 'Account aanmaken mislukt.' });
      }
      setProgress((p) => p + 1);
    }
    // Bestaande leden: alleen lege velden aanvullen (gewone profielupdate, geen accounts).
    let ok = 0;
    let failed = 0;
    for (const { uid, fill } of Object.values(fills)) {
      await updateProfile(uid, fill).then(
        () => ok++,
        () => failed++
      );
      setProgress((p) => p + 1);
    }
    setUpdated({ ok, failed });
    setResults(done);
    setStep('done');
    onImported();
  };

  const handleCopySummary = async () => {
    const lines = results
      .filter((r) => r.outcome === 'ok')
      .map((r) => `${r.displayName} · ${r.email} · tijdelijk wachtwoord: ${r.password}`);
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
    } catch {
      /* geen klembord beschikbaar */
    }
  };

  const okCount = results.filter((r) => r.outcome === 'ok').length;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth fullScreen={fullScreen}>
      <DialogTitle sx={{ pr: 6 }}>
        Leden importeren
        <IconButton aria-label="Sluiten" onClick={handleClose} sx={{ position: 'absolute', right: 8, top: 8 }}>
          <CloseRoundedIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {step === 'upload' && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Download het sjabloon, vul per lid een rij in (naam en e-mail zijn verplicht; rol, trainer, startsaldo,
              abonnement, status, geboortedatum en geslacht zijn optioneel) en upload het bestand terug. Een ledenexport uit
              Virtuagym (Excel of CSV) werkt ook. Je ziet eerst wat er gebeurt; pas daarna worden de accounts aangemaakt, elk met een
              tijdelijk wachtwoord. Uitgeschreven leden komen erin als inactief.
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button variant="outlined" startIcon={<DownloadRoundedIcon />} onClick={handleDownloadTemplate}>
                Sjabloon downloaden
              </Button>
              <Button variant="contained" disableElevation startIcon={<UploadFileRoundedIcon />} onClick={() => fileInputRef.current?.click()}>
                Bestand kiezen
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                  e.target.value = '';
                }}
              />
            </Box>
            {uploadError && <Alert severity="error">{uploadError}</Alert>}
          </Box>
        )}

        {step === 'preview' && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Typography variant="body2">
              Controleer wat er gebeurt voordat je importeert. Er wordt nog niets aangemaakt.
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {(Object.keys(OUTCOME) as ImportOutcome[]).map((k) => (
                <Chip key={k} size="small" color={OUTCOME[k].color} variant={k === 'create' ? 'filled' : 'outlined'} label={`${OUTCOME[k].label}: ${k === 'skip' ? counts.skip - fillCount : counts[k]}`} />
              ))}
              {fillCount > 0 && <Chip size="small" color="info" variant="outlined" label={`Aanvullen: ${fillCount}`} />}
            </Box>
            {creditColumns.length > 0 && (
              <Box>
                <FormControlLabel
                  control={<Switch checked={takeCredits} onChange={(e) => handleTakeCredits(e.target.checked)} />}
                  label="Creditsaldo overnemen"
                />
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  Uit {creditColumnsLabel(creditColumns)}, per lid opgeteld. Een negatief saldo gaat niet mee. Alleen voor nieuwe
                  accounts; wie al een account heeft, houdt het saldo dat er staat.
                </Typography>
              </Box>
            )}
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Naam</TableCell>
                    <TableCell>E-mail</TableCell>
                    <TableCell>Rol</TableCell>
                    <TableCell>Credits</TableCell>
                    <TableCell>Abonnement</TableCell>
                    <TableCell>Wat gebeurt er</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((r) => {
                    const outcome = importOutcome(r);
                    const fill = fills[r.line];
                    const notes = fill ? [`Heeft al een account; vult aan: ${fillSummary(fill.fill)}.`] : [...r.errors, ...(r.skipReason ? [r.skipReason] : []), ...r.warnings];
                    return (
                      <TableRow key={r.line} sx={outcome === 'skip' || outcome === 'error' ? { opacity: 0.7 } : undefined}>
                        <TableCell>{r.displayName || '—'}</TableCell>
                        <TableCell sx={{ overflowWrap: 'anywhere', minWidth: 160 }}>{r.email || '—'}</TableCell>
                        <TableCell>{ROLE_LABEL[r.role]}</TableCell>
                        <TableCell>{r.credits ?? '—'}</TableCell>
                        <TableCell>{r.planName || '—'}</TableCell>
                        <TableCell>
                          <Chip size="small" color={fill ? 'info' : OUTCOME[outcome].color} variant="outlined" label={fill ? 'Aanvullen' : OUTCOME[outcome].label} sx={{ mb: notes.length ? 0.5 : 0 }} />
                          {notes.length > 0 && (
                            <Typography variant="caption" color={outcome === 'error' ? 'error' : 'text.secondary'} sx={{ display: 'block' }}>
                              {notes.join(' ')}
                            </Typography>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>
          </Box>
        )}

        {step === 'importing' && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, py: 2 }}>
            <Typography variant="body2">
              Bezig: {progress} van {workCount}…
            </Typography>
            <LinearProgress variant="determinate" value={workCount ? (progress / workCount) * 100 : 0} />
          </Box>
        )}

        {step === 'done' && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Alert severity={okCount === results.length && updated.failed === 0 ? 'success' : 'warning'}>
              {okCount} van {results.length} {results.length === 1 ? 'account aangemaakt' : 'accounts aangemaakt'}.
              {updated.ok + updated.failed > 0 && ` ${updated.ok} bestaande ${updated.ok === 1 ? 'lid' : 'leden'} aangevuld${updated.failed ? `, ${updated.failed} mislukt` : ''}.`}
            </Alert>
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Naam</TableCell>
                    <TableCell>E-mail</TableCell>
                    <TableCell>Tijdelijk wachtwoord</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {results.map((r) => (
                    <TableRow key={r.line}>
                      <TableCell>{r.displayName}</TableCell>
                      <TableCell>{r.email}</TableCell>
                      <TableCell>
                        {r.outcome === 'ok' ? (
                          <>
                            {r.password}
                            {r.failureReason && (
                              <Typography variant="caption" color="error" sx={{ display: 'block' }}>
                                {r.failureReason}
                              </Typography>
                            )}
                          </>
                        ) : (
                          <Typography variant="caption" color="error">
                            Mislukt: {r.failureReason}
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
            <Typography variant="caption" color="text.secondary">
              Geef deze tijdelijke wachtwoorden door aan de leden; ze kunnen die later zelf wijzigen.
            </Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        {step === 'preview' && (
          <>
            <Button variant="text" onClick={reset} sx={{ textTransform: 'none' }}>
              Terug
            </Button>
            <Button variant="contained" disableElevation disabled={workCount === 0} onClick={handleImport}>
              {fillCount > 0 ? `${validRows.length} importeren, ${fillCount} aanvullen` : `${validRows.length} ${validRows.length === 1 ? 'lid' : 'leden'} importeren`}
            </Button>
          </>
        )}
        {step === 'done' && (
          <>
            <Button startIcon={<ContentCopyRoundedIcon />} onClick={handleCopySummary} sx={{ textTransform: 'none' }}>
              Kopieer overzicht
            </Button>
            <Button variant="contained" disableElevation onClick={handleClose}>
              Klaar
            </Button>
          </>
        )}
        {(step === 'upload' || step === 'importing') && (
          <Button variant="text" onClick={handleClose} disabled={step === 'importing'} sx={{ textTransform: 'none' }}>
            Annuleren
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
