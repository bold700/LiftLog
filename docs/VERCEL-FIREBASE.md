# Vercel + Firebase: inlog en data op je account

Op de Vercel-deploy (https://lift-log-phi.vercel.app/) zie je nu geen inlog en wordt er niks op een account opgeslagen, omdat Firebase daar nog niet is geconfigureerd.

**Als je Firebase op Vercel aanzet:**

- Gebruikers zien de **inlog-/registratiepagina**
- Na inloggen wordt **alles op hun account opgeslagen** in Firestore (profiel, workouts/schemas)
- **Dezelfde account** kunnen ze later gebruiken in de app (App Store/Play Store) – dan hebben ze hun data al mee

## Stappen

1. **Firebase Console**  
   Gebruik hetzelfde Firebase-project als voor je (toekomstige) app. Noteer de config uit *Projectinstellingen → Algemeen → Je apps* (of uit je lokale `.env`).

2. **Vercel → Environment Variables**  
   Ga naar je project op [vercel.com](https://vercel.com) → **Settings** → **Environment Variables** en voeg toe (voor **Production**, en eventueel Preview):

   | Name | Value |
   |------|--------|
   | `VITE_FIREBASE_API_KEY` | (jouw API key) |
   | `VITE_FIREBASE_AUTH_DOMAIN` | `jouw-project.firebaseapp.com` |
   | `VITE_FIREBASE_PROJECT_ID` | (jouw project ID) |
   | `VITE_FIREBASE_STORAGE_BUCKET` | `jouw-project.appspot.com` |
   | `VITE_FIREBASE_MESSAGING_SENDER_ID` | (sender ID) |
   | `VITE_FIREBASE_APP_ID` | (app ID) |

   De waarden kun je 1-op-1 uit je `.env` overnemen (niet de `.env` zelf uploaden – alleen de variabelen in Vercel invullen).

   **Facturen per mail (Beheer → Facturatie → Verstuur per mail)** lopen via [Resend](https://resend.com). Maak daar een account, verifieer je domein (DNS-records die Resend toont) en voeg toe:

   | Name | Value |
   |------|--------|
   | `RESEND_API_KEY` | API-sleutel uit Resend (alleen hier, nooit in de code of chat) |
   | `INVOICE_FROM_EMAIL` | afzenderadres op het geverifieerde domein, bijv. `facturen@vanaspt.nl` |

   Zonder deze twee blijft de knop uitgeschakeld en zegt Facturatie dat mail nog niet is ingericht. De naam van de afzender is de bedrijfsnaam uit Huisstijl; antwoorden gaan naar het factuur-e-mailadres daar.

   **Getekende verwerkersovereenkomsten naar de Drive van BOLD700.** Tekent een studio de
   verwerkersovereenkomst in de app (Beheer → Instellingen), dan zet de server de PDF op een gedeelde
   drive. Eenmalig instellen:

   1. Google Cloud Console, project van Firebase → *APIs & Services* → *Library* → **Google Drive API** → *Enable*.
   2. Google Drive → gedeelde drive van BOLD700 (bijv. "Contracten") → map "Verwerkersovereenkomsten" maken.
   3. Gedeelde drive → *Leden beheren* → het e-mailadres van het serviceaccount toevoegen (het veld
      `client_email` uit `FIREBASE_SERVICE_ACCOUNT`, eindigt op `iam.gserviceaccount.com`), rol **Inhoudbeheerder**.
      Weigert Drive dat, zet dan in de Admin-console (Apps → Google Workspace → Drive en Documenten →
      Instellingen voor delen) toe dat gedeelde drives leden van buiten de organisatie hebben.
   4. In Vercel: `GOOGLE_DRIVE_FOLDER_ID` = het laatste stuk van de link van de map
      (`drive.google.com/drive/folders/<dit stuk>`).

   Zonder `GOOGLE_DRIVE_FOLDER_ID` gaat de PDF alleen per mail naar de ondertekenaar en support@bold700.com
   (als Resend is ingericht). De PDF is in de app altijd opnieuw te downloaden. Een serviceaccount heeft
   zelf geen opslagruimte: het werkt daarom alleen op een gedeelde drive, niet in "Mijn Drive".

3. **Opnieuw deployen**  
   Na het opslaan van de variabelen een **nieuwe deploy** doen (bijv. *Deployments* → *…* bij de laatste deploy → *Redeploy*, of een nieuwe commit pushen).

Daarna: op de Vercel-URL inloggen/registreren → data staat op het account → later in de app met hetzelfde account inloggen en dezelfde data zien.
