# Xcode Setup Instructies voor LiftLog

## ⚠️ Belangrijk: CocoaPods Installatie Vereist

De iOS app heeft CocoaPods dependencies nodig die alleen op een **Mac** kunnen worden geïnstalleerd. Als je op Windows werkt, moet je dit op een Mac doen of een Mac gebruiken (via SSH, remote access, etc.).

## 🔧 Stap-voor-stap Setup

### Stap 1: CocoaPods Installeren (Mac vereist)

Open Terminal op je Mac en voer uit:

```bash
sudo gem install cocoapods
```

Als je een foutmelding krijgt, probeer dan:

```bash
sudo gem install cocoapods --user-install
```

### Stap 2: Navigeer naar iOS Folder

```bash
cd ios/App
```

### Stap 3: Installeer iOS Dependencies

```bash
pod install
```

Dit kan enkele minuten duren. Je ziet output zoals:
```
Analyzing dependencies
Downloading dependencies
Installing Capacitor (7.4.4)
Installing CapacitorApp (7.1.0)
...
```

### Stap 4: Open Xcode Workspace

**BELANGRIJK**: Open altijd het `.xcworkspace` bestand, NIET het `.xcodeproj` bestand!

```bash
open App.xcworkspace
```

Of via npm script:
```bash
cd ../..
npm run cap:open:ios
```

### Stap 5: Configureer Signing in Xcode

1. Selecteer het **project** in de navigator (linksboven)
2. Selecteer het **"App" target** onder TARGETS
3. Ga naar het tabblad **"Signing & Capabilities"**
4. Vink **"Automatically manage signing"** aan
5. Selecteer je **Team** (je Apple Developer account)
   - Voor simulator testen: Team is optioneel
   - Voor echt device: Team is vereist

### Stap 6: Selecteer Simulator of Device

Bovenin Xcode, naast de Play-knop:
- Kies een **simulator** (bijv. "iPhone 15 Pro") voor testen
- Of kies je **verbonden iPhone/iPad** voor device testen

### Stap 7: Build en Run

- Klik op de **Play-knop** (▶️) of druk `Cmd + R`
- De app wordt gebouwd en gestart

## 🔄 Workflow voor Testen

Na elke code wijziging:

```bash
# 1. Build en sync
npm run cap:sync

# 2. Open Xcode (op Mac)
npm run cap:open:ios

# 3. In Xcode: Cmd + R om te runnen
```

## ❌ Veelvoorkomende Problemen

### Probleem: "No Podfile found" of "pod: command not found"
**Oplossing**: 
- Zorg dat CocoaPods is geïnstalleerd: `sudo gem install cocoapods`
- Controleer of je in de juiste folder bent: `cd ios/App`

### Probleem: "Workspace is leeg"
**Oplossing**: 
- Voer `pod install` uit in de `ios/App` folder
- Dit genereert de `Pods` folder en werkt de workspace bij

### Probleem: "Build Failed" - Missing Pods
**Oplossing**: 
- Zorg dat `pod install` is uitgevoerd
- Sluit Xcode
- Verwijder `ios/App/Pods` folder (als die bestaat)
- Verwijder `ios/App/Podfile.lock`
- Voer opnieuw `pod install` uit
- Open opnieuw `App.xcworkspace`

### Probleem: "No signing certificate found"
**Oplossing**: 
- Voor simulator: Team is niet nodig
- Voor echt device: 
  - Ga naar Xcode > Preferences > Accounts
  - Voeg je Apple ID toe
  - Selecteer je Team in Signing & Capabilities

### Probleem: "Bundle identifier already exists"
**Oplossing**: 
- Wijzig de Bundle Identifier in Xcode naar iets unieks
- Bijvoorbeeld: `com.vanas.liftlog.dev`

## 📝 Checklist

- [ ] CocoaPods geïnstalleerd op Mac
- [ ] `pod install` uitgevoerd in `ios/App` folder
- [ ] `App.xcworkspace` geopend (niet `.xcodeproj`)
- [ ] Signing geconfigureerd in Xcode
- [ ] Simulator of device geselecteerd
- [ ] App succesvol gebouwd en gerund

## 💡 Tips

1. **Gebruik altijd de workspace**: Open altijd `App.xcworkspace`, nooit `App.xcodeproj` direct
2. **Clean build**: Als je vreemde errors krijgt, probeer Product > Clean Build Folder (Shift+Cmd+K)
3. **Pod update**: Als je nieuwe Capacitor plugins toevoegt, voer `pod install` opnieuw uit
4. **Simulator vs Device**: Test eerst op simulator, dan op echt device

## 🆘 Hulp Nodig?

Als je problemen blijft houden:
1. Controleer of alle stappen zijn gevolgd
2. Zorg dat je de nieuwste versie van Xcode hebt
3. Controleer de Capacitor documentatie: https://capacitorjs.com/docs/ios


