/**
 * Regeltests voor firestore.rules tegen de Firestore-emulator (vereist Java):
 *   npm run test:rules
 * Controleert wie wat mag met profielen (rollen!), logs, de ranglijst en workouts.
 */
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, setDoc, updateDoc, getDoc, deleteDoc, getDocs, collection, query, where } from 'firebase/firestore';

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

  // Studio's. Studio A (Van As) laat zelfregistratie toe, studio B niet.
  // De profielen hierboven hebben bewust geen orgId: dat test meteen de terugval voor data
  // van vóór de migratie, die als de standaardstudio moet worden gelezen.
  await setDoc(doc(db, 'orgs/vanas'), { name: 'Van As Personal Training', allowSelfSignup: true });
  await setDoc(doc(db, 'orgs/studiob'), { name: 'Studio B', allowSelfSignup: false });

  // Tweede studio, volledig eigen bezetting.
  await setDoc(doc(db, 'profiles/adminB'), { userId: 'adminB', orgId: 'studiob', orgIds: ['studiob'], role: 'admin', trainerId: null });
  await setDoc(doc(db, 'profiles/trainerB'), { userId: 'trainerB', orgId: 'studiob', orgIds: ['studiob'], role: 'trainer', trainerId: null });
  await setDoc(doc(db, 'profiles/sporterB'), { userId: 'sporterB', orgId: 'studiob', role: 'sporter', trainerId: 'trainerB', displayName: 'Nora' });
  // Freelance trainer die bij beide studio's werkt: thuisstudio A, lid van A én B.
  await setDoc(doc(db, 'profiles/duo'), { userId: 'duo', orgId: 'vanas', orgIds: ['vanas', 'studiob'], role: 'trainer', trainerId: null, displayName: 'Sam' });
  await setDoc(doc(db, 'logs/lB1'), { orgId: 'studiob', userId: 'sporterB', loggedBy: 'sporterB', exerciseName: 'Bench' });
  await setDoc(doc(db, 'measurements/mB1'), { orgId: 'studiob', userId: 'sporterB', loggedBy: 'sporterB', weightKg: 70 });
  await setDoc(doc(db, 'checkins/cB1'), { orgId: 'studiob', userId: 'sporterB', loggedBy: 'sporterB', trainerId: 'trainerB', feeling: 4 });
  await setDoc(doc(db, 'workouts/wB1'), { orgId: 'studiob', trainerId: 'trainerB', clientId: 'sporterB', name: 'B-schema' });
  await setDoc(doc(db, 'workouts/wOpenA'), { trainerId: 'trainer1', clientId: null, audience: 'open', name: 'Open A' });
  await setDoc(doc(db, 'leaderboardPublic/sporterB'), { orgId: 'studiob', userId: 'sporterB', displayLabel: 'Nora', visibility: 'named', photoURL: '' });
  await setDoc(doc(db, 'measurements/mA1'), { userId: 'sporter2', loggedBy: 'sporter2', weightKg: 80 });
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

console.log('Studio-isolatie (multi-tenant)');
// Lezen over de studiogrens heen mag nooit, ook niet als trainer of beheerder.
await t('trainer studio B leest profiel studio A → geweigerd', false, getDoc(doc(as('trainerB'), 'profiles/sporter2')));
await t('beheerder studio B leest profiel studio A → geweigerd', false, getDoc(doc(as('adminB'), 'profiles/sporter2')));
await t('trainer studio A leest profiel studio B → geweigerd', false, getDoc(doc(as('trainer1'), 'profiles/sporterB')));
await t('trainer studio B leest log studio A → geweigerd', false, getDoc(doc(as('trainerB'), 'logs/l1')));
await t('beheerder studio B leest meting studio A → geweigerd', false, getDoc(doc(as('adminB'), 'measurements/mA1')));
await t('trainer studio B leest check-in studio A → geweigerd', false, getDoc(doc(as('trainerB'), 'checkins/c1')));
await t('trainer studio A leest check-in studio B → geweigerd', false, getDoc(doc(as('trainer1'), 'checkins/cB1')));
await t('trainer studio B leest workout studio A → geweigerd', false, getDoc(doc(as('trainerB'), 'workouts/w2')));
await t('sporter studio B leest open workout studio A → geweigerd', false, getDoc(doc(as('sporterB'), 'workouts/wOpenA')));
await t('sporter studio B leest ranglijst studio A → geweigerd', false, getDoc(doc(as('sporterB'), 'leaderboardPublic/sporter1')));
await t('sporter studio A leest ranglijst studio B → geweigerd', false, getDoc(doc(as('sporter2'), 'leaderboardPublic/sporterB')));

