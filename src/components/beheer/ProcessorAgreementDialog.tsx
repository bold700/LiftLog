/**
 * De verwerkersovereenkomst lezen en tekenen. Bovenaan de partijen, dan de hele tekst, onderaan de
 * gegevens van de studio (voorgevuld uit Facturatie), naam en functie van wie tekent en een vinkje
 * dat die bevoegd is. Tekenen kan pas als alles is ingevuld. Is er al getekend, dan alleen lezen.
 */
import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { FullScreenDialogTitle } from './FullScreenDialogTitle';
import type { AgreementInfo, AgreementParty, SignAgreementInput } from '../../services/processorAgreementService';

interface Props {
  open: boolean;
  info: AgreementInfo;
  /** Alleen lezen: de huidige versie is al getekend. */
  readOnly: boolean;
  onClose: () => void;
  onSign: (input: SignAgreementInput) => Promise<void>;
}

const EMPTY: AgreementParty = { legalName: '', street: '', postcode: '', city: '', kvk: '' };

export function ProcessorAgreementDialog({ open, info, readOnly, onClose, onSign }: Props) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [company, setCompany] = useState<AgreementParty>(EMPTY);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const { name: prefillName, ...party } = info.prefill;
    setCompany(party);
    setName(prefillName);
    setRole('');
    setAgree(false);
    setError(null);
  }, [open, info]);

  const kvkOk = /^\d{8}$/.test(company.kvk.trim());
  const complete = !!(company.legalName.trim() && company.street.trim() && company.postcode.trim() && company.city.trim() && kvkOk && name.trim() && role.trim());

  const sign = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSign({ controller: company, signer: { name, role } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Tekenen mislukt.');
    } finally {
      setBusy(false);
    }
  };

  const set = (key: keyof AgreementParty) => (e: React.ChangeEvent<HTMLInputElement>) => setCompany((c) => ({ ...c, [key]: e.target.value }));
  const p = info.processor;
  const controllerName = company.legalName.trim() || 'de studio';

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullScreen={fullScreen} maxWidth="md" fullWidth scroll="paper">
      {fullScreen ? <FullScreenDialogTitle title={info.title} onClose={onClose} /> : <DialogTitle>{info.title}</DialogTitle>}
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Versie {info.version}. Jouw studio bepaalt welke gegevens van leden in VORM staan; {p.legalName} verwerkt ze namens jullie.
          Deze overeenkomst legt vast hoe.
        </Typography>

        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          Partijen
        </Typography>
        <Typography variant="body2" component="ol" sx={{ pl: 2.5, mt: 0.5 }}>
          <li>
            {controllerName}, hierna &quot;Verwerkingsverantwoordelijke&quot;.
          </li>
          <li>
            {p.legalName}, {p.street}, {p.postcode} {p.city}, KvK {p.kvk}; hierna &quot;Verwerker&quot;.
          </li>
        </Typography>

        {info.sections.map((s) => (
          <Box key={s.title} sx={{ mt: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {s.title}
            </Typography>
            {s.paragraphs?.map((t) => (
              <Typography key={t} variant="body2" sx={{ mt: 0.75 }}>
                {t}
              </Typography>
            ))}
            {s.items && (
              <Typography variant="body2" component="ol" sx={{ pl: 2.5, mt: 0.75, '& li': { mb: 0.75 } }}>
                {s.items.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </Typography>
            )}
          </Box>
        ))}

        {!readOnly && (
          <>
            <Divider sx={{ my: 3 }} />
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
              Tekenen namens de studio
            </Typography>
            <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
              <TextField label="Bedrijfsnaam" value={company.legalName} onChange={set('legalName')} sx={{ gridColumn: { sm: '1 / -1' } }} />
              <TextField label="Adres" value={company.street} onChange={set('street')} sx={{ gridColumn: { sm: '1 / -1' } }} />
              <TextField label="Postcode" value={company.postcode} onChange={set('postcode')} />
              <TextField label="Plaats" value={company.city} onChange={set('city')} />
              <TextField
                label="KvK-nummer"
                value={company.kvk}
                onChange={set('kvk')}
                inputProps={{ inputMode: 'numeric' }}
                error={company.kvk.trim() !== '' && !kvkOk}
                helperText={company.kvk.trim() !== '' && !kvkOk ? '8 cijfers' : ' '}
                sx={{ gridColumn: { sm: '1 / -1' } }}
              />
              <TextField label="Je naam" value={name} onChange={(e) => setName(e.target.value)} />
              <TextField label="Je functie" placeholder="Bijv. eigenaar" value={role} onChange={(e) => setRole(e.target.value)} />
            </Box>
            <FormControlLabel
              sx={{ mt: 1.5, alignItems: 'flex-start' }}
              control={<Checkbox checked={agree} onChange={(e) => setAgree(e.target.checked)} sx={{ mt: -0.75 }} />}
              label={
                <Typography variant="body2">
                  Ik ben bevoegd om namens {controllerName} te tekenen en ga akkoord met deze verwerkersovereenkomst.
                </Typography>
              }
            />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              Na het tekenen leggen we je naam, functie, e-mailadres, datum en tijd vast. Je krijgt de PDF per mail en kunt hem hier altijd
              downloaden.
            </Typography>
            {error && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {error}
              </Alert>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy} sx={{ textTransform: 'none' }}>
          {readOnly ? 'Sluiten' : 'Later'}
        </Button>
        {!readOnly && (
          <Button variant="contained" disableElevation disabled={!complete || !agree || busy} onClick={sign}>
            {busy ? 'Bezig…' : 'Tekenen'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
