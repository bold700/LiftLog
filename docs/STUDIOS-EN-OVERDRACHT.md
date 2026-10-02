# Studio's, uitrollen en overdracht

Dit document beschrijft twee dingen die bij elkaar horen: hoe VORM meerdere studio's gescheiden
houdt, en wat iemand anders moet weten om de boel draaiend te houden als Kenny er een week niet is.

Het tweede is geen bijzaak. Het hele argument tegenover Virtuagym is "onze data is van onszelf", en
dat is pas waar als er meer dan één persoon bij kan.

---

## 1. Hoe studio's gescheiden zijn

Elke studio is een **organisatie** met een eigen `orgId`. Elk document in Firestore draagt dat veld,
en de scheiding wordt op drie plekken afgedwongen:

| Laag | Waar | Wat het doet |
|------|------|--------------|
| Firestore-regels | `firestore.rules` | Weigert elk lezen en schrijven buiten je eigen studio |
| App | `src/services/orgContext.ts` | Houdt de actieve studio vast; queries filteren erop, schrijfacties stempelen hem mee |
| AI-koppeling | `api/_lib/liftlogData.mjs` | Draait op de Admin SDK en omzeilt de regels, dus staat de grens daar in code |

De standaardstudio heet **`vanas`**. Die waarde staat op drie plekken en moet gelijk blijven:

- `DEFAULT_ORG_ID` in `src/services/orgContext.ts`
- `DEFAULT_ORG_ID` in `api/_lib/liftlogData.mjs`
- `defaultOrg()` in `firestore.rules`

Alle drie zijn bewust een vaste waarde en geen omgevingsvariabele: de Firestore-regels kunnen niet
meebewegen met een env-var, en dan zouden app en regels documenten zonder `orgId` bij verschillende
studio's indelen.

Documenten zonder `orgId` (van vóór de migratie) worden gelezen als de standaardstudio. Dat is een
vangnet, geen vervanging voor de migratie: **queries filteren op de exacte waarde**, dus zonder
migratie is oude data onzichtbaar in de app.

### Rollen binnen een studio

`sporter`, `trainer` en `admin` gelden **binnen** één studio. Een `admin` is de eigenaar van díe
studio, niet van het hele systeem. Er is bewust geen rol die over studio's heen kijkt: wie voor
ondersteuning bij data van een andere studio moet, gebruikt de Admin SDK op de server. Dat is
zichtbaar, opzettelijk en niet per ongeluk aan te zetten vanuit de app.

`orgId` en `platformAdmin` kunnen nooit vanuit de client worden gezet — ook niet door een beheerder.

### Eigenaar

Elke studio heeft precies één **eigenaar** (`orgs/{orgId}.ownerId`). Die tekent namens de studio
(de verwerkersovereenkomst met BOLD700), is het aanspreekpunt voor BOLD700 en krijgt de rekening.
Andere beheerders beheren mee maar tekenen niet. In Beheer → Leden staat de eigenaar als "Eigenaar".

- Aanwijzen en overdragen: Beheer → Instellingen → Eigenaar van de studio. Dat mag de huidige
  eigenaar, support van BOLD700, en zolang er nog geen eigenaar is elke beheerder. Het loopt via de
  server (`api/admin-account.mjs`, actie `setOwner`); de Firestore-regels weigeren `ownerId` vanuit
  de app.
- De eigenaar moet beheerder van de studio zijn, en blijft dat: terugzetten naar trainer of
  verwijderen kan pas na overdragen.
- Support van BOLD700 (een account op `@bold700.com`) staat in de ledenlijst als
  "Support · BOLD700" en kan nooit eigenaar worden: BOLD700 kan niet aan beide kanten van de
  verwerkersovereenkomst tekenen.

BOLD700 factureert de studio's (nog) handmatig, buiten de app, aan de eigenaar.

---

## 2. Een nieuwe studio aansluiten

Er is nog geen scherm voor. Voorlopig via het script:

```bash
FIREBASE_SERVICE_ACCOUNT="$(cat service-account.json)" \
  node scripts/migrate-orgs.mjs --org studionaam --name "Studio Naam" \
  --owner-email eigenaar@studio.nl --no-self-signup --apply
```

