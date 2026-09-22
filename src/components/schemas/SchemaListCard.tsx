/**
 * Eén kaart in de workout-lijst (Figma "Workouts"): naam, een pil voor wie de workout is (Voor jou /
 * Open voor iedereen / Groepsles, bij staf de namen), het aantal dagen en tot wanneer hij loopt.
 * Klikken opent de detailweergave.
 */
import { Box, Typography } from '@mui/material';
import type { Schema, Profile } from '../../types';
import { UserAvatar } from '../UserAvatar';
import { designTokens } from '../../theme/designTokens';

interface SchemaListCardProps {
  schema: Schema;
  /** Positie in de lijst, voor de stagger-animatie (--stagger-index, max 8). */
  index: number;
  isThisWeek: boolean;
  /** Korte omschrijving voor wie de workout is, met avatars van max. 3 sporters. */
  assignee: { text: string; avatars: Profile[] };
  /** Staf ziet de namen van de sporters; een sporter ziet "Voor jou". */
  isStaff: boolean;
  /** Weergavenaam van een sporter (voor de avatar-tooltip/initialen). */
  nameOf: (userId: string) => string;
  onClick: () => void;
}

const MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

/** "Tot 12 okt" (met jaar als het niet dit jaar is), "Wekelijks" voor een groepsles zonder einde, anders "Geen einddatum". */
export function schemaEndLabel(schema: Pick<Schema, 'endDate' | 'audience'>, now = new Date()): string {
  const [y, m, d] = (schema.endDate ?? '').split('-').map(Number);
  if (y && m && d) return `Tot ${d} ${MONTHS[m - 1]}${y !== now.getFullYear() ? ` ${y}` : ''}`;
  return schema.audience === 'group' ? 'Wekelijks' : 'Geen einddatum';
}

function audiencePill(schema: Schema, assignee: SchemaListCardProps['assignee'], isStaff: boolean) {
  if (schema.audience === 'group') {
    const n = schema.participantIds?.length ?? 0;
    return { label: n > 0 ? `Groepsles · ${n} ${n === 1 ? 'persoon' : 'personen'}` : 'Groepsles', bg: designTokens.tertiaryContainer, fg: designTokens.onTertiaryContainer };
  }
  if (schema.audience === 'open') return { label: 'Open voor iedereen', bg: designTokens.secondaryContainer, fg: designTokens.onSecondaryContainer };
  if (!isStaff) return { label: 'Voor jou', bg: designTokens.primaryContainer, fg: designTokens.onPrimaryContainer };
  if (assignee.avatars.length === 0 && assignee.text === 'Niet toegewezen') return { label: assignee.text, bg: 'transparent', fg: 'text.secondary', outlined: true };
  return { label: assignee.text, bg: designTokens.primaryContainer, fg: designTokens.onPrimaryContainer };
}

export const SchemaListCard = ({ schema, index, isThisWeek, assignee, isStaff, nameOf, onClick }: SchemaListCardProps) => {
  const pill = audiencePill(schema, assignee, isStaff);
  const days = `${schema.days.length} ${schema.days.length === 1 ? 'dag' : 'dagen'}${
    schema.isFormule7Template ? (schema.formule7AssistMode === 'ai' ? ' · Formule 7 · AI' : ' · Formule 7') : ''
  }`;
  const end = schemaEndLabel(schema);
  return (
    <Box
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      sx={
        {
          '--stagger-index': Math.min(index, 8),
          bgcolor: designTokens.cardBackground,
          borderRadius: `${designTokens.cardRadius}px`,
          px: { xs: 2, md: 2.5 },
          py: { xs: 2, md: 2.5 },
          cursor: 'pointer',
          minWidth: 0,
          transition: 'background-color 0.15s ease',
          '&:hover': { bgcolor: designTokens.cardBackgroundHigh },
        } as object
      }
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 18, fontWeight: 500, lineHeight: '24px' }} noWrap>
          {schema.name}
        </Typography>
        {isThisWeek && (
          <Box
            component="span"
            sx={{
              px: 1,
              borderRadius: '8px',
              bgcolor: designTokens.primary,
              color: designTokens.onPrimary,
              fontSize: 11,
              fontWeight: 600,
              lineHeight: '20px',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            Deze week
          </Box>
        )}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1, minWidth: 0 }}>
        {isStaff && assignee.avatars.length > 0 && (
          <Box sx={{ display: 'flex', flexShrink: 0 }}>
            {assignee.avatars.map((p, i) => (
              <Box key={p.userId} sx={{ ml: i === 0 ? 0 : -0.75, borderRadius: '50%', border: '2px solid', borderColor: designTokens.cardBackground }}>
                <UserAvatar name={nameOf(p.userId)} photoURL={p.photoURL ?? null} size={20} />
              </Box>
            ))}
          </Box>
        )}
        <Box
          component="span"
          sx={{
            px: 1,
            borderRadius: '8px',
            bgcolor: pill.bg,
            color: pill.fg,
            border: pill.outlined ? `1px solid ${designTokens.outline}` : 'none',
            fontSize: 11,
            fontWeight: 500,
            lineHeight: '20px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            minWidth: 0,
          }}
        >
          {pill.label}
        </Box>
        <Typography sx={{ fontSize: 12, lineHeight: '16px', color: 'text.secondary', whiteSpace: 'nowrap', flexShrink: 0 }}>{days}</Typography>
        {/* Op een telefoon rechts op dezelfde regel, op desktop een eigen regel eronder (Figma). */}
        <Typography sx={{ display: { xs: 'block', md: 'none' }, ml: 'auto', fontSize: 12, lineHeight: '16px', color: 'text.secondary', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {end}
        </Typography>
      </Box>
      <Typography sx={{ display: { xs: 'none', md: 'block' }, mt: 1.25, fontSize: 12, lineHeight: '16px', color: 'text.secondary' }}>{end}</Typography>
    </Box>
  );
};
