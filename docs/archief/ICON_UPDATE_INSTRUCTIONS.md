# Icon Update Instructies

De app iconen zijn bijgewerkt volgens het Figma ontwerp:
- **Achtergrondkleur**: Beige (#F2E4D3)
- **Logo**: Zwart VA logo

## Wat is al gedaan:
✅ Vector drawables bijgewerkt (voor Android 7.1+)
✅ Achtergrondkleur aangepast naar beige

## Wat nog moet worden gedaan:
De PNG iconen in de `mipmap-*` folders moeten worden geregenereerd om overeen te komen met het nieuwe ontwerp.

### Stap 1: Maak een 1024x1024 PNG van het SVG bestand
1. Open `public/app-icon.svg` in een image editor (bijv. Inkscape, Figma, Adobe Illustrator)
2. Export als PNG met 1024x1024 pixels
3. Zorg dat de achtergrond beige (#F2E4D3) is en het VA logo zwart

### Stap 2: Genereer Android iconen met Android Asset Studio
1. Ga naar: https://romannurik.github.io/AndroidAssetStudio/icons-launcher.html
2. Upload je 1024x1024 PNG
3. Configureer:
   - **Background**: Beige (#F2E4D3)
   - **Foreground**: Je logo (zwart VA logo)
   - **Padding**: 0% (of kleine padding als nodig)
4. Download de gegenereerde iconen

### Stap 3: Vervang de iconen in het project
1. Pak het gedownloade zip bestand uit
2. Vervang de bestanden in `android/app/src/main/res/mipmap-*/` met de nieuwe iconen:
   - `mipmap-mdpi/ic_launcher.png`
   - `mipmap-mdpi/ic_launcher_round.png`
   - `mipmap-mdpi/ic_launcher_foreground.png`
   - Herhaal voor alle andere mipmap folders (hdpi, xhdpi, xxhdpi, xxxhdpi)

### Stap 4: Test de iconen
1. Build de app: `npm run build && npm run cap:sync`
2. Open in Android Studio: `npm run cap:open:android`
3. Test op een device of emulator om te verifiëren dat de iconen correct worden weergegeven

### Alternatief: Gebruik Capacitor Assets Plugin
Als je liever een geautomatiseerde oplossing wilt, kun je overwegen om een Capacitor plugin te gebruiken zoals `@capacitor/assets` om iconen automatisch te genereren.

## Notities
- De vector drawables zijn al bijgewerkt en werken voor Android 7.1+
- De PNG bestanden worden gebruikt voor oudere Android versies en in bepaalde contexten
- Zorg dat alle mipmap folders (mdpi, hdpi, xhdpi, xxhdpi, xxxhdpi) worden bijgewerkt