// Schrijven over de studiogrens heen mag ook niet.
await t('beheerder studio B wijzigt profiel studio A → geweigerd', false, updateDoc(doc(as('adminB'), 'profiles/sporter2'), { displayName: 'gekaapt' }));
await t('beheerder studio B maakt account in studio A → geweigerd', false, setDoc(doc(as('adminB'), 'profiles/nieuwX'), { userId: 'nieuwX', orgId: 'vanas', role: 'sporter', createdByAdmin: true }));
await t('trainer studio B maakt workout in studio A → geweigerd', false, setDoc(doc(as('trainerB'), 'workouts/wX'), { orgId: 'vanas', trainerId: 'trainerB', name: 'x' }));
await t('trainer studio B logt in studio A → geweigerd', false, setDoc(doc(as('trainerB'), 'logs/lX'), { orgId: 'vanas', userId: 'sporterB', loggedBy: 'trainerB', exerciseName: 'Squat' }));
await t('trainer studio B schrijft check-in in studio A → geweigerd', false, setDoc(doc(as('trainerB'), 'checkins/cX'), { orgId: 'vanas', userId: 'sporterB', loggedBy: 'trainerB', feeling: 3 }));
await t('check-in verhuizen naar andere studio → geweigerd', false, updateDoc(doc(as('sporterB'), 'checkins/cB1'), { orgId: 'vanas' }));
await t('sporter zet zichzelf in andere studio → geweigerd', false, updateDoc(doc(as('sporter2'), 'profiles/sporter2'), { orgId: 'studiob' }));
await t('sporter zet zichzelf platformbeheerder → geweigerd', false, updateDoc(doc(as('sporter2'), 'profiles/sporter2'), { platformAdmin: true }));
await t('beheerder zet zichzelf platformbeheerder → geweigerd', false, updateDoc(doc(as('admin1'), 'profiles/admin1'), { platformAdmin: true }));
await t('registratie in studio zonder open aanmelding → geweigerd', false, setDoc(doc(as('nieuwB'), 'profiles/nieuwB'), { userId: 'nieuwB', orgId: 'studiob', role: 'sporter' }));

// Binnen de eigen studio moet alles gewoon blijven werken (controle dat we niet te veel dichtzetten).
await t('trainer studio B leest eigen sporter → mag', true, getDoc(doc(as('trainerB'), 'profiles/sporterB')));
await t('trainer studio B leest eigen log → mag', true, getDoc(doc(as('trainerB'), 'logs/lB1')));
await t('trainer studio B leest eigen check-in → mag', true, getDoc(doc(as('trainerB'), 'checkins/cB1')));
await t('trainer studio B leest eigen workout → mag', true, getDoc(doc(as('trainerB'), 'workouts/wB1')));
await t('sporter studio B leest ranglijst eigen studio → mag', true, getDoc(doc(as('sporterB'), 'leaderboardPublic/sporterB')));
await t('beheerder studio B leest eigen studio → mag', true, getDoc(doc(as('adminB'), 'orgs/studiob')));
await t('beheerder studio B leest andere studio → geweigerd', false, getDoc(doc(as('adminB'), 'orgs/vanas')));
await t('trainer studio B maakt workout in eigen studio → mag', true, setDoc(doc(as('trainerB'), 'workouts/wB2'), { orgId: 'studiob', trainerId: 'trainerB', name: 'ok' }));

