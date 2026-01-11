# 🚀 App Store Upload Readiness Checklist

## ✅ Technische Configuratie

### iOS Project Setup
- ✅ **Bundle Identifier**: `com.vanas.liftlog` (geconfigureerd)
- ✅ **App Version**: `1.0.13` (Marketing Version)
- ✅ **Build Number**: `13` (Current Project Version)
- ✅ **Development Team**: `YR94KX729G` (al ingesteld)
- ✅ **Signing**: Automatisch beheerd (configureerd)
- ✅ **Build succesvol**: Dist folder bestaat

### App Icon
- ⚠️ **App Icon**: Er is een `AppIcon-512@2x.png` (1024x1024) aanwezig
  - **Status**: ✅ Voor App Store upload is dit voldoende (1024x1024 is vereist)
  - **Locatie**: `ios/App/App/Assets.xcassets/AppIcon.appiconset/`
  - **Notitie**: Voor beste gebruikerservaring kun je extra sizes toevoegen voor verschillende apparaten

### App Naam & Display
- ✅ **App Name**: "Van As Personal Training Logs" (in Capacitor config)
- ✅ **Bundle Display Name**: "Van As Personal Training Logs" (in Info.plist)
- ✅ **Capacitor Config**: Correct geconfigureerd met appId en appName

---

## ⚠️ Vereisten voor App Store Connect

### 1. App Store Connect Account Setup
- ❓ **Apple Developer Account**: Actief? ($99/jaar)
- ❓ **App Store Connect toegang**: Heb je toegang tot https://appstoreconnect.apple.com?

### 2. App in App Store Connect Aanmaken
- ❓ **Nieuwe app aangemaakt?** Nog niet gedaan - zie stappen hieronder
  - Name: "Van As Personal Training Logs" (of "LiftLog" - kort en krachtig)
  - Bundle ID: `com.vanas.liftlog`
  - SKU: `liftlog-001` (unieke identifier)
  - Primary Language: Nederlands

### 3. App Store Listing Content
- ❌ **Screenshots**: Nog niet gemaakt
  - Vereist voor verschillende iPhone sizes:
    - iPhone 6.7" (iPhone 14 Pro Max, 15 Pro Max) - minstens 2 screenshots
    - iPhone 6.5" (iPhone 11 Pro Max, XS Max) - optioneel
    - iPhone 5.5" (iPhone 8 Plus) - optioneel
  
- ❌ **App Beschrijving**: Nog niet geschreven
  - Korte beschrijving (max 4000 karakters)
  - Keywords voor zoekfunctie
  - Subtitle (max 30 karakters): "Track je fitness progressie"
  
- ❌ **App Categorie**: Nog niet ingesteld
  - Aanbevolen: "Health & Fitness"
  
