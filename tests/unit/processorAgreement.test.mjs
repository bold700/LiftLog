/**
 * Verwerkersovereenkomst (api/_lib/processorAgreement.mjs, processorAgreementPdf.mjs,
 * googleDrive.mjs en de acties in api/admin-account.mjs): lezen, tekenen, PDF, Drive en mail.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import {
  CURRENT_PROCESSOR_AGREEMENT_VERSION,
  agreementFileName,
  agreementHash,
  agreementSections,
  cleanSignInput,
} from '../../api/_lib/processorAgreement.mjs';
import { buildProcessorAgreementPdf } from '../../api/_lib/processorAgreementPdf.mjs';

const controller = { legalName: 'Van As Personal Training', street: 'Dorpsstraat 1', postcode: '1234 AB', city: 'Utrecht', kvk: '12345678' };
const validBody = { version: CURRENT_PROCESSOR_AGREEMENT_VERSION, agree: true, controller, signer: { name: 'Simone', role: 'Eigenaar' } };

describe('cleanSignInput', () => {
  it('neemt een volledig ingevuld akkoord aan', () => {
    const r = cleanSignInput(validBody);
    expect(r.error).toBeUndefined();
    expect(r.value.controller.kvk).toBe('12345678');
    expect(r.value.signer).toEqual({ name: 'Simone', role: 'Eigenaar' });
  });

  it('weigert zonder vinkje, met een oude versie, of met ontbrekende gegevens', () => {
    expect(cleanSignInput({ ...validBody, agree: false }).error).toMatch(/akkoord/);
    expect(cleanSignInput({ ...validBody, version: 0 }).error).toMatch(/nieuwere versie/);
    expect(cleanSignInput({ ...validBody, controller: { ...controller, kvk: '1234' } }).error).toMatch(/KvK/);
    expect(cleanSignInput({ ...validBody, controller: { ...controller, city: '' } }).error).toMatch(/adres/);
    expect(cleanSignInput({ ...validBody, signer: { name: 'Simone', role: ' ' } }).error).toMatch(/functie/);
  });
});

describe('tekst en PDF', () => {
  it('heeft een vaste hash per versie', () => {
    expect(agreementHash()).toMatch(/^[0-9a-f]{64}$/);
    expect(agreementHash()).toBe(agreementHash(CURRENT_PROCESSOR_AGREEMENT_VERSION));
    expect(agreementSections(999)).toBeNull();
  });

  it('maakt een PDF met de ondertekening, ook over meerdere pagina\'s', () => {
    const record = {
      version: 1,
      textHash: agreementHash(),
      signedAt: '2026-10-01T12:05:00.000Z',
      controller,
      signer: { name: 'Simone', role: 'Eigenaar', email: 'simone@vanas.nl', uid: 'u1' },
    };
    const bytes = Buffer.from(buildProcessorAgreementPdf(record));
    const text = bytes.toString('latin1');
    expect(text.startsWith('%PDF')).toBe(true);
    expect(text).toContain('Elektronische ondertekening');
    expect(text).toContain('simone@vanas.nl');
    expect((text.match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(1);
    expect(agreementFileName(record)).toBe('2026-10-01 Verwerkersovereenkomst VORM - Van As Personal Training (v1).pdf');
  });
});

describe('Google Drive', async () => {
  // De echte module: verderop in dit bestand is uploadPdfToDrive vervangen door een nep.
  const { serviceAccountJwt, uploadPdfToDrive } = await vi.importActual('../../api/_lib/googleDrive.mjs');
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const account = { client_email: 'vorm@project.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) };

  it('tekent de JWT met de sleutel van het serviceaccount', () => {
    const jwt = serviceAccountJwt(account, 1000);
    const [h, c, sig] = jwt.split('.');
    const claims = JSON.parse(Buffer.from(c, 'base64url').toString());
    expect(claims).toMatchObject({ iss: account.client_email, iat: 1000, exp: 4600, scope: 'https://www.googleapis.com/auth/drive' });
    const v = createVerify('RSA-SHA256');
    v.update(`${h}.${c}`);
    expect(v.verify(publicKey, Buffer.from(sig, 'base64url'))).toBe(true);
  });

  it('haalt een token en zet de PDF in de map op de gedeelde drive', async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, init });
      if (url.includes('oauth2')) return { ok: true, status: 200, json: async () => ({ access_token: 'tok' }) };
      return { ok: true, status: 200, json: async () => ({ id: 'file1', webViewLink: 'https://drive/file1' }) };
    };
    const r = await uploadPdfToDrive({ account, folderId: 'folder9', name: 'x.pdf', pdf: new Uint8Array([37, 80, 68, 70]), fetchImpl });
    expect(r).toEqual({ id: 'file1', webViewLink: 'https://drive/file1' });
    expect(calls[1].url).toContain('supportsAllDrives=true');
    expect(calls[1].init.headers.Authorization).toBe('Bearer tok');
    expect(calls[1].init.body.toString()).toContain('"parents":["folder9"]');
  });

  it('geeft een leesbare fout als Google weigert', async () => {
    const fetchImpl = async () => ({ ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }) });
    await expect(uploadPdfToDrive({ account, folderId: 'f', name: 'x.pdf', pdf: new Uint8Array(1), fetchImpl })).rejects.toThrow(/invalid_grant/);
  });
});

// --- De acties in api/admin-account.mjs, met een nep-Firestore ---

let store;
let currentUid;
const uploads = [];
const mails = [];

function reset() {
  store = {
    profiles: {
      adminA: { orgId: 'vanas', orgIds: ['vanas'], role: 'admin', displayName: 'Simone' },
      trainerA: { orgId: 'vanas', orgIds: ['vanas'], role: 'trainer', displayName: 'Esther' },
      adminB: { orgId: 'studiob', orgIds: ['studiob'], role: 'admin', displayName: 'Bea' },
      adminA2: { orgId: 'vanas', orgIds: ['vanas'], role: 'admin', displayName: 'Esther' },
      support: { orgId: 'vanas', orgIds: ['vanas'], role: 'admin', displayName: 'Kenny', email: 'support@bold700.com' },
    },
    orgs: {
      vanas: { name: 'Van As PT', ownerId: 'adminA', business: { legalName: 'Van As Personal Training', kvk: '12345678', street: 'Dorpsstraat 1', postcode: '1234 AB', city: 'Utrecht' } },
      studiob: { name: 'Studio B', ownerId: 'adminB' },
    },
    rateLimits: {},
    processorAgreements: {},
  };
  uploads.length = 0;
  mails.length = 0;
}
const col = (name) => (store[name] ??= {});
const docRef = (name, id) => ({
  id,
  get: async () => ({ exists: col(name)[id] !== undefined, id, data: () => col(name)[id] }),
  set: async (data, opts) => {
    col(name)[id] = opts?.merge ? { ...(col(name)[id] ?? {}), ...data } : { ...data };
  },
});

vi.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => 'ts', delete: () => ({ __delete: true }) } }));
vi.mock('../../api/_lib/pushSend.mjs', () => ({ sendPushToUser: async () => 1 }));
vi.mock('../../api/_lib/googleDrive.mjs', async (orig) => ({
  ...(await orig()),
  uploadPdfToDrive: async (p) => {
    uploads.push(p);
    return { id: 'drive1', webViewLink: 'https://drive/drive1' };
  },
}));
vi.mock('../../api/_lib/invoiceEmail.mjs', async (orig) => ({
  ...(await orig()),
  mailConfigured: () => true,
  sendViaResend: async (p) => {
    mails.push(p);
    return 'm1';
  },
}));
vi.mock('../../api/_lib/firebaseAdmin.mjs', () => ({
  parseServiceAccount: () => ({ account: { client_email: 'sa@x', private_key: 'k' } }),
  getAdmin: () => ({
    auth: { verifyIdToken: async () => ({ uid: currentUid }), getUser: async (uid) => ({ uid, email: uid === 'support' ? 'support@bold700.com' : `${uid}@example.com` }) },
    db: {
      collection: (name) => ({ doc: (id) => docRef(name, id) }),
      runTransaction: async (fn) => fn({ get: (ref) => ref.get(), set: (ref, data) => ref.set(data), update: (ref, data) => ref.set(data, { merge: true }) }),
    },
  }),
}));

const { default: handler } = await import('../../api/admin-account.mjs');

async function post(uid, body) {
  currentUid = uid;
  const res = {
    statusCode: 0,
    body: null,
    setHeader() {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    end(payload) {
      this.body = payload ? JSON.parse(payload) : null;
    },
  };
  await handler({ method: 'POST', headers: { authorization: 'Bearer x', 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }, body }, res);
  return res;
}

describe('acties verwerkersovereenkomst', () => {
  beforeEach(() => {
    reset();
    process.env.GOOGLE_DRIVE_FOLDER_ID = 'folder9';
  });

  it('geeft de tekst en de voorgevulde bedrijfsgegevens aan een beheerder', async () => {
    const r = await post('adminA', { action: 'processorAgreement', actingOrgId: 'vanas' });
    expect(r.statusCode).toBe(200);
    expect(r.body.version).toBe(CURRENT_PROCESSOR_AGREEMENT_VERSION);
    expect(r.body.sections.length).toBeGreaterThan(5);
    expect(r.body.signed).toBeNull();
    expect(r.body.prefill).toMatchObject({ legalName: 'Van As Personal Training', kvk: '12345678', name: 'Simone' });
    expect(r.body.owner).toEqual({ uid: 'adminA', name: 'Simone' });
    expect(r.body.canSign).toBe(true);
  });

  it('alleen de eigenaar tekent; een andere beheerder leest mee maar tekent niet', async () => {
    const info = await post('adminA2', { action: 'processorAgreement', actingOrgId: 'vanas' });
    expect(info.statusCode).toBe(200);
    expect(info.body.canSign).toBe(false);
    const r = await post('adminA2', { action: 'signProcessorAgreement', actingOrgId: 'vanas', ...validBody });
    expect(r.statusCode).toBe(403);
    expect(r.body.error).toMatch(/eigenaar/);
    expect(store.orgs.vanas.processorAgreement).toBeUndefined();
  });

  it('zonder eigenaar tekent niemand: eerst een eigenaar aanwijzen', async () => {
    delete store.orgs.vanas.ownerId;
    const r = await post('adminA', { action: 'signProcessorAgreement', actingOrgId: 'vanas', ...validBody });
    expect(r.statusCode).toBe(403);
    expect(r.body.error).toMatch(/Wijs eerst de eigenaar/);
  });

  it('weigert een trainer', async () => {
    expect((await post('trainerA', { action: 'processorAgreement', actingOrgId: 'vanas' })).statusCode).toBe(403);
    expect((await post('trainerA', { action: 'signProcessorAgreement', actingOrgId: 'vanas', ...validBody })).statusCode).toBe(403);
  });

  it('een beheerder van een andere studio kan niet voor deze studio tekenen', async () => {
    const r = await post('adminB', { action: 'signProcessorAgreement', actingOrgId: 'vanas', ...validBody });
    expect(r.statusCode).toBe(200);
    // actingOrg valt terug op de eigen studio: getekend voor studiob, niet voor vanas.
    expect(store.orgs.vanas.processorAgreement).toBeUndefined();
    expect(store.orgs.studiob.processorAgreement.orgId).toBe('studiob');
  });

  it('tekenen legt vast wie, wanneer en welke tekst, en stuurt kopieën naar Drive en mail', async () => {
    const r = await post('adminA', { action: 'signProcessorAgreement', actingOrgId: 'vanas', ...validBody });
    expect(r.statusCode).toBe(200);
    expect(r.body).toMatchObject({ ok: true, drive: 'uploaded', emailed: true });
    const rec = store.orgs.vanas.processorAgreement;
    expect(rec).toMatchObject({ version: 1, textHash: agreementHash(), orgId: 'vanas', ip: '1.2.3.4' });
    expect(rec.signer).toEqual({ name: 'Simone', role: 'Eigenaar', uid: 'adminA', email: 'adminA@example.com' });
    expect(store.orgs.vanas.name).toBe('Van As PT');
    const history = Object.values(store.processorAgreements);
    expect(history).toHaveLength(1);
    expect(history[0].copies).toMatchObject({ drive: 'uploaded', emailed: true });
    expect(uploads[0]).toMatchObject({ folderId: 'folder9', name: agreementFileName(rec) });
    expect(mails.map((m) => m.to).sort()).toEqual(['adminA@example.com', 'support@bold700.com']);
    expect(mails[0].attachments[0].filename).toMatch(/\.pdf$/);
  });

  it('zonder Drive-map wordt er alleen gemaild', async () => {
    delete process.env.GOOGLE_DRIVE_FOLDER_ID;
    const r = await post('adminA', { action: 'signProcessorAgreement', actingOrgId: 'vanas', ...validBody });
    expect(r.body.drive).toBe('not-configured');
    expect(uploads).toHaveLength(0);
  });

  it('weigert een onvolledig akkoord', async () => {
    const r = await post('adminA', { action: 'signProcessorAgreement', actingOrgId: 'vanas', ...validBody, agree: false });
    expect(r.statusCode).toBe(400);
    expect(store.orgs.vanas.processorAgreement).toBeUndefined();
  });

  it('de PDF is alleen te downloaden na tekenen', async () => {
    expect((await post('adminA', { action: 'processorAgreementPdf', actingOrgId: 'vanas' })).statusCode).toBe(404);
    await post('adminA', { action: 'signProcessorAgreement', actingOrgId: 'vanas', ...validBody });
    const r = await post('adminA', { action: 'processorAgreementPdf', actingOrgId: 'vanas' });
    expect(r.statusCode).toBe(200);
    expect(Buffer.from(r.body.pdf, 'base64').subarray(0, 4).toString()).toBe('%PDF');
  });
});

describe('eigenaar van de studio aanwijzen', () => {
  beforeEach(reset);

  it('de eigenaar draagt over aan een andere beheerder', async () => {
    const r = await post('adminA', { action: 'setOwner', actingOrgId: 'vanas', targetUid: 'adminA2' });
    expect(r.statusCode).toBe(200);
    expect(store.orgs.vanas.ownerId).toBe('adminA2');
    expect(store.orgs.vanas.ownerSetBy).toBe('adminA');
  });

  it('een beheerder die geen eigenaar is kan niet overdragen', async () => {
    const r = await post('adminA2', { action: 'setOwner', actingOrgId: 'vanas', targetUid: 'adminA2' });
    expect(r.statusCode).toBe(403);
    expect(store.orgs.vanas.ownerId).toBe('adminA');
  });

  it('zonder eigenaar mag een beheerder er een aanwijzen', async () => {
    delete store.orgs.vanas.ownerId;
    const r = await post('adminA2', { action: 'setOwner', actingOrgId: 'vanas', targetUid: 'adminA' });
    expect(r.statusCode).toBe(200);
    expect(store.orgs.vanas.ownerId).toBe('adminA');
  });

  it('support van BOLD700 wijst aan, maar wordt zelf nooit eigenaar', async () => {
    expect((await post('support', { action: 'setOwner', actingOrgId: 'vanas', targetUid: 'adminA2' })).statusCode).toBe(200);
    expect(store.orgs.vanas.ownerId).toBe('adminA2');
    const r = await post('adminA2', { action: 'setOwner', actingOrgId: 'vanas', targetUid: 'support' });
    expect(r.statusCode).toBe(400);
    expect(store.orgs.vanas.ownerId).toBe('adminA2');
  });

  it('de nieuwe eigenaar moet beheerder van deze studio zijn', async () => {
    expect((await post('adminA', { action: 'setOwner', actingOrgId: 'vanas', targetUid: 'trainerA' })).statusCode).toBe(400);
    expect((await post('adminA', { action: 'setOwner', actingOrgId: 'vanas', targetUid: 'adminB' })).statusCode).toBe(400);
    expect(store.orgs.vanas.ownerId).toBe('adminA');
  });

  it('een trainer wijst geen eigenaar aan', async () => {
    expect((await post('trainerA', { action: 'setOwner', actingOrgId: 'vanas', targetUid: 'trainerA' })).statusCode).toBe(403);
  });

  it('de eigenaar is niet weg te halen of terug te zetten naar trainer zonder eerst over te dragen', async () => {
    const demote = await post('adminA2', { action: 'setRole', actingOrgId: 'vanas', targetUid: 'adminA', role: 'trainer' });
    expect(demote.statusCode).toBe(409);
    const del = await post('adminA2', { action: 'delete', actingOrgId: 'vanas', targetUid: 'adminA' });
    expect(del.statusCode).toBe(409);
    expect(store.profiles.adminA.role).toBe('admin');
  });
});
