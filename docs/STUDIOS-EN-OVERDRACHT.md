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
- Tot **12 uur** voor aanvang afmelden geeft de credit terug; daarna niet. Wordt de les afgelast,
  dan altijd terug.
- Een sporter meldt alleen zichzelf af; een trainer mag dat ook voor een ander doen.

De annuleertermijn staat als `FREE_CANCEL_HOURS` in `api/booking.mjs`.

---

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
| Meldingen komen niet aan | APNs-sleutel of Play-configuratie ontbreekt in Firebase | Zie hieronder |

### Pushnotificaties: wat er nog handmatig moet

De code staat er; de configuratie bij Apple en Google niet. Eenmalig nodig:

1. **iOS:** een APNs-authenticatiesleutel (`.p8`) aanmaken in het Apple Developer-portaal en
   uploaden in Firebase → Project settings → Cloud Messaging.
2. **Android:** `google-services.json` in de Android-map (staat er meestal al via Capacitor).
3. **Web (optioneel):** een VAPID-sleutel in Firebase → Cloud Messaging → Web Push certificates,
   en die als `VITE_FIREBASE_VAPID_KEY` in Vercel zetten. Zonder die sleutel meldt de webversie
   zich netjes niet aan; er gaat niets stuk.

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