Daarna zet je de eigenaar handmatig op `role: admin` met `orgId: studionaam` in Firestore.

**`allowSelfSignup`** bepaalt of iemand zich zelf mag registreren in die studio. Staat het uit, dan
kunnen accounts alleen door de beheerder van die studio worden aangemaakt. Voor een nieuwe klant is
uit de veilige stand.

### Iemand bij een tweede studio halen

Een freelance trainer kan bij meerdere studio's werken. Lidmaatschap staat als `orgIds` op het
profiel en is bewust **niet** vanuit de app te wijzigen — anders kon iemand zichzelf bij een studio
naar keuze inschrijven. Toevoegen doe je met het script:

```bash
FIREBASE_SERVICE_ACCOUNT="$(cat service-account.json)" \
  node scripts/migrate-orgs.mjs --add-member trainer@voorbeeld.nl --org studionaam --apply
```

`--remove-member` haalt iemand er weer uit; de thuisstudio blijft altijd staan. In de app verschijnt
bovenin een wisselaar zodra iemand bij meer dan één studio hoort.

---

## 3. Credits en lesreservering

Sporters reserveren lessen met credits. De trainer kent ze toe (Lessen → Credits toekennen); elke
mutatie komt in `creditLedger` te staan, zodat later te herleiden is waar een saldo vandaan komt.

**Waarom dit via de server loopt.** Reserveren moet drie dingen tegelijk doen: kijken of er plek is,
een credit afschrijven en de reservering vastleggen. Firestore-regels kunnen niet tellen en niet
meerdere documenten samen bewaken. Zonder transactie zouden twee mensen op hetzelfde moment de
laatste plek pakken, of zou iemand kunnen reserveren zonder saldo. Daarom kan de app zelf níets
schrijven in `bookings`, `creditAccounts` en `creditLedger` — alleen `api/booking.mjs` doet dat.

Ook de tellers `bookedCount` en `waitlistCount` op een les zijn afgeschermd: kon een trainer die
zelf zetten, dan klopt de capaciteit niet meer.

**Regels van het huis, in code vastgelegd:**

- Zit een les vol, dan kom je op de wachtlijst. Daar gaat nog geen credit af.
- Meldt iemand zich af, dan schuift de eerste van de wachtlijst door en betaalt op dat moment.
  Heeft die geen saldo, dan komt de plek gewoon vrij en blijft de wachtlijst staan.
- Tot **12 uur** voor aanvang afmelden geeft de credit terug; daarna niet (ook niet bij niet
  komen opdagen). De eigenaar zet die termijn per studio in Beheer → Instellingen (bijv. 24 uur).
  Wordt de les afgelast, dan altijd terug.
- Een sporter meldt alleen zichzelf af; een trainer mag dat ook voor een ander doen.

De annuleertermijn staat als `FREE_CANCEL_HOURS` in `api/booking.mjs`.

---

### Abonnement en vaste momenten (Moment inplannen)

Elk abonnement heeft "Geldt voor" (personal training, groepslessen of alle lessen) en "Keer per week"
(Beheer → Abonnementen; staat het er niet op, dan leidt de app het af uit naam en credits, zie
`api/_lib/planCoverage.mjs`). Bij een lid staat één knop **Moment inplannen** (Profiel →
Abonnement voor de sporter, Beheer → lid voor staf). Het werkt zoals een afspraak in Google Agenda:
**Datum · Tijd · Herhaling**, waarbij Herhaling "Niet herhaald" (één losse afspraak),
"Elke week op …" of "Om de week op …" (vast moment) is. Is het abonnement vol of is er geen
abonnement, dan staat het standaard op "Niet herhaald"; past er nog maar een halve keer in, dan op
"Om de week".

**Om de week** (`everyWeeks: 2`): het moment valt in de even of de oneven weken (`weekParity`),
geteld vanaf maandag 5 januari 1970; welke van de twee volgt uit de gekozen datum (de eerste keer).
De app toont "Op do 1 okt, do 15 okt, do 29 okt enzovoort". Rekenkant:
`api/_lib/classSchedule.mjs` (`weekIndex`, `onPatternWeek`, `shareWeeks`, `patternFields`), voor de
app `src/utils/weekPattern.ts`.

