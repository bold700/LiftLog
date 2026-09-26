/**
 * Tabs die op een smal scherm niet allemaal passen (Inzichten, Profiel, Beheer). Zonder hint zag je
 * niet dat er rechts nog tabs zijn. Pijltjes nemen ruimte weg (en staan niet in Figma), dus een
 * zachte fade aan de rechterkant; met wat ruimte achter de laatste tab, zodat die helemaal leesbaar
 * is als je naar het eind swipet.
 */
export const tabsOverflowHintSx = {
  '& .MuiTabs-scroller': {
    maskImage: 'linear-gradient(to right, #000 calc(100% - 32px), transparent 100%)',
    WebkitMaskImage: 'linear-gradient(to right, #000 calc(100% - 32px), transparent 100%)',
  },
  '& .MuiTabs-flexContainer::after': { content: '""', flex: '0 0 32px' },
} as const;
