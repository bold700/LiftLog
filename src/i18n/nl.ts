/**
 * Nederlandse teksten. Dit is de brontaal: `en.ts` moet dezelfde sleutels hebben (TypeScript
 * controleert dat via `Messages`). Sleutels zijn per scherm gegroepeerd; `{naam}` is een plek
 * waar een waarde in komt.
 */
export const nl = {
  lang: {
    nl: 'Nederlands',
    en: 'English',
    label: 'Taal',
  },
  nav: {
    log: 'Log',
    insights: 'Inzichten',
    workouts: 'Workouts',
    classes: 'Lessen',
    nutrition: 'Voeding',
    profile: 'Profiel',
    assistant: 'Assistent',
    measurements: 'Metingen',
    admin: 'Beheer',
    signOut: 'Uitloggen',
    mainNavigation: 'Hoofdnavigatie',
  },
  profile: {
    more: 'Meer',
    account: 'Account',
    languageHelp: 'Geldt voor de hele app, op al je apparaten.',
  },
  admin: {
    title: 'Beheer',
    tabs: {
      members: 'Leden',
      classTypes: 'Lessoorten',
      subscriptions: 'Abonnementen',
      branding: 'Huisstijl',
      billing: 'Facturatie',
    },
    addAccount: 'Account toevoegen',
    openRequests: {
      one: '1 open aanvraag',
      other: '{count} open aanvragen',
    },
    comingSoon: 'Komt in een volgende stap.',
    review: 'Bekijken',
    searchMembers: 'Zoek leden',
    columns: {
      name: 'Naam',
      email: 'E-mail',
      role: 'Rol',
      subscription: 'Abonnement',
      credits: 'Credits',
    },
    roles: {
      sporter: 'Sporter',
      trainer: 'Trainer',
      admin: 'Beheerder',
    },
    creditsLeft: {
      one: '1 over',
      other: '{count} over',
    },
    onlyStaff: 'Alleen trainers en beheerders kunnen profielen beheren.',
    search: 'Zoek op naam of e-mail',
    refresh: 'Vernieuwen',
    loading: 'Leden laden…',
    empty: 'Nog geen leden.',
    emptySearch: 'Geen leden gevonden.',
    me: '(ik)',
    linkByEmail: 'Bestaande sporter koppelen',
    requests: {
      title: 'Open aanvragen',
      trainerRights: '{name} wil trainerrechten',
      newProgramme: '{name} vroeg een nieuw schema',
      approve: 'Goedkeuren',
      decline: 'Afwijzen',
      done: 'Afgehandeld',
      none: 'Geen open aanvragen.',
      failed: 'Aanvraag afhandelen mislukt.',
    },
  },
  common: {
    save: 'Opslaan',
    cancel: 'Annuleren',
    saving: 'Bezig…',
    none: '—',
  },
} as const;