- Een vast PT-moment of vaste groepsles (groep) om de week: het weekmoment van de privé-lessoort
  draagt het patroon, dus het rooster krijgt alleen lessen in die weken.
- Een vaste les op een gewone groepsles om de week: de les staat elke week op het rooster, het lid
  wordt alleen in zijn eigen weken ingeschreven. Is de groepsles zelf om de week, dan volgt de vaste
  les die weken.
- Botsingen en vrije tijden: twee momenten om de week in verschillende weken botsen niet. Zo kunnen
  twee leden om de week hetzelfde tijdstip bij dezelfde trainer delen.
- Abonnement: om de week telt als een halve keer per week (2x per week = bijv. 1x elke week en
  2x om de week).
- Van elke week naar om de week (zelfde dag en tijd opnieuw vastzetten, of Reeks wijzigen): de
  afspraken in de weken die vervallen worden afgemeld met de credit terug.

- **PT**: alleen vrije tijden bij de trainer, binnen zijn beschikbaarheid en zonder botsing met zijn
  andere lessen; "sluit aan" = direct voor of na een andere les. Geen lessoort kiezen: het wordt
  "Personal Training", 1-op-1, 1 credit. Staf plant meteen in; een sporter vraagt aan en de
  trainer keurt goed in Beheer → Leden (zelfde lijst als verzetten).
  - Niet herhaald: een losse afspraak tot vier weken vooruit (`singlePtOptions`, `bookSinglePt`;
    verzoek met `kind: 'single'`). De credit gaat eraf zodra hij vaststaat.
  - Elke week of om de week: een vast PT-moment vanaf de gekozen datum.
- **Groepsles**: een les uit het rooster op die dag. Niet herhaald = gewoon inschrijven (of
  wachtlijst als hij vol zit); elke week of om de week = vaste groepsles op dat weekmoment.
- Op een dag zonder plek toont de app de eerstvolgende dagen waarop het wel kan.
- **Vanuit het rooster (staf)**: in Lessen → Week op een leeg vak klikken opent "Nieuwe afspraak"
  met die dag en tijd (per half uur) al ingevuld; je kiest het lid, de trainer staat op jezelf en
  Herhaling op "Niet herhaald". Is de trainer op die tijd niet vrij, dan staat de dichtstbijzijnde
  vrije tijd klaar. In de Dag-weergave doet de knop **Afspraak** hetzelfde.
- Onder de vaste lessen staan de **losse afspraken** van het lid (ook verzette lessen en losse
  groepslessen), met Afmelden en voor staf Verzetten.
- Een sporter plant niet meer vaste momenten in dan zijn abonnement toestaat (soort en keer per
  week; de server controleert dat). Een losse afspraak kan altijd; die kost een credit. Staf krijgt
  een waarschuwing en beslist zelf.
- Abonnement toewijzen: na Opslaan komen de credits van de eerste periode er meteen bij, met de
  eerste factuur. Het ledenscherm zegt dat vooraf.

### Factuurritme (eigenaar)

Beheer → Instellingen → **Factuurritme**, alleen de eigenaar (Firestore-regels, veld
`orgs/{orgId}.billing = { period: 'fourWeeks' | 'month', anchorDate }`):

- **Per lid** (standaard): de periode loopt vanaf de dag dat het lid begint, hele prijs.
- **Iedereen elke 4 weken / elke maand** vanaf een startdatum: alle abonnementen met die periode
  verlengen op dezelfde factuurdatum. Wie halverwege instapt, krijgt een eerste factuur én credits
  naar rato van de dagen tot de eerstvolgende factuurdatum (`api/_lib/billingCycle.mjs`,
  `firstPeriod`), bijv. "2x per week" voor € 80 met nog 14 van de 28 dagen: € 40 en 4 credits.
  Daarna gewone periodes. Geldt bij toewijzen door staf (`assign`) en bij zelf kopen via Mollie
  (`purchasePlan`; het bedrag op maat wordt bij de betaling vastgelegd).
- Strippenkaarten, weekabonnementen en groepsabonnementen volgen het ritme niet.
- Het ledenscherm toont vooraf wat Opslaan doet ("eerste factuur € 40 (14 van de 28 dagen, tot de
  factuurdatum 2 november)").

### Ingangsdatum van een abonnement

