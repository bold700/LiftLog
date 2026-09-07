/**
 * Eén kaart in de workout-lijst: naam, label "Deze week", voor wie de workout is (met avatars),
 * aantal dagen en het type (Vrij / Formule 7 / Formule 7 · AI). Klikken opent de detailweergave.
 */
import { Card, CardContent, Box, Typography } from '@mui/material';
import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded';
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
  /** Weergavenaam van een sporter (voor de avatar-tooltip/initialen). */
  nameOf: (userId: string) => string;
  onClick: () => void;
}

export const SchemaListCard = ({ schema, index, isThisWeek, assignee, nameOf, onClick }: SchemaListCardProps) => (
  <Card
    onClick={onClick}
    sx={{
      '--stagger-index': Math.min(index, 8),
      backgroundColor: 'transparent',
      borderRadius: `${designTokens.cardRadius}px`,
      border: `1px solid ${designTokens.cardBorder}`,
      boxShadow: 'none',
      cursor: 'pointer',
      transition: 'transform 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease',
      '&:hover': {
        backgroundColor: 'rgba(0,0,0,0.03)',
        transform: 'translateY(-2px)',
        boxShadow: 2,
      },
    } as any}
  >
    <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <CalendarMonthRoundedIcon color="action" fontSize="small" />
        <Typography variant="subtitle1" fontWeight={600}>
          {schema.name}
        </Typography>
        {isThisWeek && (
          <Box
            component="span"
            sx={{
              px: 1,
              py: 0.25,
              borderRadius: '12px',
              bgcolor: '#000000',
              color: '#F2E4D3',
              fontSize: 12,
              fontWeight: 600,
              lineHeight: 1.4,
            }}
          >
            Deze week
          </Box>
        )}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.75 }}>
        {assignee.avatars.length > 0 && (
          <Box sx={{ display: 'flex' }}>
            {assignee.avatars.map((p, i) => (
              <Box key={p.userId} sx={{ ml: i === 0 ? 0 : -0.75, borderRadius: '50%', border: '2px solid', borderColor: 'background.paper' }}>
                <UserAvatar name={nameOf(p.userId)} photoURL={p.photoURL ?? null} size={22} />
              </Box>
            ))}
          </Box>
        )}
        <Typography variant="body2" color="text.secondary">
          {assignee.text}
        </Typography>
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
        {schema.days.length} {schema.days.length === 1 ? 'dag' : 'dagen'}
        {schema.isFormule7Template
          ? schema.formule7AssistMode === 'ai'
            ? ' · Formule 7 · AI'
            : ' · Formule 7'
          : ' · Vrij'}
      </Typography>
    </CardContent>
  </Card>
);
