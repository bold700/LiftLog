/**
 * Live updates voor de apps (zie src/native/liveUpdate.ts): na de Vercel-build de web-app inpakken
 * als zip en een manifest schrijven naar dist/app-update/.
 *
 *   dist/app-update/manifest.json   → { version, url, requiredPlugins: { ios, android } }
 *   dist/app-update/<version>.zip   → de hele dist (zonder app-update zelf), index.html in de root
 *
 * Alleen op Vercel (of met APP_UPDATE_BUNDLE=1): in de app zelf hoort geen zip van zichzelf.
 *
 * requiredPlugins: de native plug-ins die deze web-versie verwacht. Een app die er een mist, slaat de
 * update over tot er een nieuwe versie uit de winkel is. Komt er een Capacitor-plug-in bij in
 * package.json zonder dat hij hieronder staat, dan faalt de build: zo kan een live update nooit
 * stilletjes een app breken die de plug-in nog niet heeft.
 */
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { zipSync } from 'fflate';

/** npm-pakket → naam waaronder Capacitor de plug-in kent, per platform. */
export const NATIVE_PLUGINS = {
  '@capacitor/app': { name: 'App', platforms: ['ios', 'android'] },
  '@capacitor/haptics': { name: 'Haptics', platforms: ['ios', 'android'] },
  '@capacitor/keyboard': { name: 'Keyboard', platforms: ['ios', 'android'] },
  '@capacitor/push-notifications': { name: 'PushNotifications', platforms: ['ios', 'android'] },
  '@capacitor/splash-screen': { name: 'SplashScreen', platforms: ['ios', 'android'] },
  '@capacitor/status-bar': { name: 'StatusBar', platforms: ['ios', 'android'] },
  '@capgo/capacitor-updater': { name: 'CapacitorUpdater', platforms: ['ios', 'android'] },
};

/** Pakketten die wel met Capacitor te maken hebben maar geen plug-in zijn. */
const NOT_PLUGINS = new Set(['@capacitor/core', '@capacitor/cli', '@capacitor/ios', '@capacitor/android']);

/** De plug-ins die de app nodig heeft, per platform; gooit bij een onbekende Capacitor-plug-in. */
export function requiredPlugins(pkg) {
  const deps = Object.keys({ ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) });
  const unknown = deps.filter(
    (d) => (d.startsWith('@capacitor/') || d.startsWith('@capgo/') || d.startsWith('capacitor-')) && !NOT_PLUGINS.has(d) && !NATIVE_PLUGINS[d]
  );
  if (unknown.length) {
    throw new Error(
      `Onbekende Capacitor-plug-in(s): ${unknown.join(', ')}. Zet ze in NATIVE_PLUGINS in scripts/app-update-bundle.mjs.`
    );
  }
  const out = { ios: [], android: [] };
  for (const d of deps) {
    const p = NATIVE_PLUGINS[d];
    if (!p) continue;
    for (const platform of p.platforms) out[platform].push(p.name);
  }
  out.ios.sort();
  out.android.sort();
  return out;
}

function filesIn(dir, root = dir, skip = 'app-update') {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (relative(root, full) === skip) continue;
    if (statSync(full).isDirectory()) out.push(...filesIn(full, root, skip));
    else out.push(full);
  }
  return out;
}

function main() {
  if (process.env.VERCEL !== '1' && process.env.APP_UPDATE_BUNDLE !== '1') return;
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const plugins = requiredPlugins(pkg);
  const version = (process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || '').slice(0, 12);
  if (!version) throw new Error('Geen commit bekend (VERCEL_GIT_COMMIT_SHA): kan geen versie voor de live update maken.');

  const dist = 'dist';
  const files = {};
  for (const file of filesIn(dist)) files[relative(dist, file).split(sep).join('/')] = readFileSync(file);
  const zip = zipSync(files, { level: 9 });

  mkdirSync(join(dist, 'app-update'), { recursive: true });
  writeFileSync(join(dist, 'app-update', `${version}.zip`), zip);
  const manifest = { version, url: `/app-update/${version}.zip`, requiredPlugins: plugins, builtAt: new Date().toISOString() };
  writeFileSync(join(dist, 'app-update', 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`[app-update] ${version}: ${Object.keys(files).length} bestanden, ${(zip.length / 1e6).toFixed(1)} MB`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
