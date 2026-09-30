/**
 * Beheer → Instellingen: de verwerkersovereenkomst met BOLD700. Nog niet getekend (of een nieuwe
 * versie): uitleg en "Lezen en tekenen". Getekend: wie en wanneer, met "Bekijken" en de PDF.
 * Alleen voor beheerders; de server controleert dat ook.
 *
 * Alleen de eigenaar van de studio tekent. Andere beheerders zien wie dat is en kunnen de tekst
 * lezen; is er nog geen eigenaar, dan staat er dat die eerst moet worden aangewezen.
 *
 * `variant="banner"`: bovenaan Beheer → Leden een melding zolang er (opnieuw) getekend moet worden,
 * alleen voor de eigenaar (of voor elke beheerder zolang er geen eigenaar is); daarna niets.
 */
import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Typography } from '@mui/material';
import { ContentCard } from '../layout';
import { useAuth } from '../../context/AuthContext';
import { useNotify } from '../../context/NotifyContext';
import { ProcessorAgreementDialog } from './ProcessorAgreementDialog';
import {
  downloadProcessorAgreementPdf,
  getProcessorAgreement,
  isAgreementCurrent,
  signProcessorAgreement,
  type AgreementInfo,
  type SignAgreementInput,
} from '../../services/processorAgreementService';

const formatDate = (iso: string) => new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });

export function ProcessorAgreementCard({ variant = 'card' }: { variant?: 'card' | 'banner' }) {
  const auth = useAuth();
  const notify = useNotify();
  const user = auth?.user ?? null;
  const [info, setInfo] = useState<AgreementInfo | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Eén keer laden per ingelogde gebruiker, ook als het user-object zelf een nieuwe identiteit krijgt.
  const userRef = useRef(user);
  userRef.current = user;
  const uid = user?.uid ?? null;
  useEffect(() => {
    const u = userRef.current;
    if (!uid || !u) return;
    let cancelled = false;
    getProcessorAgreement(u).then(
      (r) => {
        if (cancelled) return;
        setInfo(r);
        setLoadError(false);
      },
      () => {
        if (!cancelled) setLoadError(true);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [uid]);

  if (!user) return null;
  if (variant === 'banner' && (loadError || !info || isAgreementCurrent(info) || (!info.canSign && info.owner))) return null;
  if (loadError) {
    return (
      <ContentCard>
        <Typography variant="h6" sx={{ mb: 1 }}>
          Verwerkersovereenkomst
        </Typography>
        <Alert severity="warning">De overeenkomst kon niet worden geladen. Probeer het later opnieuw.</Alert>
      </ContentCard>
    );
  }
  if (!info) return null;

  const current = isAgreementCurrent(info);
  const signed = info.signed;
  const canSign = info.canSign === true;
  // Wie niet mag tekenen, leest alleen.
  const readOnly = current || !canSign;

  const sign = async (input: SignAgreementInput) => {
    const r = await signProcessorAgreement(user, info.version, input);
    setInfo({ ...info, signed: r.signed });
    setOpen(false);
    notify.success(r.emailed ? 'Getekend. Je krijgt de PDF per mail.' : 'Getekend. Download de PDF hieronder.');
  };

  const download = async () => {
    setDownloading(true);
    try {
      await downloadProcessorAgreementPdf(user);
    } catch (e) {
      notify.error('PDF downloaden mislukt.', e);
    } finally {
      setDownloading(false);
    }
  };

  const dialog = <ProcessorAgreementDialog open={open} info={info} readOnly={readOnly} onClose={() => setOpen(false)} onSign={sign} />;

  if (variant === 'banner' && !canSign) {
    return (
      <Alert severity="info" sx={{ mb: 2 }}>
        Wijs de eigenaar van de studio aan (Beheer → Instellingen). Die tekent de verwerkersovereenkomst met BOLD700.
      </Alert>
    );
  }

  if (variant === 'banner') {
    return (
      <Alert
        severity="info"
        sx={{ mb: 2 }}
        action={
          <Button color="inherit" size="small" onClick={() => setOpen(true)} sx={{ textTransform: 'none', whiteSpace: 'nowrap' }}>
            Lezen en tekenen
          </Button>
        }
      >
        {signed ? 'Er is een nieuwe versie van de verwerkersovereenkomst met BOLD700.' : 'Teken de verwerkersovereenkomst met BOLD700 (AVG).'}
        {dialog}
      </Alert>
    );
  }

  return (
    <ContentCard>
      <Typography variant="h6" sx={{ mb: 1 }}>
        Verwerkersovereenkomst
      </Typography>
      {current && signed ? (
        <Typography variant="body2" color="text.secondary">
          Getekend door {signed.signer.name} ({signed.signer.role}) op {formatDate(signed.signedAt)}, namens {signed.controller.legalName}.
        </Typography>
      ) : !canSign ? (
        <Alert severity="info" sx={{ mb: 1 }}>
          {info.owner
            ? `Alleen de eigenaar van de studio tekent: ${info.owner.name || 'de eigenaar'}. Je kunt de tekst wel lezen.`
            : 'Wijs hierboven eerst de eigenaar van de studio aan. Die tekent de verwerkersovereenkomst namens de studio.'}
        </Alert>
      ) : (
        <Alert severity="info" sx={{ mb: 1 }}>
          {signed
            ? `Er is een nieuwe versie van de verwerkersovereenkomst. Lees en teken hem opnieuw; de vorige versie tekende ${signed.signer.name} op ${formatDate(signed.signedAt)}.`
            : `Jullie studio beheert gegevens van leden; ${info.processor.legalName} verwerkt ze in VORM namens jullie. De AVG vraagt daarvoor een verwerkersovereenkomst. Lees hem en teken hier.`}
        </Alert>
      )}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1.5 }}>
        <Button variant={readOnly ? 'outlined' : 'contained'} disableElevation onClick={() => setOpen(true)}>
          {readOnly ? 'Bekijken' : 'Lezen en tekenen'}
        </Button>
        {signed && (
          <Button variant="text" onClick={download} disabled={downloading} sx={{ textTransform: 'none' }}>
            {downloading ? 'Bezig…' : 'PDF downloaden'}
          </Button>
        )}
      </Box>
      {dialog}
    </ContentCard>
  );
}
