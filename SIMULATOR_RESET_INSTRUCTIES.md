# Simulator Reset Instructies

Als je de oude versie van de app ziet in de simulator, volg deze stappen:

## ✅ Stap 1: Build & Sync (Al gedaan)
- ✅ Build uitgevoerd: `npm run build`
- ✅ Sync uitgevoerd: `npx cap sync ios`

## 🔄 Stap 2: App Verwijderen in Simulator

1. **Stop de app** als die nog draait (druk op Stop in Xcode, of swipe de app weg)
2. **Verwijder de app** van het simulator homescreen:
   - Houd de app icon ingedrukt
   - Kies "Remove App" of sleep naar prullenbak
   - Bevestig met "Delete App"

## 🧹 Stap 3: Clean Build in Xcode

1. Open Xcode (als die nog niet open is):
   ```bash
   npm run cap:open:ios
   ```
   Of open handmatig: `ios/App/App.xcworkspace`

2. **Clean Build Folder**:
   - Ga naar: **Product > Clean Build Folder** (of druk `Shift + Cmd + K`)
   - Dit verwijdert alle oude build artifacts

## 🔄 Stap 4: Reset Simulator (Optioneel maar Aanbevolen)

Als de app nog steeds de oude versie toont:

1. **In Xcode**: 
   - Ga naar: **Device > Erase All Content and Settings...**
   - Bevestig dat je de simulator wilt resetten

2. **Of in Simulator App**:
   - Ga naar: **Device > Erase All Content and Settings...**

## ▶️ Stap 5: Opnieuw Builden en Run

1. In Xcode, selecteer een simulator (bijv. iPhone 16 Pro)
2. Klik op de **Play knop** (▶️) of druk `Cmd + R`
3. De app wordt opnieuw gebouwd en geïnstalleerd met de nieuwe versie

## 🔍 Alternatief: Hard Reload in Safari Web Inspector

Als de app draait maar je ziet nog oude content:

1. In Xcode: **Debug > View Debugging > Capture View Hierarchy** is niet nodig
2. **Stop de app** en **start opnieuw** (dit is meestal voldoende)

## 💡 Waarom gebeurt dit?

De simulator cacht soms de oude web assets. Door de app te verwijderen en opnieuw te installeren, zorg je dat alle bestanden vers zijn.

## ✅ Verificatie

Na het opnieuw runnen, zou je moeten zien:
- ✅ De nieuwe versie van de app
- ✅ Alle recente wijzigingen zichtbaar
- ✅ Geen oude cached content meer