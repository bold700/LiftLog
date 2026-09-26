/** Hoe een oefening ging volgens de sporter: te licht, goed of te zwaar. */
export type ExerciseEffort = 'light' | 'good' | 'heavy';

export interface Exercise {
  id: string;
  name?: string; // Optioneel: kan leeg zijn voor alleen notities
  weight?: number; // Optioneel: kan leeg zijn voor alleen notities
  date: string; // ISO date string
  sets?: number;
  reps?: number;
  notes?: string; // Optionele notitie bijv. "last van mn schouder", "ging goed", "was te zwaar"
  /** Signaal van de sporter: te licht / goed / te zwaar (voor de trainer bij de volgende sessie). */
  effort?: ExerciseEffort;
  /** Alleen gezet wanneer log vanuit een schema wordt aangemaakt */
  schemaId?: string | null;
  /** Welke dag van het schema (0-based index) */
  schemaDayIndex?: number | null;
}

export interface Workout {
  id: string;
  date: string;
  exercises: Exercise[];
}

/**
 * Cloud-log per persoon per oefening (Firestore-collectie `logs`).
 * Basis voor groepsles-loggen en per-klant progressie/overload.
 */
export interface ExerciseLog {
  id: string;
  /** Studio waar deze log bij hoort. */
  orgId?: string;
  /** Voor wie de log is (de sporter/deelnemer). */
  userId: string;
  /** Wie de log invoerde: trainer-uid of de sporter zelf. */
  loggedBy: string;
  /** Trainer die de sporter beheert (voor rules/queries). */
  trainerId: string | null;
  exerciseName: string;
  exerciseId?: string | null;
  weight: number | null;
  sets: number | null;
  reps: number | null;
  notes?: string | null;
  /** Signaal van de sporter: te licht / goed / te zwaar. */
  effort?: ExerciseEffort | null;
  date: string; // ISO date-time string
  schemaId?: string | null;
  schemaDayIndex?: number | null;
  /** Koppeling aan een groepssessie (optioneel). */
  sessionId?: string | null;
  createdAt: string;
}

/**
 * Check-in na een training (Firestore-collectie `checkins`): hoe voelde het en waar moet de
 * trainer op letten. Vervangt het WhatsApp-verslagje na een thuistraining.
 */
export interface SessionCheckin {
  id: string;
  /** Studio waar deze check-in bij hoort. */
  orgId?: string;
  userId: string;
  loggedBy: string;
  trainerId: string | null;
  schemaId: string | null;
  schemaDayIndex: number | null;
  /** Label van de trainingsdag, voor weergave zonder het schema op te halen. */
  dayLabel: string | null;
  /** 1 (slecht) t/m 5 (top). */
  feeling: 1 | 2 | 3 | 4 | 5;
  note: string | null;
  /**
   * Overdracht aan de vaste trainer, geschreven door wie de training gaf. Staat los van `note`:
   * dat is wat de sporter kwijt wil, dit is wat een collega moet weten.
   */
  handover?: string | null;
  date: string; // ISO date-time string
  createdAt: string;
}

/**
 * Een groepsles-instantie: één workout-dag op een datum met de aanwezige deelnemers.
 * Firestore-collectie `sessions`.
 */
export interface GroupSession {
  id: string;
  /** Studio waar deze sessie bij hoort. */
  orgId?: string;
  trainerId: string;
  schemaId: string;
  schemaName: string;
  dayIndex: number;
  date: string; // YYYY-MM-DD
  participantIds: string[];
  createdAt: string;
  updatedAt?: string;
}

/** Log voor een hele trainingssessie (één schema-dag op een datum), met optionele notitie. */
export interface TrainingSessionLog {
  id: string;
  date: string; // YYYY-MM-DD
  schemaId: string;
  schemaDayIndex: number;
  notes?: string | null;
}

// --- Schema types (trainingsplan met meerdere dagen) ---
// Structuur volgt AALO Fitness Instructeur §5.5 Trainingsonderdelen:
// 1. Warming-up (5.5.1)  2. Neuromusculair trainen/NMT (5.5.2)  3. Cardiovasculair/CVT (5.5.3)  4. Cooling-down.
// Stretching wordt in de app als extra onderdeel na cooling-down ondersteund. NMT-parameters (sets, reps, %1RM) sluiten aan op Tabel 4 (S1–S4).

