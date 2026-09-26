import { describe, it, expect } from 'vitest';
import { shouldDownload } from '../../src/native/liveUpdate';
// @ts-expect-error: .mjs-script zonder types
import { requiredPlugins } from '../../scripts/app-update-bundle.mjs';

/**
 * Waarom dit getest wordt: een live update die een app binnenhaalt waar een native plug-in in
 * ontbreekt, breekt die app bij iedereen tegelijk, zonder dat wij het zien.
 */

const manifest = {
  version: 'abc123',
  url: '/app-update/abc123.zip',
  requiredPlugins: { ios: ['App', 'CapacitorUpdater'], android: ['App', 'CapacitorUpdater'] },
};
const all = () => true;

describe('shouldDownload', () => {
  it('nieuwere versie met alle plug-ins aanwezig: ophalen', () => {
    expect(shouldDownload(manifest, 'oud', 'ios', all)).toBe(true);
    expect(shouldDownload(manifest, 'oud', 'android', all)).toBe(true);
  });

  it('dezelfde versie: niets doen', () => {
    expect(shouldDownload(manifest, 'abc123', 'ios', all)).toBe(false);
  });

  it('app mist een plug-in die de nieuwe versie nodig heeft: wachten op de winkel', () => {
    expect(shouldDownload(manifest, 'oud', 'ios', (n) => n !== 'CapacitorUpdater')).toBe(false);
  });

  it('kapot of onvolledig manifest, of de browser: niets doen', () => {
    expect(shouldDownload(null, 'oud', 'ios', all)).toBe(false);
    expect(shouldDownload({ version: 'x' }, 'oud', 'ios', all)).toBe(false);
    expect(shouldDownload({ ...manifest, requiredPlugins: undefined }, 'oud', 'ios', all)).toBe(false);
    expect(shouldDownload(manifest, 'oud', 'web', all)).toBe(false);
  });
});

describe('requiredPlugins', () => {
  it('kent elke Capacitor-plug-in uit package.json', async () => {
    const { readFileSync } = await import('node:fs');
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    const out = requiredPlugins(pkg);
    expect(out.ios).toContain('CapacitorUpdater');
    expect(out.android).toContain('PushNotifications');
  });

  it('een nieuwe plug-in zonder vermelding laat de build falen', () => {
    expect(() => requiredPlugins({ dependencies: { '@capacitor/camera': '^7.0.0' } })).toThrow(/NATIVE_PLUGINS/);
  });
});
