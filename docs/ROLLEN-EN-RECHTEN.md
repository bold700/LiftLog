# Rollen en rechten

## Rollen

De app kent drie rollen, gedefinieerd in **`src/types/index.ts`**:

- **`sporter`** – kan alleen toegewezen workouts zien en trainingen loggen.
- **`trainer`** – kan workouts aanmaken, bewerken, verwijderen, toewijzen aan sporters en de Beheer-tab gebruiken.
- **`admin`** (beheerder) – kan trainer-aanvragen goedkeuren of afwijzen (tab Beheerder).

De rol wordt opgeslagen in Firestore in de collectie **`profiles`**, per document (document-id = `userId`), veld **`role`** (`"sporter"`, `"trainer"` of `"admin"`).

### Trainer worden: goedkeuring door beheerder

Je kunt je niet zomaar als trainer aanmelden. Wie bij **registratie** "Trainer" kiest, krijgt eerst een **sporter**-account met een vlag **`trainerRequested: true`**. Een **beheerder** moet in de app op de tab **Beheerder** de aanvraag **goedkeuren**; dan wordt de rol naar `trainer` gezet. Tot die tijd gebruikt de gebruiker de app als sporter en ziet een melding dat de aanvraag op goedkeuring wacht.

**Eerste beheerder aanmaken:** er is geen "registreren als admin" in de app. Zet de eerste beheerder handmatig in Firestore: open **`profiles`** → document van de gewenste gebruiker (document-id = zijn/haar Firebase Auth UID) → veld **`role`** op **`"admin"`** zetten. Die gebruiker ziet daarna de tab **Beheerder** en kan trainer-aanvragen goedkeuren.

**Zelf direct trainer maken (zonder beheerder):** als je als trainer hebt geregistreerd maar er is nog geen beheerder, kun je jezelf trainer maken via Firestore: **`profiles`** → jouw document (document-id = jouw Firebase Auth UID) → **`role`** op **`"trainer"`** zetten en **`trainerRequested`** op **`false`**. Daarna in de app op **Vernieuwen** klikken (in de blauwe balk) of de pagina verversen.

---

## Rechten (waar gecontroleerd)

| Recht | Waar | Voorwaarde |
|-------|------|------------|
| Workouts aanmaken | `useWorkouts.canCreateWorkouts` | Alleen trainer (of niet ingelogd, dan localStorage) |
| Workouts bewerken/verwijderen | `SchemasPage` (Bewerken/Verwijderen knoppen) | `isTrainer` |
| Tab Beheer zien | `App.tsx` (tabs) | `profile.isTrainer` |
| Tab Beheerder zien | `App.tsx` (tabs) | `profile.isAdmin` |
| Beheer-pagina gebruiken | `BeheerPage.tsx` | `profile.isTrainer` |
| Trainer-aanvragen goedkeuren/afwijzen | `AdminPage.tsx` | `profile.isAdmin` |
| Workout toewijzen aan sporter | `SchemaEditView` (dropdown Toewijzen aan) | Trainer + sporterslijst |
| Welke workouts je ziet | `workoutFirestore.getWorkoutsForUser(uid, role)` | Trainer: `trainerId === uid`; Sporter: `clientId === uid` |

Deze checks staan in o.a. **`src/hooks/useWorkouts.ts`**, **`src/context/ProfileContext.tsx`**, **`src/App.tsx`**, **`src/components/SchemasPage.tsx`**, **`src/components/BeheerPage.tsx`**.

---

## Rol aanpassen

### 1. In de app (Beheer)

Als je **trainer** bent: ga naar **Beheer** → bij een sporter kun je de **rol wijzigen** (Sporter / Trainer). Bij wijziging naar trainer wordt die gebruiker trainer en kan hij/zij zelf workouts aanmaken en Beheer gebruiken.

### 2. Handmatig in Firebase Console

1. Open [Firebase Console](https://console.firebase.google.com) → je project → **Firestore**.
2. Ga naar de collectie **`profiles`**.
3. Open het document van de gebruiker (document-id = Firebase Auth UID).
4. Bewerk het veld **`role`** naar `"sporter"`, `"trainer"` of `"admin"` (exact zo schrijven).
5. Na verversen van de app wordt de nieuwe rol gebruikt.

### 3. In de code (nieuwe rol of rechten)

- **Nieuwe rol toevoegen**  
  - **`src/types/index.ts`**: pas `ProfileRole` aan, bijv. `'trainer' | 'sporter' | 'admin'`.  
  - **`src/context/ProfileContext.tsx`**: `isTrainer` (en evt. `isAdmin`) afleiden uit `profile.role`.  
  - **`src/services/profileService.ts`**: in `toProfile` en `createProfile` de nieuwe rol ondersteunen.  
  - Overal waar nu `isTrainer` wordt gebruikt, eventueel ook rechten voor de nieuwe rol toevoegen.

- **Rechten wijzigen**  
  Zoek op `isTrainer` of `canCreateWorkouts` in de codebase en pas de voorwaarden aan op de plek waar het recht gecontroleerd wordt (zie tabel hierboven).

---

## Firestore-regels (veiligheid)

In het project staat een bestand **`firestore.rules`** in de projectroot. Die regels sluiten aan op de app:

| Collectie | Lezen | Schrijven |
|-----------|--------|-----------|
| **profiles** | Eigen profiel, sporters van jouw trainer, trainers (opzoeken op e-mail), of beheerder (o.a. lijst trainer-aanvragen) | Eigen profiel aanmaken/bewerken; trainers en beheerders mogen ook andere profielen bewerken (rol, trainerId, trainerRequested) |
| **workouts** | Alleen workouts waar jij `trainerId` of `clientId` bent | Alleen aanmaken/bewerken/verwijderen als jij de trainer bent |
| **leaderboardPublic** | Iedere ingelogde gebruiker (ranglijst) | Alleen je eigen document (`userId` = jouw uid): sync van geaggregeerde ranglijstdata |

Zonder het blok `match /leaderboardPublic/{userId}` in de gepubliceerde regels krijg je *Missing or insufficient permissions* op de ranglijst. Zorg dat je de **volledige** inhoud van `firestore.rules` uit deze repo publiceert, of deploy met `npm run deploy:firestore` (na `firebase login` en gekozen project).

**Regels in Firebase zetten:**

1. Open **Firebase Console** → je project → **Firestore** → tab **Rules**.
2. Vervang de inhoud van de editor door de inhoud van **`firestore.rules`** uit dit project (of kopieer de regels hieronder).
3. Klik op **Publish** / **Publiceren**.

Zonder deze regels (of met `allow read, write: if false`) heeft de app geen toegang tot Firestore en werken inloggen en data niet.