Bij het toewijzen (Beheer → lid → Abonnement) staat **Gaat in op**. Vandaag = meteen, zoals altijd.
Een latere datum plant het abonnement alleen (`memberships` met `status: 'scheduled'`,
`startsOn`): tot die dag geen factuur en geen credits uit dit abonnement, en een lopend
abonnement loopt door. Op de ingangsdatum start de server het (`startScheduledMemberships`, bij
boeken, bij het openen van Beheer en in de avondronde): het oude abonnement stopt, de eerste
factuur (volgens het factuurritme, naar rato vanaf de ingangsdatum) en de credits komen erbij.
Het ledenscherm toont "Gepland: … gaat in op …" met **Annuleren**; een nieuwe keuze vervangt de
planning. Wil je vóór de ingangsdatum al inplannen, geef dan zelf credits (geen factuur).

### Betalen via Mollie: betaallink en automatisch afschrijven

Advies aan studio's: laat alles via Mollie lopen. Credits toekennen en zelf factureren (overmaken,
op betaald zetten in Facturatie) blijft kunnen als tijdelijke oplossing.

- **Betaallink per factuur.** Heeft de studio een Mollie-sleutel (Beheer → Facturatie → Betalingen),
  dan heeft elke open factuur een vaste betaallink `/b/{code}` (zelfde code als de factuurlink
  `/f/{code}`). Die staat in de factuurmail (knop "Direct betalen via iDEAL"), in de WhatsApp-tekst
  en bij Facturatie; het lid ziet bij Profiel → Facturen een knop **Betalen**. Elke klik maakt een
  verse Mollie-betaling (10 minuten hergebruikt), zodat een link nooit verloopt. Na betalen zet de
  webhook de factuur op betaald (`paidBy: 'mollie'`) en mailt de betaalde factuur.
- **Automatisch afschrijven** (schakelaar bij Betalingen, `orgs.payments.autoCollect`; eerst testen
  in de testmodus): bij een terugkerend abonnement is de eerste betaling (zelf kopen, of de
  betaallink van de eerste factuur) er een met machtiging (`sequenceType: 'first'`). Klant en
  machtiging per lid staan in `mollieCustomers/{orgId}__{userId}` (alleen de server; apart voor test
  en live). De avondronde (`eveningRun` → `runAutoCollect`) werkt dan per studio de verlengingen
  bij en schrijft elke open, vervallen factuur van een lid met machtiging af
  (`sequenceType: 'recurring'`). Facturatie toont "Incasso loopt" en daarna betaald, of
  "Incasso mislukt": dan blijft de factuur open, probeert de app het niet vanzelf opnieuw en kan
  het lid via de betaallink betalen.

Testen (testmodus, testsleutel van Mollie):
1. Betalingen: testsleutel koppelen, modus Testen, Automatisch afschrijven aan.
2. Een lid een abonnement per 4 weken geven; bij Facturatie de betaallink openen en in de
   Mollie-testpagina "Betaald" kiezen → factuur op betaald, machtiging opgeslagen.
3. Een volgende factuur laten ontstaan (of de verlengdatum in Firestore naar vandaag zetten) en
   de avondronde laten lopen → "Incasso loopt", daarna betaald (in testmodus meldt Mollie de
   uitkomst vanzelf).

### Afspraken wijzigen (staf)

- **Eén afspraak verzetten**: bij een vast PT-moment (Beheer → lid → Afspraken) of in Lessen →
  Deelnemers. Kies een vrij moment bij de trainer; de oude afspraak gaat eraf met de credit terug
  (ook binnen de afmeldtermijn) en het nieuwe moment staat meteen vast (`moveOccurrence`).
- **Hele reeks wijzigen**: ⋮ bij een vast PT-moment → andere dag, tijd of trainer vanaf een datum.
  Afspraken van de oude reeks vanaf die datum gaan eraf met de credit terug (`moveStandingPt`).
- In het rooster staat bij een PT-moment wie het is en bij welke trainer ("Emma L" / "PT – Kenny").

### Verzetten na afmelden (PT-moment)

