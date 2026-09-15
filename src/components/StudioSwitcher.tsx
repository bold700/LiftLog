import { useCallback, useEffect, useState } from 'react';
import { Box, Chip, Menu, MenuItem, CircularProgress, ListItemText, ListItemIcon } from '@mui/material';
import StorefrontRoundedIcon from '@mui/icons-material/StorefrontRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import { useProfile } from '../context/ProfileContext';
import { useNotify } from '../context/NotifyContext';
import { getOrg } from '../services/orgService';

/**
 * Wisselen tussen studio's.
 *
 * Alleen zichtbaar voor wie bij meer dan één studio hoort — in de praktijk een freelance trainer
 * die bij twee of drie studio's werkt. Voor iedereen met één studio is dit onzichtbaar, want dan
 * is het alleen ruis.
 *
 * Waarom het opvalt: als je met de verkeerde studio in beeld een schema aanmaakt, staat dat bij de
 * verkeerde klant. Daarom een duidelijk label in plaats van een klein pijltje.
 */
export function StudioSwitcher() {
  const profile = useProfile();
  const notify = useNotify();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const orgIds = profile?.orgIds ?? [];
  const activeOrgId = profile?.activeOrgId ?? null;

  // Namen van de studio's ophalen; zonder naam is een id betekenisloos in de balk.
  useEffect(() => {
    if (orgIds.length < 2) return;
    let cancelled = false;
    void (async () => {
      const found: Record<string, string> = {};
      for (const id of orgIds) {
        const org = await getOrg(id).catch(() => null);
        found[id] = org?.name ?? id;
      }
      if (!cancelled) setNames(found);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgIds.join(',')]);

  const pick = useCallback(
    async (orgId: string) => {
      setAnchorEl(null);
      if (!profile || orgId === activeOrgId) return;
      setBusy(true);
      try {
        await profile.switchOrg(orgId);
        notify?.success(`Je werkt nu in ${names[orgId] ?? orgId}.`);
      } catch (e) {
        notify?.error(e instanceof Error ? e.message : 'Wisselen van studio mislukt');
      } finally {
        setBusy(false);
      }
    },
    [profile, activeOrgId, names, notify]
  );

  // Eén studio (of nog niet geladen): niets tonen.
  if (orgIds.length < 2 || !activeOrgId) return null;

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}>
      <Chip
        icon={busy ? <CircularProgress size={14} sx={{ ml: 1 }} /> : <StorefrontRoundedIcon fontSize="small" />}
        label={names[activeOrgId] ?? activeOrgId}
        onClick={(e) => setAnchorEl(e.currentTarget)}
        disabled={busy}
        variant="outlined"
        size="small"
        aria-label={`Actieve studio: ${names[activeOrgId] ?? activeOrgId}. Klik om te wisselen.`}
      />
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
        {orgIds.map((id) => (
          <MenuItem key={id} onClick={() => void pick(id)} selected={id === activeOrgId}>
            <ListItemIcon sx={{ minWidth: 32 }}>
              {id === activeOrgId ? <CheckRoundedIcon fontSize="small" /> : null}
            </ListItemIcon>
            <ListItemText primary={names[id] ?? id} />
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
}
