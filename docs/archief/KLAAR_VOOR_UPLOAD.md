# ✅ Alles Klaar voor Upload - "Van As Personal Training Logs"

## 📋 Checklist voor Upload

### ✅ Huidige Instellingen (Alles Correct!)

**Xcode Project:**
- ✅ **Display Name**: "Van As Personal Training Logs"
- ✅ **Bundle ID**: `com.vanas.liftlog`
- ✅ **Version**: `1.0.14`
- ✅ **Build**: `14`
- ✅ **App Category**: Sports

**Info.plist:**
- ✅ CFBundleDisplayName: "Van As Personal Training Logs"
- ✅ CFBundleName: "Van As Personal Training Logs"
- ✅ CFBundleShortVersionString: `1.0.14`
- ✅ CFBundleVersion: `14`

**Localization:**
- ✅ Dutch (nl-NL): "Van As Personal Training Logs"
- ✅ English (en): "Van As Personal Training Logs"

---

## 🔴 Wat Je Moet Doen in Xcode Dialog

Wanneer je **"Distribute App"** doet en de dialog verschijnt voor app informatie:

### Verplichte Velden:

1. **Name**: 
   - ✅ **"Van As Personal Training Logs"** (blijft zo)

2. **SKU** ⚠️ BELANGRIJK:
   - ❌ Verander **NIET** naar `com.vanas.liftlog` (dit is verkeerd!)
   - ✅ Type: **`liftlog-001`** of **`van-as-liftlog-001`**

3. **Bundle Identifier**:
   - ✅ **`com.vanas.liftlog`** (laat staan - dit is correct)

4. **Primary Language**:
   - ✅ **Dutch (Netherlands)** (laat staan)

### ⚠️ Belangrijk: SKU

De **SKU** (Stock Keeping Unit) is **NIET** hetzelfde als de Bundle ID!

- ❌ **VERKEERD**: `com.vanas.liftlog` (dit is de Bundle ID!)
- ✅ **CORRECT**: `liftlog-001` (een unieke identifier voor interne tracking)

De SKU wordt gebruikt door Apple voor interne tracking en hoeft NIET hetzelfde te zijn als je Bundle ID.

---

## 📝 Stap-voor-Stap Upload Instructies

### Stap 1: Verwijder Oude App in App Store Connect

1. Ga naar: https://appstoreconnect.apple.com
2. Login met je Apple Developer account
3. Klik op **"My Apps"**
4. Zoek de oude app "Van As Personal Training Logs" (met andere Bundle ID)
5. Klik op de app
6. Ga naar **App Information**
7. Scroll naar beneden → **"Remove App"** (of "Delete App")
8. Bevestig verwijdering

⚠️ **LET OP**: Verwijder alleen de oude app met een **andere** Bundle ID, NIET een app met Bundle ID `com.vanas.liftlog`!

### Stap 2: Wacht Even

- Wacht 5-10 minuten nadat je de app hebt verwijderd
- App Store Connect moet tijd hebben om de naam vrij te geven

### Stap 3: Upload vanuit Xcode

1. **Open Xcode Organizer**:
   - Window → Organizer (of `Cmd+Shift+9`)

2. **Selecteer je Archive**:
   - "Van As Personal Training Logs"
   - Versie: 1.0.14 (14)
   - Datum: 10 Jan 2026 at 22:39

3. **Klik "Distribute App"**

4. **Selecteer**:
   - "App Store Connect" → **Next**
   - "Upload" → **Next**

5. **In de Dialog** (Create App Record):
   - **Name**: "Van As Personal Training Logs" ✅
   - **SKU**: `liftlog-001` ⚠️ (NIET `com.vanas.liftlog`!)
   - **Bundle Identifier**: `com.vanas.liftlog` ✅
   - **Primary Language**: Dutch (Netherlands) ✅
   - Klik **"Next"**

6. **Selecteer Team**:
   - Kenny Timmer (YR94KX729G)
   - Klik **"Next"**

7. **Automatic Signing**:
   - Laat automatische signing aan
   - Klik **"Next"**

8. **Review**:
   - Controleer alles
   - Klik **"Upload"**

9. **Wacht**:
   - Upload kan 10-30 minuten duren
   - Je ziet progress in Xcode

---

## ✅ Na Upload

1. **Wacht op processing**:
   - Ga naar App Store Connect
   - Klik op je nieuwe app "Van As Personal Training Logs"
   - Wacht tot de build is verwerkt (kan 30-60 minuten duren)

2. **Create App Store Listing**:
   - Voeg app beschrijving toe
   - Upload screenshots
   - Voeg privacy policy URL toe
   - Vul alle vereiste velden in

3. **Submit for Review**:
   - Selecteer je build
   - Klik "Submit for Review"

---

## 🎯 Samenvatting

**Alles is klaar voor upload!** 

Je hoeft alleen maar:
1. ✅ Oude app verwijderen in App Store Connect
2. ✅ Wachten 5-10 minuten
3. ✅ Upload via Xcode met juiste SKU: `liftlog-001`

**Belangrijkste punt**: De SKU in de Xcode dialog moet `liftlog-001` zijn, NIET `com.vanas.liftlog`!
