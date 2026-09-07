# LiftLog - App Store & Play Store Deployment Guide

Deze guide helpt je om de LiftLog app te publiceren in de Apple App Store en Google Play Store.

## 📋 Vereisten

### Voor iOS (App Store):
- **Mac computer** met macOS (vereist voor Xcode)
- **Apple Developer Account** ($99/jaar)
  - Registreer op: https://developer.apple.com/programs/
- **Xcode** (gratis via Mac App Store)
- **CocoaPods** (voor iOS dependencies)

### Voor Android (Play Store):
- **Google Play Console Account** ($25 eenmalig)
  - Registreer op: https://play.google.com/console
- **Android Studio** (gratis)
- **Java Development Kit (JDK)** 17 of hoger

---

## 🚀 Stap 1: Project Setup

### 1.1 Dependencies Installeren

```bash
npm install
```

### 1.2 App Builden

```bash
npm run build
```

### 1.3 Capacitor Sync

```bash
npm run cap:sync
```

Dit kopieert je web assets naar de native platforms.

---

## 📱 Stap 2: iOS Setup & Deployment

### 2.1 CocoaPods Installeren (Mac)

```bash
sudo gem install cocoapods
```

### 2.2 iOS Dependencies Installeren

```bash
cd ios/App
pod install
cd ../..
```

### 2.3 Xcode Project Openen

```bash
npm run cap:open:ios
```

Of handmatig:
```bash
open ios/App/App.xcworkspace
```

**BELANGRIJK**: Open altijd het `.xcworkspace` bestand, niet het `.xcodeproj` bestand!

### 2.4 Xcode Configuratie

1. **Selecteer het project** in de navigator (bovenaan links)
2. **Selecteer "App" target** (onder TARGETS)
3. **Ga naar "Signing & Capabilities" tab**
4. **Vink "Automatically manage signing" aan**
5. **Selecteer je Team** (je Apple Developer account)
6. **Bundle Identifier**: `com.vanas.liftlog` (moet uniek zijn)

### 2.5 App Icon & Splash Screen

#### App Icon:
1. Ga naar `ios/App/App/Assets.xcassets/AppIcon.appiconset/`
2. Vervang de placeholder icons met je eigen app icon
3. Je hebt verschillende sizes nodig:
   - 20x20 (@2x, @3x)
   - 29x29 (@2x, @3x)
   - 40x40 (@2x, @3x)
   - 60x60 (@2x, @3x)
   - 1024x1024 (voor App Store)

