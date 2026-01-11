# 📍 Waar Je de Naam Moet Veranderen

## 🎯 Stap-voor-Stap Instructies

### Stap 1: Open Xcode Organizer
- In Xcode, ga naar: **Window → Organizer** (of druk op `Cmd+Shift+9`)
- Of: **Product → Archive** (als je nog geen archive hebt)

### Stap 2: Selecteer Je Archive
- Je ziet een lijst met archives
- Selecteer: **"Van As Personal Training Logs"** (versie 1.0.14, build 14)
- De archive is waarschijnlijk van: **10 Jan 2026 at 22:39**

### Stap 3: Start Distribute App
- Klik op de knop **"Distribute App"** (rechts bovenin)
- Dit opent een wizard

### Stap 4: Kies App Store Connect
- Selecteer: **"App Store Connect"**
- Klik **"Next"**

### Stap 5: Kies Upload
- Selecteer: **"Upload"**
- Klik **"Next"**

### Stap 6: 🔴 HIER is de Dialog!

Nu verschijnt er een dialog met app informatie. **DEZE DIALOG** moet je aanpassen:

#### In deze dialog zie je:

1. **Name** (of App Name):
   - ❌ Nu: "Van As Personal Training Logs"
   - ✅ Verander naar: **"LiftLog"**

2. **SKU** (Stock Keeping Unit):
   - ❌ Nu: "com.vanas.liftlog" (VERKEERD - zelfde als Bundle ID!)
   - ✅ Verander naar: **"liftlog-001"**

3. **Bundle Identifier**:
   - ✅ Blijft: `com.vanas.liftlog` (laat staan!)

4. **Primary Language**:
   - ✅ Blijft: Dutch (Netherlands) (laat staan!)

### Stap 7: Klik Next
- Na het aanpassen van **Name** en **SKU**, klik op **"Next"**
- De upload zou nu moeten werken!

---

## ⚠️ Belangrijk

Deze dialog verschijnt alleen als:
- Er nog **GEEN** app bestaat in App Store Connect met Bundle ID `com.vanas.liftlog`
- Xcode probeert een **NIEUWE** app aan te maken

Als er al een app bestaat met deze Bundle ID, zie je deze dialog **NIET** en uploadt Xcode direct naar de bestaande app.

---

## 🖼️ Wat de Dialog Eruitziet

De dialog heeft meestal:
- Een titel: "App Record Creation" of "Create App Record"
- Meerdere tekstvelden
- Een uitleg: "Your app must be registered with App Store Connect before it can be uploaded."

**Dit is de dialog waar je de naam moet veranderen!**
