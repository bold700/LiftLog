/**
 * Back-up van Firestore naar losse JSON-bestanden op je eigen schijf.
 *
 * "Onze data is van onszelf" is pas waar als je er ook zonder Firebase bij kunt. Dit script
 * schrijft elke collectie weg als één JSON-bestand, zodat een back-up buiten Google te bewaren is
 * (externe schijf, NAS, versleutelde cloudmap).
 *
 * LET OP: de export bevat persoonsgegevens en gezondheidsgegevens van klanten. Bewaar hem
 * versleuteld, deel hem niet, en ruim oude exports op — dat is een AVG-verplichting, geen advies.
 *
 * Gebruik:
 *   FIREBASE_SERVICE_ACCOUNT="$(cat service-account.json)" node scripts/backup-firestore.mjs
 *
 * Opties:
 *   --out <map>   Doelmap (standaard ./backups/<datum-tijd>).
 *   --org <id>    Alleen documenten van deze studio meenemen.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { getAdmin } from '../api/_lib/firebaseAdmin.mjs';

const COLLECTIONS = [
  'orgs',
  'profiles',
  'workouts',
  'logs',
  'nutritionLogs',
  'measurements',
  'sessions',
  'workoutRequests',
  'leaderboardPublic',
  'mcpKeys',
];

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const ORG_FILTER = arg('--org');
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT_DIR = arg('--out') ?? join('backups', stamp);

async function main() {
  const admin = getAdmin();
  if (admin.error) {
    console.error('Firebase Admin niet beschikbaar:', admin.error);
    process.exit(1);
  }
  mkdirSync(OUT_DIR, { recursive: true });

  let total = 0;
  const summary = {};
  for (const name of COLLECTIONS) {
    let ref = admin.db.collection(name);
    // mcpKeys en orgs hebben geen orgId-veld; die filteren we niet.
    if (ORG_FILTER && name !== 'orgs' && name !== 'mcpKeys') ref = ref.where('orgId', '==', ORG_FILTER);

    const snap = await ref.get();
    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    writeFileSync(join(OUT_DIR, `${name}.json`), JSON.stringify(docs, null, 2), 'utf8');
    summary[name] = docs.length;
    total += docs.length;
    console.log(`${name.padEnd(18)} ${String(docs.length).padStart(5)} documenten`);
  }

  writeFileSync(
    join(OUT_DIR, '_meta.json'),
    JSON.stringify({ createdAt: new Date().toISOString(), org: ORG_FILTER ?? 'alle', counts: summary }, null, 2),
    'utf8'
  );
  console.log(`\n${total} documenten weggeschreven naar ${OUT_DIR}`);
  console.log('Bewaar deze map versleuteld en buiten Google. Hij bevat gezondheidsgegevens van klanten.');
}

main().catch((e) => {
  console.error('Back-up mislukt:', e);
  process.exit(1);
});
