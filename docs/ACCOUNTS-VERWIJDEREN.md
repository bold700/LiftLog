# Alle accounts verwijderen

Om **alle** gebruikersaccounts en bijbehorende data (profielen, workouts) te verwijderen, kun je het script `scripts/delete-all-accounts.cjs` gebruiken. Dit gebruikt de **Firebase Admin SDK** (niet de client), dus je hebt een **service account key** nodig.

## Stap 1: Service account key aanmaken

1. Ga naar [Firebase Console](https://console.firebase.google.com) → je project (bijv. **vanas-d1a25**).
2. Klik op het **tandwiel** → **Projectinstellingen**.
3. Tab **Serviceaccounts** → onderaan **"Nieuwe particuliere sleutel genereren"** → **Sleutel genereren**.
4. Het gedownloade JSON-bestand bewaar je lokaal (bijv. `service-account.json` in de projectroot).  
   **Let op:** zet dit bestand **nooit** in git (voeg `service-account.json` toe aan `.gitignore` als je het in de projectmap zet).

## Stap 2: Script uitvoeren

In de terminal, vanuit de projectmap:

```bash
export GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
npm run delete-all-accounts
```

(of het volledige pad naar je JSON-bestand invullen bij `GOOGLE_APPLICATION_CREDENTIALS`)

Het script doet het volgende:

- **Authentication:** alle gebruikers verwijderen (in batches).
- **Firestore `profiles`:** alle documenten verwijderen.
- **Firestore `workouts`:** alle documenten verwijderen.

Daarna kun je opnieuw accounts aanmaken; die komen weer in de database.

---

## Handmatig in Firebase Console

Als je geen service account wilt gebruiken:

1. **Authentication** → **Users** → per gebruiker het menu (⋮) → **Delete user**.
2. **Firestore** → **Data** → collectie **profiles** → elk document openen → **Delete document** (of de hele collectie legen).
3. Idem voor de collectie **workouts**.

Dit is handig als je maar een paar accounts hebt.
