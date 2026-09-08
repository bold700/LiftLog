/**
 * Regeltests voor firestore.rules tegen de Firestore-emulator (vereist Java):
 *   npm run test:rules
 * Controleert wie wat mag met profielen (rollen!), logs, de ranglijst en workouts.
 */
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, setDoc, updateDoc, getDoc, deleteDoc } from 'firebase/firestore';

const env = await initializeTestEnvironment({
  projectId: 'liftlog-rules-test',
  firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8089 },
});
await env.clearFirestore();
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'profiles/admin1'), { userId: 'admin1', role: 'admin', trainerId: null });
  await setDoc(doc(db, 'profiles/trainer1'), { userId: 'trainer1', role: 'trainer', trainerId: null });
  await setDoc(doc(db, 'profiles/sporter1'), { userId: 'sporter1', role: 'sporter', trainerId: 'trainer1', displayName: 'Bas' });
  await setDoc(doc(db, 'profiles/sporter2'), { userId: 'sporter2', role: 'sporter', trainerId: null, displayName: 'Sumit' });
  await setDoc(doc(db, 'profiles/sporter3'), { userId: 'sporter3', role: 'sporter', trainerId: null, displayName: 'Eva' });
});
const as = (uid) => env.authenticatedContext(uid).firestore();
let passed = 0, failed = 0;
async function t(name, ok, p) {
  try { await (ok ? assertSucceeds(p) : assertFails(p)); passed++; console.log('  ok  ', name); }
  catch (e) { failed++; console.log('  FAIL', name, '→', String(e.message || e).split('\n')[0].slice(0, 160)); }
}

console.log('Profielen');
await t('sporter maakt zichzelf admin → geweigerd', false, updateDoc(doc(as('sporter1'), 'profiles/sporter1'), { role: 'admin' }));
await t('sporter maakt zichzelf trainer → geweigerd', false, updateDoc(doc(as('sporter1'), 'profiles/sporter1'), { role: 'trainer', trainerRequested: false }));
await t('sporter zet createdByAdmin → geweigerd', false, updateDoc(doc(as('sporter1'), 'profiles/sporter1'), { createdByAdmin: true }));
await t('sporter werkt eigen naam/geboortedatum bij → mag', true, updateDoc(doc(as('sporter1'), 'profiles/sporter1'), { displayName: 'Bas de V', birthDate: '1990-01-01' }));
await t('sporter leest ander profiel → geweigerd', false, getDoc(doc(as('sporter1'), 'profiles/sporter2')));
await t('nieuw account maakt eigen sporterprofiel → mag', true, setDoc(doc(as('nieuw1'), 'profiles/nieuw1'), { userId: 'nieuw1', role: 'sporter', trainerId: null, trainerRequested: true }));
await t('nieuw account maakt zichzelf trainer bij registratie → geweigerd', false, setDoc(doc(as('nieuw2'), 'profiles/nieuw2'), { userId: 'nieuw2', role: 'trainer', trainerId: null }));
await t('nieuw account maakt zichzelf admin bij registratie → geweigerd', false, setDoc(doc(as('nieuw3'), 'profiles/nieuw3'), { userId: 'nieuw3', role: 'admin', trainerId: null }));
await t('nieuw account met createdByAdmin → geweigerd', false, setDoc(doc(as('nieuw4'), 'profiles/nieuw4'), { userId: 'nieuw4', role: 'sporter', createdByAdmin: true }));
await t('trainer maakt sporter admin → geweigerd', false, updateDoc(doc(as('trainer1'), 'profiles/sporter1'), { role: 'admin' }));
await t('trainer maakt zichzelf admin → geweigerd', false, updateDoc(doc(as('trainer1'), 'profiles/trainer1'), { role: 'admin' }));
await t('trainer koppelt sporter aan zichzelf → mag', true, updateDoc(doc(as('trainer1'), 'profiles/sporter2'), { trainerId: 'trainer1' }));
await t('trainer werkt rusthartslag van sporter bij → mag', true, updateDoc(doc(as('trainer1'), 'profiles/sporter1'), { restingHrBpm: 60 }));
await t('trainer wijzigt profiel van andere trainer → geweigerd', false, updateDoc(doc(as('trainer1'), 'profiles/admin1'), { displayName: 'x' }));
await t('trainer leest sporterprofiel → mag', true, getDoc(doc(as('trainer1'), 'profiles/sporter2')));
await t('admin maakt sporter trainer → mag', true, updateDoc(doc(as('admin1'), 'profiles/sporter1'), { role: 'trainer', trainerId: null }));
await t('admin maakt account-profiel aan voor ander (Beheer) → mag', true, setDoc(doc(as('admin1'), 'profiles/nieuw5'), { userId: 'nieuw5', role: 'trainer', trainerId: null, createdByAdmin: true }));
await t('trainer maakt account-profiel aan voor ander → geweigerd', false, setDoc(doc(as('trainer1'), 'profiles/nieuw6'), { userId: 'nieuw6', role: 'sporter', trainerId: 'trainer1', createdByAdmin: true }));
await t('sporter verwijdert ander profiel → geweigerd', false, deleteDoc(doc(as('sporter1'), 'profiles/sporter2')));