Meldt een sporter zich op tijd af voor een persoonlijk PT-moment (credit terug), dan biedt de app
meteen andere momenten bij dezelfde trainer aan: de komende twee weken, minstens twee uur vooruit,
binnen de beschikbaarheid van de trainer (of de openingstijden van de studio), waar trainer en ruimte
vrij zijn. Momenten die direct aansluiten op een andere les van de trainer staan bovenaan.

- De sporter vraagt aan; de trainer (of een beheerder) keurt goed of wijst af in Beheer → Leden.
  Beiden krijgen een pushmelding. Goedkeuren zet een losse les op het rooster (`cls_rs_…`) en
  schrijft de sporter in via de gewone boekingsregels (credit eraf).
- Afgewezen: de credit staat nog op het saldo en de sporter kiest in Lessen een ander moment.
- Meldt de trainer het lid af (Deelnemers), dan plant hij meteen zelf een nieuw moment in.
- De twee uur vooruit geldt alleen als een sporter aanvraagt (dan heeft de trainer tijd om te
  bevestigen). Plant staf zelf (verzetten, losse afspraak, goedkeuren), dan kan elk moment dat nog
  niet begonnen is, ook direct aansluitend vandaag.
- Verzoeken staan in `rescheduleRequests` (alleen via de server); rekenregels in
  `api/_lib/reschedule.mjs`.

### Afwezigheid en invallers

Profiel → **Afwezigheid** (trainer zelf, of een beheerder voor een trainer):

- **Losse dagen**: van … t/m … (vakantie, ziek, cursus).
- **Elke maand**: bijv. "1e donderdag van de maand" (1e t/m 4e of de laatste), vanaf een datum en
  eventueel t/m een datum.
- Optioneel een **vaste invaller**. De lessen van de trainer op die dagen gaan dan naar de invaller,
  als die vrij is (niet afwezig, geen andere les, binnen zijn beschikbaarheid). Wie is ingeschreven
  krijgt een pushmelding. Elke avond loopt dit opnieuw voor nieuwe lessen op het rooster.
- Lessen die nog geen invaller hebben staan in Beheer → Leden bij **Lessen zonder trainer**, met wie
  vrij is (de vaste invaller bovenaan, bezet met de reden erbij) en één knop Toewijzen. Niemand vrij?
  Gelast de les af in Lessen.
- Eén les een andere trainer geven: open de les (Deelnemers) → **Trainer (alleen deze les)**. De
  vaste trainer van de lessoort blijft hetzelfde. Terugzetten kan in hetzelfde veld.
- Afwezigheid weghalen: lessen die via die afwezigheid naar een invaller gingen, gaan terug.
- Een losse PT-afspraak of verzetten biedt geen dagen aan waarop de trainer afwezig is.
- Opslag: `trainerAbsences/{id}` (alleen via de server); een les met invaller heeft
  `originalTrainerId` (en `substituteVia` als het via een afwezigheid ging). Rekenregels in
  `api/_lib/absence.mjs`.

### Training uit ChatGPT in een les zetten

Met de AI-koppeling (Profiel → Koppel met AI-chat) kan een trainer in ChatGPT of Claude zeggen:
*"Zet deze training in de groepsles van woensdagavond. Sara doet niets boven het hoofd."* De
koppeling (functie `plan_class` in `api/_lib/mcpServer.mjs`) zoekt de les op dag, tijd of dagdeel en
naam, en zet de oefeningen en de notitie als voorbereiding in die les (`classPlans/{classId}`, net als
Lessen → les → Voorbereiding).

- Geen of meerdere lessen gevonden: de chat krijgt de lessen van die dag terug en vraagt welke.
- Staat er al een voorbereiding, dan vraagt de chat eerst of die vervangen mag.
- In de app staat de training bij de les ("uit de chat"); de trainer kan hem aanpassen, een workout
  kiezen in plaats daarvan, of meteen Start les doen.
- Rekenregels (welke les, oefeningen opschonen): `api/_lib/classPlanInput.mjs`.

### Twee accounts van dezelfde persoon samenvoegen

Beheer → lid → Account → **Samenvoegen** (alleen beheerder). Bijvoorbeeld een account dat de studio
aanmaakte (richard@studio.nl) en een account waarmee de persoon zelf inlogt.

- Kies het andere account en welk account blijft. Bij elk account staat wanneer het voor het laatst
  inlogde; het account dat blijft is het account waarmee de persoon inlogt.
