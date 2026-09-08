/**
 * Zet een aparte studio "Testruimte" klaar om VORM te kunnen uitproberen zonder klantgegevens
 * aan te raken.
 *
 * Waarom dit bestaat: er is één Firebase-project, dus de previewomgeving schrijft in dezelfde
 * database als de live app. Klikken in de preview betekent dus klikken in echte klantgegevens.
 * De studioscheiding lost dat op: een tweede studio staat volledig los, en de Firestore-regels
 * houden hem gescheiden — dezelfde scheiding die straks tussen twee échte studio's geldt.
 * Wie wil testen, wisselt bovenin van studio en klikt vrijuit.
 *
 * Wat het klaarzet:
 *  - de studio zelf (zonder open aanmelding, dus niemand rolt er per ongeluk in);
 *  - een testtrainer en twee testsporters, met opgegeven of gegenereerde wachtwoorden;
 *  - jouw eigen account als lid van de Testruimte, zodat de studiowisselaar verschijnt;
 *  - een paar lessen in de komende dagen, waarvan één met één plek — daar test je de wachtlijst;
 *  - credits op de testsporters, zodat er meteen te reserveren valt.
 *
 * Gebruik:
 *   # 1. Kijken wat er zou gebeuren (schrijft niets):
 *   FIREBASE_SERVICE_ACCOUNT="$(cat service-account.json)" \
 *     node scripts/seed-testruimte.mjs --owner-email jij@voorbeeld.nl
 *
 *   # 2. Echt aanmaken:
 *   FIREBASE_SERVICE_ACCOUNT="$(cat service-account.json)" \
 *     node scripts/seed-testruimte.mjs --owner-email jij@voorbeeld.nl --apply
 *
 *   # 3. Alles weer opruimen als je klaar bent:
 *   FIREBASE_SERVICE_ACCOUNT="$(cat service-account.json)" \
 *     node scripts/seed-testruimte.mjs --owner-email jij@voorbeeld.nl --remove --apply
 *
 * Opties:
 *   --owner-email <mail>  Jouw account; wordt eigenaar én lid van de Testruimte. Verplicht.
 *   --apply               Schrijf de wijzigingen echt weg (zonder deze vlag: alleen rapporteren).
 *   --org <id>            Ander studio-id dan "test".
 *   --name "<naam>"       Andere weergavenaam dan "Testruimte".
 *   --password <wachtw.>  Eén wachtwoord voor alle testaccounts (handig om te onthouden).
 *                         Zonder deze vlag genereert het script er één en toont die.
 *   --remove              Ruim de Testruimte en alle testaccounts op.
 *
 * Het script is idempotent: het gebruikt vaste id's, dus twee keer draaien levert geen dubbele
 * lessen of accounts op. Draai je het opnieuw, dan worden bestaande testaccounts hergebruikt en
 * hun saldo teruggezet naar de startwaarde.
 *
 * VEILIGHEID: het script weigert te draaien op de standaardstudio. Het kan dus niet per ongeluk
 * testlessen of testaccounts in Van As zetten.
 */
import process from 'node:process';
import { randomBytes } from 'node:crypto';
import { getAdmin } from '../api/_lib/firebaseAdmin.mjs';
import { DEFAULT_ORG_ID } from '../api/_lib/liftlogData.mjs';

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const has = (name) => process.argv.includes(name);

const APPLY = has('--apply');
const REMOVE = has('--remove');
const ORG_ID = (arg('--org') ?? 'test').trim();
const ORG_NAME = arg('--name') ?? 'Testruimte';
const OWNER_EMAIL = (arg('--owner-email') ?? '').trim().toLowerCase();

/** Startsaldo per testsporter. Genoeg om te reserveren, af te melden en opnieuw te reserveren. */
const START_CREDITS = 10;

/**
 * De testaccounts. Het e-maildomein is `vorm-test.invalid`: `.invalid` is door de IETF
 * gereserveerd en bestaat gegarandeerd niet (RFC 2606). Zo kan er nooit een echte mailbox
 * achter zitten en is aan het adres meteen te zien dat het om een testaccount gaat.
 */
