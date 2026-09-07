# Van As Personal Training Logs (LiftLog)

Web- en mobiele app voor Van As Personal Training: trainers maken workouts en groepslessen, sporters loggen hun trainingen, voeding en metingen en zien hun voortgang.

- **Live**: https://lift-log-phi.vercel.app (Vercel bouwt automatisch vanaf `main`)
- **Native**: iOS/Android via Capacitor (`ios/App`, `android/`)
- **Stack**: React 18 + TypeScript + Vite, MUI (Material 3), Firebase Auth/Firestore/Storage, Vercel serverless-functies (`api/`), OpenAI voor workoutgeneratie en fotoherkenning, MCP-server voor AI-chats

## Functies

- **Rollen**: sporter, trainer, beheerder (zie [docs/ROLLEN-EN-RECHTEN.md](docs/ROLLEN-EN-RECHTEN.md)). Rollen zet alleen een beheerder.
- **Workouts**: per sporter, voor meerdere sporters, open, of groepsles; Formule 7-routekaart (AALO); AI-generatie; PDF-export als invulbaar schema met plaatjes.
- **Groepslessen**: halfjaarschema per lesmoment (week 1–26 volgt het ISO-weeknummer), import vanuit het lesrooster (`scripts/import-groepslessen.mjs`, Beheer → Groepslessen importeren).
- **Loggen**: sets/reps/gewicht per oefening, groepslessessies, Apple Health-workouts (native).
- **Inzichten**: progressie, spiergroepen, ranglijst (opt-in), hartslagzones, vetpercentage (Durnin & Womersley).
- **Voeding en metingen**: Open Food Facts, barcode-scanner, fotoherkenning, gewicht/huidplooien/voortgangsfoto's.
- **AI-chat koppeling**: MCP-server op `/api/mcp` met een persoonlijke koppelsleutel (Profiel → Koppel met AI-chat).
- **Assistent in de app**: dezelfde gereedschapskist als de AI-koppeling, maar zonder connector of ChatGPT-abonnement (`/api/assistant`).
- **Berichten en check-ins**: contact tussen trainer en sporter bij het dossier, met een wekelijkse check-in die het gewicht meteen als meting vastlegt.
- **Meldingen**: pushnotificaties per toestel bij een bericht, een check-in of een nieuw schema.
- **Meerdere studio's**: elke studio is strikt gescheiden (zie [docs/STUDIOS-EN-OVERDRACHT.md](docs/STUDIOS-EN-OVERDRACHT.md)).

## Ontwikkelen

```bash
npm install
cp .env.example .env        # Firebase-config invullen (zie .env.example)
npm run dev                 # app op http://localhost:5173
node scripts/local-api-server.mjs   # optioneel: /api lokaal (poort 3001)
```

Kwaliteitscontroles (draaien ook in CI bij elke pull request):

```bash
npm run check        # typecheck + lint + unit-tests
npm run test:rules   # Firestore-regels testen in de emulator (Java vereist)
npm run build
```

## Structuur

```
api/                 Vercel serverless-functies (AI, GIF-proxy, admin, MCP) en api/_lib helpers
src/components/      Schermen en componenten (MUI)
src/context/         Auth- en profielcontext
src/services/        Firestore-toegang per collectie
src/utils/           Pure logica (filters, hartslag, vetpercentage, PDF-export, …)
src/data/            Oefeningcatalogus, GIF-index, spiergroepmapping, lesrooster
scripts/             Import- en beheerscripts
tests/unit/          Unit-tests (vitest)
tests/rules/         Firestore-regeltests (emulator)
docs/                Documentatie; docs/archief bevat oude probleemnotities
```

## Deploy

- **Web**: elke merge naar `main` deployt naar Vercel. Omgevingsvariabelen staan in Vercel (zie `.env.example`; `OPENAI_API_KEY` en `FIREBASE_SERVICE_ACCOUNT` zijn server-side).
- **Firestore- en Storage-regels** worden **niet** door Vercel gedeployed. Na een wijziging in `firestore.rules` of `storage.rules`:

  ```bash
  npm run deploy:firestore
  npm run deploy:storage
  ```

- **Native**: `npm run cap:sync`, daarna `npm run cap:open:ios` / `npm run cap:open:android`. Zie [docs/APP_STORE_DEPLOYMENT.md](docs/APP_STORE_DEPLOYMENT.md).

## Data en beveiliging

- Alle gegevens staan in Firestore; toegang wordt afgedwongen in `firestore.rules` (getest in `tests/rules`).
- Oefening-GIF's staan in Firebase Storage (`exercises/720/{id}.gif`, publiek leesbaar); `/api/exercise-gif` levert er een stilstaand beeld van voor de PDF.
- Geen geheimen in Git: `.env` en service-accounts staan in `.gitignore`.

## Licentie

Privé project, alle rechten voorbehouden.