**Tip**: Gebruik een tool zoals [App Icon Generator](https://www.appicon.co/) om alle sizes automatisch te genereren.

#### Splash Screen:
De splash screen is al geconfigureerd in `capacitor.config.ts`. Je kunt de splash images aanpassen in:
- `ios/App/App/Assets.xcassets/Splash.imageset/`

### 2.6 App Info Aanpassen

1. In Xcode, selecteer `Info.plist`
2. Pas de volgende velden aan:
   - **Bundle display name**: "LiftLog"
   - **Bundle version**: "1.0.0"
   - **Bundle versions string, short**: "1.0.0"

### 2.7 Testen op Simulator

1. Selecteer een simulator (bijv. iPhone 15 Pro)
2. Klik op de "Play" knop (▶️) of druk `Cmd + R`
3. Test de app grondig

### 2.8 Testen op Echt Device

1. Verbind je iPhone/iPad via USB
2. Selecteer je device in Xcode
3. Klik op "Play" knop
4. Op je device: Ga naar Instellingen > Algemeen > VPN & Device Management
5. Vertrouw je developer certificaat

### 2.9 Archive & Upload naar App Store

1. **Selecteer "Any iOS Device"** of je echte device (niet simulator)
2. Ga naar **Product > Archive**
3. Wacht tot de archive klaar is
4. Het **Organizer** venster opent automatisch
5. Selecteer je archive en klik **"Distribute App"**
6. Kies **"App Store Connect"**
7. Kies **"Upload"**
8. Volg de wizard:
   - Selecteer je team
   - Laat automatische signing aan
   - Klik "Upload"
9. Wacht tot de upload klaar is (kan 10-30 minuten duren)

### 2.10 App Store Connect Configuratie

1. Ga naar https://appstoreconnect.apple.com
2. Login met je Apple Developer account
3. Klik op **"My Apps"** > **"+ New App"**
4. Vul in:
   - **Platform**: iOS
   - **Name**: LiftLog
   - **Primary Language**: Nederlands
   - **Bundle ID**: com.vanas.liftlog
   - **SKU**: liftlog-001 (unieke identifier)
   - **User Access**: Full Access
5. Klik **"Create"**

### 2.11 App Store Listing

1. **App Information**:
   - Subtitle: "Track je fitness progressie"
   - Category: Health & Fitness
   - Privacy Policy URL: (vereist, voeg toe als je die hebt)

2. **Pricing and Availability**:
   - Kies "Free" of stel een prijs in
   - Beschikbaarheid: Alle landen (of selecteer specifieke)

3. **App Privacy**:
   - Beantwoord vragen over data verzameling
   - Voor LiftLog: Geen data verzameling (alleen lokale opslag)

4. **Version Information**:
   - Screenshots: Upload screenshots van verschillende iPhone sizes
     - iPhone 6.7" (iPhone 14 Pro Max, 15 Pro Max)
     - iPhone 6.5" (iPhone 11 Pro Max, XS Max)
     - iPhone 5.5" (iPhone 8 Plus)
   - Description: Schrijf een beschrijving van je app
   - Keywords: fitness, workout, training, log, progressie
   - Support URL: (optioneel)
   - Marketing URL: (optioneel)

5. **Build**:
   - Wacht tot je build verschijnt (kan 1-2 uur duren na upload)
   - Selecteer je build
   - Klik "Done"

6. **Review Information**:
   - Contact Information: Je contactgegevens
   - Demo Account: (als je app login vereist)
   - Notes: Extra informatie voor reviewers

### 2.12 Submit voor Review

1. Controleer alle informatie
2. Klik **"Submit for Review"**
3. Wacht op review (meestal 1-3 dagen)
4. Je ontvangt een email wanneer de app is goedgekeurd

---

## 🤖 Stap 3: Android Setup & Deployment

### 3.1 Android Studio Installeren

1. Download Android Studio: https://developer.android.com/studio
2. Installeer Android Studio
3. Open Android Studio en installeer:
   - Android SDK
   - Android SDK Platform
   - Android Virtual Device (voor emulator)

### 3.2 Java Development Kit (JDK)

Android Studio installeert meestal automatisch JDK. Controleer:
- Android Studio > Preferences > Build, Execution, Deployment > Build Tools > Gradle
- JDK location moet ingesteld zijn

### 3.3 Android Project Openen

```bash
npm run cap:open:android
```

Of handmatig:
- Open Android Studio
- File > Open > Selecteer `android` folder

### 3.4 Android Configuratie

1. **Open `android/app/build.gradle`**
2. Controleer:
   - `applicationId`: "com.vanas.liftlog"
   - `versionCode`: 1 (verhoog bij elke update)
   - `versionName`: "1.0.0"

3. **Open `android/app/src/main/AndroidManifest.xml`**
4. Controleer:
   - Package name: "com.vanas.liftlog"
   - App name: "LiftLog"
   - Permissions (indien nodig)

### 3.5 App Icon & Splash Screen

#### App Icon:
1. Ga naar `android/app/src/main/res/`
2. Vervang de icons in de `mipmap-*` folders:
   - `mipmap-mdpi/ic_launcher.png` (48x48)
   - `mipmap-hdpi/ic_launcher.png` (72x72)
   - `mipmap-xhdpi/ic_launcher.png` (96x96)
   - `mipmap-xxhdpi/ic_launcher.png` (144x144)
   - `mipmap-xxxhdpi/ic_launcher.png` (192x192)

**Tip**: Gebruik [Android Asset Studio](https://romannurik.github.io/AndroidAssetStudio/) om alle sizes automatisch te genereren.

#### Splash Screen:
De splash screen is al geconfigureerd. Pas aan in:
- `android/app/src/main/res/drawable-*/splash.png`

### 3.6 Testen op Emulator

1. Open Android Studio
2. Klik op "Device Manager" (telefoon icoon)
3. Klik "+ Create Device"
4. Selecteer een device (bijv. Pixel 7)
5. Download een system image (bijv. Android 13)
6. Klik "Finish"
7. Start de emulator
8. Klik op "Run" (▶️) in Android Studio

### 3.7 Testen op Echt Device

1. Activeer **Developer Options** op je Android device:
   - Ga naar Instellingen > Over de telefoon
   - Tik 7x op "Buildnummer"
2. Activeer **USB Debugging**:
   - Instellingen > Systeem > Ontwikkelaarsopties
   - Zet "USB-foutopsporing" aan
3. Verbind je device via USB
4. Accepteer de USB debugging prompt op je device
5. Klik "Run" in Android Studio

### 3.8 Release Build Maken

1. **Maak een keystore** (eenmalig):
   ```bash
   keytool -genkey -v -keystore liftlog-release.keystore -alias liftlog -keyalg RSA -keysize 2048 -validity 10000
   ```
   - Vul een wachtwoord in (bewaar dit goed!)
   - Vul je gegevens in
   - Bewaar het `.keystore` bestand op een veilige plek

2. **Maak `android/key.properties`**:
   ```properties
   storePassword=JOUW_WACHTWOORD
   keyPassword=JOUW_WACHTWOORD
   keyAlias=liftlog
   storeFile=../liftlog-release.keystore
   ```

3. **Update `android/app/build.gradle`**:
   Voeg toe aan het begin van het bestand:
   ```gradle
   def keystoreProperties = new Properties()
   def keystorePropertiesFile = rootProject.file('key.properties')
   if (keystorePropertiesFile.exists()) {
       keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
   }
   ```

   En voeg toe in `android {` block:
   ```gradle
   signingConfigs {
       release {
           keyAlias keystoreProperties['keyAlias']
           keyPassword keystoreProperties['keyPassword']
           storeFile keystoreProperties['storeFile'] ? file(keystoreProperties['storeFile']) : null
           storePassword keystoreProperties['storePassword']
       }
   }
   buildTypes {
       release {
           signingConfig signingConfigs.release
           minifyEnabled false
           proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
       }
   }
   ```

4. **Build de release APK**:
   ```bash
   cd android
   ./gradlew assembleRelease
   ```
   
   Het APK bestand staat in: `android/app/build/outputs/apk/release/app-release.apk`

5. **Of build een App Bundle (AAB) - Aanbevolen voor Play Store**:
   ```bash
   cd android
   ./gradlew bundleRelease
   ```
   
   Het AAB bestand staat in: `android/app/build/outputs/bundle/release/app-release.aab`

### 3.9 Google Play Console Setup

1. Ga naar https://play.google.com/console
2. Betaal de $25 eenmalige registratiekosten
3. Klik **"Create app"**
4. Vul in:
   - **App name**: LiftLog
   - **Default language**: Nederlands
   - **App or game**: App
   - **Free or paid**: Free (of Paid)
   - **Declarations**: Accepteer de voorwaarden
5. Klik **"Create app"**

### 3.10 App Content Configureren

1. **App access**:
   - Is je app gratis of betaald?
   - Vereist je app een account?

2. **Ads**:
   - Bevat je app advertenties? (waarschijnlijk niet)

3. **Content rating**:
   - Vul de vragenlijst in
   - Voor LiftLog: Geen specifieke leeftijdsbeperkingen

4. **Target audience**:
   - Leeftijdsgroep: Alle leeftijden
   - Primair publiek: Fitness enthousiastelingen

5. **Data safety**:
   - Beantwoord vragen over data verzameling
   - Voor LiftLog: Geen data verzameling (alleen lokale opslag)

### 3.11 Store Listing

1. **App details**:
   - **Short description**: "Track je fitness progressie en workouts"
   - **Full description**: Uitgebreide beschrijving van je app
   - **App icon**: 512x512 PNG (transparant)
   - **Feature graphic**: 1024x500 PNG
   - **Screenshots**: 
     - Phone: Minimaal 2, maximaal 8
     - Tablet (optioneel): Minimaal 1
   - **Categories**: Health & Fitness
   - **Contact details**: Je email

2. **Graphics**:
   - App icon: 512x512 PNG
   - Feature graphic: 1024x500 PNG
   - Screenshots: Verschillende sizes
     - Phone: 16:9 of 9:16 ratio
     - Tablet: 16:9 of 9:16 ratio

### 3.12 App Uploaden

1. Ga naar **"Production"** (of "Internal testing" / "Closed testing" voor testen)
2. Klik **"Create new release"**
3. Upload je **AAB bestand** (niet APK voor nieuwe apps)
4. **Release name**: "1.0.0" (of versie nummer)
5. **Release notes**: Beschrijf wat nieuw is in deze versie
6. Klik **"Save"**

### 3.13 Review & Publicatie

1. Controleer alle informatie
2. Klik **"Review release"**
3. Controleer dat alles correct is
4. Klik **"Start rollout to Production"**
5. Wacht op review (meestal 1-7 dagen)
6. Je ontvangt een email wanneer de app is goedgekeurd

---

## 🔄 Updates Publiceren

### iOS Updates:

1. Verhoog versie nummer in:
   - `package.json`: `"version": "1.0.1"`
   - Xcode: Info.plist > Bundle versions string, short
   - Xcode: Info.plist > Bundle version

2. Build en upload:
   ```bash
   npm run build
   npm run cap:sync
   npm run cap:open:ios
   ```
   - Archive en upload via Xcode (zie stap 2.9)

### Android Updates:

1. Verhoog versie nummer in:
   - `package.json`: `"version": "1.0.1"`
   - `android/app/build.gradle`: `versionCode 2` en `versionName "1.0.1"`

2. Build en upload:
   ```bash
   npm run build
   npm run cap:sync
   cd android
   ./gradlew bundleRelease
   ```
   - Upload het nieuwe AAB bestand via Play Console

---

## 📝 Checklist voor Publicatie

### iOS:
- [ ] Apple Developer Account actief
- [ ] Xcode geïnstalleerd
- [ ] App getest op simulator
- [ ] App getest op echt device
- [ ] App icon geconfigureerd (alle sizes)
- [ ] Splash screen geconfigureerd
- [ ] App Store Connect app aangemaakt
- [ ] Screenshots toegevoegd
- [ ] Beschrijving geschreven
- [ ] Privacy policy toegevoegd (indien nodig)
- [ ] App geüpload via Xcode
- [ ] App ingediend voor review

### Android:
- [ ] Google Play Console account actief
- [ ] Android Studio geïnstalleerd
- [ ] App getest op emulator
- [ ] App getest op echt device
- [ ] Keystore aangemaakt en beveiligd
- [ ] App icon geconfigureerd (alle sizes)
- [ ] Splash screen geconfigureerd
- [ ] Release build gemaakt (AAB)
- [ ] Play Console app aangemaakt
- [ ] Screenshots toegevoegd
- [ ] Beschrijving geschreven
- [ ] Data safety formulier ingevuld
- [ ] App geüpload naar Play Console
- [ ] App ingediend voor review

---

## 🆘 Troubleshooting

### iOS:

**Probleem**: "No signing certificate found"
- **Oplossing**: Zorg dat je Apple Developer account is gekoppeld in Xcode > Preferences > Accounts

**Probleem**: "Bundle identifier already exists"
- **Oplossing**: Kies een unieke bundle identifier (bijv. com.vanas.liftlog.app)

**Probleem**: CocoaPods installatie faalt
- **Oplossing**: Update CocoaPods: `sudo gem install cocoapods`

### Android:

**Probleem**: "Gradle sync failed"
- **Oplossing**: Open Android Studio > File > Invalidate Caches / Restart

**Probleem**: "Keystore file not found"
- **Oplossing**: Controleer het pad in `key.properties` en zorg dat het bestand bestaat

**Probleem**: "App not installing on device"
- **Oplossing**: Controleer USB debugging en accepteer de prompt op je device

---

## 📚 Handige Links

- [Capacitor Documentation](https://capacitorjs.com/docs)
- [Apple App Store Connect](https://appstoreconnect.apple.com)
- [Google Play Console](https://play.google.com/console)
- [App Icon Generator](https://www.appicon.co/)
- [Android Asset Studio](https://romannurik.github.io/AndroidAssetStudio/)

---

## 💡 Tips

1. **Test grondig** voordat je publiceert
2. **Bewaar je keystore** op een veilige plek (voor Android)
3. **Maak screenshots** op echte devices voor beste kwaliteit
4. **Schrijf een goede beschrijving** - dit helpt met discoverability
5. **Reageer snel** op reviews en feedback
6. **Update regelmatig** om bugs te fixen en features toe te voegen

Veel succes met je app! 🚀