console.log('Berichten');
const msg = (from, to, extra = {}) => ({
  orgId: 'vanas', threadId: [from, to].sort().join('__'), participants: [from, to].sort(),
  senderId: from, recipientId: to, text: 'Hoe ging de training?', kind: 'text', readAt: null, ...extra,
});
await t('trainer stuurt bericht aan sporter → mag', true, setDoc(doc(as('trainer1'), 'messages/m1'), msg('trainer1', 'sporter2')));
await t('sporter antwoordt → mag', true, setDoc(doc(as('sporter2'), 'messages/m2'), msg('sporter2', 'trainer1')));
await t('bericht op naam van een ander versturen → geweigerd', false, setDoc(doc(as('sporter3'), 'messages/m3'), msg('trainer1', 'sporter2')));
await t('bericht aan jezelf → geweigerd', false, setDoc(doc(as('sporter3'), 'messages/m4'), msg('sporter3', 'sporter3')));
await t('leeg bericht → geweigerd', false, setDoc(doc(as('sporter3'), 'messages/m5'), msg('sporter3', 'trainer1', { text: '' })));
await t('bericht meteen als gelezen aanmaken → geweigerd', false, setDoc(doc(as('sporter3'), 'messages/m6'), msg('sporter3', 'trainer1', { readAt: '2026-09-07' })));
await t('derde leest andermans gesprek → geweigerd', false, getDoc(doc(as('sporter3'), 'messages/m1')));
await t('ontvanger leest het bericht → mag', true, getDoc(doc(as('sporter2'), 'messages/m1')));
await t('afzender leest het eigen bericht → mag', true, getDoc(doc(as('trainer1'), 'messages/m1')));
await t('ontvanger markeert als gelezen → mag', true, updateDoc(doc(as('sporter2'), 'messages/m1'), { readAt: '2026-09-07T10:00:00.000Z' }));
await t('afzender markeert eigen bericht als gelezen → geweigerd', false, updateDoc(doc(as('trainer1'), 'messages/m1'), { readAt: '2026-09-07T10:00:00.000Z' }));
await t('ontvanger wijzigt de tekst → geweigerd', false, updateDoc(doc(as('sporter2'), 'messages/m1'), { text: 'iets anders' }));
await t('afzender trekt eigen bericht terug → mag', true, deleteDoc(doc(as('sporter2'), 'messages/m2')));
await t('ontvanger verwijdert andermans bericht → geweigerd', false, deleteDoc(doc(as('sporter2'), 'messages/m1')));
await t('studio B leest bericht uit studio A → geweigerd', false, getDoc(doc(as('trainerB'), 'messages/m1')));

console.log('Pushtokens');
const tok = (uid, extra = {}) => ({ token: 'tok', userId: uid, orgId: 'vanas', platform: 'ios', ...extra });
await t('eigen toestel aanmelden → mag', true, setDoc(doc(as('sporter2'), 'pushTokens/tokA'), tok('sporter2')));
await t('toestel op naam van een ander → geweigerd', false, setDoc(doc(as('sporter3'), 'pushTokens/tokB'), tok('sporter2')));
await t('token van een ander lezen → geweigerd', false, getDoc(doc(as('sporter3'), 'pushTokens/tokA')));
await t('eigen token lezen → mag', true, getDoc(doc(as('sporter2'), 'pushTokens/tokA')));
await t('token van een ander verwijderen → geweigerd', false, deleteDoc(doc(as('sporter3'), 'pushTokens/tokA')));
await t('eigen token verwijderen → mag', true, deleteDoc(doc(as('sporter2'), 'pushTokens/tokA')));
await t('token in een andere studio aanmelden → geweigerd', false, setDoc(doc(as('sporter3'), 'pushTokens/tokC'), tok('sporter3', { orgId: 'studiob' })));

console.log('Gesprek ophalen (query moet door de leesregel komen)');
// Zonder filter op participants kan Firestore de leesregel niet toepassen en weigert het de hele lijst.
const threadQuery = (as_, a, b) =>
  getDocs(query(collection(as_, 'messages'),
    where('participants', 'array-contains', a),
    where('threadId', '==', [a, b].sort().join('__'))));
await t('deelnemer haalt zijn gesprek op → mag', true, threadQuery(as('trainer1'), 'trainer1', 'sporter2'));
await t('deelnemer aan de andere kant → mag', true, threadQuery(as('sporter2'), 'sporter2', 'trainer1'));
await t('derde haalt andermans gesprek op → geweigerd', false,
  getDocs(query(collection(as('sporter3'), 'messages'), where('threadId', '==', ['trainer1', 'sporter2'].sort().join('__')))));
await t('bericht zonder kloppende participants aanmaken → geweigerd', false,
  setDoc(doc(as('sporter3'), 'messages/mBad'), msg('sporter3', 'trainer1', { participants: ['sporter3', 'sporter2'] })));

console.log('Studio wisselen op een bestaand document');
// Dit is het gat dat de review vond: bij update stond het orgId niet vast.
await setDoc(doc(as('trainer1'), 'measurements/mMove'), { orgId: 'vanas', userId: 'sporter2', loggedBy: 'trainer1', trainerId: 'trainer1', weightKg: 80 });
await t('meting naar een andere studio schrijven → geweigerd', false, updateDoc(doc(as('trainer1'), 'measurements/mMove'), { orgId: 'studiob' }));
await setDoc(doc(as('sporter2'), 'logs/lMove'), { orgId: 'vanas', userId: 'sporter2', loggedBy: 'sporter2', exerciseName: 'Squat' });
await t('eigen log naar een andere studio schrijven → geweigerd', false, updateDoc(doc(as('sporter2'), 'logs/lMove'), { orgId: 'studiob' }));
await setDoc(doc(as('sporter2'), 'workoutRequests/rMove'), { orgId: 'vanas', userId: 'sporter2', status: 'pending' });
await t('aanvraag naar een andere studio schrijven → geweigerd', false, updateDoc(doc(as('sporter2'), 'workoutRequests/rMove'), { orgId: 'studiob' }));
await t('meting bijwerken binnen de eigen studio → mag', true, updateDoc(doc(as('trainer1'), 'measurements/mMove'), { weightKg: 81 }));

