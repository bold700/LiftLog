# Android Studio - Quick Start Guide

## ✅ Wat je nu moet doen in Android Studio

### Stap 1: Gradle Sync
1. **Wacht tot Gradle sync klaar is** (rechtsonder zie je "Gradle sync" draaien)
2. Als er errors zijn, klik op "Sync Now" bovenaan
3. Wacht tot alles is gedownload en gebouwd

### Stap 2: App Testen op Emulator

#### A. Emulator Opzetten (als je nog geen hebt):
1. Klik op **"Device Manager"** (telefoon icoon in de rechterbovenhoek, of Tools > Device Manager)
2. Klik op **"+ Create Device"**
3. Kies een device (bijv. **Pixel 7** of **Pixel 6**)
4. Klik **"Next"**
5. Download een **System Image** (bijv. **Android 13 (Tiramisu)** - API 33)
   - Klik op download icoon naast de image
   - Accepteer licentie en wacht tot download klaar is
6. Klik **"Next"** en dan **"Finish"**

#### B. Emulator Starten:
1. In Device Manager, klik op de **▶️ Play knop** naast je device
2. Wacht tot de emulator opstart (kan 1-2 minuten duren)

#### C. App Runnen:
1. Zorg dat je emulator is geselecteerd in de device dropdown (bovenaan rechts)
2. Klik op de **groene ▶️ Run knop** (of druk `Shift + F10`)
3. Wacht tot de app wordt gebouwd en geïnstalleerd
4. De app zou nu moeten openen in je emulator!

### Stap 3: App Testen op Echt Device (Optioneel maar Aanbevolen)

#### A. Developer Options Activeren op je Telefoon:
1. Ga naar **Instellingen** op je Android telefoon
2. Ga naar **Over de telefoon** (of **Over het apparaat**)
3. Zoek **"Buildnummer"** (of **"Build number"**)
4. **Tik 7x op Buildnummer** - je ziet een melding "Je bent nu een ontwikkelaar"

#### B. USB Debugging Activeren:
1. Ga terug naar **Instellingen**
2. Ga naar **Systeem** > **Ontwikkelaarsopties** (of **Developer options**)
3. Zet **"USB-foutopsporing"** aan (of **"USB debugging"**)
4. Accepteer de waarschuwing

#### C. Telefoon Verbinden:
1. Verbind je telefoon met USB naar je computer
2. Op je telefoon: Accepteer de **"Allow USB debugging"** prompt (vink "Always allow" aan)
3. In Android Studio: Je telefoon zou nu moeten verschijnen in de device dropdown
4. Selecteer je telefoon
5. Klik **▶️ Run** - de app wordt nu op je telefoon geïnstalleerd!

### Stap 4: App Icon Aanpassen (Optioneel)

Het app icon staat nu op de standaard Capacitor icon. Je kunt dit aanpassen:

1. **Maak een 1024x1024 PNG** van je app icon (gebruik je `app-icon.svg` en converteer naar PNG)
2. Ga naar: https://romannurik.github.io/AndroidAssetStudio/icons-launcher.html
3. Upload je 1024x1024 icon
4. Download de gegenereerde icons
5. In Android Studio:
   - Ga naar `android/app/src/main/res/`
   - Vervang de icons in de `mipmap-*` folders met de gedownloade icons

### Stap 5: Test de App

Test deze functionaliteiten:
- [ ] App opent zonder crashes
- [ ] Alle tabs werken (Spiergroepen, Oefeningen, Logs, Toevoegen)
- [ ] Je kunt een workout toevoegen
- [ ] Data wordt opgeslagen (sluit app, heropen, data is er nog)
- [ ] Navigatie werkt soepel

---

## 🚀 Volgende Stap: Release Build Maken voor Play Store

Als alles werkt, kun je een release build maken voor de Play Store. Zie `APP_STORE_DEPLOYMENT.md` sectie 3.8 voor instructies.

**Belangrijk**: Voor de Play Store heb je een **keystore** nodig om de app te ondertekenen. Dit is een eenmalige setup.

---

## ❓ Troubleshooting

### "Gradle sync failed"
- **Oplossing**: Klik op File > Invalidate Caches / Restart > Invalidate and Restart
- Of: Tools > SDK Manager > Controleer dat Android SDK is geïnstalleerd

### "Device not found"
- **Oplossing**: Controleer USB debugging op je telefoon
- Of: Installeer USB drivers voor je telefoon (vaak via fabrikant website)

### "Build failed"
- **Oplossing**: Controleer dat alle dependencies zijn gedownload
- Klik op: File > Sync Project with Gradle Files

### App crasht bij openen
- **Oplossing**: Controleer Logcat (onderaan Android Studio) voor errors
- Zorg dat `npm run cap:sync` is gedraaid voordat je opent in Android Studio

---

## 💡 Tips

1. **Altijd eerst sync doen**: Voordat je de app runt, zorg dat je `npm run cap:sync` hebt gedraaid na code changes
2. **Gebruik Logcat**: Onderaan Android Studio zie je Logcat - hier staan alle app logs en errors
3. **Hot Reload werkt niet**: Je moet de app opnieuw builden na elke code change (maar dat is snel met Capacitor)

---

## 📱 Klaar om te Publiceren?

Zie `APP_STORE_DEPLOYMENT.md` voor:
- Release build maken (sectie 3.8)
- Google Play Console setup (sectie 3.9)
- App uploaden (sectie 3.12)

Veel succes! 🎉

