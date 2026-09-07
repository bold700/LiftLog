# ⚠️ Belangrijke Correctie voor Xcode Dialog

## 🔴 Het Probleem

Uit de logs blijkt dat er **TWEE** dingen verkeerd zijn:

1. ❌ **Name**: "Van As Personal Training Logs" - deze naam bestaat al in App Store Connect
2. ❌ **SKU**: `com.vanas.liftlog` - dit is **VERKEERD**! De SKU mag NIET hetzelfde zijn als de Bundle ID!

## ✅ De Oplossing

Wanneer Xcode de dialog toont om app informatie in te voeren, moet je **ALLE TWEE** velden aanpassen:

### Velden die je MOET veranderen:

1. **Name**: 
   - ❌ Verkeerd: "Van As Personal Training Logs"
   - ✅ Correct: **"LiftLog"**

2. **SKU** (Stock Keeping Unit):
   - ❌ Verkeerd: `com.vanas.liftlog` (dit is hetzelfde als Bundle ID!)
   - ✅ Correct: **`liftlog-001`** (of iets anders unieks, maar NIET hetzelfde als Bundle ID)

### Velden die je NIET verandert:

- ✅ **Bundle Identifier**: `com.vanas.liftlog` (blijft hetzelfde)
- ✅ **Primary Language**: Dutch (Netherlands) (blijft hetzelfde)

## 📝 Stap-voor-Stap

1. In Xcode, klik **"Distribute App"**
2. Selecteer **"App Store Connect"**
3. Selecteer **"Upload"**
4. Wanneer de dialog verschijnt met app informatie:
   - **Name**: Type `LiftLog`
   - **SKU**: Type `liftlog-001` (VERGEET NIET OM DEZE TE VERANDEREN!)
   - **Bundle Identifier**: `com.vanas.liftlog` (laat staan)
   - **Primary Language**: Dutch (Netherlands) (laat staan)
5. Klik **"Next"**

## ⚠️ Belangrijk

De SKU is **NIET** hetzelfde als de Bundle ID! 
- Bundle ID = `com.vanas.liftlog` (identificeert je app)
- SKU = `liftlog-001` (een unieke code voor interne tracking)

Als je de SKU hetzelfde maakt als de Bundle ID, krijg je problemen!

---

**Probeer het opnieuw met deze correcties!**