console.log('Profiel: ontsnappen naar een andere studio');
await t('eigen profiel verwijderen → geweigerd', false, deleteDoc(doc(as('sporter3'), 'profiles/sporter3')));
await t('beheerder verwijdert profiel in de app → geweigerd', false, deleteDoc(doc(as('admin1'), 'profiles/sporter3')));
await t('sporter hangt zichzelf aan een trainer → geweigerd', false, updateDoc(doc(as('sporter3'), 'profiles/sporter3'), { trainerId: 'trainer1' }));
await t('trainer koppelt sporter wel → mag', true, updateDoc(doc(as('trainer1'), 'profiles/sporter3'), { trainerId: 'trainer1' }));
await t('sporter leest profiel van zijn eigen trainer → mag', true, getDoc(doc(as('sporter3'), 'profiles/trainer1')));
await t('sporter leest profiel van een andere trainer → geweigerd', false, getDoc(doc(as('sporter3'), 'profiles/admin1')));

console.log('Pushtoken kapen');
await setDoc(doc(as('sporter2'), 'pushTokens/tokVictim'), { token: 'tokVictim', userId: 'sporter2', orgId: 'vanas', platform: 'ios' });
await t('andermans token naar jezelf omschrijven → geweigerd', false,
  setDoc(doc(as('sporter3'), 'pushTokens/tokVictim'), { token: 'tokVictim', userId: 'sporter3', orgId: 'vanas', platform: 'ios' }, { merge: true }));

console.log('Trainer bij meerdere studio\'s');
await t('schrijft in studio A → mag', true, setDoc(doc(as('duo'), 'workouts/wDuoA'), { orgId: 'vanas', trainerId: 'duo', name: 'A' }));
await t('schrijft in studio B → mag', true, setDoc(doc(as('duo'), 'workouts/wDuoB'), { orgId: 'studiob', trainerId: 'duo', name: 'B' }));
await t('leest zijn werk in studio A → mag', true, getDoc(doc(as('duo'), 'workouts/wDuoA')));
await t('leest zijn werk in studio B → mag', true, getDoc(doc(as('duo'), 'workouts/wDuoB')));
await t('leest de open workout van studio A → mag', true, getDoc(doc(as('duo'), 'workouts/wOpenA')));
// Lid zijn van een studio is geen vrijbrief: andermans schema blijft dicht, ook binnen je eigen studio.
await t('leest het schema van een andere trainer → geweigerd', false, getDoc(doc(as('duo'), 'workouts/w2')));
await t('schrijft in een studio waar hij NIET werkt → geweigerd', false, setDoc(doc(as('duo'), 'workouts/wDuoC'), { orgId: 'studioc', trainerId: 'duo', name: 'C' }));
await t('trainer met één studio komt niet bij de andere', false, getDoc(doc(as('trainer1'), 'workouts/wB1')));

console.log('Lidmaatschap kan niemand zichzelf geven');
await t('sporter voegt zichzelf toe aan een tweede studio → geweigerd', false,
  updateDoc(doc(as('sporter2'), 'profiles/sporter2'), { orgIds: ['vanas', 'studiob'] }));
await t('trainer voegt zichzelf toe aan een tweede studio → geweigerd', false,
  updateDoc(doc(as('trainer1'), 'profiles/trainer1'), { orgIds: ['vanas', 'studiob'] }));
await t('registratie met twee studio\'s ineens → geweigerd', false,
  setDoc(doc(as('nieuwD'), 'profiles/nieuwD'), { userId: 'nieuwD', orgId: 'vanas', orgIds: ['vanas', 'studiob'], role: 'sporter' }));
await t('registratie met één studio → mag', true,
  setDoc(doc(as('nieuwE'), 'profiles/nieuwE'), { userId: 'nieuwE', orgId: 'vanas', orgIds: ['vanas'], role: 'sporter' }));
