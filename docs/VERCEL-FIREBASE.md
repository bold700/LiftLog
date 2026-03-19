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

3. **Opnieuw deployen**  
   Na het opslaan van de variabelen een **nieuwe deploy** doen (bijv. *Deployments* → *…* bij de laatste deploy → *Redeploy*, of een nieuwe commit pushen).

Daarna: op de Vercel-URL inloggen/registreren → data staat op het account → later in de app met hetzelfde account inloggen en dezelfde data zien.
