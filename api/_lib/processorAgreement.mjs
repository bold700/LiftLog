/**
 * Verwerkersovereenkomst tussen BOLD700 (verwerker, maker van VORM) en een studio
 * (verwerkingsverantwoordelijke). De beheerder van de studio leest hem in de app (Beheer →
 * Instellingen) en tekent daar; de server legt vast wie, wanneer en welke tekst.
 *
 * De tekst staat hier, met een versie. Een getekende versie wordt nooit meer gewijzigd: een nieuwe
 * tekst krijgt een nieuwe versie, en dan vraagt de app opnieuw om te tekenen. Oude versies blijven
 * in PROCESSOR_AGREEMENT_VERSIONS staan, zodat een PDF van een eerdere ondertekening altijd opnieuw
 * te maken is. De hash van de tekst gaat mee in het ondertekeningsrecord als bewijs.
 */
import { createHash } from 'node:crypto';

export const PROCESSOR = {
  legalName: 'BOLD700 B.V.',
  street: 'Zilveren Florijnlaan 7',
  postcode: '3541 HA',
  city: 'Utrecht',
  kvk: '95956840',
  email: 'support@bold700.com',
};

/** Tekst van versie 1. Elk onderdeel: een kop en alinea's; `items` is een genummerde lijst. */
const V1 = [
  {
    title: 'Waarom deze overeenkomst',
    paragraphs: [
      'Verwerker levert aan Verwerkingsverantwoordelijke de app VORM (de "Dienst"). Daarbij verwerkt Verwerker persoonsgegevens namens Verwerkingsverantwoordelijke. Deze overeenkomst legt vast hoe, zoals artikel 28 van de Algemene verordening gegevensbescherming (AVG) vraagt.',
    ],
  },
  {
    title: 'Artikel 1. Onderwerp en duur',
    items: [
      'Verwerker verwerkt alleen de persoonsgegevens, voor de doelen en zo lang als in bijlage A staat.',
      'Deze overeenkomst loopt zolang Verwerker de Dienst levert, en daarna zolang Verwerker nog persoonsgegevens van Verwerkingsverantwoordelijke heeft.',
    ],
  },
  {
    title: 'Artikel 2. Instructies',
    items: [
      'Verwerker verwerkt persoonsgegevens alleen op schriftelijke instructie van Verwerkingsverantwoordelijke. Het gebruik van de Dienst zoals bedoeld, en de instellingen die de studio daarin kiest, gelden als instructie.',
      'Vindt Verwerker een instructie in strijd met de AVG, dan meldt Verwerker dat direct.',
      'Moet Verwerker op grond van de wet gegevens verstrekken, dan meldt Verwerker dat vooraf, tenzij de wet dat verbiedt.',
    ],
  },
  {
    title: 'Artikel 3. Geheimhouding',
    paragraphs: [
      'Iedereen die namens Verwerker toegang heeft tot de persoonsgegevens, heeft een geheimhoudingsplicht en krijgt alleen toegang voor zover dat nodig is voor zijn taak.',
    ],
  },
  {
    title: 'Artikel 4. Beveiliging',
    items: [
      'Verwerker neemt de technische en organisatorische maatregelen uit bijlage C.',
      'Verwerker mag die maatregelen aanpassen, zolang het beveiligingsniveau niet lager wordt.',
    ],
  },
  {
    title: 'Artikel 5. Subverwerkers',
    items: [
      'Verwerkingsverantwoordelijke geeft toestemming voor de subverwerkers in bijlage B.',
      'Een nieuwe of andere subverwerker meldt Verwerker minstens 30 dagen vooraf. Verwerkingsverantwoordelijke mag binnen die termijn met redenen bezwaar maken. Komen partijen er niet uit, dan mag Verwerkingsverantwoordelijke de Dienst opzeggen.',
      'Verwerker legt subverwerkers minstens dezelfde verplichtingen op als in deze overeenkomst, en blijft verantwoordelijk voor hun werk.',
    ],
  },
  {
    title: 'Artikel 6. Doorgifte buiten de EER',
    paragraphs: [
      'Verwerker geeft persoonsgegevens alleen door buiten de Europese Economische Ruimte als daar passende waarborgen voor zijn: een adequaatheidsbesluit (zoals het EU-VS Data Privacy Framework) of de standaardcontractbepalingen van de Europese Commissie.',
    ],
  },
  {
    title: 'Artikel 7. Rechten van betrokkenen',
    items: [
      'Leden kunnen in de app zelf hun gegevens downloaden, hun toestemming voor gezondheidsgegevens intrekken en hun account verwijderen.',
      'Voor andere verzoeken helpt Verwerker Verwerkingsverantwoordelijke binnen redelijke termijn. Een verzoek dat bij Verwerker binnenkomt, stuurt Verwerker door.',
    ],
  },
  {
    title: 'Artikel 8. Datalekken',
    items: [
      'Verwerker meldt een inbreuk in verband met persoonsgegevens zonder onredelijke vertraging, en uiterlijk binnen 24 uur nadat Verwerker die ontdekt, aan Verwerkingsverantwoordelijke.',
      'De melding bevat wat op dat moment bekend is: wat er gebeurd is, welke gegevens en hoeveel betrokkenen het raakt, de mogelijke gevolgen en de genomen maatregelen. Verwerker vult de melding aan zodra er meer bekend is.',
      'Melden aan de Autoriteit Persoonsgegevens en aan betrokkenen doet Verwerkingsverantwoordelijke; Verwerker helpt daarbij.',
    ],
  },
  {
    title: 'Artikel 9. Hulp en controle',
    items: [
      'Verwerker helpt Verwerkingsverantwoordelijke bij een gegevensbeschermingseffectbeoordeling (DPIA) en een voorafgaande raadpleging.',
      'Verwerker geeft de informatie die nodig is om naleving van deze overeenkomst aan te tonen. Een audit mag een keer per jaar, met 30 dagen aankondiging, op kosten van Verwerkingsverantwoordelijke tenzij er een tekortkoming blijkt.',
    ],
  },
  {
    title: 'Artikel 10. Einde',
    items: [
      'Na het einde van de Dienst kan Verwerkingsverantwoordelijke binnen 30 dagen een export van de gegevens krijgen.',
      'Daarna verwijdert Verwerker de persoonsgegevens binnen 90 dagen, ook uit back-ups. Wat de wet langer laat bewaren (zoals facturen, 7 jaar), bewaart Verwerker alleen daarvoor.',
    ],
  },
  {
    title: 'Artikel 11. Aansprakelijkheid',
    paragraphs: [
      'Voor aansprakelijkheid geldt wat in de overeenkomst over de Dienst staat. Zonder zo\'n afspraak is de aansprakelijkheid van Verwerker beperkt tot het bedrag dat Verwerkingsverantwoordelijke in de 12 maanden daarvoor voor de Dienst betaalde.',
    ],
  },
  {
    title: 'Artikel 12. Slot',
    items: [
      'Op deze overeenkomst is Nederlands recht van toepassing. Geschillen gaan naar de rechter in Utrecht.',
      'Bij tegenstrijdigheid gaat deze overeenkomst voor op andere afspraken, voor zover het om persoonsgegevens gaat.',
      'Partijen sluiten deze overeenkomst elektronisch: de bevoegde vertegenwoordiger van Verwerkingsverantwoordelijke tekent in de app, en Verwerker legt naam, functie, e-mailadres, datum en tijd en de versie van deze tekst vast.',
    ],
  },
  {
    title: 'Bijlage A. Gegevens, betrokkenen, doelen en bewaren',
    paragraphs: [
      'Betrokkenen: leden (sporters), trainers en beheerders van de studio, en contactpersonen van groepen.',
      'Account en contact: naam, e-mail, telefoon, adres, profielfoto, rol en lid sinds. Doel: inloggen, contact, administratie. Bewaren: zolang het account bestaat.',
      'Lessen en administratie: boekingen, aanwezigheid, abonnement, credits en groepstegoed. Doel: lessen plannen en afrekenen. Bewaren: zolang het account bestaat.',
      'Facturen en betalingen: facturen en betaalstatus, geen bank- of kaartgegevens. Doel: facturering en wettelijke plicht. Bewaren: 7 jaar.',
      'Training en voeding: schema\'s, gelogde trainingen, records, voeding en check-ins. Doel: begeleiding door de trainer. Bewaren: zolang het account bestaat.',
      'Gezondheid (bijzondere persoonsgegevens): gewicht, lichaamssamenstelling, omtrekmaten, voortgangsfoto\'s, rusthartslag en blessures, alleen met uitdrukkelijke toestemming van het lid. Doel: voortgang volgen en veilig trainen. Bewaren: tot intrekking van de toestemming of verwijdering van het account.',
      'Persoonskenmerken: geboortedatum, geslacht en lengte. Doel: berekeningen (zoals hartslagzones) en leeftijdscheck. Bewaren: zolang het account bestaat.',
      'Na verwijderen van een account zijn de gegevens direct weg uit de database, en binnen 90 dagen uit back-ups.',
    ],
  },
  {
    title: 'Bijlage B. Subverwerkers',
    paragraphs: [
      'Google (Firebase): database, bestanden, inloggen, pushmeldingen en back-ups. EU en VS, met het EU-VS Data Privacy Framework en standaardcontractbepalingen.',
      'Vercel: hosting van de website en de serverfuncties. EU en VS, met het EU-VS Data Privacy Framework en standaardcontractbepalingen.',
      'OpenAI: AI-hulp (schema maken, foto\'s uitlezen, assistent), alleen wanneer die wordt gebruikt en alleen wat daarvoor nodig is; niet gebruikt voor training. VS, met het EU-VS Data Privacy Framework en standaardcontractbepalingen.',
      'Resend: e-mail versturen. VS, met standaardcontractbepalingen.',
      'Mollie: betalingen. Nederland.',
    ],
  },
  {
    title: 'Bijlage C. Beveiligingsmaatregelen',
    paragraphs: [
      'Alle verbindingen zijn versleuteld (HTTPS); opgeslagen gegevens worden versleuteld door Google.',
      'Toegangsregels per studio en per rol: een studio ziet nooit de leden van een andere studio. Die regels worden bij elke wijziging automatisch getest voordat ze live gaan.',
      'Gevoelige handelingen (accounts, geld, meldingen) lopen via de server, met controle van rol en studio, en met een grens op het aantal verzoeken.',
      'Dagelijkse back-up, 14 dagen bewaard.',
      'Gezondheidsgegevens alleen na uitdrukkelijke toestemming van het lid; bij intrekken worden ze verwijderd.',
      'Geen advertentie- of trackingcookies.',
      'Beheertoegang tot de productieomgeving alleen voor wie die nodig heeft, met tweestapsverificatie.',
    ],
  },
];