export interface SchemaExercise {
  exerciseId: string;
  exerciseName: string;
  setsTarget: number;
  repsTarget: number;
  restSeconds?: number;
  notes: string;
  /** Optioneel doelgewicht voor progressie (kg). Kan automatisch uit 1RM en % 1RM worden berekend. */
  targetWeight?: number;
  /** Intensiteit in % van 1RM (Formule 7 / Tabel 4). */
  intensityPercent1RM?: number;
  /** Optioneel: geschatte 1RM (kg). Wordt gebruikt om doelgewicht te berekenen: doelgewicht = 1RM × (% 1RM / 100). */
  estimated1RMKg?: number;
}

export interface SchemaDay {
  dayLabel: string;
  exercises: SchemaExercise[];
  /** Vrije notitie bij deze dag/week, bijv. trainingsvorm ("10x10x8", "Tabata", "AMRAP 17 min"). */
  notes?: string | null;
  /** Formule 7 – per trainingsdag (sectie 2–6). Optioneel. */
  warmup?: Formule7Warmup | null;
  cardio?: Formule7Cardio | null;
  cooldown?: Formule7Cooldown | null;
  stretching?: Formule7Stretch[] | null;
}

// --- Formule 7 routekaart types ---

export type Formule7MoverType = 'Non' | 'Low' | 'High';

export type Formule7Goal =
  | 'G'
  | 'U'
  | 'S'
  | 'GU'
  | 'GS'
  | 'US'
  | 'GUS';

export type Formule7Organisation =
  | 'FIETSEN'
  | 'LOPEN'
  | 'ROEIEN'
  | 'CROSSTRAINEN'
  | 'ANDERS';

export interface Formule7Warmup {
  organisation: Formule7Organisation | null;
  intensityPercentOfMaxHr?: number | null;
  trainingHr?: number | null;
  durationMinutes?: number | null;
}

export type Formule7StrengthGoal = 'S1' | 'S2' | 'S3' | 'S4' | 'S4.1' | 'S4.2' | 'S4.3';

export interface Formule7NeuromuscularExercise {
  /** Vrije omschrijving van de fitnessoefening. */
  name: string;
  /** Intensiteit in % van 1RM. */
  intensityPercent1RM?: number | null;
  sets?: number | null;
  reps?: number | null;
  restSeconds?: number | null;
}

export interface Formule7Neuromuscular {
  goal: Formule7StrengthGoal | null;
  trainingForm?: string;
  /** Gewenst aantal oefeningen (4, 6, 7, 8 of 9). */
  desiredExerciseCount?: 4 | 6 | 7 | 8 | 9 | null;
  exercises: Formule7NeuromuscularExercise[];
}

export interface Formule7CardioZone {
  zone: 1 | 2 | 3;
  organisation: Formule7Organisation | null;
  trainingHr?: number | null;
  durationMinutes?: number | null;
}

export interface Formule7Cardio {
  trainingMethod?: string;
  organisation: Formule7Organisation | null;
  zones: Formule7CardioZone[];
}

export type Formule7CooldownOrganisation = 'FIETSEN' | 'LOPEN';

export interface Formule7Cooldown {
  organisation: Formule7CooldownOrganisation | null;
  intensityPercentOfMaxHr?: number | null;
  trainingHr?: number | null;
  durationMinutes?: number | null;
}

export interface Formule7Stretch {
  muscleGroup: string;
  stretchDurationSeconds?: number | null;
  repetitions?: number | null;
}

/** Weekschema: Total body (1–3×/week) of Split (4+×/week). */
export type Formule7WeekschemaType = 'TOTAL_BODY' | 'SPLIT';

/** Bij Total body met 2 of 3 dagen: welke versie van de week (A/B/C). */
export type Formule7TotalBodyVersion = 'A' | 'B' | 'C';

/** Bij Split: variant Upper/Lower of Upper/Lower met A/B-varianten per dag. */
export type Formule7SplitVariant = 'UPPER_LOWER' | 'UPPER_LOWER_AB';

