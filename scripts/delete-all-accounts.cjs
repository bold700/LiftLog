/**
 * Verwijder alle accounts en bijbehorende data uit Firebase.
 * Gebruik alleen in development of om een schone lei te krijgen.
 *
 * Vereisten:
 * 1. Service account key: Firebase Console → Projectinstellingen → Serviceaccounts →
 *    "Nieuwe particuliere sleutel genereren" → JSON downloaden.
 * 2. Omgevingsvariabele: GOOGLE_APPLICATION_CREDENTIALS=pad/naar/jouw-service-account.json
 * 3. Project-ID (optioneel als die in de service account JSON zit):
 *    FIREBASE_PROJECT_ID=vanas-d1a25
 *
 * Uitvoeren: node scripts/delete-all-accounts.cjs
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const projectId = process.env.FIREBASE_PROJECT_ID;

if (!credPath || !fs.existsSync(path.resolve(credPath))) {
  console.error('FOUT: Zet GOOGLE_APPLICATION_CREDENTIALS naar het pad van je Firebase service account JSON.');
  console.error('Voorbeeld: export GOOGLE_APPLICATION_CREDENTIALS=./service-account.json');
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(credPath))) });
}

const auth = admin.auth();
const db = admin.firestore();

async function deleteAllAuthUsers() {
  let totalDeleted = 0;
  let pageToken;
  do {
    const list = await auth.listUsers(1000, pageToken);
    const uids = list.users.map((u) => u.uid);
    if (uids.length === 0) break;
    const result = await auth.deleteUsers(uids);
    totalDeleted += result.successCount;
    if (result.failureCount > 0) {
      console.warn('Een aantal gebruikers kon niet worden verwijderd:', result.errors);
    }
    pageToken = list.pageToken;
  } while (pageToken);
  return totalDeleted;
}

async function deleteCollection(name) {
  const col = db.collection(name);
  const snap = await col.get();
  const batchSize = 500;
  let deleted = 0;
  for (let i = 0; i < snap.docs.length; i += batchSize) {
    const chunk = snap.docs.slice(i, i + batchSize);
    if (chunk.length === 0) break;
    const batch = db.batch();
    chunk.forEach((doc) => {
      batch.delete(doc.ref);
      deleted++;
    });
    await batch.commit();
  }
  return deleted;
}

async function main() {
  console.log('Start verwijderen van alle accounts en data…\n');

  try {
    const authCount = await deleteAllAuthUsers();
    console.log('Auth: %d gebruiker(s) verwijderd.', authCount);

    const profilesCount = await deleteCollection('profiles');
    console.log('Firestore profiles: %d document(en) verwijderd.', profilesCount);

    const workoutsCount = await deleteCollection('workouts');
    console.log('Firestore workouts: %d document(en) verwijderd.', workoutsCount);

    console.log('\nKlaar. Alle accounts en bijbehorende data zijn verwijderd.');
  } catch (err) {
    console.error('Fout:', err.message);
    process.exit(1);
  }
}

main();
