/**
 * Beheer → Instellingen: de eigenaar van de studio. Die tekent de verwerkersovereenkomst namens de
 * studio en is het aanspreekpunt voor BOLD700 (ook voor de rekening). Andere beheerders beheren mee.
 *
 * Overdragen kan de huidige eigenaar (of support van BOLD700); zolang er nog geen eigenaar is, kan
 * elke beheerder er een aanwijzen. Alleen beheerders van de studio komen in aanmerking, support van
 * BOLD700 niet. De server controleert dat allemaal (api/admin-account.mjs, actie setOwner).
 */
import { useEffect, useState } from 'react';
import { Alert, Box, Button, MenuItem, TextField, Typography } from '@mui/material';
import { ContentCard } from '../layout';
import { useAuth } from '../../context/AuthContext';
import { useNotify } from '../../context/NotifyContext';
import { getAllProfiles } from '../../services/profileService';
import { setStudioOwner } from '../../services/adminAccountService';
import { isSupportEmail } from '../../utils/support';
import type { Profile } from '../../types';

interface Props {
  ownerId: string | null;
  myUid: string | null | undefined;
  myEmail: string | null | undefined;
  onChanged: (ownerId: string) => void;
}

const nameOf = (p: Profile) => p.displayName?.trim() || p.email || p.userId;

export function StudioOwnerCard({ ownerId, myUid, myEmail, onChanged }: Props) {
  const auth = useAuth();
  const notify = useNotify();
  const [admins, setAdmins] = useState<Profile[] | null>(null);
  const [choice, setChoice] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getAllProfiles().then(
      (list) => {
        if (cancelled) return;
        setAdmins(list.filter((p) => p.role === 'admin').sort((a, b) => nameOf(a).localeCompare(nameOf(b), undefined, { sensitivity: 'base' })));
      },
      () => {
        if (!cancelled) setAdmins([]);
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const owner = admins?.find((p) => p.userId === ownerId) ?? null;
  const candidates = (admins ?? []).filter((p) => p.userId !== ownerId && !isSupportEmail(p.email));
  const canChange = !ownerId || ownerId === myUid || isSupportEmail(myEmail);

  const save = async () => {
    const user = auth?.user;
    if (!user || !choice) return;
    setSaving(true);
    try {
      await setStudioOwner(user, choice);
      onChanged(choice);
      setChoice('');
      notify.success(ownerId ? 'Eigenaarschap overgedragen.' : 'Eigenaar aangewezen.');
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Eigenaar aanwijzen mislukt.', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ContentCard>
      <Typography variant="h6" sx={{ mb: 1 }}>
        Eigenaar van de studio
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        De eigenaar tekent namens de studio (zoals de verwerkersovereenkomst) en is het aanspreekpunt voor BOLD700. Andere
        beheerders beheren mee.
      </Typography>
      {ownerId ? (
        <Typography variant="body2" sx={{ mb: canChange ? 2 : 0 }}>
          Eigenaar: <strong>{owner ? nameOf(owner) : 'onbekend'}</strong>
          {ownerId === myUid ? ' (jij)' : ''}
        </Typography>
      ) : (
        <Alert severity="warning" sx={{ mb: canChange ? 2 : 0 }}>
          Er is nog geen eigenaar aangewezen.
        </Alert>
      )}
      {canChange && admins && (
        candidates.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Maak eerst iemand beheerder (Beheer → Leden) om het eigenaarschap aan over te dragen.
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
            <TextField
              select
              size="small"
              label={ownerId ? 'Overdragen aan' : 'Eigenaar'}
              value={choice}
              onChange={(e) => setChoice(e.target.value)}
              sx={{ minWidth: 240 }}
            >
              {candidates.map((p) => (
                <MenuItem key={p.userId} value={p.userId}>
                  {nameOf(p)}
                  {p.userId === myUid ? ' (jij)' : ''}
                </MenuItem>
              ))}
            </TextField>
            <Button variant="contained" disableElevation disabled={!choice || saving} onClick={() => void save()}>
              {saving ? 'Bezig…' : ownerId ? 'Overdragen' : 'Aanwijzen'}
            </Button>
          </Box>
        )
      )}
    </ContentCard>
  );
}