console.log('Logs');
await t('sporter logt eigen oefening → mag', true, setDoc(doc(as('sporter2'), 'logs/l1'), { userId: 'sporter2', loggedBy: 'sporter2', exerciseName: 'Squat' }));
await t('sporter schrijft log in geschiedenis van ander → geweigerd', false, setDoc(doc(as('sporter2'), 'logs/l2'), { userId: 'sporter1', loggedBy: 'sporter2', exerciseName: 'Squat' }));
await t('trainer logt voor sporter (groepsles) → mag', true, setDoc(doc(as('trainer1'), 'logs/l3'), { userId: 'sporter2', loggedBy: 'trainer1', trainerId: 'trainer1', exerciseName: 'Squat' }));
await t('sporter leest log van ander → geweigerd', false, getDoc(doc(as('sporter3'), 'logs/l3')));
await t('sporter leest eigen log → mag', true, getDoc(doc(as('sporter2'), 'logs/l1')));
await t('meting van ander aanmaken als sporter → geweigerd', false, setDoc(doc(as('sporter2'), 'measurements/m1'), { userId: 'sporter1', loggedBy: 'sporter2', weightKg: 80 }));

console.log('Ranglijst');
const lb = (uid, extra = {}) => ({ userId: uid, displayLabel: 'Bas', visibility: 'named', photoURL: '', weightKg7d: 100, ...extra });
await t('eigen ranglijstdocument → mag', true, setDoc(doc(as('sporter1'), 'leaderboardPublic/sporter1'), lb('sporter1')));
await t('ranglijstdocument van ander → geweigerd', false, setDoc(doc(as('sporter1'), 'leaderboardPublic/sporter2'), lb('sporter2')));
await t('userId van ander in eigen document → geweigerd', false, setDoc(doc(as('sporter1'), 'leaderboardPublic/sporter1'), lb('sporter2')));
await t('externe foto-URL → geweigerd', false, setDoc(doc(as('sporter1'), 'leaderboardPublic/sporter1'), lb('sporter1', { photoURL: 'https://evil.example/x.png' })));
await t('foto uit Firebase Storage → mag', true, setDoc(doc(as('sporter1'), 'leaderboardPublic/sporter1'), lb('sporter1', { photoURL: 'https://firebasestorage.googleapis.com/v0/b/x/o/avatars%2Fsporter1?alt=media&token=abc' })));
await t('te lange naam → geweigerd', false, setDoc(doc(as('sporter1'), 'leaderboardPublic/sporter1'), lb('sporter1', { displayLabel: 'x'.repeat(61) })));
await t('merge-update van eigen document (zoals de app doet) → mag', true, setDoc(doc(as('sporter1'), 'leaderboardPublic/sporter1'), lb('sporter1', { weightKg7d: 120 }), { merge: true }));
await t('andere ingelogde gebruiker leest ranglijst → mag', true, getDoc(doc(as('sporter2'), 'leaderboardPublic/sporter1')));

console.log('Check-ins');
await t('sporter slaat eigen check-in op → mag', true, setDoc(doc(as('sporter2'), 'checkins/c1'), { userId: 'sporter2', loggedBy: 'sporter2', trainerId: 'trainer1', feeling: 4, note: 'Arnold press lastig' }));
await t('sporter schrijft check-in voor ander → geweigerd', false, setDoc(doc(as('sporter2'), 'checkins/c2'), { userId: 'sporter1', loggedBy: 'sporter2', feeling: 3 }));
await t('trainer leest check-in van sporter → mag', true, getDoc(doc(as('trainer1'), 'checkins/c1')));
await t('andere sporter leest check-in → geweigerd', false, getDoc(doc(as('sporter3'), 'checkins/c1')));

console.log('Workouts');
await t('sporter maakt workout op naam van trainer → geweigerd', false, setDoc(doc(as('sporter1'), 'workouts/w1'), { trainerId: 'trainer1', clientId: 'sporter1', name: 'x' }));
await t('trainer maakt workout → mag', true, setDoc(doc(as('trainer1'), 'workouts/w2'), { trainerId: 'trainer1', clientId: 'sporter1', name: 'x' }));
await t('toegewezen sporter leest workout → mag', true, getDoc(doc(as('sporter1'), 'workouts/w2')));
await t('andere sporter leest workout → geweigerd', false, getDoc(doc(as('sporter2'), 'workouts/w2')));

await env.cleanup();
console.log(`\n${passed} geslaagd, ${failed} mislukt`);
process.exit(failed ? 1 : 0);
