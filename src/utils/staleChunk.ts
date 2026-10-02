/**
 * Na een nieuwe versie (deploy) bestaan de oude JS-bestanden niet meer. Een tabblad dat nog open stond
 * vraagt bij het openen van bijv. Beheer zo'n oud bestand op en krijgt niets terug: dan bleef het scherm
 * zwart. Herkennen we dat, dan laden we de pagina één keer opnieuw, zodat de nieuwe versie geladen wordt.
 */
const KEY = 'liftlog:chunkReloadAt';
/** Binnen deze tijd niet nog eens herladen: dan ligt het niet aan een oude versie en zou het blijven herladen. */
const GUARD_MS = 30_000;

const CHUNK_ERROR =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|Expected a JavaScript.*module script/i;

export function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err ?? '');
  return CHUNK_ERROR.test(msg);
}

/** Herlaadt de pagina, tenzij dat net al gebeurde. Geeft true als er herladen wordt. */
export function reloadForNewVersion(now = Date.now()): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (now - last < GUARD_MS) return false;
    sessionStorage.setItem(KEY, String(now));
  } catch {
    return false; // geen sessionStorage: niet automatisch herladen (kan anders blijven lussen)
  }
  window.location.reload();
  return true;
}
