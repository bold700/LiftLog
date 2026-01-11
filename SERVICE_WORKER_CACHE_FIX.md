# Service Worker Cache Fix

Het probleem is waarschijnlijk dat de Service Worker (PWA) de oude versie cached heeft. Hier zijn verschillende oplossingen:

## Oplossing 1: Service Worker Unregisteren in Simulator (Snelst)

1. **In Xcode, run de app op de simulator**
2. **Open Safari Developer Tools**:
   - In Safari (op je Mac): Develop > [Simulator naam] > [App naam]
   - Of: Window > [Simulator naam] > [App naam]
3. **Ga naar de "Application" tab** (of "Toepassing" in Nederlands)
4. **In de linker sidebar**: Klik op "Service Workers"
5. **Klik op "Unregister"** naast de geregistreerde service worker
6. **In de linker sidebar**: Klik op "Storage"
7. **Klik "Clear Site Data"** om alle cached data te verwijderen
8. **Stop en start de app opnieuw** in de simulator

## Oplossing 2: Service Worker Tijdelijk Uitschakelen

Als je de service worker tijdelijk wilt uitschakelen voor testing, kun je de `registerSW.js` aanpassen om niet te registreren in development mode.

## Oplossing 3: Hard Reload in Simulator

1. **Stop de app** in Xcode
2. **Verwijder de app** van het simulator homescreen
3. **In Xcode**: Product > Clean Build Folder (Shift + Cmd + K)
4. **Rebuild en run** opnieuw

## Oplossing 4: Simulator Reset

1. **In Simulator**: Device > Erase All Content and Settings
2. Dit verwijdert alle data, inclusief service worker cache

## Verificatie

Na het clearen van de cache, zou je de nieuwe versie moeten zien die overeenkomt met localhost.