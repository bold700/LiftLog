# 💪 LiftLog - Fitness Progressie Tracker

Een moderne Progressive Web App (PWA) voor het bijhouden van je fitness workouts en progressie, gebouwd met React, TypeScript en Material Design 3.

## ✨ Features

- 📊 **Progressie Tracking**: Volg je gewicht progressie per oefening over tijd
- 📈 **Volume Tracking**: Bereken en volg totaal volume (sets × reps × gewicht)
- 💾 **Offline First**: Alle data wordt lokaal opgeslagen - werkt zonder internet
- 🎯 **Oefening Database**: 80+ oefeningen met metadata (spiergroepen, bewegingstypes)
- 📱 **Mobiel App**: Installeer als app op je telefoon (PWA)
- 🎨 **Material Design 3**: Moderne, beige-themed UI
- 📸 **Exercise Images**: Automatische oefening afbeeldingen via ExerciseDB API

## 🚀 Quick Start

### Installatie

```bash
# Installeer dependencies
npm install

# Start development server
npm run dev

# Build voor productie
npm run build

# Preview productie build
npm run preview
```

## 📱 App Installeren

### Als PWA (Progressive Web App):
**Android:**
1. Open in Chrome browser
2. Menu → "Toevoegen aan startscherm"
3. Bevestig installatie

**iOS:**
1. Open in Safari browser
2. Deel-knop → "Voeg toe aan beginscherm"
3. Bevestig met "Toevoegen"

### Als Native App:
De app kan ook worden geïnstalleerd als native app via de App Store (iOS) en Play Store (Android). Zie [APP_STORE_DEPLOYMENT.md](./APP_STORE_DEPLOYMENT.md) voor instructies.

## 🌐 Deployment

### Web Deployment (PWA)
Zie [DEPLOYMENT.md](./DEPLOYMENT.md) voor gedetailleerde instructies voor web deployment.

**Snelle opties:**
- **Vercel**: `vercel` (aanbevolen)
- **Netlify**: `netlify deploy --prod --dir=dist`
- **GitHub Pages**: `npm run deploy` (na setup)

### Native App Deployment (App Store & Play Store)
Zie [APP_STORE_DEPLOYMENT.md](./APP_STORE_DEPLOYMENT.md) voor complete instructies om de app te publiceren in de Apple App Store en Google Play Store.

**Quick start voor native apps:**
```bash
# Build en sync naar native platforms
npm run cap:sync

# Open iOS project (Mac vereist)
npm run cap:open:ios

# Open Android project
npm run cap:open:android
```

## 🛠️ Tech Stack

- **React 18** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Material UI (MUI)** - Component library
- **Material Web Components** - M3 buttons & navigation
- **Recharts** - Data visualisatie
- **PWA** - Progressive Web App support
- **Capacitor** - Native app wrapper (iOS & Android)
- **ExerciseDB API** - Oefening afbeeldingen

## 📦 Project Structuur

```
src/
├── components/
│   └── Statistics.tsx    # Hoofdcomponent met alle functionaliteit
├── data/
│   ├── exercises.ts     # Oefening database
│   └── exerciseMetadata.ts  # Gedetailleerde metadata
├── utils/
│   ├── storage.ts       # LocalStorage helpers
│   └── exercisedb.ts    # ExerciseDB API integratie
├── styles/
│   └── material-web-theme.css  # Material Web Components styling
└── theme.ts            # MUI theme configuratie
```

## 📝 Features Uitleg

### Statistieken
- **Overzicht**: Algemene stats wanneer geen oefening geselecteerd
- **Specifiek**: Gedetailleerde progressie per oefening met grafieken
- **Inzichten**: Spiergroep analyse, push/pull ratio, bewegingstype verdeling

### Oefeningen
- **Toevoegen**: FAB button → snel nieuwe workout loggen
- **Bewerken**: Klik op edit icon bij elke log entry
- **Verwijderen**: Klik op delete icon met bevestiging

### Data
- Alle data wordt opgeslagen in browser localStorage
- Geen server of account nodig
- Privacy-vriendelijk - data blijft op je device

## 🔥 Firebase (optioneel)

Voor cloud-opslag kun je Firebase/Firestore aanzetten. **Geen keys in Git:**

1. Kopieer `.env.example` naar `.env`
2. Vul in `.env` je Firebase-waarden in (uit de Firebase Console)
3. Het bestand `.env` staat in `.gitignore` en wordt **niet** geüpload naar Git

Commit alleen `.env.example` (met placeholders); je echte keys blijven lokaal in `.env`.

## 🎨 Customization

### Kleuren Aanpassen
Bewerk `src/theme.json` of `src/theme.ts` voor kleuraanpassingen.

### Oefeningen Toevoegen
Bewerk `src/data/exerciseMetadata.ts` om nieuwe oefeningen toe te voegen met metadata.

## 📄 Licentie

Privé project - Alle rechten voorbehouden.

## 🙏 Credits

- **ExerciseDB API** voor oefening afbeeldingen
- **Material Design 3** voor UI guidelines
- **Recharts** voor data visualisatie

---

Gemaakt met ❤️ voor fitness enthousiastelingen