export interface Formule7Routekaart {
  clientName: string;
  casus: string;
  gender: 'M' | 'V' | null;
  ageYears?: number | null;
  moverType: Formule7MoverType | null;
  goal: Formule7Goal | null;
  sessionsPerWeek?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | null;
  sessionDurationCategory?: '<30' | '30-60' | '>60' | null;
  restingHr?: number | null;
  theoreticalMaxHr?: number | null;
  /** Afgeleid uit frequentie: 1–3 → Total body, 4+ → Split. Opgeslagen voor weergave/export. */
  weekschemaType?: Formule7WeekschemaType | null;
  /** Bij Total body met 2 of 3 sessies: versie A, B of C van dit schema. */
  totalBodyVersion?: Formule7TotalBodyVersion | null;
  /** Bij Split: welk type split. */
  splitVariant?: Formule7SplitVariant | null;
  warmup: Formule7Warmup;
  neuromuscular: Formule7Neuromuscular;
  cardio: Formule7Cardio;
  cooldown: Formule7Cooldown;
  stretching: Formule7Stretch[];
  notes: string;
}

/** Lichaamsdeel waarop een sporter een bijzonderheid (blessure, pijntje) heeft. */
export type LimitationArea =
  | 'schouder'
  | 'nek'
  | 'elleboog'
  | 'pols'
  | 'onderrug'
  | 'bovenrug'
  | 'borst'
  | 'buik'
  | 'heup'
  | 'knie'
  | 'hamstring'
  | 'enkel'
  | 'overig';

/**
 * Bijzonderheid van een sporter: waar het zit, hoe streng ("let op" of "vermijden"), een toelichting
 * en wat die sporter in plaats daarvan doet. De app waarschuwt bij oefeningen die dat gebied belasten.
 */
export interface Limitation {
  id: string;
  area: LimitationArea;
  severity: 'let-op' | 'vermijden';
  note?: string | null;
  /** Wat deze sporter in plaats daarvan doet, bijv. "geen pressen boven schouderhoogte, floor press". */
  alternative?: string | null;
  createdAt: string;
}

// --- Profiel (sporter / trainer / beheerder) ---
export type ProfileRole = 'sporter' | 'trainer' | 'admin';

/** Zichtbaarheid op de gedeelde ranglijst (alleen geaggregeerde totalen worden gedeeld). */
export type LeaderboardVisibility = 'hidden' | 'anonymous' | 'named';

