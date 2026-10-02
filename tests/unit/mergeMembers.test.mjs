import { describe, expect, it } from 'vitest';
import { mergeMembers, profileFill } from '../../api/_lib/mergeMembers.mjs';

/** Minimale nabootsing van de Admin-SDK: where(==, array-contains), doc get/set(merge)/delete. */
function fakeDb(seed) {
  const data = new Map(Object.entries(seed).map(([k, v]) => [k, structuredClone(v)]));
  const query = (name, filters) => ({
    where: (f, op, v) => query(name, [...filters, [f, op, v]]),
    get: async () => ({
      docs: [...data.entries()]
        .filter(([p]) => p.startsWith(`${name}/`))
        .map(([p, v]) => ({ id: p.slice(name.length + 1), data: () => v }))
        .filter((d) => filters.every(([f, op, v]) => (op === 'array-contains' ? (d.data()[f] ?? []).includes(v) : d.data()[f] === v))),
    }),
  });
  return {
    data,
    collection: (name) => ({
      ...query(name, []),
      doc: (id) => ({
        get: async () => ({ exists: data.has(`${name}/${id}`), data: () => data.get(`${name}/${id}`) }),
        set: async (v, o) => data.set(`${name}/${id}`, o?.merge ? { ...(data.get(`${name}/${id}`) ?? {}), ...v } : v),
        delete: async () => data.delete(`${name}/${id}`),
      }),
    }),
  };
}

const keepProfile = { userId: 'keep', email: 'rljdeloor@gmail.com', displayName: 'Richard de Loor', orgIds: ['vanas'], phone: '' };
const fromProfile = { userId: 'from', email: 'richard@vanas.nl', displayName: 'Richard', orgIds: ['vanas'], phone: '0612345678', birthDate: '1977-03-10', role: 'sporter', trainerId: 't1' };
const seed = () => ({
  'profiles/keep': keepProfile,
  'profiles/from': fromProfile,
  'logs/l1': { userId: 'from', exerciseName: 'Squat' },
  'memberships/m1': { userId: 'from', orgId: 'vanas', status: 'active' },
  'creditAccounts/vanas__from': { orgId: 'vanas', userId: 'from', balance: 3 },
  'creditAccounts/vanas__keep': { orgId: 'vanas', userId: 'keep', balance: 2 },
  'classes/c1': { orgId: 'vanas', bookedCount: 2, waitlistCount: 0 },
  'bookings/b1': { userId: 'from', classId: 'c1', status: 'booked' },
  'bookings/b2': { userId: 'keep', classId: 'c1', status: 'booked' },
  'bookings/b3': { userId: 'from', classId: 'c2', status: 'booked' },
  'standingBookings/sb_ctp_from_3_2100_from_3_2100': { id: 'sb_ctp_from_3_2100_from_3_2100', userId: 'from', classTypeId: 'ctp_from_3_2100', weekday: 3, startTime: '21:00' },
  'classTypes/ctp_from_3_2100': { privateFor: 'from', orgId: 'vanas' },
  'classes/cls_gen_ctp_from_3_2100_x': { privateFor: 'from', orgId: 'vanas' },
  'groups/g1': { memberIds: ['from', 'x'] },
  'workouts/w1': { clientId: 'from' },
  'messages/msg1': { participants: ['from', 't1'], senderId: 'from', recipientId: 't1' },
  'pushTokens/tok': { userId: 'from' },
  'mcpKeys/k': { userId: 'from' },
});

describe('accounts samenvoegen', () => {
  it('voorbeeld (dryRun) telt wat overgaat en verandert niets', async () => {
    const db = fakeDb(seed());
    const before = JSON.stringify([...db.data.entries()]);
    const r = await mergeMembers(db, { orgId: 'vanas', keepId: 'keep', fromId: 'from', keepProfile, fromProfile, dryRun: true });
    expect(JSON.stringify([...db.data.entries()])).toBe(before);
    expect(r.counts).toMatchObject({ logs: 1, memberships: 1, bookings: 1, duplicateBookings: 1, standingBookings: 1, personalSlots: 1, personalClasses: 1, credits: 3 });
    expect(r.profileFill.sort()).toEqual(['birthDate', 'phone', 'trainerId']);
  });

  it('zet alles om naar het account dat blijft', async () => {
    const db = fakeDb(seed());
    await mergeMembers(db, { orgId: 'vanas', keepId: 'keep', fromId: 'from', keepProfile, fromProfile, byUserId: 'admin' });
    const g = (p) => db.data.get(p);
    expect(g('logs/l1').userId).toBe('keep');
    expect(g('memberships/m1').userId).toBe('keep');
    // Credits opgeteld, oude rekening weg, met een regel in het grootboek.
    expect(g('creditAccounts/vanas__keep').balance).toBe(5);
    expect(g('creditAccounts/vanas__from')).toBeUndefined();
    expect(g('creditLedger/cl_merge_from_keep')).toMatchObject({ userId: 'keep', delta: 3, reason: 'merge' });
    // Dubbele boeking in dezelfde les vervalt (en telt niet meer mee), de andere gaat over.
    expect(g('bookings/b1')).toMatchObject({ userId: 'keep', status: 'cancelled' });
    expect(g('classes/c1').bookedCount).toBe(1);
    expect(g('bookings/b3').userId).toBe('keep');
    // Vaste afspraak onder de nieuwe id; PT-moment en lessen voor het blijvende account.
    expect(g('standingBookings/sb_ctp_from_3_2100_from_3_2100')).toBeUndefined();
    expect(g('standingBookings/sb_ctp_from_3_2100_keep_3_2100')).toMatchObject({ userId: 'keep', id: 'sb_ctp_from_3_2100_keep_3_2100' });
    expect(g('classTypes/ctp_from_3_2100').privateFor).toBe('keep');
    expect(g('classes/cls_gen_ctp_from_3_2100_x').privateFor).toBe('keep');
    expect(g('groups/g1').memberIds).toEqual(['keep', 'x']);
    expect(g('workouts/w1').clientId).toBe('keep');
    expect(g('messages/msg1')).toMatchObject({ participants: ['keep', 't1'], senderId: 'keep' });
    // Inlogsleutels van het oude account weg; lege profielvelden aangevuld, naam en e-mail niet.
    expect(g('pushTokens/tok')).toBeUndefined();
    expect(g('mcpKeys/k')).toBeUndefined();
    expect(g('profiles/keep')).toMatchObject({ phone: '0612345678', birthDate: '1977-03-10', trainerId: 't1', displayName: 'Richard de Loor', email: 'rljdeloor@gmail.com', mergedFrom: ['richard@vanas.nl'] });
  });

  it('waarschuwt bij twee lopende abonnementen', async () => {
    const s = seed();
    s['memberships/m2'] = { userId: 'keep', orgId: 'vanas', status: 'active' };
    const r = await mergeMembers(fakeDb(s), { orgId: 'vanas', keepId: 'keep', fromId: 'from', keepProfile, fromProfile, dryRun: true });
    expect(r.warnings[0]).toMatch(/2 lopende abonnementen/);
  });

  it('profielvelden: alleen lege velden aanvullen, nooit rol, studio of toestemming', () => {
    expect(profileFill({ phone: '1', role: 'sporter' }, { phone: '2', role: 'admin', orgIds: ['b'], healthConsent: true, heightCm: 180 })).toEqual({ heightCm: 180 });
  });
});