- Eerst een overzicht van wat overgaat, met waarschuwingen (bijv. twee lopende abonnementen). Pas na
  het vinkje "Dit kan niet terug" wordt er samengevoegd.
- Alles gaat mee: trainingen, metingen, voeding, check-ins, boekingen, vaste afspraken en
  PT-momenten, abonnementen, facturen, credits (opgeteld, met een regel in het grootboek),
  berichten, groepen en workouts. Lege profielvelden worden aangevuld; naam, e-mail, rol en
  toestemmingen niet. Staan beide accounts in dezelfde les, dan vervalt de dubbele boeking.
- Daarna verdwijnen het profiel en het login-account dat wegging (en zijn pushtokens en
  koppelsleutels).
- Niet mogelijk voor de eigenaar, voor een trainer of beheerder (eerst sporter maken) of als het
  account dat weggaat ook bij een andere studio hoort.
- Code: `api/_lib/mergeMembers.mjs` (acties `mergePreview` en `mergeMembers` in
  `api/admin-account.mjs`).

### Aanwezigheid en gegeven lessen

Na de les meldt de trainer wie er was: Lessen → les → **Deelnemers**. Zodra de les begonnen is staat
bij elke ingeschreven sporter **Aanwezig** / **Niet gekomen** (of in één keer "Iedereen aanwezig"),
en met **Les gegeven** is de les afgerond. Later bijwerken kan.

- De credit verandert hierdoor niet: wie niet kwam of te laat afmeldde, had zijn credit al niet terug
  (zie de afmeldtermijn hierboven). Het is een registratie, geen straf.
- De eigenaar ziet alles in Beheer → **Gegeven lessen**: per week of maand welke lessen er waren, wie
  ze gaf, of ze als gegeven zijn gemeld en wie er wel en niet was, met totalen per trainer, filter op
  trainer en **Exporteren** (CSV voor Excel). Een trainer ziet daar alleen zijn eigen lessen.
- Velden: op de boeking `attendance` (`present` / `absent`), `attendanceBy`, `attendanceAt`; op de les
  `givenAt`, `givenBy`, `presentCount`, `absentCount`. Alleen de server schrijft ze (acties
  `setAttendance` en `lessonReport` in `api/booking.mjs`).

## 3b. Veilig uitproberen: de Testruimte

Er is één Firebase-project. De previewomgeving van Vercel schrijft dus in dezelfde database als
de live app: klikken in de preview is klikken in echte klantgegevens. Een tweede Firebase-project
zou dat oplossen, maar dat is een dagdeel werk en twee omgevingen om bij te houden.

Goedkoper: gebruik de studioscheiding die er nu toch al is. Een tweede studio staat volledig los,
en de Firestore-regels houden hem gescheiden — precies dezelfde scheiding die straks tussen twee
échte studio's geldt. Je test dus meteen of die scheiding werkt.

```bash
# Kijken wat er zou gebeuren (schrijft niets):
FIREBASE_SERVICE_ACCOUNT="$(cat service-account.json)" \
  npm run seed:testruimte -- --owner-email jij@voorbeeld.nl

# Echt aanmaken:
FIREBASE_SERVICE_ACCOUNT="$(cat service-account.json)" \
  npm run seed:testruimte -- --owner-email jij@voorbeeld.nl --apply
```

Dat zet klaar: de studio zelf (zonder open aanmelding), een testtrainer, twee testsporters met
elk tien credits, jouw eigen account als lid, en vier lessen in de komende dagen. Eén les heeft
bewust **één plek** — daarmee test je in twee klikken de wachtlijst en het doorschuiven, wat je
met een lege agenda nooit tegenkomt.

Na afloop log je opnieuw in; bovenin verschijnt de studiowisselaar. Alles wat je in de Testruimte
doet blijft daar.

Het script draait **niet** op de standaardstudio: het weigert dienst als `--org` gelijk is aan
`vanas`. Zo kan er nooit een testles in de echte studio belanden.

Opruimen als je klaar bent — de export van klantgegevens is al genoeg om te bewaken, daar hoef je
geen slapende testaccounts bij te hebben:

