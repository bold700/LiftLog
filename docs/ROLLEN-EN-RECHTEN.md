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

> **Gaat vanzelf.** Sinds de CI-workflow `deploy-rules` bestaat worden `firestore.rules` en
> `storage.rules` bij een merge naar `main` automatisch uitgerold, maar alleen als die bestanden in
> die push zijn veranderd. Daarvoor moet in GitHub → Settings → Secrets and variables → Actions de
> secret **`FIREBASE_SERVICE_ACCOUNT`** staan: dezelfde JSON van het service-account die ook op
> Vercel staat. Ontbreekt die, dan slaat de stap over met een waarschuwing (CI wordt niet rood) en
> blijft het handwerk hieronder nodig.
>
> Loopt de database achter op de repo, dan is er niets veranderd om op te reageren. Start dan
> GitHub → Actions → **CI** → *Run workflow* met **deploy_rules** aangevinkt; die rolt de huidige
> regels alsnog uit.
>
> **Drie rollen die het service-account nodig heeft.** Ga naar
> [Google Cloud → IAM](https://console.cloud.google.com/iam-admin/iam?project=vanas-d1a25), zoek het
> account `firebase-adminsdk-…@vanas-d1a25.iam.gserviceaccount.com`, klik op het potlood en voeg toe:
>
> - **Firebase Rules Admin** (`roles/firebaserules.admin`) — zonder deze rol valt de
>   Firestore-stap om op `firebaserules.googleapis.com … HTTP Error: 403`. De CLI compileert de
>   regels eerst via die API, en een standaard service-account mag dat niet.
> - **Service Usage Consumer** (`roles/serviceusage.serviceUsageConsumer`) — voor de storage-stap,
>   die vóór het uitrollen opvraagt of de storage-API aanstaat (`serviceusage.services.get`).
> - **Cloud Storage for Firebase Admin** (`roles/firebasestorage.admin`; in de console zo genoemd,
>   met "(Beta)" erachter — niet te verwarren met *Storage Admin* van Cloud Storage) — ook voor de storage-stap: de CLI
>   zoekt eerst de standaardbucket op (`firebasestorage.defaultBucket.get`). Zonder deze rol:
>   `Unexpected error when fetching default storage bucket … HTTP Error: 403`. Dat gebeurde op
>   19 september 2026; het gevolg was dat de regel voor studiologo's (`orgLogos/{orgId}`) alleen in
>   de repo stond en "Logo uploaden mislukt" in Beheer → Huisstijl.
>
> De **storage**-regels gaan daarom in een aparte stap en mogen falen zonder de rest tegen te
> houden: die regels veranderen zelden, en de fout blijft zichtbaar in de job zonder de
> Firestore-regels tegen te houden. Let wel: zolang die stap faalt, werkt een storage-regel die
> alleen in de repo staat in de app nog niet. Snelste omweg: **Firebase Console → Storage →
> Rules**, inhoud van `storage.rules` plakken, **Publish**.

Met de hand:

1. Open **Firebase Console** → je project → **Firestore** → tab **Rules**.
2. Vervang de inhoud van de editor door de inhoud van **`firestore.rules`** uit dit project (of kopieer de regels hieronder).
3. Klik op **Publish** / **Publiceren**.

Zonder deze regels (of met `allow read, write: if false`) heeft de app geen toegang tot Firestore en werken inloggen en data niet.
