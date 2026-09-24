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
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
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
import { parseCsv, toCsv } from '../../utils/csv';
import { buildMemberImportRows, MEMBER_IMPORT_TEMPLATE, MAX_IMPORT_ROWS, type MemberImportRow } from '../../utils/memberImport';
import { generatePassword } from '../../utils/account';
import type { ProfileRole } from '../../types';

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
}

export function MemberImportDialog({ open, onClose, existingEmails, trainers, defaultTrainerId, onImported }: MemberImportDialogProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const auth = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [step, setStep] = useState<Step>('upload');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [rows, setRows] = useState<MemberImportRow[]>([]);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<ImportResult[]>([]);

  const reset = () => {
    setStep('upload');
    setUploadError(null);
    setRows([]);
    setProgress(0);
    setResults([]);
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

  const handleFile = async (file: File) => {
    setUploadError(null);
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.rows.length === 0) {
      setUploadError('Geen rijen gevonden in dit bestand. Gebruik het sjabloon als voorbeeld.');
      return;
    }
    if (parsed.rows.length > MAX_IMPORT_ROWS) {
      setUploadError(`Dit bestand heeft ${parsed.rows.length} rijen; meer dan ${MAX_IMPORT_ROWS} in één keer wordt niet ondersteund.`);
      return;
    }
    setRows(buildMemberImportRows(parsed.rows, existingEmails));
    setStep('preview');
  };

  const trainerIdByEmail = new Map(trainers.filter((t) => t.email).map((t) => [t.email!.toLowerCase(), t.userId]));
  const resolveTrainerId = (row: MemberImportRow): string | null => {
    if (row.role !== 'sporter') return null;
    if (row.trainerEmail) return trainerIdByEmail.get(row.trainerEmail) ?? (defaultTrainerId || null);
    return defaultTrainerId || null;
  };

  const validRows = rows.filter((r) => r.errors.length === 0);

  const handleImport = async () => {
    if (!auth) return;
    setStep('importing');
    setProgress(0);
    const done: ImportResult[] = [];
    for (const row of validRows) {
      const password = generatePassword();
      try {
        const created = await auth.adminCreateAccount(row.email, password, row.role, row.displayName, { trainerId: resolveTrainerId(row) });
        if (row.credits) {
          try {
            await grantCredits(created.uid, row.credits, 'Geïmporteerd bij overstap');
          } catch {
            done.push({ ...row, password, outcome: 'ok', failureReason: 'Account aangemaakt, maar het startsaldo kon niet worden gezet.' });
            setProgress((p) => p + 1);
            continue;
          }
        }
        done.push({ ...row, password, outcome: 'ok' });
      } catch (e) {
        done.push({ ...row, password: '', outcome: 'failed', failureReason: e instanceof Error ? e.message : 'Account aanmaken mislukt.' });
      }
      setProgress((p) => p + 1);
    }
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
              Download het sjabloon, vul per lid een rij in (naam en e-mail zijn verplicht; rol, trainer en startsaldo zijn
              optioneel) en upload het bestand terug. Elk lid krijgt meteen een werkend account met een tijdelijk wachtwoord —
              geen e-mailverificatie nodig.
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
                accept=".csv,text/csv"
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
              {validRows.length} van {rows.length} {rows.length === 1 ? 'rij wordt' : 'rijen worden'} geïmporteerd
              {validRows.length < rows.length ? ' — de rest heeft fouten en wordt overgeslagen.' : '.'}
            </Typography>
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Naam</TableCell>
                    <TableCell>E-mail</TableCell>
                    <TableCell>Rol</TableCell>
                    <TableCell>Credits</TableCell>
                    <TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.line}>
                      <TableCell>{r.displayName || '—'}</TableCell>
                      <TableCell>{r.email || '—'}</TableCell>
                      <TableCell>{ROLE_LABEL[r.role]}</TableCell>
                      <TableCell>{r.credits ?? '—'}</TableCell>
                      <TableCell>
                        {r.errors.length > 0 ? (
                          <Typography variant="caption" color="error">
                            {r.errors.join(' ')}
                          </Typography>
                        ) : r.warnings.length > 0 ? (
                          <Typography variant="caption" sx={{ color: 'warning.main' }}>
                            {r.warnings.join(' ')}
                          </Typography>
                        ) : (
                          <Typography variant="caption" color="text.secondary">
                            Klaar om te importeren
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </Box>
        )}

        {step === 'importing' && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, py: 2 }}>
            <Typography variant="body2">
              Bezig: {progress} van {validRows.length}…
            </Typography>
            <LinearProgress variant="determinate" value={validRows.length ? (progress / validRows.length) * 100 : 0} />
          </Box>
        )}

        {step === 'done' && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Alert severity={okCount === results.length ? 'success' : 'warning'}>
              {okCount} van {results.length} {results.length === 1 ? 'account aangemaakt' : 'accounts aangemaakt'}.
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
            <Button variant="contained" disableElevation disabled={validRows.length === 0} onClick={handleImport}>
              {validRows.length} {validRows.length === 1 ? 'lid' : 'leden'} importeren
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