const TEST_USERS = [
  { key: 'trainer', email: `trainer@${ORG_ID}.vorm-test.invalid`, name: 'Test Trainer', role: 'trainer' },
  { key: 'sporter1', email: `sporter1@${ORG_ID}.vorm-test.invalid`, name: 'Test Sporter Een', role: 'sporter' },
  { key: 'sporter2', email: `sporter2@${ORG_ID}.vorm-test.invalid`, name: 'Test Sporter Twee', role: 'sporter' },
];

/**
 * De lessen. De capaciteit van de laatste is bewust 1: daarmee test je in twee klikken wat je
 * met een lege agenda nooit tegenkomt — de tweede sporter komt op de wachtlijst, en schuift door
 * zodra de eerste zich afmeldt.
 */
const TEST_CLASSES = [
  { key: 'les1', title: 'Testles ochtend', dayOffset: 1, startTime: '09:00', endTime: '10:00', capacity: 8, creditCost: 1 },
  { key: 'les2', title: 'Testles avond', dayOffset: 1, startTime: '19:00', endTime: '20:00', capacity: 6, creditCost: 1 },
  { key: 'les3', title: 'Testles duur (2 credits)', dayOffset: 2, startTime: '10:00', endTime: '11:30', capacity: 4, creditCost: 2 },
  { key: 'les4', title: 'Testles met één plek', dayOffset: 3, startTime: '18:00', endTime: '19:00', capacity: 1, creditCost: 1 },
];

/** Vaste id's, zodat opnieuw draaien bijwerkt in plaats van dupliceert. */
const classId = (key) => `class_${ORG_ID}_${key}`;
const accountId = (userId) => `${ORG_ID}__${userId}`;
const ledgerId = (userId) => `cl_${ORG_ID}_start_${userId}`;

/** YYYY-MM-DD, een aantal dagen vanaf vandaag. */
function dateIn(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Leesbaar wachtwoord van voldoende lengte; alleen voor testaccounts. */
function generatePassword() {
  return `Test-${randomBytes(6).toString('base64url')}`;
}

/** Alle documenten van deze studio in één collectie verwijderen. */
async function deleteCollectionForOrg(db, name) {
  const snap = await db.collection(name).where('orgId', '==', ORG_ID).get();
  if (snap.empty) return 0;
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = db.batch();
    for (const d of snap.docs.slice(i, i + 400)) batch.delete(d.ref);
    await batch.commit();
  }
  return snap.size;
}

const COLLECTIONS_TO_CLEAR = [
  'classes',
  'bookings',
  'creditAccounts',
  'creditLedger',
  'logs',
  'checkins',
  'measurements',
  'nutritionLogs',
  'sessions',
  'workouts',
  'workoutRequests',
  'messages',
  'leaderboardPublic',
];

async function remove(db, auth) {
  console.log(`Opruimen van studio "${ORG_ID}".\n`);

  for (const name of COLLECTIONS_TO_CLEAR) {
    const snap = await db.collection(name).where('orgId', '==', ORG_ID).get();
    console.log(`${name.padEnd(18)} ${String(snap.size).padStart(4)} documenten`);
    if (APPLY && snap.size) await deleteCollectionForOrg(db, name);
  }

  // Testaccounts: eerst het profiel, dan het login-account.
  console.log('');
  for (const u of TEST_USERS) {
    let uid = null;
    try {
      uid = (await auth.getUserByEmail(u.email)).uid;
    } catch {
      console.log(`${u.email} — bestaat niet (overgeslagen)`);
      continue;
    }
    console.log(`${u.email} (${uid}) wordt verwijderd`);
    if (!APPLY) continue;
    await db.collection('profiles').doc(uid).delete().catch(() => {});
    await auth.deleteUser(uid).catch(() => {});
  }

  // De eigenaar blijft bestaan; alleen zijn lidmaatschap van de Testruimte gaat eruit.
  if (OWNER_EMAIL) {
    try {
      const ownerUid = (await auth.getUserByEmail(OWNER_EMAIL)).uid;
      const ref = db.collection('profiles').doc(ownerUid);
      const snap = await ref.get();
      const data = snap.data() ?? {};
      const home = typeof data.orgId === 'string' && data.orgId.trim() ? data.orgId.trim() : DEFAULT_ORG_ID;
      const current = Array.isArray(data.orgIds) && data.orgIds.length ? data.orgIds.map(String) : [home];
      const next = current.filter((o) => o !== ORG_ID);
      if (!next.includes(home)) next.push(home);
      console.log(`\n${OWNER_EMAIL}: lidmaatschap ${current.join(', ')} → ${next.join(', ')}`);
      if (APPLY) await ref.set({ orgIds: next }, { merge: true });
    } catch {
      console.log(`\nGeen account gevonden met e-mail ${OWNER_EMAIL}; lidmaatschap overgeslagen.`);
    }
  }

  const orgRef = db.collection('orgs').doc(ORG_ID);
  console.log(`\norgs/${ORG_ID} wordt verwijderd`);
  if (APPLY) await orgRef.delete().catch(() => {});

  console.log(APPLY ? '\nOpgeruimd.' : '\nNiets gedaan — geef --apply om het echt te verwijderen.');
}