await t('beheerder haalt een trainer bij zijn studio → mag', true,
  updateDoc(doc(as('admin1'), 'profiles/trainer1'), { orgIds: ['vanas'] }));
await t('beheerder zet iemand in een studio die niet de zijne is → geweigerd', false,
  updateDoc(doc(as('admin1'), 'profiles/trainer1'), { orgIds: ['studiob'] }));

console.log('Lessen, reserveringen en credits');
const les = (extra = {}) => ({
  orgId: 'vanas', title: 'Small Group', date: '2026-09-10', startTime: '09:00',
  trainerId: 'trainer1', capacity: 8, creditCost: 1, bookedCount: 0, waitlistCount: 0, ...extra,
});
await t('trainer maakt een les → mag', true, setDoc(doc(as('trainer1'), 'classes/c1'), les()));
await t('sporter maakt een les → geweigerd', false, setDoc(doc(as('sporter2'), 'classes/c2'), les()));
await t('les aanmaken met de teller al gevuld → geweigerd', false, setDoc(doc(as('trainer1'), 'classes/c3'), les({ bookedCount: 5 })));
await t('les zonder capaciteit → geweigerd', false, setDoc(doc(as('trainer1'), 'classes/c4'), les({ capacity: 0 })));
await t('sporter leest het rooster → mag', true, getDoc(doc(as('sporter2'), 'classes/c1')));
await t('studio B leest het rooster van studio A → geweigerd', false, getDoc(doc(as('trainerB'), 'classes/c1')));
await t('trainer wijzigt de capaciteit → mag', true, updateDoc(doc(as('trainer1'), 'classes/c1'), { capacity: 10 }));
await t('trainer draait zelf aan de bezettingsteller → geweigerd', false, updateDoc(doc(as('trainer1'), 'classes/c1'), { bookedCount: 7 }));
await t('trainer draait aan de wachtlijstteller → geweigerd', false, updateDoc(doc(as('trainer1'), 'classes/c1'), { waitlistCount: 3 }));
await t('sporter wijzigt de les → geweigerd', false, updateDoc(doc(as('sporter2'), 'classes/c1'), { capacity: 99 }));

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'bookings/b1'), { orgId: 'vanas', classId: 'c1', userId: 'sporter2', status: 'booked', creditsSpent: 1 });
  await setDoc(doc(db, 'creditAccounts/vanas__sporter2'), { orgId: 'vanas', userId: 'sporter2', balance: 9 });
  await setDoc(doc(db, 'creditLedger/le1'), { orgId: 'vanas', userId: 'sporter2', delta: -1, reason: 'booking' });
});

await t('sporter leest zijn eigen reservering → mag', true, getDoc(doc(as('sporter2'), 'bookings/b1')));
await t('andere sporter leest die reservering → geweigerd', false, getDoc(doc(as('sporter3'), 'bookings/b1')));
await t('trainer leest de reservering → mag', true, getDoc(doc(as('trainer1'), 'bookings/b1')));
await t('reserveren buiten de server om → geweigerd', false, setDoc(doc(as('sporter2'), 'bookings/bZelf'), { orgId: 'vanas', classId: 'c1', userId: 'sporter2', status: 'booked' }));
await t('eigen reservering wijzigen → geweigerd', false, updateDoc(doc(as('sporter2'), 'bookings/b1'), { status: 'cancelled' }));

await t('sporter leest zijn eigen saldo → mag', true, getDoc(doc(as('sporter2'), 'creditAccounts/vanas__sporter2')));
await t('andere sporter leest dat saldo → geweigerd', false, getDoc(doc(as('sporter3'), 'creditAccounts/vanas__sporter2')));
await t('sporter zet zijn eigen saldo hoger → geweigerd', false, setDoc(doc(as('sporter2'), 'creditAccounts/vanas__sporter2'), { orgId: 'vanas', userId: 'sporter2', balance: 999 }, { merge: true }));
await t('beheerder zet een saldo buiten de server om → geweigerd', false, setDoc(doc(as('admin1'), 'creditAccounts/vanas__sporter2'), { balance: 999 }, { merge: true }));
await t('sporter leest zijn eigen grootboek → mag', true, getDoc(doc(as('sporter2'), 'creditLedger/le1')));
await t('grootboekregel toevoegen buiten de server om → geweigerd', false, setDoc(doc(as('sporter2'), 'creditLedger/leZelf'), { orgId: 'vanas', userId: 'sporter2', delta: 50, reason: 'manual' }));

await env.cleanup();
console.log(`\n${passed} geslaagd, ${failed} mislukt`);
process.exit(failed ? 1 : 0);
