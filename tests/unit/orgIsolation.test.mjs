/**
 * Studio-isolatie in de AI-gegevenslaag (api/_lib/liftlogData.mjs).
 *
 * Deze laag draait op de Firebase Admin SDK en omzeilt dus alle Firestore-regels: de scheiding
 * tussen studio's moet hier in code staan. Daarom testen we `createStore` rechtstreeks, met een
 * nagebootste Firestore die alleen doet wat we gebruiken (collection → where → get, doc → get/set).
 */
import { describe, it, expect } from 'vitest';
import { createStore, DEFAULT_ORG_ID, orgIdOf } from '../../api/_lib/liftlogData.mjs';

/** Minimale nabootsing van de Admin-SDK query-API op een gewone map met documenten. */
function fakeDb(seed) {
  const data = new Map(Object.entries(seed).map(([k, v]) => [k, { ...v }]));
  const writes = [];

  const matches = (docData, filters) =>
    filters.every(([field, op, value]) => {
      const actual = docData[field];
      if (op === 'array-contains') return Array.isArray(actual) && actual.includes(value);
      return actual === value;
    });

  function makeQuery(name, filters) {
    return {
      where: (field, op, value) => makeQuery(name, [...filters, [field, op, value]]),
      get: async () => {
        const docs = [...data.entries()]
          .filter(([path]) => path.startsWith(`${name}/`))
          .map(([path, v]) => ({ id: path.slice(name.length + 1), data: () => v }))
          .filter((d) => matches(d.data(), filters));
        return { docs, empty: docs.length === 0 };
      },
    };
  }

  return {
    _data: data,
    _writes: writes,
    collection: (name) => ({
      ...makeQuery(name, []),
      doc: (id) => ({
        get: async () => {
          const v = data.get(`${name}/${id}`);
          return { exists: v !== undefined, id, data: () => v };
        },
        set: async (value, opts) => {
          const path = `${name}/${id}`;
          writes.push({ path, value });
          data.set(path, opts?.merge ? { ...(data.get(path) ?? {}), ...value } : value);
        },
      }),
    }),
  };
}

const seed = {
  'profiles/adminA': { userId: 'adminA', orgId: 'vanas', role: 'admin', displayName: 'Kenny' },
  'profiles/sporterA': { userId: 'sporterA', orgId: 'vanas', role: 'sporter', displayName: 'Bas', trainerId: 'adminA' },
  'profiles/legacy': { userId: 'legacy', role: 'sporter', displayName: 'Oud account', trainerId: 'adminA' },
  'profiles/adminB': { userId: 'adminB', orgId: 'studiob', role: 'admin', displayName: 'Nora' },
  'profiles/sporterB': { userId: 'sporterB', orgId: 'studiob', role: 'sporter', displayName: 'Iris', trainerId: 'adminB' },
  'workouts/wA': { id: 'wA', orgId: 'vanas', trainerId: 'adminA', clientId: 'sporterA', name: 'Schema A', days: [] },
  'workouts/wOpenA': { id: 'wOpenA', orgId: 'vanas', trainerId: 'adminA', audience: 'open', name: 'Open A', days: [] },
  'workouts/wB': { id: 'wB', orgId: 'studiob', trainerId: 'adminB', clientId: 'sporterB', name: 'Schema B', days: [] },
};

describe('studio-isolatie in de AI-gegevenslaag', () => {
  it('getAllProfiles geeft alleen de eigen studio terug', async () => {
    const db = fakeDb(seed);
    const namesA = (await createStore(db, null, 'vanas').getAllProfiles()).map((p) => p.displayName);
    const namesB = (await createStore(db, null, 'studiob').getAllProfiles()).map((p) => p.displayName);

    expect(namesA).toContain('Bas');
    expect(namesA).not.toContain('Iris');
    expect(namesB).toContain('Iris');
    expect(namesB).not.toContain('Bas');
  });

  it('schema’s van een andere studio zijn onzichtbaar, ook de open schema’s', async () => {
    const db = fakeDb(seed);
    const forB = await createStore(db, null, 'studiob').getSchemasForUser('sporterB', 'sporter');
    expect(forB.map((s) => s.name)).toEqual(['Schema B']);

    const forA = await createStore(db, null, 'vanas').getSchemasForUser('sporterA', 'sporter');
    expect(forA.map((s) => s.name).sort()).toEqual(['Open A', 'Schema A']);
  });

  it('een schema van een andere studio toewijzen wordt geweigerd', async () => {
    const db = fakeDb(seed);
    await expect(createStore(db, null, 'studiob').assignSchema('wA', 'sporterB')).rejects.toThrow(
      /niet gevonden/i
    );
    // Het document mag niet zijn aangeraakt.
    expect(db._writes).toHaveLength(0);
    expect(db._data.get('workouts/wA').clientId).toBe('sporterA');
  });

  it('een schema binnen de eigen studio toewijzen mag wel', async () => {
    const db = fakeDb(seed);
    await createStore(db, null, 'vanas').assignSchema('wA', 'legacy');
    expect(db._data.get('workouts/wA').clientId).toBe('legacy');
  });

  it('elke schrijfactie stempelt de eigen studio mee', async () => {
    const db = fakeDb(seed);
    const store = createStore(db, null, 'studiob');
    await store.saveLog({ userId: 'sporterB', loggedBy: 'sporterB', exerciseName: 'Squat' });
    await store.saveNutritionLog({ userId: 'sporterB', date: '2026-09-07', productName: 'Kwark' });
    await store.saveMeasurement({ userId: 'sporterB', date: '2026-09-07', weightKg: 70 });
    await store.saveSchema({ name: 'Nieuw', trainerId: 'adminB', days: [] });

    expect(db._writes).toHaveLength(4);
    for (const w of db._writes) expect(w.value.orgId).toBe('studiob');
  });

  it('zonder studio wordt er niets gelezen of geschreven', async () => {
    const db = fakeDb(seed);
    const store = createStore(db, null, null);
    await expect(store.getAllProfiles()).rejects.toThrow(/studio/i);
    await expect(store.saveLog({ userId: 'x' })).rejects.toThrow(/studio/i);
    expect(db._writes).toHaveLength(0);
  });

  it('updateProfileFields kan geen studio, rol of platformrechten wijzigen', async () => {
    const db = fakeDb(seed);
    await createStore(db, null, 'vanas').updateProfileFields('sporterA', {
      displayName: 'Bas de V',
      orgId: 'studiob',
      role: 'admin',
      platformAdmin: true,
    });
    const saved = db._data.get('profiles/sporterA');
    expect(saved.displayName).toBe('Bas de V');
    expect(saved.orgId).toBe('vanas');
    expect(saved.role).toBe('sporter');
    expect(saved.platformAdmin).toBeUndefined();
  });

  it('documenten zonder orgId horen bij de standaardstudio', () => {
    expect(orgIdOf(undefined)).toBe(DEFAULT_ORG_ID);
    expect(orgIdOf('  ')).toBe(DEFAULT_ORG_ID);
    expect(orgIdOf('studiob')).toBe('studiob');
  });
});
