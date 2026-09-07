# Hoe een Update Uploaden (Niet Nieuwe App)

## ❌ Het Probleem
Xcode probeert een NIEUWE app aan te maken in plaats van een update te uploaden naar de bestaande app.

## ✅ Oplossing: Update Uploaden

### Methode 1: Via Xcode Organizer (Aanbevolen)

1. **In Xcode Organizer** (waar je nu bent):
   - Je ziet je archive: "Van As Personal Training Logs 1.0.14 (14)"
   - Klik op **"Distribute App"**

2. **In de wizard:**
   - Kies **"App Store Connect"**
   - Klik **"Next"**
   
3. **BELANGRIJK - Skip App Creation:**
   - Als je een dialog ziet met "Create new app" of "App Record Creation"
   - Kies **"Use existing app"** of **"Skip this step"**
   - Of klik **"Cancel"** en probeer anders

4. **Direct Upload:**
   - De wizard zou je moeten vragen welke bestaande app je wilt updaten
   - Selecteer de bestaande app met Bundle ID `com.vanas.liftlog`
   - Of: Xcode zou automatisch de juiste app moeten detecteren
   - Volg de rest van de wizard
   - Klik **"Upload"**

### Methode 2: Via App Store Connect (Alternatief)

Als Xcode niet wil meewerken:

1. **Maak eerst de archive** (al gedaan ✅)
2. **Export als IPA:**
   - In Organizer → "Distribute App"
   - Kies **"Export"** (niet "Upload")
   - Kies **"Development"** of **"Ad Hoc"** 
   - Volg wizard en exporteer
3. **Upload via App Store Connect:**
   - Ga naar: https://appstoreconnect.apple.com
   - Login → My Apps → Selecteer je app
   - Ga naar versie pagina
   - Klik **"Create new version"** (bijv. 1.0.14)
   - Upload het IPA bestand handmatig

### Methode 3: Forceer "Existing App" Selectie

1. **In Xcode Organizer:**
   - Klik **"Distribute App"**
   - Kies **"App Store Connect"**
   - **Belangrijk**: Als je de "App Record Creation" dialog ziet
   - Klik **"Cancel"**
   - Probeer opnieuw, maar deze keer:
     - Kies **"Automatically manage signing"**
     - Xcode zou dan de bestaande app moeten detecteren

### Methode 4: Validate Eerst

Soms helpt het om eerst te valideren:

1. In Organizer → Selecteer je archive
2. Klik **"Validate App"**
3. Kies "App Store Connect"
4. Selecteer je bestaande app
5. Na validatie → "Distribute App" → zou nu moeten werken

## 🔍 Waarom Gaat Dit Mis?

Xcode ziet mogelijk niet direct welke bestaande app je wilt updaten. Dit kan gebeuren als:
- Je account meerdere apps heeft
- De Bundle ID matching niet perfect is
- Xcode de bestaande app niet kan detecteren

## ✅ Beste Aanpak

**Probeer eerst Methode 1**, maar:
- Wanneer je de "App Record Creation" dialog ziet
- Kijk of er een **"Use existing app"** of **"Skip"** optie is
- Of klik **"Cancel"** en probeer **"Validate App"** eerst
- Dan **"Distribute App"** opnieuw

**Als dat niet werkt**, gebruik Methode 2 (handmatig via App Store Connect).

## 💡 Tip

Als Xcode blijft vragen om een nieuwe app aan te maken, kan het helpen om:
1. Xcode te sluiten
2. In te loggen op App Store Connect en te verifiëren dat de app bestaat
3. Xcode opnieuw te openen en opnieuw te proberen

De app zou automatisch moeten worden gedetecteerd op basis van Bundle ID `com.vanas.liftlog`.
