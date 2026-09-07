/**
 * Migratie naar multi-tenant: geeft alle bestaande documenten een `orgId` en maakt de studio aan.
 *
 * Waarom dit moet: vanaf deze versie filteren zowel de app als de AI-koppeling op `orgId`.
 * Documenten zonder dat veld vallen buiten elke query en zijn daarna onzichtbaar in de app.
 * Draai dit script dus VOORDAT je de nieuwe versie uitrolt.
 *
 * Het script is idempotent: documenten die al een `orgId` hebben blijven ongemoeid, ook als je
 * het twee keer draait. Standaard doet het niets — je moet `--apply` meegeven om te schrijven.
 *
 * Gebruik:
 *   # 1. Kijken wat er zou gebeuren (schrijft niets):
 *   FIREBASE_SERVICE_ACCOUNT="$(cat service-account.json)" node scripts/migrate-orgs.mjs
 *
 *   # 2. Echt uitvoeren:
 *   FIREBASE_SERVICE_ACCOUNT="$(cat service-account.json)" node scripts/migrate-orgs.mjs --apply
 *
 * Opties:
 *   --apply                Schrijf de wijzigingen echt weg (zonder deze vlag: alleen rapporteren).
 *   --org <id>             Studio-id (standaard "vanas"). Moet gelijk zijn aan DEFAULT_ORG_ID
 *                          in src/services/orgContext.ts en defaultOrg() in firestore.rules.
 *   --name "<naam>"        Weergavenaam van de studio (standaard "Van As Personal Training").
 *   --owner-email <mail>   E-mail van de eigenaar; wordt als ownerId op de studio gezet.
 *   --no-self-signup       Zet open aanmelding uit voor deze studio (standaard: aan).
 */
import process from 'node:process';
import { getAdmin } from '../api/_lib/firebaseAdmin.mjs';

/** Collecties die een `orgId` moeten krijgen. Elke collectie die de app leest staat hier. */
const COLLECTIONS = [
  'profiles',
  'workouts',
  'logs',
  'nutritionLogs',
  'measurements',
  'sessions',
  'workoutRequests',
  'leaderboardPublic',
];

/** Firestore staat maximaal 500 schrijfacties per batch toe. */
const BATCH_SIZE = 400;

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const has = (name) => process.argv.includes(name);

const APPLY = has('--apply');
const ORG_ID = (arg('--org') ?? 'vanas').trim();
const ORG_NAME = arg('--name') ?? 'Van As Personal Training';
const OWNER_EMAIL = arg('--owner-email');
const ALLOW_SELF_SIGNUP = !has('--no-self-signup');

async function main() {
  const admin = getAdmin();
  if (admin.error) {
    console.error('Firebase Admin niet beschikbaar:', admin.error);
    process.exit(1);
  }
  const { db, auth } = admin;

  console.log(`Studio        : ${ORG_ID} (${ORG_NAME})`);
  console.log(`Open aanmelding: ${ALLOW_SELF_SIGNUP ? 'aan' : 'uit'}`);
  console.log(`Modus         : ${APPLY ? 'SCHRIJVEN' : 'alleen rapporteren (geef --apply om te schrijven)'}`);
  console.log('');

  // Eigenaar opzoeken, zodat de studio weet wie hem beheert.
  let ownerId = null;
  if (OWNER_EMAIL) {
    try {
      ownerId = (await auth.getUserByEmail(OWNER_EMAIL.trim().toLowerCase())).uid;
      console.log(`Eigenaar      : ${OWNER_EMAIL} → ${ownerId}`);
    } catch {
      console.error(`Geen account gevonden met e-mail ${OWNER_EMAIL}. Ga door zonder eigenaar.`);
    }
  }

  // 1. De studio zelf. Zonder dit document werkt zelfregistratie niet meer voor nieuwe studio's.
  const orgRef = db.collection('orgs').doc(ORG_ID);
  const orgSnap = await orgRef.get();
  if (orgSnap.exists) {
    console.log(`\norgs/${ORG_ID} bestaat al — blijft ongemoeid.`);
  } else if (APPLY) {
    await orgRef.set({
      name: ORG_NAME,
      ownerId,
      allowSelfSignup: ALLOW_SELF_SIGNUP,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    console.log(`\norgs/${ORG_ID} aangemaakt.`);
  } else {
    console.log(`\norgs/${ORG_ID} zou worden aangemaakt.`);
  }

  // 2. Alle documenten voorzien van orgId.
  let totalMissing = 0;
  let totalOther = 0;
  console.log('');
  for (const name of COLLECTIONS) {
    const snap = await db.collection(name).get();
    const missing = snap.docs.filter((d) => {
      const v = d.data()?.orgId;
      return typeof v !== 'string' || v.trim() === '';
    });
    const otherOrg = snap.docs.filter((d) => {
      const v = d.data()?.orgId;
      return typeof v === 'string' && v.trim() !== '' && v.trim() !== ORG_ID;
    });
    totalMissing += missing.length;
    totalOther += otherOrg.length;

    const suffix = otherOrg.length ? `, ${otherOrg.length} van een andere studio (niet aangeraakt)` : '';
    console.log(
      `${name.padEnd(18)} ${String(snap.size).padStart(5)} documenten, ${String(missing.length).padStart(5)} zonder orgId${suffix}`
    );

    if (!APPLY || missing.length === 0) continue;

    for (let i = 0; i < missing.length; i += BATCH_SIZE) {
      const batch = db.batch();
      for (const d of missing.slice(i, i + BATCH_SIZE)) batch.set(d.ref, { orgId: ORG_ID }, { merge: true });
      await batch.commit();
    }
    console.log(`${' '.repeat(18)} → ${missing.length} bijgewerkt.`);
  }

  console.log('');
  if (totalOther > 0) {
    console.log(`${totalOther} document(en) horen bij een andere studio en zijn met rust gelaten.`);
  }
  if (APPLY) {
    console.log(`Klaar. ${totalMissing} document(en) hebben nu orgId "${ORG_ID}".`);
    console.log('Rol hierna de nieuwe app-versie en de Firestore-regels uit (npm run deploy:firestore).');
  } else {
    console.log(`${totalMissing} document(en) zouden orgId "${ORG_ID}" krijgen.`);
    console.log('Draai opnieuw met --apply om het echt te doen.');
  }
}

main().catch((e) => {
  console.error('Migratie mislukt:', e);
  process.exit(1);
});