```bash
FIREBASE_SERVICE_ACCOUNT="$(cat service-account.json)" \
  npm run seed:testruimte -- --owner-email jij@voorbeeld.nl --remove --apply
```

---

## 4. Uitrollen (volgorde is belangrijk)

De volgorde ligt vast omdat de app op `orgId` filtert. Draai je de migratie ná het uitrollen, dan
lijkt alle data even weg.

```bash
# 1. Back-up. Altijd eerst.
FIREBASE_SERVICE_ACCOUNT="$(cat service-account.json)" npm run backup

# 2. Kijken wat de migratie zou doen (schrijft niets).
FIREBASE_SERVICE_ACCOUNT="$(cat service-account.json)" npm run migrate:orgs

# 3. Echt migreren.
FIREBASE_SERVICE_ACCOUNT="$(cat service-account.json)" npm run migrate:orgs -- --apply

# 4. Firestore-regels uitrollen.
npm run deploy:firestore

# 5. App uitrollen (gaat vanzelf bij een push naar main via Vercel).
```

Het migratiescript is **idempotent**: twee keer draaien verandert niets extra. Documenten die al een
`orgId` hebben blijft het af, ook die van een andere studio.

---

## 5. Controleren of het klopt

```bash
npm run check           # typecheck, lint, unit-tests
npm run test:rules      # Firestore-regels tegen de emulator (vereist Java)
npm run test:mcp:rechten # rechten op de AI-koppeling
```

De regeltests bevatten een blok **Studio-isolatie** met kruisverkeer tussen twee studio's. Als je
aan de regels sleutelt en die tests blijven groen, controleer dan of ze nog wel iets meten: zet
`sameOrg()` tijdelijk op `return true;` — er horen er dan negen om te slaan.

---

## 6. Back-ups

`npm run backup` schrijft elke collectie als JSON naar `backups/<datum-tijd>/`. Die map staat in
`.gitignore` en hoort **niet** in Git.

De export bevat persoonsgegevens en gezondheidsgegevens van klanten. Bewaar hem versleuteld, buiten
Google, en ruim oude exports op. Dat is een AVG-verplichting, geen advies.

Doe dit minimaal vóór elke migratie en verder maandelijks.

---

## 7. Wat te doen als er iets stukgaat

**Account verwijderen loopt via de server.** In de app mag niemand een profiel verwijderen — ook
een beheerder niet. Dat gaat via `api/admin-account.mjs`, dat het login-account, het profiel en de
bijbehorende gegevens in één keer opruimt. De reden: kon je je eigen profiel weggooien, dan kon je
jezelf daarna met dezelfde uid opnieuw aanmaken in een andere studio, inclusief de logs en metingen
die op die uid blijven staan.

| Symptoom | Waarschijnlijke oorzaak | Wat te doen |
|----------|------------------------|-------------|
| App is leeg, geen profielen of workouts | Migratie niet gedraaid, of `orgId` staat verkeerd | Stap 3 van het uitrollen draaien |
| Geen studiowisselaar bovenin | Je account is maar bij één studio lid | `--add-member`, of hoofdstuk 3b |
| "Geen studio geladen" bij opslaan | Profiel is niet geladen voordat er geschreven werd | Uitloggen en opnieuw inloggen |
| "Geen toegang tot database" | Firestore-regels niet uitgerold | `npm run deploy:firestore` |
| Assistent antwoordt niet | `OPENAI_API_KEY` ontbreekt op Vercel | Zie `docs/VERCEL-FIREBASE.md` |
| AI-koppeling geeft 401 | Koppelsleutel ingetrokken of ongeldig | Nieuwe sleutel maken onder Profiel |
| "Google inloggen mislukt" of "The requested action is invalid" | Domein staat niet bij Firebase → Authentication → Settings → Authorized domains | Domein toevoegen; zie hieronder |
| Meldingen komen niet aan | APNs-sleutel of Play-configuratie ontbreekt in Firebase | Zie hieronder |

### Inloggen met Google

Vanaf het beginscherm en in de native app is er geen bruikbare popup: iOS opent die als een los
venster dat niets kan teruggeven aan de app, en Firebase toont dan alleen *The requested action is
invalid*. De app stuurt daarom door in plaats van een popup te openen zodra hij zonder adresbalk
draait (`src/utils/appMode.ts`); in een gewoon tabblad blijft de popup, want dan raak je de pagina
niet kwijt.

