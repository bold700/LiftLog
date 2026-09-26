/**
 * De automatische meldingen zoals een studio-eigenaar ze in Beheer → Meldingen ziet: wat het is,
 * wie het krijgt en wanneer. Het versturen zelf zit op de server (api/_lib/notifications.mjs en
 * api/notify.mjs); die kijkt per studio of een soort aan staat.
 */
import type { NotificationKind, OrgNotificationSettings } from '../types';

export interface NotificationKindInfo {
  kind: NotificationKind;
  label: string;
  description: string;
  /** Wie hem krijgt. */
  to: 'Sporter' | 'Trainer';
  /** Wanneer hij gaat. */
  when: string;
}

export const NOTIFICATION_KIND_INFO: NotificationKindInfo[] = [
  {
    kind: 'classReminder',
    label: 'Lesherinnering',
    description: 'Een seintje over de les van morgen, met tijd en zaal.',
    to: 'Sporter',
    when: 'De avond ervoor, rond 18:00',
  },
  {
    kind: 'classCancelled',
    label: 'Les geannuleerd',
    description: 'Als de studio iemand afmeldt, bijvoorbeeld omdat een les niet doorgaat. Zegt ook of de credit terug is.',
    to: 'Sporter',
    when: 'Direct',
  },
  {
    kind: 'waitlistPromoted',
    label: 'Plek vrij voor de wachtlijst',
    description: 'Iemand meldt zich af: iedereen op de wachtlijst krijgt een melding en kan zich aanmelden (wie het eerst is).',
    to: 'Sporter',
    when: 'Direct',
  },
  {
    kind: 'creditsLow',
    label: 'Credits bijna op',
    description: 'Als iemand na een boeking nog 1 credit of minder over heeft.',
    to: 'Sporter',
    when: 'Direct na boeken',
  },
  {
    kind: 'workout',
    label: 'Nieuw schema',
    description: 'Als een trainer een schema toewijst.',
    to: 'Sporter',
    when: 'Direct',
  },
  {
    kind: 'weeklyCheckin',
    label: 'Wekelijkse check-in',
    description: 'Herinnering om de check-in voor de trainer in te vullen. Alleen voor sporters met een trainer.',
    to: 'Sporter',
    when: 'Zondag, rond 18:00',
  },
  {
    kind: 'birthday',
    label: 'Verjaardag',
    description: 'Een felicitatie namens de studio. Alleen als de geboortedatum in het profiel staat.',
    to: 'Sporter',
    when: 'Op de dag zelf, rond 18:00',
  },
  {
    kind: 'checkin',
    label: 'Check-in of training ingevuld',
    description: 'Als een eigen sporter een check-in invult of een training afrondt.',
    to: 'Trainer',
    when: 'Direct',
  },
  {
    kind: 'inactive',
    label: '2 weken niet getraind',
    description: 'Eén overzicht van eigen sporters die 2 weken geen training logden en geen les volgden, zodat je ze een berichtje kunt sturen.',
    to: 'Trainer',
    when: 'Maandag, rond 18:00',
  },
];

/** Standaard aan; alleen een expliciete `false` zet een soort uit. Zelfde regel als op de server. */
export function isNotificationEnabled(settings: OrgNotificationSettings | null | undefined, kind: NotificationKind): boolean {
  return settings?.[kind] !== false;
}
