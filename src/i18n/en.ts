import type { Messages } from './types';

/** English texts. Same keys as `nl.ts`; TypeScript refuses a missing one. */
export const en: Messages = {
  lang: {
    nl: 'Nederlands',
    en: 'English',
    label: 'Language',
  },
  nav: {
    log: 'Log',
    insights: 'Insights',
    workouts: 'Workouts',
    classes: 'Schedule',
    nutrition: 'Nutrition',
    profile: 'Profile',
    assistant: 'Assistant',
    measurements: 'Measurements',
    admin: 'Admin',
    signOut: 'Sign out',
    mainNavigation: 'Main navigation',
  },
  profile: {
    more: 'More',
    account: 'Account',
    languageHelp: 'Applies to the whole app, on all your devices.',
  },
  admin: {
    title: 'Admin',
    tabs: {
      members: 'Members',
      classTypes: 'Class types',
      subscriptions: 'Subscriptions',
      branding: 'Branding',
      billing: 'Billing',
    },
    addAccount: 'Add account',
    openRequests: {
      one: '1 open request',
      other: '{count} open requests',
    },
    review: 'Review',
    searchMembers: 'Search members',
    columns: {
      name: 'Name',
      email: 'Email',
      role: 'Role',
      subscription: 'Subscription',
      credits: 'Credits',
    },
    roles: {
      sporter: 'Member',
      trainer: 'Trainer',
      admin: 'Manager',
    },
    creditsLeft: {
      one: '1 left',
      other: '{count} left',
    },
    onlyStaff: 'Only trainers and managers can manage profiles.',
  },
  common: {
    save: 'Save',
    cancel: 'Cancel',
    saving: 'Saving…',
    none: '—',
  },
};
