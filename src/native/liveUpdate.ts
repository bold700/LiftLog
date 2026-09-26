/**
 * Live updates voor de iPhone- en Android-app.
 *
 * De apps bevatten dezelfde web-app als de website. Zonder dit zou elke wijziging een nieuwe versie
 * in de App Store en Play Store vragen. Nu haalt de app bij het opstarten en bij terugkeren naar de
 * voorgrond `/app-update/manifest.json` op (gemaakt door scripts/app-update-bundle.mjs bij elke
 * Vercel-deploy). Is er een nieuwere versie, dan downloadt hij die op de achtergrond en schakelt hij
 * over zodra de app de volgende keer naar de achtergrond gaat.
 *
 * Veiligheid: een nieuwe web-versie die een native plug-in nodig heeft die de geïnstalleerde app nog
 * niet heeft (bijv. een nieuwe gezondheidskoppeling), wordt overgeslagen: die komt pas met een nieuwe
 * versie uit de winkel. En start een gedownloade versie niet goed op (notifyAppReady blijft uit), dan
 * zet de plug-in zelf de vorige versie terug.
 */
import { Capacitor } from '@capacitor/core';
import { apiUrl } from '../utils/apiOrigin';

export interface AppUpdateManifest {
  /** Unieke versie van de web-bundel (commit). */
  version: string;
  /** Pad of URL van de zip. */
  url: string;
  /** Native plug-ins (Capacitor-namen) die deze bundel per platform nodig heeft. */
  requiredPlugins: { ios: string[]; android: string[] };
}

/** Versie van de web-app die nu draait; zelfde waarde als `version` in het manifest van dezelfde build. */
export const APP_BUNDLE_VERSION: string = typeof __APP_BUNDLE_VERSION__ === 'string' ? __APP_BUNDLE_VERSION__ : 'dev';

const CHECK_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Moet deze app de bundel uit het manifest ophalen? Nee als het dezelfde versie is, als het manifest
 * onvolledig is, of als de app een plug-in mist die de bundel nodig heeft.
 */
export function shouldDownload(
  manifest: Partial<AppUpdateManifest> | null,
  runningVersion: string,
  platform: string,
  isPluginAvailable: (name: string) => boolean
): boolean {
  if (!manifest || typeof manifest.version !== 'string' || typeof manifest.url !== 'string') return false;
  if (!manifest.version || manifest.version === runningVersion) return false;
  if (platform !== 'ios' && platform !== 'android') return false;
  const required = manifest.requiredPlugins?.[platform];
  if (!Array.isArray(required)) return false;
  return required.every((name) => isPluginAvailable(name));
}

let lastCheck = 0;
let busy = false;

async function checkForUpdate(): Promise<void> {
  if (busy || Date.now() - lastCheck < CHECK_INTERVAL_MS) return;
  busy = true;
  lastCheck = Date.now();
  try {
    const { CapacitorUpdater } = await import('@capgo/capacitor-updater');
    const res = await fetch(apiUrl('/app-update/manifest.json'), { cache: 'no-store' });
    if (!res.ok) return;
    const manifest = (await res.json()) as AppUpdateManifest;
    const platform = Capacitor.getPlatform();
    if (!shouldDownload(manifest, APP_BUNDLE_VERSION, platform, (n) => Capacitor.isPluginAvailable(n))) return;

    // Al eerder gedownload (bijv. de app ging nog niet naar de achtergrond)? Dan niet opnieuw.
    const { bundles } = await CapacitorUpdater.list();
    const existing = bundles.find((b) => b.version === manifest.version && b.status !== 'error');
    const bundle = existing ?? (await CapacitorUpdater.download({ url: new URL(manifest.url, apiUrl('/')).href, version: manifest.version }));
    await CapacitorUpdater.next({ id: bundle.id });
  } catch (e) {
    // Geen netwerk of een mislukte download: de app blijft gewoon op de huidige versie.
    console.warn('[live update] overgeslagen:', e);
  } finally {
    busy = false;
  }
}

/** Eén keer aanroepen bij het opstarten. Doet niets in de browser. */
export async function initLiveUpdates(): Promise<void> {
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('CapacitorUpdater')) return;
  const { CapacitorUpdater } = await import('@capgo/capacitor-updater');
  // Zeggen dat deze versie goed is opgestart; anders zet de plug-in na een tijd de vorige terug.
  await CapacitorUpdater.notifyAppReady();
  void checkForUpdate();
  const { App } = await import('@capacitor/app');
  void App.addListener('resume', () => void checkForUpdate());
}
