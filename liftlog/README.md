# LiftLog voor Simone

Een minimalistische, snelle trainingslog-app waarmee klanten hun gewichten per oefening kunnen bijhouden en progressie kunnen delen met Simone (trainer).

## Features

- ✅ Offline-first: Alle logs gaan eerst naar SQLite; achtergrond-sync met Supabase
- ✅ Snel loggen: één tik om vorige set te kopiëren, pijltjes ±2.5 kg
- ✅ PR detectie: nieuw hoogste gewicht of reps → badge "PR 🎉"
- ✅ Progressie tracking: lijn/kolom grafieken, 1RM schatting (Epley), volume per week
- ✅ Delen met trainer: read-only web view via Supabase Row Level Security
- ✅ Herinneringen: push notificaties op gekozen dagen/tijden
- ✅ Meertalig: Nederlands (standaard) en Engels

## Stack

- React Native + Expo (TypeScript)
- Zustand voor state management
- Expo SQLite voor offline storage
- Supabase als backend (auth + sync + row level security)
- Expo Router voor navigatie
- Zod voor schema-validatie
- date-fns voor datums
- Victory Native voor grafieken

## Setup

### 1. Clone en installeer dependencies

```bash
cd liftlog
npm install
```

### 2. Supabase Setup

1. Maak een nieuw Supabase project op [supabase.com](https://supabase.com)
2. Kopieer de SQL uit de sectie "Database Schema" hieronder en voer deze uit in de SQL Editor
3. Kopieer `.env.example` naar `.env` en vul je Supabase credentials in:
   - `EXPO_PUBLIC_SUPABASE_URL`: Je Supabase project URL
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`: Je Supabase anon key

### 3. Database Schema (Supabase SQL)

Voer dit uit in de Supabase SQL Editor:

```sql
-- Profiles table
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text,
  unit text default 'kg',
  created_at timestamp with time zone default now()
);

-- Exercises table
create table exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  name text not null,
  muscle_group text check (muscle_group in ('legs','push','pull','core','other')) default 'other',
  created_at timestamptz default now()
);

-- Sessions table
create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  notes text
);

-- Set logs table
create table set_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  exercise_id uuid references exercises(id) on delete cascade,
  performed_at timestamptz not null default now(),
  weight_kg numeric not null check (weight_kg >= 0),
  reps int not null check (reps > 0),
  rpe numeric,
  is_pr boolean default false,
  synced_at timestamptz
);

-- Trainer links table (voor delen met Simone)
create table trainer_links (
  id uuid primary key default gen_random_uuid(),
  trainee_id uuid references profiles(id) on delete cascade,
  trainer_email text not null,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Row Level Security
alter table profiles enable row level security;
alter table exercises enable row level security;
alter table sessions enable row level security;
alter table set_logs enable row level security;
alter table trainer_links enable row level security;

-- RLS Policies
create policy "own_rows" on profiles
for select using (auth.uid() = id);

create policy "own_exercises" on exercises
for select using (auth.uid() = user_id),
for insert with check (auth.uid() = user_id),
for update using (auth.uid() = user_id),
for delete using (auth.uid() = user_id);

create policy "own_sessions" on sessions
for select using (auth.uid() = user_id),
for insert with check (auth.uid() = user_id),
for update using (auth.uid() = user_id),
for delete using (auth.uid() = user_id);

create policy "own_set_logs" on set_logs
for select using (session_id in (select id from sessions where user_id = auth.uid())),
for insert with check (session_id in (select id from sessions where user_id = auth.uid())),
for update using (session_id in (select id from sessions where user_id = auth.uid())),
for delete using (session_id in (select id from sessions where user_id = auth.uid()));
```

### 4. Run de app

```bash
# Start Expo dev server
npm start

# Voor iOS (vereist macOS)
npm run ios

# Voor Android
npm run android

# Voor web (testen)
npm run web
```

## Gebruik

### Workout starten
1. Ga naar het "Today" tab
2. Klik op "Start workout"
3. Kies een oefening en voeg sets toe met gewicht, reps en optioneel RPE
4. Klik op "Beëindig workout" wanneer klaar

### Oefeningen toevoegen
1. Ga naar het "Exercises" tab
2. Klik op de "+" knop
3. Voer naam en spiergroep in
4. Oefening is direct beschikbaar voor logging

### Progressie bekijken
1. Ga naar het "Progress" tab
2. Bekijk grafieken van belasting en volume
3. Zie alle PR's (Persoonlijke Records)

### Delen met Simone
1. Ga naar het "Share" tab
2. Zet "Deel met Simone" aan
3. Selecteer oefeningen en periode
4. Genereer deelbare link of exporteer CSV

## App structuur

```
liftlog/
├── app/                    # Expo Router screens
│   ├── (tabs)/            # Tab navigatie screens
│   │   ├── index.tsx      # Today screen
│   │   ├── exercises.tsx  # Exercises list
│   │   ├── progress.tsx   # Progress charts
│   │   ├── share.tsx      # Share/Export
│   │   └── settings.tsx   # Settings
│   ├── exercise/[id].tsx  # Exercise detail
│   └── _layout.tsx        # Root layout
├── src/
│   ├── api/               # Supabase client
│   ├── components/        # Reusable components
│   ├── db/                # SQLite database
│   ├── i18n/              # Internationalization
│   ├── store/             # Zustand store
│   ├── types/             # TypeScript types
│   └── utils/             # Utility functions
└── assets/                # Images, fonts, etc.
```

## Berekeningen

### 1RM (Epley Formule)
```
est1RM = weight_kg × (1 + reps / 30)
```

### PR Detectie
Een set is een PR als:
- Het gewicht hoger is dan alle eerdere sets, OF
- Het aantal reps hoger is bij hetzelfde gewicht

### Volume
```
volume = weight_kg × reps (per set)
totaal_volume = som van alle sets
```

## Developer Notes

### Offline-first sync
- Alle data wordt eerst lokaal opgeslagen in SQLite
- Bij reconnect wordt automatisch gesync't met Supabase
- Sync gebeurt in de achtergrond zonder UI block

### Notificaties
- Expo Notifications voor push notificaties
- Configureerbaar in Settings
- Deep links naar Today screen

### Testen
De app werkt zonder Supabase setup voor lokale development:
- Gebruikt een demo user ID wanneer niet geauthenticeerd
- Alle features werken offline
- Sync functionaliteit vereist Supabase setup

## Troubleshooting

### App crasht bij opstarten
- Controleer of alle dependencies geïnstalleerd zijn: `npm install`
- Clear cache: `npx expo start --clear`

### Sync werkt niet
- Controleer Supabase credentials in `.env`
- Zorg dat Row Level Security policies correct zijn ingesteld
- Check network connectivity

### Victory Native grafieken werken niet
- Zorg dat `react-native-svg` correct geïnstalleerd is
- Mogelijk moet je `npx pod-install` runnen voor iOS

## Toekomstige features (out of scope voor MVP)

- Workout templates en supersets
- Video-form checks
- Plate math en timers
- Apple/Google Health sync
- Workout programma's
- Nutrition tracking

## Licentie

Dit project is ontwikkeld voor Simone's trainingsprogramma.


