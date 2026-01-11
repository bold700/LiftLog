# Xcode Cache Fix - Simulator Laadt Oude Versie

## Probleem
De simulator laadt nog steeds de oude versie, zelfs na:
- ✅ Build & sync uitgevoerd
- ✅ Bestanden zijn identiek in dist/ en ios/App/App/public/
- ✅ App verwijderd en opnieuw geïnstalleerd

## Oplossing: Xcode Derived Data Clearen

De iOS simulator/WKWebView cache zit in Xcode's Derived Data. Volg deze stappen:

### Stap 1: Xcode Sluiten
Sluit Xcode volledig (Cmd + Q)

### Stap 2: Derived Data Verwijderen
1. Open Terminal
2. Voer uit:
   ```bash
   rm -rf ~/Library/Developer/Xcode/DerivedData/*
   ```
   
   Of handmatig:
   - Open Finder
   - Ga naar: `~/Library/Developer/Xcode/DerivedData/`
   - Verwijder alle mappen (of alleen die van dit project)

### Stap 3: Simulator Resetten
1. Open Simulator app
2. Device > Erase All Content and Settings...
3. Bevestig

### Stap 4: Xcode Opnieuw Openen
1. Open Xcode opnieuw
2. Open project: `ios/App/App.xcworkspace`
3. Product > Clean Build Folder (Shift + Cmd + K)
4. Product > Build (Cmd + B)
5. Product > Run (Cmd + R)

## Alternatief: Specifiek Project Derived Data

Als je alleen dit project wilt resetten:

```bash
# Vind de project derived data
ls -la ~/Library/Developer/Xcode/DerivedData/ | grep -i liftlog

# Verwijder alleen deze folder
rm -rf ~/Library/Developer/Xcode/DerivedData/[PROJECT_FOLDER]
```

## Waarom Dit Werkt

WKWebView (de webview die Capacitor gebruikt) cached JavaScript en HTML bestanden. Zelfs als je de bestanden update, blijft de oude versie in de cache. Door Derived Data te clearen, forceer je Xcode om alles opnieuw te bouwen en de WKWebView cache te resetten.

## Verificatie

Na deze stappen zou je moeten zien:
- ✅ Filter dropdown in AddPage (zoals op localhost)
- ✅ "Inzichten" in plaats van "Spiergroepen" in navigatie
- ✅ Alle nieuwe functionaliteit werkt
