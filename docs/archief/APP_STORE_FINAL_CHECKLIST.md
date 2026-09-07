# 🚀 App Store Upload - Finale Checklist

## ✅ Wat is al Klaar

### Technische Configuratie
- ✅ **Build succesvol**: App werkt en is getest
- ✅ **Bundle Identifier**: `com.vanas.liftlog` (in beide projecten)
- ✅ **App Version**: `1.0.13`
- ✅ **Build Number**: `14` (verhoogd voor App Store)
- ✅ **Development Team**: `YR94KX729G` (al ingesteld)
- ✅ **Signing**: Automatisch beheerd
- ✅ **App Icon**: 1024x1024 aanwezig
- ✅ **Automatisch build script**: `npm run build:ios` kopieert bestanden automatisch

---

## ⚠️ Wat Moet Nog Gedaan Worden

### 1. Xcode Project Configuratie Controleren

**In Xcode (`Van As Personal Training Logs.xcworkspace`):**

1. Open het project in Xcode
2. Selecteer het project in de navigator (linksboven)
3. Selecteer "Van As Personal Training Logs" target
4. Ga naar **"General"** tab:
   - ✅ **Version**: `1.0.13`
   - ✅ **Build**: `14`
   - ✅ **Bundle Identifier**: `com.vanas.liftlog`
5. Ga naar **"Signing & Capabilities"** tab:
   - ✅ **Automatically manage signing**: Aangevinkt
   - ✅ **Team**: `YR94KX729G` (of jouw team)
   - ✅ **Bundle Identifier**: `com.vanas.liftlog`

### 2. Test op Simulator & Device (Optioneel maar Aanbevolen)

- [ ] Test op simulator (iPhone 15 Pro)
- [ ] Test op echt device (iPhone/iPad) - optioneel maar aanbevolen
- [ ] Verifieer dat alle functionaliteit werkt

### 3. Privacy Policy URL (VERPLICHT)

⚠️ **CRITIEK**: Apple vereist een privacy policy URL voor alle apps.

**Opties:**
- **Optie 1**: Maak een simpele HTML pagina en host deze (bijv. via GitHub Pages, Vercel)
- **Optie 2**: Gebruik een privacy policy generator: https://www.freeprivacypolicy.com/
- **Optie 3**: Voeg toe aan je bestaande website

**Privacy Policy moet vermelden:**
- Geen data wordt verzameld
- Alle data wordt lokaal opgeslagen op het device (localStorage)
- Geen tracking of analytics
- Geen account vereist
- Geen data wordt gedeeld met derden

**Voorbeeld Privacy Policy (simpel):**
```
Privacy Policy - Van As Personal Training Logs

Gegevensverzameling:
Van As Personal Training Logs verzamelt GEEN persoonlijke gegevens. Alle data die je invoert (oefeningen, gewichten, sets, reps) wordt uitsluitend lokaal opgeslagen op jouw apparaat.

Lokale Opslag:
Alle workout data wordt opgeslagen in de lokale opslag van je apparaat (localStorage). Deze data blijft privé en wordt nooit naar externe servers verzonden.

Geen Tracking:
We gebruiken geen analytics, tracking tools of cookies.

Geen Account:
De app vereist geen account of registratie.

Contact:
Voor vragen over privacy, neem contact op via [jouw email]
```

### 4. App Store Connect Setup

**Stap 1: Login op App Store Connect**
- Ga naar: https://appstoreconnect.apple.com
- Login met je Apple Developer account

**Stap 2: Nieuwe App Aanmaken**
- Klik op **"My Apps"** > **"+ New App"**
- Vul in:
  - **Platform**: iOS
  - **Name**: "Van As Personal Training Logs" (of "LiftLog")
  - **Primary Language**: Nederlands
  - **Bundle ID**: `com.vanas.liftlog` (selecteer uit dropdown)
  - **SKU**: `liftlog-001` (unieke identifier, alleen voor intern gebruik)
  - **User Access**: Full Access
- Klik **"Create"**

### 5. App Store Listing Content

**App Information:**
- [ ] **Subtitle**: "Track je fitness progressie" (max 30 karakters)
- [ ] **Category**: Health & Fitness
- [ ] **Privacy Policy URL**: **[VOEG TOE]** (VERPLICHT!)

**Pricing and Availability:**
- [ ] **Price**: Gratis of betaald (kies wat je wilt)
- [ ] **Availability**: Alle landen of specifieke selectie

**Version Information:**
- [ ] **Screenshots**: Maak screenshots (zie hieronder)
- [ ] **Description**: Schrijf app beschrijving (zie hieronder)
- [ ] **Keywords**: fitness, workout, training, log, progressie, fitness tracker
- [ ] **Support URL**: (optioneel, maar aanbevolen)
- [ ] **Marketing URL**: (optioneel)

**App Privacy:**
- [ ] Vul privacy vragenlijst in:
  - **Data Collection**: NEE
  - **Tracking**: NEE
  - **Data Sharing**: NEE

### 6. Screenshots Maken

**Vereist voor:**
- iPhone 6.7" (iPhone 14 Pro Max, 15 Pro Max) - **minimaal 2 screenshots**

