# App Store Connect Situatie

## 📋 Situatie

Het project is oorspronkelijk begonnen als **"LiftLog"**, maar later veranderd naar **"Van As Personal Training Logs"**.

## ❌ Huidig Probleem

- Er bestaat al een app in App Store Connect met naam "Van As Personal Training Logs"
- Die app heeft waarschijnlijk een andere Bundle ID (de oude)
- Er bestaat GEEN app met Bundle ID `com.vanas.liftlog`
- Xcode kan de bestaande app niet vinden met Bundle ID `com.vanas.liftlog`

## ✅ Oplossingen

### Optie 1: Gebruik Naam "LiftLog" (Aanbevolen)

Dit is de oorspronkelijke naam, en waarschijnlijk bestaat er al een app met die naam.

**In Xcode dialog:**
- **Name**: "LiftLog" (in plaats van "Van As Personal Training Logs")
- **SKU**: `liftlog-001`
- **Bundle ID**: `com.vanas.liftlog`
- **Primary Language**: Dutch (Netherlands)

**Waarom dit werkt:**
- "LiftLog" is waarschijnlijk niet in gebruik (of je kunt die app updaten)
- Je gebruikt de oorspronkelijke projectnaam
- De naam kan later worden aangepast in App Store Connect als je wilt

### Optie 2: Check App Store Connect

1. Ga naar: https://appstoreconnect.apple.com
2. Login → My Apps
3. Zoek naar apps met:
   - Naam: "LiftLog" → Check Bundle ID
   - Naam: "Van As Personal Training Logs" → Check Bundle ID
4. Als je een app vindt met Bundle ID `com.vanas.liftlog` → gebruik die direct!
5. Als je alleen een app vindt met oude Bundle ID → gebruik Optie 1

### Optie 3: Gebruik Andere Unieke Naam

- **Name**: "VA Training Logs" of "Van As PT" of iets anders unieks
- Dit voorkomt conflicten

---

## 💡 Aanbeveling

**Gebruik "LiftLog" als naam:**
- Dit is de oorspronkelijke naam van het project
- Minder kans op conflicten
- Je kunt altijd later de naam aanpassen in App Store Connect
- In Xcode dialog: verander Name naar **"LiftLog"**

Laat me weten welke naam je wilt gebruiken, dan pas ik het project ook aan als je wilt!