- ❌ **Privacy Policy URL**: **VERPLICHT** maar nog niet toegevoegd
  - ⚠️ **CRITIEK**: Apple vereist een privacy policy URL voor alle apps
  - Opties:
    - Host een privacy policy pagina op je website
    - Gebruik een privacy policy generator (bijv. https://www.freeprivacypolicy.com/)
    - Voor deze app: Privacy policy moet vermelden dat:
      - Geen data wordt verzameld
      - Alle data wordt lokaal opgeslagen op het device
      - Geen tracking of analytics
      - Geen account vereist

### 4. App Privacy Informatie
- ❌ **Privacy vragenlijst**: Nog niet ingevuld in App Store Connect
  - Data verzameling: NEE (voor LiftLog - alleen lokale opslag)
  - Tracking: NEE
  - Data delen: NEE

### 5. Pricing & Availability
- ❌ **Pricing**: Nog niet ingesteld
  - Opties: Gratis of betaald
  - Beschikbaarheid: Alle landen of specifieke selectie

### 6. Contact & Support
- ❌ **Contact informatie**: Nog niet toegevoegd
  - Contact email (vereist)
  - Support URL (optioneel)
  - Marketing URL (optioneel)

---

## 📋 Pre-Upload Checklist

### Voor je de app archiveert en uploadt:

#### In Xcode:
- [ ] Open `ios/App/App.xcworkspace` (NIET .xcodeproj)
- [ ] Selecteer "Any iOS Device" of echt device (niet simulator)
- [ ] Controleer Signing & Capabilities:
  - [ ] "Automatically manage signing" is aangevinkt
  - [ ] Team is geselecteerd: `YR94KX729G`
  - [ ] Bundle Identifier: `com.vanas.liftlog`
- [ ] Test de app op een echt device (optioneel maar aanbevolen)
- [ ] Test de app op simulator om te verifiëren dat alles werkt

#### Build & Sync:
- [ ] Run `npm run build` (al gedaan ✅)
- [ ] Run `npm run cap:sync` om naar iOS te kopiëren
- [ ] Verifieer dat `dist/` folder correct is gebouwd

#### Archive:
- [ ] In Xcode: Product > Archive
- [ ] Wacht tot archive klaar is
- [ ] Organizer venster opent automatisch
- [ ] Verifieer archive in Organizer

---

## 🚨 Kritieke Items VOOR Upload

### MOET worden gedaan:
1. ✅ **Build is succesvol** - DONE
2. ✅ **Bundle ID is uniek** - `com.vanas.liftlog` - DONE
3. ✅ **Version nummers zijn ingesteld** - DONE
4. ⚠️ **App Store Connect app aanmaken** - NOG TE DOEN
5. ⚠️ **Privacy Policy URL toevoegen** - NOG TE DOEN (VERPLICHT!)
6. ⚠️ **Screenshots maken** - NOG TE DOEN
7. ⚠️ **App beschrijving schrijven** - NOG TE DOEN

---

## 📝 Aanbevolen Volgorde

### Stap 1: App Store Connect Setup (15 min)
1. Login op https://appstoreconnect.apple.com
2. Klik "My Apps" > "+ New App"
3. Vul in:
   - Platform: iOS
   - Name: "Van As Personal Training Logs" (of "LiftLog")
   - Primary Language: Nederlands
   - Bundle ID: `com.vanas.liftlog`
   - SKU: `liftlog-001`
4. Klik "Create"

### Stap 2: Privacy Policy Toevoegen (30 min)
1. Maak of gebruik een privacy policy
2. Host het op een URL (bijv. via Vercel/GitHub Pages)
3. Voeg URL toe in App Store Connect > App Information

### Stap 3: Screenshots Maken (30 min)
1. Test de app op simulator (iPhone 15 Pro Max voor 6.7" screenshots)
2. Navigeer door alle belangrijke schermen:
   - Inzichten/Statistieken pagina
   - Oefeningen overzicht
   - Logs pagina
   - Toevoegen pagina
3. Maak screenshots (Cmd + S in simulator)
4. Upload minimaal 2 screenshots voor iPhone 6.7" in App Store Connect

### Stap 4: App Listing Invullen (30 min)
1. Beschrijving schrijven (max 4000 karakters)
2. Subtitle toevoegen (max 30 karakters)
3. Keywords toevoegen: fitness, workout, training, log, progressie
4. Categorie selecteren: Health & Fitness
5. Pricing instellen: Gratis

### Stap 5: Privacy Informatie Invullen (10 min)
1. Beantwoord dat je GEEN data verzamelt
2. Beantwoord dat je GEEN tracking doet
3. Beantwoord dat je GEEN data deelt

### Stap 6: Archive & Upload (20-30 min)
1. In Xcode: Product > Archive
2. Wacht tot archive klaar is
3. In Organizer: Selecteer archive > "Distribute App"
4. Kies "App Store Connect" > "Upload"
5. Volg wizard en wacht op upload (kan 10-30 min duren)

### Stap 7: Build Selecteren & Submit (10 min)
1. Wacht 1-2 uur tot build verschijnt in App Store Connect
2. Ga naar versie pagina
3. Selecteer je build
4. Controleer alle informatie
5. Klik "Submit for Review"

---

## ⏱️ Geschatte Tijd Tot Klaar Voor Review

- **Minimaal**: ~2 uur werk (als je alles snel doet)
- **Aanbevolen**: ~4 uur werk (voor kwaliteitscontent)

---

## ✅ Huidige Status Samenvatting

### ✅ Klaar:
- Build is succesvol
- Bundle ID en versie geconfigureerd
- App icon aanwezig (1024x1024)
- Development team ingesteld
- Signing geconfigureerd

### ⚠️ Nog Te Doen:
- App Store Connect app aanmaken
- Privacy Policy URL toevoegen (VERPLICHT)
- Screenshots maken en uploaden
- App beschrijving schrijven
- Privacy vragenlijst invullen
- Archive en upload naar App Store Connect
- Build selecteren en submit voor review

---

## 🎯 Conclusie

**Status**: 🟡 **Bijna klaar, maar niet volledig gereed**

De app is technisch klaar om geüpload te worden, maar je hebt nog wat administratieve taken nodig in App Store Connect voordat je kunt submitten voor review. De belangrijkste items zijn:

1. ⚠️ **Privacy Policy URL** - Dit is VERPLICHT door Apple
2. 📸 **Screenshots** - Vereist voor app listing
3. 📝 **App beschrijving** - Vereist voor app listing

Zodra deze 3 items zijn afgerond, kun je de app archiven, uploaden en submiten voor review.

---

## 💡 Tips

1. **Privacy Policy**: Gebruik een simpele privacy policy die vermeldt dat de app geen data verzamelt. Dit kan een eenvoudige HTML pagina zijn die je host via Vercel/GitHub Pages.

2. **Screenshots**: Maak screenshots op verschillende schermen van de app zodat gebruikers weten wat ze kunnen verwachten.

3. **Beschrijving**: Schrijf een duidelijke, aantrekkelijke beschrijving die uitlegt wat de app doet en wat de voordelen zijn.

4. **Eerste Review**: Apple review kan 1-3 dagen duren. Wees geduldig en controleer je email voor updates.

---

**Volgende Stap**: Begin met App Store Connect setup en privacy policy maken!