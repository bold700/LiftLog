/**
 * Uitnodiging van een andere studio. Eén VORM-account kan bij meerdere studio's horen; een studio
 * nodigt je uit, jij beslist. Pas na "Accepteren" hoor je erbij en verschijnt de studiowisselaar.
 * Wie weigert, hoort er niet bij; de studio ziet dan niets van je.
 */
import { useEffect, useState } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { useAuth } from '../context/AuthContext';
import { useProfile } from '../context/ProfileContext';
import { useNotify } from '../context/NotifyContext';
import { answerInvite, getMyInvites, type OrgInvite } from '../services/adminAccountService';
import { setCurrentOrgId } from '../services/orgContext';

const ROLE_TEXT: Record<OrgInvite['role'], string> = { sporter: 'sporter', trainer: 'trainer', admin: 'beheerder' };

export function OrgInviteDialog() {
  const auth = useAuth();
  const profileCtx = useProfile();
  const notify = useNotify();
  const [invites, setInvites] = useState<OrgInvite[]>([]);
  const [busy, setBusy] = useState(false);
  const user = auth?.user ?? null;
  const uid = profileCtx?.profile?.userId ?? null;

  // Eén keer per inlog kijken; een uitnodiging die later binnenkomt, zie je bij de volgende keer openen.
  useEffect(() => {
    if (!user || !uid) return;
    let alive = true;
    getMyInvites(user)
      .then((list) => alive && setInvites(list))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [user, uid]);

  const invite = invites[0];
  if (!invite || !user) return null;

  const answer = async (accept: boolean) => {
    setBusy(true);
    try {
      const orgId = await answerInvite(user, invite.id, accept);
      setInvites((list) => list.slice(1));
      if (accept) {
        // Meteen in de nieuwe studio beginnen: die als laatst gebruikt zetten, dan opnieuw laden.
        if (orgId) setCurrentOrgId(orgId);
        await profileCtx?.refreshProfile();
        notify.success(`Welkom bij ${invite.orgName}. Wissel bovenin tussen je studio's.`);
      }
    } catch (e) {
      notify.error('Uitnodiging verwerken mislukt.', e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open maxWidth="xs" fullWidth aria-labelledby="org-invite-title">
      <DialogTitle id="org-invite-title">Uitnodiging van {invite.orgName}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 1.5 }}>
          {invite.invitedByName ? `${invite.invitedByName} nodigt` : `${invite.orgName} nodigt`} je uit als{' '}
          <strong>{ROLE_TEXT[invite.role]}</strong> bij {invite.orgName}.
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Je gebruikt hetzelfde account. Lessen, credits en je trainingen bij {invite.orgName} staan los van je andere studio; die ziet
          niets van wat je hier doet, en andersom. Je wisselt bovenin tussen je studio's.
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={() => void answer(false)} disabled={busy}>
          Weigeren
        </Button>
        <Button variant="contained" disableElevation onClick={() => void answer(true)} disabled={busy}>
          Accepteren
        </Button>
      </DialogActions>
    </Dialog>
  );
}
