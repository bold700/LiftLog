/**
 * Groepen: bedrijf, gezin of vriendengroep die samen traint (duo-PT, Pouw, een kantoor).
 *
 * Iedereen in een groep heeft een eigen account; de groep zelf is een lijst leden met één
 * hoofdprofiel dat betaalt. Het groepstegoed staat op een eigen creditAccount (`grp_{groupId}`,
 * los van de persoonlijke credits van de leden) en is alleen voor trainingen van die groep. Een
 * abonnement van de groep staat op dat tegoed; de posten en facturen gaan naar het hoofdprofiel
 * (`billToUserId` op het lidmaatschap).
 *
 * Het groepstegoed is in euro's, niet in credits: een groepsles kost een basisprijs plus een bedrag
 * per extra persoon (Van As: €85 + €25), naar hoeveel er echt komen. De studio factureert vooruit
 * voor de hele groep; meldt iemand zich op tijd af, dan wordt de les goedkoper en blijft het
 * verschil op het tegoed staan. Een groepsabonnement zet de prijs van het abonnement als tegoed op
 * de groep (en neemt het restant altijd mee: daar is voor betaald).
 */

export const GROUP_KINDS = ['bedrijf', 'gezin', 'vrienden'];
export const MAX_GROUP_MEMBERS = 12;
export const DEFAULT_GROUP_PRICING = { base: 85, perExtra: 25 };
/** Grootste handmatige correctie van een groepstegoed in één keer, in euro's. */
export const MAX_GROUP_ADJUST = 10000;

/** Bedrag op hele centen. */
export const euros = (v) => Math.round((Number(v) || 0) * 100) / 100;

/** Het "lid" waar tegoed en abonnement van een groep op staan. */
export const groupHolderId = (groupId) => `grp_${groupId}`;
export const isGroupHolder = (id) => typeof id === 'string' && id.startsWith('grp_');

/**
 * Controle van een groep die staf opslaat. Geeft `{ error }` of `{ value }` met opgeschoonde velden.
 * Welke leden bij de studio horen, controleert de aanroeper (die heeft de profielen).
 */
export function cleanGroupInput(body) {
  const name = String(body?.name ?? '').trim().slice(0, 80);
  if (!name) return { error: 'Geef de groep een naam.' };
  const kind = GROUP_KINDS.includes(body?.kind) ? body.kind : 'vrienden';
  const memberIds = [...new Set((Array.isArray(body?.memberIds) ? body.memberIds : []).map((v) => String(v).trim()).filter(Boolean))];
  if (memberIds.length === 0) return { error: 'Kies minstens één lid.' };
  if (memberIds.length > MAX_GROUP_MEMBERS) return { error: `Een groep heeft maximaal ${MAX_GROUP_MEMBERS} leden.` };
  if (memberIds.some(isGroupHolder)) return { error: 'Ongeldig lid.' };
  const payerId = String(body?.payerId ?? '').trim() || memberIds[0];
  if (!memberIds.includes(payerId)) return { error: 'Het hoofdprofiel (betaler) moet in de groep zitten.' };
  return { value: { name, kind, memberIds, payerId } };
}

/** Hoogste tarief per les dat je kunt instellen, in euro's (tegen tikfouten). */
export const MAX_GROUP_RATE = 10000;

/**
 * Eigen tarief van één groep (Beheer → Groepen → groep): basistarief plus per extra persoon.
 * Geeft `{ value }` met het tarief of null (geen eigen tarief: dan geldt dat van de studio), of `{ error }`.
 */
export function cleanGroupPricing(raw) {
  if (raw == null || raw === '') return { value: null };
  const rate = (v) => (v === '' || v == null ? NaN : Number(v));
  const base = rate(raw?.base);
  const perExtra = rate(raw?.perExtra);
  if (![base, perExtra].every((n) => Number.isFinite(n) && n >= 0 && n <= MAX_GROUP_RATE)) {
    return { error: `Vul een basistarief en een tarief per extra persoon in tussen € 0 en € ${MAX_GROUP_RATE}.` };
  }
  return { value: { base: euros(base), perExtra: euros(perExtra) } };
}

/**
 * Tarief van een groepsles: het eigen tarief van de groep als die er een heeft, anders dat van de
 * studio (Beheer → Instellingen), anders de standaard.
 */
export function groupPricingOf(orgData, groupData = null) {
  const own = groupData?.pricing ? cleanGroupPricing(groupData.pricing).value : null;
  if (own) return own;
  const p = orgData?.groupPricing;
  const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v) * 100) / 100 : d);
  return { base: num(p?.base, DEFAULT_GROUP_PRICING.base), perExtra: num(p?.perExtra, DEFAULT_GROUP_PRICING.perExtra) };
}

/**
 * Prijs van één groepsles voor `size` aanwezigen: 1 → €85, 2 → €110, 4 → €160 (bij €85 + €25).
 * Niemand (hele groep afgemeld): niets.
 */
export function groupSessionPrice(pricing, size) {
  const n = Math.max(0, Math.trunc(Number(size) || 0));
  if (n === 0) return 0;
  return euros(pricing.base + pricing.perExtra * (n - 1));
}

/**
 * Een groepsabonnement op het tegoed: de prijs van het abonnement komt er (in euro's) bij, en het
 * restant gaat altijd mee naar de volgende periode.
 */
export const groupPlanView = (plan) => ({ ...plan, credits: euros(plan.price), rollover: 'carry' });

/**
 * Groepsles: wie de groep voor deze les betaalt (`groupPaidIds` op de les) en wat er betaald is
 * (`groupSpent`). Boekt er iemand bij, dan komt die op de lijst en betaalt de groep het verschil.
 * Meldt iemand zich op tijd af, dan gaat die van de lijst en komt het verschil terug. Te laat
 * afgemeld: blijft op de lijst (de groep betaalt die plek). Afgelast door de studio: alles terug
 * (zie cancelWholeClass). Wie te laat afmeldde en toch komt, kost niets extra.
 */
const paidIdsOf = (cls) => (Array.isArray(cls?.groupPaidIds) ? cls.groupPaidIds.map(String) : []);

export function groupChargeOnBook(pricing, cls, userId) {
  const paid = paidIdsOf(cls);
  const spent = euros(cls?.groupSpent);
  if (paid.includes(userId)) return { paidIds: paid, total: spent, charge: 0 };
  const next = [...paid, userId];
  const total = groupSessionPrice(pricing, next.length);
  return { paidIds: next, total, charge: Math.max(0, euros(total - spent)) };
}

export function groupRefundOnCancel(pricing, cls, userId) {
  const paid = paidIdsOf(cls);
  const spent = euros(cls?.groupSpent);
  if (!paid.includes(userId)) return { paidIds: paid, total: spent, refund: 0 };
  const next = paid.filter((id) => id !== userId);
  const total = Math.min(spent, groupSessionPrice(pricing, next.length));
  return { paidIds: next, total, refund: euros(spent - total) };
}
