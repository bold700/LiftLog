/**
 * Soort les in één oogopslag: 1-op-1 één persoon, duo twee personen, groepsles (en concept) een
 * groepje. In de kleur van de soort, zoals in de legenda en het weekrooster.
 */
import PersonRoundedIcon from '@mui/icons-material/PersonRounded';
import PeopleRoundedIcon from '@mui/icons-material/PeopleRounded';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';
import type { SvgIconProps } from '@mui/material';
import { SESSION_KIND_COLORS } from '../services/classService';
import type { SessionKind } from '../types';

const ICONS = { '1on1': PersonRoundedIcon, duo: PeopleRoundedIcon, group: GroupsRoundedIcon, concept: GroupsRoundedIcon } as const;

export function SessionKindIcon({ kind, sx, ...rest }: { kind: SessionKind } & SvgIconProps) {
  const Icon = ICONS[kind] ?? GroupsRoundedIcon;
  return <Icon {...rest} sx={{ color: SESSION_KIND_COLORS[kind], ...sx }} />;
}
