# Profiel in Firestore

## Nieuwe accounts komen niet in de database

Als je een nieuw account aanmaakt (registreren of Google) en er verschijnt **geen** document in de collectie **profiles**:

1. **Firestore-regels controleren**  
   In Firebase Console → Firestore → **Rules** moet staan dat een ingelogde gebruiker een document mag **aanmaken** waarvan de document-ID gelijk is aan zijn eigen gebruikers-ID. In `firestore.rules` in dit project staat:  
   `allow create: if request.auth != null && request.auth.uid == userId;`  
   Zet de inhoud van **firestore.rules** in de Console en klik op **Publiceren**.

2. **Foutmelding in de app**  
   Als het aanmaken van het profiel mislukt, verschijnt bovenin de app een rode melding. Klik op **Opnieuw proberen**. Als je daar iets met "permission" of "toegang" ziet, kloppen de Firestore-regels waarschijnlijk niet (zie stap 1).

3. **Zelf profiel aanmaken**  
   Zie hieronder hoe je handmatig een profiel (bijv. trainer) in Firestore aanmaakt.

---

# Profiel handmatig in Firestore aanmaken (trainer)

De app koppelt profielen aan je **Firebase Auth-account**. Het document in de collectie `profiles` moet daarom **exact** jouw gebruikers-ID als **Document ID** hebben (geen Auto-ID).

---

## Stap 1: Jouw gebruikers-ID weten

1. Log in de app in (Van As Personal Training Log).
2. Ga naar **Menu** (eerste tab).
3. Onder “Ingelogd als …” staat **Gebruikers-ID**. Kopieer die (of noteer hem).

Die ID is iets als: `97UU2dayDmP7h1JEo9wx` of een andere lange string.

---

## Stap 2: In Firestore

1. Open **Firebase Console** → je project (vanas) → **Firestore** → tab **Data**.
2. Bestaat de collectie **`profiles`** al?
   - **Ja** → klik op **`profiles`**.
   - **Nee** → klik op **“Start collection”**, geef als Collection ID **`profiles`** op en bevestig.
3. Klik op **“Add document”** (niet “Start collection” opnieuw).
4. **Document ID:** vul **handmatig** jouw gebruikers-ID in (uit stap 1). Gebruik **geen** Auto-ID.
5. Voeg onderstaande velden toe (type en waarde exact zo):

| Veld           | Type     | Waarde (voorbeeld)        |
|----------------|----------|---------------------------|
| `role`         | string   | `trainer`                 |
| `email`        | string   | jouw@email.nl            |
| `displayName`  | string   | Je naam (mag leeg)        |
| `trainerId`    | string   | *(laat leeg of null)*     |
| `trainerRequested` | boolean | `false`               |
| `createdAt`    | string   | `2025-03-07T12:00:00.000Z` |
| `updatedAt`    | string   | `2025-03-07T12:00:00.000Z` |

Voor **trainer** moet `role` = `trainer` en `trainerRequested` = `false`.

6. Klik op **Save**.

---

## Stap 3: In de app

Ververs de app of ga naar Menu en klik op **Vernieuwen**. Je zou nu de tab **Beheer** moeten zien (trainerrechten).

---

## Makkelijker: via de app

Als je al een account hebt en je hebt bij registratie **Trainer** gekozen:

1. Log in.
2. In de blauwe balk: klik op **“Direct trainerrechten”**.

Dan zet de app jouw profiel zelf op `trainer`; je hoeft niets in Firestore te doen.