/** Dagelijks voedingsdoel (kcal + macro's in gram). */
export interface NutritionGoal {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

/**
 * Een studio (organisatie). Alle gegevens van een studio zijn strikt gescheiden van andere studio's:
 * elk document draagt een `orgId` en de Firestore-regels dwingen af dat je alleen je eigen studio ziet.
 */
/** Instelling "inactieve accounts verwijderen" van een studio. */
export interface OrgAccountRetention {
  enabled: boolean;
  /** Na zoveel maanden zonder inloggen (3 tot 120). */
  months: number;
}

export interface Org {
  id: string;
  /** Weergavenaam, bijv. "Van As Personal Training". */
  name: string;
  /** Uid van de eigenaar (rol `admin` binnen deze studio). */
  ownerId: string | null;
  /**
   * True wanneer iemand zich zelf mag registreren en dan in deze studio terechtkomt.
   * Staat dit uit, dan kunnen accounts alleen door een beheerder worden aangemaakt.
   */
  allowSelfSignup: boolean;
  /** Eigen uiterlijk van de studio. Ontbreekt dit, dan ziet de studio er uit als VORM zelf. */
  branding?: OrgBranding | null;
  /** Bedrijfsgegevens voor op de factuur (Beheer → Facturatie). Ontbreekt dit, dan staat alleen de naam op de factuur. */
  business?: OrgBusiness | null;
  /**
   * Status van de betaalkoppeling (Beheer → Facturatie → Betalingen). Nooit de sleutels zelf: die
   * staan los in `orgSecrets/{orgId}`, ongelezen door de client. Alleen wat een beheerder mag
   * zien: welke modus actief is en, per modus, de laatste vier tekens en wanneer gekoppeld.
   */
  payments: OrgPaymentsStatus;
  /** Wanneer afmelden nog gratis is (Beheer → Instellingen). Ontbreekt dit, dan geldt het standaard aantal uur van de server. */
  bookingPolicy?: OrgBookingPolicy | null;
  /**
   * Accounts die lang niet zijn gebruikt automatisch verwijderen (Beheer → Instellingen). Alleen de
   * eigenaar zet dit aan; de dagelijkse ronde op de server doet de rest (api/_lib/accountRetention.mjs).
   */
  accountRetention?: OrgAccountRetention | null;
  /**
   * Mag een trainer binnen deze studio de workouts/schema's van andermans cliënten zien, niet
   * alleen de eigen? Standaard uit: elke trainer ziet dan alleen zijn eigen cliënten. Nodig voor
   * bijv. een dienst-overdracht (shift handover), waarbij een overnemende trainer tijdelijk het
   * schema van een collega's cliënt moet kunnen inzien — een bewuste, organisatiebrede keuze van
   * de beheerder, geen per-overdracht uitzondering.
   */
  staffFullClientAccess: boolean;
  /**
   * Beheerde lijst van ruimtenamen (Beheer → Lessoorten), zodat een lessoort of losse les een
   * ruimte kiest in plaats van vrij te typen. Voorkomt dat "Boven" en "boven" als twee losse
   * ruimtes eindigen door een typfout. Leeg = nog niets aangemaakt.
   */
  rooms: string[];
  /**
   * Automatische meldingen aan of uit (Beheer → Meldingen). Standaard staat alles aan: alleen een
   * expliciete `false` zet een soort uit. De server leest dit voordat hij iets verstuurt.
   */
  notifications: OrgNotificationSettings;
  createdAt: string;
  updatedAt: string;
}

/** Soorten automatische meldingen; zelfde lijst als NOTIFICATION_KINDS in api/_lib/notifications.mjs. */
export type NotificationKind =
  | 'workout'
  | 'checkin'
  | 'classReminder'
  | 'classCancelled'
  | 'waitlistPromoted'
  | 'creditsLow'
  | 'weeklyCheckin'
  | 'inactive'
  | 'birthday';

export type OrgNotificationSettings = Partial<Record<NotificationKind, boolean>>;

/** Naar wie een bericht van de studio gaat. `label` is alleen voor de geschiedenis ("HIIT za 26 sep"). */
export interface BroadcastAudience {
  type: 'member' | 'class' | 'classType' | 'all';
  id: string | null;
  label: string;
}

/** Een bericht dat een trainer of beheerder aan leden stuurt (Beheer → Meldingen). */
export interface Broadcast {
  id: string;
  orgId: string;
  title: string;
  body: string;
  audience: BroadcastAudience;
  /** YYYY-MM-DD: gaat die avond mee met de avondronde. Null = meteen verstuurd. */
  scheduledFor: string | null;
  status: 'scheduled' | 'sending' | 'sent' | 'cancelled';
  createdBy: string;
  createdByName: string;
  createdAt: string;
  sentAt: string | null;
  /** Aantal mensen dat het bericht kreeg (met minstens één apparaat), en het aantal apparaten. */
  recipients: number | null;
  devices: number | null;
}

/**
 * Huisstijl van een studio. VORM is het platform, maar een studio wil dat de app van hén lijkt:
 * eigen naam en logo in de balk, en eigen kleuren. De kleuren komen uit één merkkleur (het
 * Material 3-schema wordt daaruit afgeleid, zoals de Material Theme Builder doet) of uit een
 * geplakte Theme Builder-export voor wie precies wil sturen.
 */
/**
 * Bedrijfsgegevens van de studio, zoals ze op elke factuur en in de factuurmail staan. Een Nederlandse
 * factuur moet naam, adres, KvK- en btw-nummer dragen; de rest is service voor het lid. De nummering
 * loopt per studio door zonder gaten: de server kent bij elke nieuwe post het volgende nummer toe.
 */
/**
 * Elk bedrijf koppelt zijn eigen Mollie-account: het geld gaat rechtstreeks naar hun rekening,
 * dus dit is geen omgevingsvariabele van het platform (zoals Resend) maar een instelling per
 * studio. De sleutels zelf staan nooit op dit object; alleen het zichtbare restje.
 */
export interface OrgPaymentsStatus {
  provider: 'mollie';
  /** Welke sleutel een nieuwe betaallink gebruikt zodra die functie gebouwd is. */
  mode: 'test' | 'live';
  testKeyLast4: string | null;
  liveKeyLast4: string | null;
  testConnectedAt: string | null;
  liveConnectedAt: string | null;
  /** Naam van de Mollie-organisatie die de sleutel opleverde, ter herkenning ("Verbonden met …"). */
  testOrganizationName: string | null;
  liveOrganizationName: string | null;
}

export interface OrgBusiness {
  legalName: string;
  street: string;
  postcode: string;
  city: string;
  kvk: string;
  vatNumber: string;
  iban: string;
  invoiceEmail: string;
  phone: string;
  /** Voorvoegsel van het factuurnummer, bijv. "VAS-2026-". */
  invoicePrefix: string;
  /** Eerstvolgende volgnummer (1 = "0001"). */
  nextInvoiceNumber: number;
}

export interface OrgBranding {
  /** Download-URL van het logo in Storage (orgLogos/{orgId}). */
  logoUrl?: string | null;
  /** Drukversie van het logo als PNG (orgLogos/print/{orgId}), voor facturen en mail. Ook bij een SVG-logo. */
  logoPrintUrl?: string | null;
  /**
   * Eigen logo voor de donkere modus (orgLogos/dark/{orgId}). Zonder maakt de app er zelf een:
   * donkere delen van het gewone logo worden licht (components/BrandLogo).
   */
  logoDarkUrl?: string | null;
  /** Merkkleur als hex, bijv. "#4E6543". Daaruit wordt het hele schema afgeleid. */
  seedColor?: string | null;
  /** Volledig licht schema uit de Material Theme Builder (schemes.light). Gaat vóór seedColor. */
  lightScheme?: Record<string, string> | null;
}

export interface Profile {
  userId: string;
  /** Thuisstudio: waar dit account is aangemaakt en standaard mee begint. */
  orgId: string;
  /**
   * Alle studio's waar dit account lid van is. Bevat altijd `orgId`.
   * Een sporter zit doorgaans bij één studio; een trainer kan bij meerdere werken en wisselt
   * daartussen in de app. Documenten horen altijd bij precies één studio.
   */
  orgIds: string[];
  role: ProfileRole;
  email: string | null;
  displayName: string | null;
  /** Profielfoto (download-URL uit Firebase Storage). */
  photoURL?: string | null;
  /** Dagelijks voedingsdoel (optioneel). */
  nutritionGoal?: NutritionGoal | null;
  /** Doelgewicht in kg (optioneel). */
  weightGoalKg?: number | null;
  /** Lengte in cm (voor o.a. AI-routekaart). */
  heightCm?: number | null;
  /** Geboortedatum (YYYY-MM-DD) om leeftijd te berekenen. */
  birthDate?: string | null;
  /** Geslacht. */
  gender?: 'man' | 'vrouw' | 'anders' | null;
  /** Rusthartslag in bpm. */
  restingHrBpm?: number | null;
  /** Blessures en pijntjes; zichtbaar voor de trainer bij het inplannen en tijdens de les. */
  limitations?: Limitation[];
  /** Alleen bij sporters: uid van de trainer die hen beheert. */
  trainerId: string | null;
  /** True als deze gebruiker als trainer wil en op goedkeuring wacht. */
  trainerRequested?: boolean;
  /** True als het account door een beheerder is aangemaakt (slaat e-mailverificatie over). */
  createdByAdmin?: boolean;
  /**
   * Ranglijst: standaard `named` (profielnaam). `anonymous` = alleen “Anoniem”. `hidden` = uit.
   */
  leaderboardVisibility?: LeaderboardVisibility;
  /** Taal van de app voor dit account; ontbreekt hij, dan beslist de browser. */
  language?: 'nl' | 'en' | null;
  /**
   * Toestemming voor gezondheidsgegevens (AVG art. 9): alleen de persoon zelf zet dit, via de
   * toestemmingsvraag of Profiel → Account. Ontbreekt het, dan is er nog niets gevraagd.
   */
  healthConsent?: HealthConsent | null;
  createdAt: string;
  updatedAt: string;
}

export interface HealthConsent {
  given: boolean;
  /** ISO-tijdstip van de keuze. */
  at: string;
  /** Versie van de toestemmingstekst waarop de keuze is gemaakt. */
  version: number;
}

/**
 * Voor wie een workout bedoeld is (bepaald bij aanmaken):
 * - single: één klant (clientId)
 * - multiple: meerdere klanten (participantIds)
 * - open: beschikbaar voor iedereen
 * - group: groepsles met vaste deelnemers (participantIds) → per-account loggen
 */
/**
 * Lessoort: de vaste vorm van een les (Small group strength, Personal training, …). Een les op het
 * rooster kiest een lessoort en neemt duur, plekken, credits en trainer over. Beheer → Lessoorten.
 */
/** Eén vast weekmoment waarop een lessoort terugkeert, bijv. "elke donderdag 19:00–20:00". */
export interface ClassScheduleSlot {
  /** 0 = zondag .. 6 = zaterdag (zoals JS Date#getDay()). */
  weekday: number;
  /** HH:MM */
  startTime: string;
  /** HH:MM */
  endTime: string;
}

/** Vorm van een sessie, voor de legenda en kleurcodering op het rooster (Figma "05 · Schedule"). */
export type SessionKind = '1on1' | 'duo' | 'group' | 'concept';

export interface ClassType {
  id: string;
  orgId: string;
  name: string;
  /** Maximum aantal deelnemers; null = geen limiet (open gym). */
  capacity: number | null;
  /** Wat een les van deze soort kost; 0 = gratis. */
  creditCost: number;
  /** Vaste trainer; null = elke trainer. Verplicht zodra er een `schedule` is: de achtergrondtaak
   *  die lessen aanmaakt heeft geen mens die op dat moment een trainer kiest. */
  defaultTrainerId: string | null;
  /** Gekoppeld schema (workout) dat bij deze lessoort hoort. */
  schemaId: string | null;
  /** Vaste weekmomenten waarop deze lessoort automatisch op het rooster komt; leeg = alleen handmatig. */
  schedule: ClassScheduleSlot[];
  /** Waar dit normaal plaatsvindt; null = geen vaste ruimte. Vrije tekst, geen aparte lijst. */
  room: string | null;
  /** 1-op-1, Duo PT, Groep of Concept — voor de legenda/kleur op het rooster. */
  sessionKind: SessionKind;
  /** Korte omschrijving voor de sporter, getoond in de boekingsdialoog; null = geen omschrijving. */
  description: string | null;
  /**
   * Vast PT-moment van één lid (userId), aangemaakt via Profiel → Vaste lessen → PT-moment. Zo'n
   * privé-lessoort staat niet in Beheer → Lessoorten en is alleen voor dat lid te boeken; null =
   * een gewone lessoort.
   */
  privateFor: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Uitkomst van de laatste keer dat de cron een wekelijkse inschrijving probeerde te boeken. */
export type StandingBookingOutcome = 'booked' | 'skippedFull' | 'skippedNoCredits';

/**
 * Wekelijkse inschrijving van een sporter op een vast weekmoment van een lessoort ("elke week
 * inschrijven"): de cron die lessen genereert (api/booking.mjs) boekt deze automatisch mee zodra
 * de les van die week op het rooster komt. Firestore-collectie `standingBookings`; alleen de
 * server schrijft (zie de rules), de sporter zet 'm zelf aan/uit via de `setStandingBooking`-actie.
 */
export interface StandingBooking {
  id: string;
  orgId: string;
  userId: string;
  classTypeId: string;
  /** 0 = zondag .. 6 = zaterdag, zoals ClassScheduleSlot. */
  weekday: number;
  /** HH:MM, hoort bij een ClassScheduleSlot van de lessoort. */
  startTime: string;
  /** Uit: blijft bestaan (voor de geschiedenis), maar de cron slaat 'm over. */
  active: boolean;
  /** Vanaf deze datum (YYYY-MM-DD); null = meteen. */
  startDate: string | null;
  /** Pauze (vakantie): van t/m; `pausedUntil` null = tot opheffen. Geen pauze: beide null. */
  pausedFrom: string | null;
  pausedUntil: string | null;
  /** Wat er gebeurde bij de laatst gegenereerde les van dit weekmoment; null als het nog niet is geprobeerd. */
  lastOutcome: StandingBookingOutcome | null;
  /** Datum (YYYY-MM-DD) van die laatste poging. */
  lastOutcomeDate: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Boekingsbeleid van de studio (Beheer → Instellingen): wanneer afmelden nog gratis is. */
export interface OrgBookingPolicy {
  /** Aantal uur voor aanvang tot waar afmelden geen credit kost; erna wel. */
  freeCancelHours: number;
}

/** Abonnement (Beheer → Abonnementen): wat een lid krijgt en wat het kost. */
export interface Plan {
  id: string;
  orgId: string;
  name: string;
  /** Prijs in euro's. */
  price: number;
  /** Per week, per 4 weken, per maand, of eenmalig (strippenkaart, proefles). */
  period: 'week' | 'fourWeeks' | 'month' | 'once';
  /** Credits per periode; null = onbeperkt. */
  credits: number | null;
  /** Alleen bij eenmalig: hoeveel maanden de kaart geldig is; null = onbeperkt geldig. */
  validityMonths: number | null;
  /** Wat er met ongebruikte credits gebeurt bij een verlenging. */
  rollover: 'expire' | 'carry';
  availableTo: 'all' | 'invite';
  status: 'active' | 'paused';
  /** Btw-percentage dat in de prijs zit (0, 9 of 21). Sport en fitness vallen doorgaans onder 9. */
  vatRate: VatRate;
  createdAt: string;
  updatedAt: string;
}

export type VatRate = 0 | 9 | 21;
export const VAT_RATES: readonly VatRate[] = [0, 9, 21];
/** Standaardtarief voor een nieuw plan: gelegenheid geven tot sportbeoefening valt onder het lage tarief. */
export const DEFAULT_VAT_RATE: VatRate = 9;

/** Lidmaatschap: dit lid heeft dit abonnement. Alleen de server schrijft ze. */
export interface Membership {
  id: string;
  orgId: string;
  userId: string;
  planId: string;
  planName: string;
  status: 'active' | 'cancelled' | 'expired';
  startedAt: string;
  nextRenewalAt: string | null;
  expiresAt: string | null;
  lastRenewedAt: string | null;
}

/** Post (Beheer → Facturatie): wat een lid verschuldigd is voor een periode van zijn abonnement. */
export interface Charge {
  id: string;
  orgId: string;
  userId: string;
  membershipId: string;
  planId: string;
  planName: string;
  description: string;
  amount: number;
  /** "2026-09" bij een maandplan; null bij een eenmalige kaart. */
  period: string | null;
  issuedAt: string;
  dueAt: string;
  status: 'open' | 'paid' | 'void';
  paidAt: string | null;
  note: string;
  /** Btw-percentage dat in het bedrag zit, overgenomen van het plan op het moment van aanmaken. */
  vatRate: VatRate;
  /** Factuurnummer, bijv. "VAS-2026-0142". Krijgt elke betaalde post bij het aanmaken; oudere posten bij de eerste download. */
  invoiceNumber: string | null;
  /** Wanneer het factuurnummer is toegekend: de factuurdatum. */
  invoiceIssuedAt: string | null;
  /** Laatste keer dat de factuur per mail is verstuurd, en aan welk adres. */
  invoiceSentAt: string | null;
  invoiceSentTo: string | null;
  /** Alleen bij een zelf-aankoop via Mollie: het betaal-id, ter herkenning in Beheer. */
  molliePaymentId?: string | null;
}

export type SchemaAudience = 'single' | 'multiple' | 'open' | 'group';

export interface Schema {
  id: string;
  name: string;
  /** Studio waar dit schema bij hoort. */
  orgId?: string;
  trainerId: string;
  clientId: string | null;
  /** Type/doelgroep van de workout. Ontbreekt = legacy 'single'. */
  audience?: SchemaAudience;
  /** Toegewezen accounts bij 'multiple' en de deelnemers bij 'group'. */
  participantIds?: string[];
  /** Categorie (tab in Workouts), bijv. "Groepslessen". Leeg = gewone workout. */
  category?: string | null;
  /** Reeks binnen een categorie, bijv. het lesmoment ("Woensdag ochtend") bij groepslessen. */
  series?: string | null;
  /** Volgorde van de reeks binnen de categorie (0 = maandag … 6 = zondag). Voor sortering van de filterchips. */
  seriesOrder?: number | null;
  /**
   * Week in een halfjaarschema (1–26). Volgt het ISO-weeknummer van de kalender en herhaalt zich
   * vanaf week 27: ISO-week 27 is weer schemaweek 1. Zo hoort er geen startdatum bij het schema.
   */
  scheduleWeek?: number | null;
  createdAt: string; // ISO date string
  days: SchemaDay[];
  /** Start van de schema-periode (YYYY-MM-DD). Optioneel. */
  startDate?: string | null;
  /** Einde van de schema-periode (YYYY-MM-DD). Optioneel. */
  endDate?: string | null;
  /** Optioneel: Formule 7 routekaart gegevens gekoppeld aan dit schema. */
  formule7?: Formule7Routekaart | null;
  /** Flag om snel te zien of dit schema met het Formule 7 template is opgezet. */
  isFormule7Template?: boolean;
  /**
   * Alleen bij Formule 7: handmatige routekaart (geen AI-blok) of AI-begeleide flow (stappen + genereren).
   * Ontbreekt: legacy-gedrag (AI-blok zichtbaar zoals vóór deze optie).
   */
  formule7AssistMode?: 'manual' | 'ai';
}

