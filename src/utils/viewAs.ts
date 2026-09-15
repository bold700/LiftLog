/**
 * Wiens gegevens staan er op het scherm?
 *
 * Een trainer wil de inzichten van een sporter kunnen bekijken zonder in te loggen als die
 * sporter. Dat laatste zou het spoor wissen: alles wat je dan doet lijkt van de sporter zelf.
 * Daarom kiest de trainer hier wie hij bekijkt, blijft hij ingelogd als zichzelf, en draagt
 * alles wat hij schrijft zijn eigen naam in `loggedBy`.
 *
 * De grens staat hier, in één functie, en niet per scherm: wie geen trainer of beheerder is,
 * krijgt altijd zijn eigen gegevens terug — ook als er een keuze in het geheugen staat.
 */

export interface ViewedUser {
  /** Van wie zijn de gegevens die je ziet. */
  userId: string;
  /** Naam om te tonen; leeg als we die niet kennen. */
  name: string;
  /** Kijk je bij iemand anders, of gewoon bij jezelf? */
  isOther: boolean;
}

export interface ViewAsSelection {
  userId: string;
  name: string;
}

/**
 * Bepaalt naar wie je kijkt.
 *
 * @param ownUserId  De ingelogde gebruiker.
 * @param ownName    Diens naam, voor de knop.
 * @param mayViewOthers Of deze rol bij een ander mag kijken (trainer of beheerder).
 * @param selection  De gekozen sporter, of null voor jezelf.
 */
export function resolveViewedUser(
  ownUserId: string | null,
  ownName: string,
  mayViewOthers: boolean,
  selection: ViewAsSelection | null
): ViewedUser {
  const self: ViewedUser = { userId: ownUserId ?? '', name: ownName, isOther: false };
  if (!mayViewOthers || !selection) return self;
  // Jezelf kiezen uit de lijst is geen "bekijken als": de balk hoort dan weg te blijven.
  if (!selection.userId || selection.userId === ownUserId) return self;
  return { userId: selection.userId, name: selection.name, isOther: true };
}