async function seed(db, auth) {
  const password = arg('--password') ?? generatePassword();

  // 1. De eigenaar moet bestaan; zonder hem is er niemand die de Testruimte kan bekijken.
  let ownerUid;
  try {
    ownerUid = (await auth.getUserByEmail(OWNER_EMAIL)).uid;
  } catch {
    console.error(`Geen account gevonden met e-mail ${OWNER_EMAIL}.`);
    process.exit(1);
  }
  console.log(`Studio        : ${ORG_ID} (${ORG_NAME})`);
  console.log(`Eigenaar      : ${OWNER_EMAIL} → ${ownerUid}`);
  console.log(`Modus         : ${APPLY ? 'SCHRIJVEN' : 'alleen rapporteren (geef --apply om te schrijven)'}`);
  console.log('');

  // 2. De studio zelf. Open aanmelding staat uit: niemand hoort hier per ongeluk in te rollen.
  const orgRef = db.collection('orgs').doc(ORG_ID);
  const orgExists = (await orgRef.get()).exists;
  console.log(`orgs/${ORG_ID} ${orgExists ? 'bestaat al — blijft ongemoeid' : 'wordt aangemaakt'}`);
  if (APPLY && !orgExists) {
    await orgRef.set({
      name: ORG_NAME,
      ownerId: ownerUid,
      allowSelfSignup: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  // 3. De testaccounts. Bestaat er al een, dan hergebruiken we die en zetten alleen het
  //    wachtwoord opnieuw — anders raak je na een tweede run niet meer binnen.
  console.log('');
  const uids = {};
  for (const u of TEST_USERS) {
    let uid = null;
    let existed = true;
    try {
      uid = (await auth.getUserByEmail(u.email)).uid;
    } catch {
      existed = false;
    }
    console.log(`${u.email.padEnd(42)} ${existed ? 'bestaat al' : 'wordt aangemaakt'} (${u.role})`);
    if (!APPLY) {
      uids[u.key] = uid ?? `(nieuw)`;
      continue;
    }
    if (existed) {
      await auth.updateUser(uid, { password, displayName: u.name });
    } else {
      uid = (await auth.createUser({ email: u.email, password, displayName: u.name, emailVerified: false })).uid;
    }
    uids[u.key] = uid;
  }

  // 4. Profielen. De sporters krijgen de testtrainer als trainer, zodat de koppeling klopt.
  if (APPLY) {
    const now = new Date().toISOString();
    for (const u of TEST_USERS) {
      await db.collection('profiles').doc(uids[u.key]).set(
        {
          userId: uids[u.key],
          orgId: ORG_ID,
          orgIds: [ORG_ID],
          role: u.role,
          email: u.email,
          displayName: u.name,
          trainerId: u.role === 'sporter' ? uids.trainer : null,
          trainerRequested: false,
          createdByAdmin: true,
          leaderboardVisibility: 'named',
          createdAt: now,
          updatedAt: now,
        },
        { merge: true }
      );
    }
  }

  // 5. De eigenaar erbij als lid. Lidmaatschap kan niet vanuit de app — precies omdat niemand
  //    zichzelf bij een studio moet kunnen inschrijven — dus dat gebeurt hier.
  const ownerRef = db.collection('profiles').doc(ownerUid);
  const ownerData = (await ownerRef.get()).data() ?? {};
  const ownerHome = typeof ownerData.orgId === 'string' && ownerData.orgId.trim() ? ownerData.orgId.trim() : DEFAULT_ORG_ID;
  const ownerOrgs = Array.isArray(ownerData.orgIds) && ownerData.orgIds.length ? ownerData.orgIds.map(String) : [ownerHome];
  const ownerNext = ownerOrgs.includes(ORG_ID) ? ownerOrgs : [...ownerOrgs, ORG_ID];
  console.log(`\n${OWNER_EMAIL}: lidmaatschap ${ownerOrgs.join(', ')} → ${ownerNext.join(', ')}`);
  if (APPLY) await ownerRef.set({ orgIds: ownerNext }, { merge: true });

  // 6. De lessen. De tellers gaan op nul: reserveringen lopen via de server, die telt zelf.
  console.log('');
  for (const c of TEST_CLASSES) {
    const date = dateIn(c.dayOffset);
    console.log(`${c.title.padEnd(28)} ${date} ${c.startTime}  ${c.capacity} plek(ken), ${c.creditCost} credit(s)`);
    if (!APPLY) continue;
    await db.collection('classes').doc(classId(c.key)).set(
      {
        id: classId(c.key),
        orgId: ORG_ID,
        title: c.title,
        date,
        startTime: c.startTime,
        endTime: c.endTime,
        trainerId: uids.trainer,
        capacity: c.capacity,
        creditCost: c.creditCost,
        bookedCount: 0,
        waitlistCount: 0,
        schemaId: null,
        cancelledAt: null,
        createdAt: new Date().toISOString(),
      },
      { merge: true }
    );
  }

  // 7. Credits. Het saldo gaat naar de startwaarde in plaats van erbij op te tellen, zodat
  //    opnieuw draaien een schone begintoestand geeft en niet een steeds hoger saldo.
  console.log('');
  for (const u of TEST_USERS.filter((x) => x.role === 'sporter')) {
    console.log(`${u.email.padEnd(42)} saldo → ${START_CREDITS} credits`);
    if (!APPLY) continue;
    const now = new Date().toISOString();
    await db.collection('creditAccounts').doc(accountId(uids[u.key])).set(
      { orgId: ORG_ID, userId: uids[u.key], balance: START_CREDITS, updatedAt: now },
      { merge: true }
    );
    await db.collection('creditLedger').doc(ledgerId(uids[u.key])).set(
      {
        orgId: ORG_ID,
        userId: uids[u.key],
        delta: START_CREDITS,
        reason: 'manual',
        note: 'Startsaldo Testruimte',
        byUserId: ownerUid,
        createdAt: now,
      },
      { merge: true }
    );
  }

  if (!APPLY) {
    console.log('\nEr is niets geschreven. Draai opnieuw met --apply om het echt aan te maken.');
    return;
  }

  console.log('\n---\n');
  console.log('De Testruimte staat klaar. Inloggen kan met:\n');
  for (const u of TEST_USERS) console.log(`  ${u.email.padEnd(42)} ${password}   (${u.role})`);
  console.log(`\nJouw eigen account (${OWNER_EMAIL}) is nu lid van beide studio's. Log opnieuw in;`);
  console.log(`bovenin verschijnt een wisselaar waarmee je naar "${ORG_NAME}" gaat.`);
  console.log('\nDeze wachtwoorden staan nu in je terminalgeschiedenis. Het zijn testaccounts in een');
  console.log('lege studio, dus dat is geen ramp — maar ruim ze op als je klaar bent:');
  console.log(`  node scripts/seed-testruimte.mjs --owner-email ${OWNER_EMAIL} --remove --apply`);
}

async function main() {
  if (!OWNER_EMAIL) {
    console.error('Geef je eigen account op met --owner-email; anders kun je de Testruimte niet in.');
    process.exit(1);
  }
  // De hele reden van dit script is dat het klantgegevens níet aanraakt. Draaien op de
  // standaardstudio zou testlessen en testaccounts in de echte studio zetten.
  if (ORG_ID === DEFAULT_ORG_ID) {
    console.error(`Dit script weigert te draaien op de standaardstudio "${DEFAULT_ORG_ID}".`);
    console.error('Kies een ander studio-id met --org.');
    process.exit(1);
  }

  const admin = getAdmin();
  if (admin.error) {
    console.error('Firebase Admin niet beschikbaar:', admin.error);
    process.exit(1);
  }

  if (REMOVE) await remove(admin.db, admin.auth);
  else await seed(admin.db, admin.auth);
}

main().catch((e) => {
  console.error('Mislukt:', e);
  process.exit(1);
});