**Hoe screenshots maken:**

1. **Via Simulator:**
   - Open de app in Xcode simulator (iPhone 15 Pro Max)
   - Navigeer naar verschillende schermen:
     - Inzichten/Spiergroepen pagina
     - Oefeningen overzicht
     - Logs pagina
     - AddPage met filter dropdown
   - Maak screenshots: **Cmd + S** (of Device > Screenshot)
   - Screenshots worden opgeslagen in: `~/Desktop`

2. **Via Echt Device:**
   - Maak screenshots met normale iOS screenshot methode
   - Exporteer naar Mac via AirDrop of Photos

**Screenshot Requirements:**
- Formaat: PNG of JPEG
- Resolutie: 1290 x 2796 pixels (voor 6.7")
- Minimaal 2 screenshots vereist
- Maximaal 10 screenshots per size

**Tips voor Screenshots:**
- Maak screenshots op verschillende schermen
- Zorg dat er echte data zichtbaar is (niet leeg)
- Toon belangrijke functionaliteit (filters, grafieken, etc.)

### 7. App Beschrijving Schrijven

**Beschrijving (max 4000 karakters):**

```
Van As Personal Training Logs - Track je Fitness Progressie

📊 Volg je Workouts en Progressie
Log je oefeningen, gewichten, sets en reps eenvoudig. Zie je progressie over tijd met duidelijke grafieken en statistieken.

💪 Complete Oefening Database
Meer dan 80 oefeningen met automatische spiergroep detectie. Filter oefeningen op spiergroep en zie visuele indicatie welke spieren je traint.

📈 Inzicht in je Training
Analyseer je workouts met gedetailleerde statistieken:
- Progressie per oefening
- Totaal volume tracking (sets × reps × gewicht)
- Spiergroep analyse
- Push/pull ratio
- Bewegingstype verdeling

💾 Privacy First
Alle data wordt lokaal opgeslagen op je apparaat. Geen account nodig, geen data verzameling, volledig privé.

🎯 Eenvoudig en Overzichtelijk
Moderne, intuïtieve interface. Snel oefeningen toevoegen en je workouts bijhouden. Perfect voor serieuze fitness enthousiastelingen.

✨ Features:
- Log workouts met gewicht, sets en reps
- Automatische spiergroep detectie
- Progressie grafieken per oefening
- Volume tracking en statistieken
- Filter oefeningen op spiergroep
- Visuele body maps
- Offline - werkt zonder internet
- Volledig gratis en zonder advertenties

Begin vandaag nog met het bijhouden van je fitness journey!
```

**Korte beschrijving voor App Store:**
```
Track je fitness progressie met gedetailleerde statistieken en grafieken. Log workouts, volg progressie per oefening en analyseer je training data.
```

### 8. Archive & Upload

**In Xcode:**

1. **Selecteer "Any iOS Device"** (niet simulator!) bovenaan in Xcode
2. **Product > Archive**
3. Wacht tot archive klaar is (kan enkele minuten duren)
4. Het **Organizer** venster opent automatisch
5. Selecteer je archive en klik **"Distribute App"**
6. Kies **"App Store Connect"**
7. Kies **"Upload"**
8. Volg de wizard:
   - Selecteer je team
   - Laat automatische signing aan
   - Klik "Upload"
9. Wacht tot upload klaar is (kan 10-30 minuten duren)

### 9. App Store Connect - Build Selecteren & Submit

**Na upload (wacht 1-2 uur):**

1. Ga naar App Store Connect > My Apps > [Jouw App]
2. Ga naar de **versie** pagina (bijv. 1.0.13)
3. Wacht tot je build verschijnt (kan 1-2 uur duren)
4. Selecteer je build (versie 1.0.13, build 14)
5. Controleer alle informatie:
   - Screenshots ✅
   - Beschrijving ✅
   - Privacy Policy URL ✅
   - App Privacy ✅
6. Vul **Review Information** in:
   - Contact email
   - Demo account (niet nodig voor deze app)
   - Notes voor reviewers (optioneel)
7. Klik **"Submit for Review"**

---

## 📝 Quick Reference Commands

```bash
# Build en kopieer naar iOS project
npm run build:ios

# Alleen build (zonder kopiëren)
npm run build

# Open iOS project in Xcode
open "Van As Personal Training Logs/Van As Personal Training Logs.xcworkspace"
```

---

## ⏱️ Geschatte Tijd

- **Privacy Policy maken**: 30 min
- **Screenshots maken**: 30 min
- **App Store Connect setup**: 30 min
- **App beschrijving schrijven**: 30 min
- **Archive & Upload**: 30 min (exclusief upload tijd)
- **Totaal**: ~2.5 uur werk

---

## 🎯 Volgende Stappen

1. ✅ Build script is klaar (`npm run build:ios`)
2. ⏭️ Controleer Xcode project configuratie
3. ⏭️ Maak privacy policy
4. ⏭️ Maak screenshots
5. ⏭️ Schrijf app beschrijving
6. ⏭️ App Store Connect setup
7. ⏭️ Archive & Upload

**Je bent bijna klaar! 🚀**
