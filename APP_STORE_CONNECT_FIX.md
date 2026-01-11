# App Store Connect Fout - App Naam Al In Gebruik

## ❌ Foutmelding:
"App Record Creation failed... The app name you entered is already being used for another app in your account."

## 🔍 Waarom gebeurt dit?

De app naam "Van As Personal Training Logs" bestaat al in je App Store Connect account. Dit kan zijn:
- Een eerdere versie van deze app
- Een andere app met dezelfde naam
- De oude app met Bundle ID `com.kennytimmer.vanaspersonaltraininglogs`

## ✅ Oplossingen:

### Optie 1: Gebruik de Bestaande App (Aanbevolen)

Als je een bestaande app hebt met Bundle ID `com.vanas.liftlog`:

1. **Ga naar App Store Connect**: https://appstoreconnect.apple.com
2. **Login** met je Apple Developer account
3. **Klik op "My Apps"**
4. **Zoek** naar "Van As Personal Training Logs" of app met Bundle ID `com.vanas.liftlog`
5. **Klik** op de bestaande app
6. **Upload direct** via Xcode zonder nieuwe app aan te maken:
   - In Xcode: Selecteer je archive
   - Klik **"Distribute App"**
   - Kies **"App Store Connect"**
   - **BELANGRIJK**: Selecteer **"Use existing app"** of **"Update existing app"** (niet "Create new app")
   - Volg de wizard

### Optie 2: Wijzig App Naam

Als je een NIEUWE app wilt maken (niet aanbevolen):

1. **Verander de app naam** in Xcode:
   - Open project
   - Selecteer target
   - General tab → **Display Name** → verander naar bijv. "LiftLog" of "VA Training Logs"

2. **Upload opnieuw** via Xcode

### Optie 3: Verwijder Oude App (Alleen als zeker)

Als je zeker weet dat je de oude app niet meer nodig hebt:

1. **Ga naar App Store Connect**
2. **Zoek** de oude app
3. **Verwijder** de app (Let op: dit is permanent!)

## 💡 Aanbevolen Actie

**Gebruik Optie 1**: Als je een bestaande app hebt met Bundle ID `com.vanas.liftlog`, gebruik die dan. Dit is de snelste en makkelijkste oplossing.

In Xcode, bij "Distribute App" → "App Store Connect" → kies **"Use existing app"** in plaats van "Create new app".

## 🔍 Check App Store Connect

1. Login op: https://appstoreconnect.apple.com
2. Kijk welke apps je hebt
3. Check of er al een app is met Bundle ID `com.vanas.liftlog`

Als die bestaat, kun je daar direct naar uploaden!
