# Actielijst: VORM-apps onder BOLD700

De iPhone- en Android-app van VORM komen uit dezelfde code als de website. Ze worden gebouwd en
geüpload door de bouwstap in GitHub (`.github/workflows/native.yml`), niet met de hand op een Mac.
Deze lijst is wat daarvoor eenmalig geregeld moet worden. Vink af wat klaar is.

- App-ID (iOS en Android): **`com.bold700.vorm`**
- Naam in de winkels: **VORM**
- De oude apps ("Van As Personal Training Logs") blijven staan tot VORM live is (stap F).

**Live updates.** Een gewone wijziging hoeft niet langs de winkels: bij elke Vercel-deploy komt er
een pakketje van de web-app op `/app-update/` (`scripts/app-update-bundle.mjs`), en de apps halen dat
zelf op en schakelen over zodra ze naar de achtergrond gaan (`src/native/liveUpdate.ts`). Alleen als er
een native onderdeel bijkomt (een nieuwe Capacitor-plug-in) is een nieuwe versie in de winkels nodig;
tot die er is, slaan de apps de live update over.

---

## A. Apple: ontwikkelaarsaccount voor BOLD700

- [ ] **D-U-N-S-nummer** van BOLD700 bij de hand (hetzelfde als bij Google). De bedrijfsnaam moet
      precies zo gespeld zijn als bij de KvK en D&B.
- [ ] **Apple ID op een bold700.com-adres** aanmaken (bijv. `apps@bold700.com`), met tweestapsverificatie.
- [ ] Aanmelden op <https://developer.apple.com/programs/enroll/> als **Organization**:
      bedrijfsnaam, D-U-N-S, website `bold700.com`, zakelijk telefoonnummer. Kosten € 99 per jaar.
      Apple controleert dit (vaak een telefoontje); reken op een paar dagen.

Als het account is goedgekeurd:

- [ ] **Team-ID** noteren: developer.apple.com → Account → Membership details.
- [ ] **App-ID registreren**: Certificates, Identifiers & Profiles → Identifiers → + → App IDs → App.
      Bundle ID (Explicit): `com.bold700.vorm`. Vink aan: **HealthKit** en **Push Notifications**.
- [ ] **App aanmaken** in <https://appstoreconnect.apple.com> → Apps → + → Nieuwe app:
      iOS, naam **VORM** (bezet? dan bijv. "VORM Training"), taal Nederlands,
      bundle-ID `com.bold700.vorm`, SKU `vorm-001`.
- [ ] **Sleutel voor de bouwstap**: App Store Connect → Gebruikers en toegang → Integraties →
      App Store Connect API → Teamsleutels → +. Rol **Admin** (nodig om zelf de ondertekening te
      regelen). Download het **.p8-bestand** (kan maar één keer), noteer **Key ID** en **Issuer ID**.
- [ ] **Pushsleutel (APNs)**: developer.apple.com → Keys → + → "Apple Push Notifications service
      (APNs)". Download het .p8-bestand en noteer de Key ID. Deze gaat naar Firebase (stap C).

## B. Google Play: account voor BOLD700

- [x] **Play Console-account op naam van BOLD700** (organisatie) bestaat al; daar staat ook de
      huidige app "Van As Personal Training Logs" (`com.vanas.liftlog`).
- De melding over **Android-ontwikkelaarsverificatie** (vóór 30 september 2026) vraagt niets: alle
  Play-apps zijn al geregistreerd, en we verspreiden niets buiten Google Play.
- [ ] **App aanmaken**: Alle apps → App maken → naam **VORM**, standaardtaal Nederlands, App, Gratis.
- [ ] **Uploadsleutel maken** op de Mac (Terminal), en het wachtwoord in je wachtwoordkluis bewaren:

      keytool -genkeypair -v -keystore vorm-upload.keystore -alias vorm \
        -keyalg RSA -keysize 2048 -validity 10000

      Bewaar `vorm-upload.keystore` ook in de kluis. Kwijt = gedoe met Google.
      Omzetten voor GitHub (staat daarna op het klembord):

      base64 -i vorm-upload.keystore | pbcopy

- [ ] **Serviceaccount voor automatisch uploaden**: in Google Cloud (zelfde Google-account) →
      IAM → Serviceaccounts → aanmaken → Sleutels → JSON-sleutel downloaden. Daarna in de
      Play Console → Gebruikers en rechten → het e-mailadres van dat serviceaccount uitnodigen, met
      rechten om releases te beheren voor de app VORM.

## C. Firebase (bestaand project, voor inloggen en pushmeldingen in de apps)

- [ ] Projectinstellingen → Je apps → **Android-app toevoegen** met pakketnaam `com.bold700.vorm`.
      Download `google-services.json` en stuur het naar Claude (geen geheim; komt in de repo).
- [ ] **iOS-app toevoegen** met bundle-ID `com.bold700.vorm`. Download `GoogleService-Info.plist`
      en stuur ook die.
- [ ] Projectinstellingen → Cloud Messaging → Apple-app → **APNs-verificatiesleutel uploaden**:
      het .p8-bestand uit stap A, met Key ID en Team-ID.

## D. GitHub: sleutels voor de bouwstap

Repo **bold700/LiftLog** → Settings → Secrets and variables → Actions.

Tab **Secrets** (geheim, niemand kan ze teruglezen):

| Naam | Waarde |
|---|---|
| `APPSTORE_KEY_ID` | Key ID van de App Store Connect-sleutel |
| `APPSTORE_ISSUER_ID` | Issuer ID |
| `APPSTORE_KEY_P8` | de hele inhoud van het .p8-bestand, inclusief de BEGIN- en END-regel |
| `ANDROID_UPLOAD_KEYSTORE_B64` | wat `base64 … \| pbcopy` op het klembord zette |
| `ANDROID_UPLOAD_KEYSTORE_PASSWORD` | het wachtwoord van de uploadsleutel |
| `ANDROID_UPLOAD_KEY_ALIAS` | `vorm` |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | de hele inhoud van de JSON-sleutel van het serviceaccount |

Tab **Variables** (niet geheim):

| Naam | Waarde |
|---|---|
| `APPLE_TEAM_ID` | het Team-ID van BOLD700 |
| `VITE_FIREBASE_API_KEY` … `VITE_FIREBASE_APP_ID` | de zes `VITE_FIREBASE_*`-waarden, over te nemen uit Vercel → Settings → Environment Variables |

## E. Eerste builds

- [ ] GitHub → Actions → **Apps** → Run workflow. De iOS-build komt vanzelf in **TestFlight**.
- [ ] Android: Google wil de allereerste upload met de hand. Download de bundle
      (`vorm-android-…`) onderaan de run in GitHub en upload hem in de Play Console bij
      Testen → **Interne test**. Daarna gaat elke volgende build vanzelf.
- [ ] Zelf testen via TestFlight en de interne test van Google Play.
- [ ] Winkelvermelding invullen (beschrijving, schermafbeeldingen, privacybeleid, gegevensgebruik
      en de gezondheidsverklaring). Claude levert de teksten.

## F. Pas als VORM live staat: oude apps weghalen

- [ ] Huidige gebruikers laten weten dat ze de nieuwe VORM-app moeten downloaden.
- [ ] App Store (oude, persoonlijke account): "Van As Personal Training Logs" → **Verwijderen uit de
      verkoop**, daarna de app verwijderen.
- [ ] Google Play (oude app `com.vanas.liftlog`): op **Niet gepubliceerd** zetten (echt verwijderen
      kan bij Google niet).