Blijft het misgaan, kijk dan in de Firebase-console onder **Authentication → Settings → Authorized
domains**. Elk domein waar de app op draait moet daar staan — het Vercel-domein, een eigen domein,
en `localhost` voor de native app. Ontbreekt er één, dan weigert de inlogpagina zonder dat de app
er iets zinnigs over kan zeggen.

### Pushnotificaties: wat er nog handmatig moet

De code staat er; de configuratie bij Apple en Google niet. Eenmalig nodig:

1. **iOS:** een APNs-authenticatiesleutel (`.p8`) aanmaken in het Apple Developer-portaal en
   uploaden in Firebase → Project settings → Cloud Messaging.
2. **Android:** `google-services.json` in de Android-map (staat er meestal al via Capacitor).
3. **Web (webapp/PWA):** een VAPID-sleutel in Firebase → Project settings → Cloud Messaging →
   Web Push certificates → *Generate key pair*, en die als `VITE_FIREBASE_VAPID_KEY` in Vercel
   zetten (alle omgevingen), daarna opnieuw deployen. Zonder die sleutel legt de kaart Meldingen
   uit dat het nog niet is ingesteld; er gaat niets stuk. Ontvangen gaat via
   `public/firebase-messaging-sw.js` (alleen meldingen, geen cache). Op een iPhone werkt webpush
   alleen als de app op het beginscherm staat (iOS 16.4+).

Welke meldingen er zijn staat in **Beheer → Meldingen**; de eigenaar zet daar per soort aan of uit
(standaard alles aan, opgeslagen als `orgs/{orgId}.notifications`). Een trainer ziet die lijst
alleen. Direct: nieuw schema, les geannuleerd door de studio, plek via de wachtlijst, credits
bijna op (na een boeking met 1 of 0 over), en voor de trainer een ingevulde check-in. Losse
meldingen vanuit de app lopen via `api/notify.mjs`; die bij boeken en afmelden via
`api/booking.mjs`.

Avondronde: elke dag rond 18:00 (Vercel-cron `/api/cron/evening`, 16:00 UTC; op het Hobby-plan
ergens binnen dat uur). Daarin: lesherinneringen voor morgen (één melding per persoon, geen
wachtlijst of afgelaste lessen; `reminderSentAt` per boeking voorkomt dubbel), berichten die voor
vandaag gepland staan, verjaardagen, op zondag de wekelijkse check-in voor sporters met een
trainer, en op maandag per trainer een overzicht van eigen sporters die 2 weken geen training
logden en geen les volgden. Code: `runEveningNotifications` in `api/_lib/notifications.mjs`.
Vereist `CRON_SECRET` (staat er al).

Berichten van de studio: in Beheer → Meldingen stuurt een trainer of de eigenaar een bericht aan
één lid, de deelnemers van een les, iedereen van een lessoort of de hele studio; meteen of op een
dag vanaf morgen (dan in de avondronde). Opgeslagen in `broadcasts` (alleen de server, max 30 per
dag per persoon). Een gepland bericht kun je intrekken.

Lukt aanmelden niet, dan toont de kaart Meldingen de technische foutcode. Bekende oorzaak: de
Browser key in Google Cloud (APIs & Services → Credentials) moet o.a. **Firebase Installations
API**, **FCM Registration API** en **Firebase Cloud Messaging API** toestaan.

---

## 8. Wie moet wat kunnen

Voor de overdracht is dit het minimum dat een tweede persoon moet kunnen:

- **Inloggen op Vercel** en zien of de laatste deploy is gelukt.
- **Inloggen op de Firebase-console** en een profiel opzoeken.
- **Een back-up draaien** (hoofdstuk 6).
- **Een account aanmaken of verwijderen** — zie `docs/ACCOUNTS-VERWIJDEREN.md` en Profielen in de app.
- **Weten waar het service-account staat.** Dat bestand is een sleutel tot alle klantgegevens:
  het hoort in een wachtwoordkluis, nooit in Git, nooit in een chat of screenshot.

Zet de toegang tot Vercel, Firebase en de kluis op naam van minstens twee mensen. Dat is de
goedkoopste verzekering die er is.