export const PROCESSOR_AGREEMENT_VERSIONS = { 1: V1 };
export const CURRENT_PROCESSOR_AGREEMENT_VERSION = 1;
export const PROCESSOR_AGREEMENT_TITLE = 'Verwerkersovereenkomst VORM';

export function agreementSections(version = CURRENT_PROCESSOR_AGREEMENT_VERSION) {
  return PROCESSOR_AGREEMENT_VERSIONS[version] ?? null;
}

/** SHA-256 van de tekst van een versie: bewijs welke tekst er getekend is. */
export function agreementHash(version = CURRENT_PROCESSOR_AGREEMENT_VERSION) {
  const sections = agreementSections(version);
  if (!sections) return null;
  return createHash('sha256').update(JSON.stringify(sections)).digest('hex');
}

const clean = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * Controle van wat de beheerder invult bij tekenen. Geeft `{ error }` of `{ value }`.
 * `controller` = de studio als bedrijf; `signer` = wie tekent.
 */
export function cleanSignInput(body) {
  if (Number(body?.version) !== CURRENT_PROCESSOR_AGREEMENT_VERSION) {
    return { error: 'Er is een nieuwere versie van de overeenkomst. Herlaad de pagina en lees hem opnieuw.' };
  }
  if (body?.agree !== true) return { error: 'Vink aan dat je akkoord gaat.' };
  const controller = {
    legalName: clean(body?.controller?.legalName, 120),
    street: clean(body?.controller?.street, 120),
    postcode: clean(body?.controller?.postcode, 12),
    city: clean(body?.controller?.city, 80),
    kvk: clean(body?.controller?.kvk, 20),
  };
  const signer = { name: clean(body?.signer?.name, 120), role: clean(body?.signer?.role, 80) };
  if (!controller.legalName) return { error: 'Vul de naam van het bedrijf in.' };
  if (!controller.street || !controller.postcode || !controller.city) return { error: 'Vul het adres van het bedrijf in.' };
  if (!/^\d{8}$/.test(controller.kvk)) return { error: 'Vul een KvK-nummer van 8 cijfers in.' };
  if (!signer.name) return { error: 'Vul je naam in.' };
  if (!signer.role) return { error: 'Vul je functie in.' };
  return { value: { controller, signer } };
}

/** Bestandsnaam voor de PDF, ook voor op de Drive: "2026-10-01 Verwerkersovereenkomst VORM - Van As (v1).pdf". */
export function agreementFileName(record) {
  const date = String(record.signedAt ?? '').slice(0, 10);
  const name = String(record.controller?.legalName ?? '').replace(/[\\/:*?"<>|]/g, '').trim();
  return `${date} ${PROCESSOR_AGREEMENT_TITLE} - ${name} (v${record.version}).pdf`;
}
