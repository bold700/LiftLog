import type { nl } from './nl';

export type Lang = 'nl' | 'en';
export const LANGS: readonly Lang[] = ['nl', 'en'] as const;

/** Dezelfde boom als `nl`, maar met gewone strings zodat `en` andere teksten mag hebben. */
type Loosen<T> = { [K in keyof T]: T[K] extends string ? string : Loosen<T[K]> };
export type Messages = Loosen<typeof nl>;

/** Alle sleutelpaden, bijvoorbeeld `nav.insights` of `admin.openRequests` (een meervoudsvorm). */
type Paths<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? `${P}${K}`
    : T[K] extends { one: string; other: string }
      ? `${P}${K}`
      : Paths<T[K], `${P}${K}.`>;
}[keyof T & string];
export type MessageKey = Paths<Messages>;
