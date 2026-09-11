/**
 * In welke omgeving draait VORM op dit moment?
 *
 * Dit is geen cosmetisch onderscheid. Een pagina in een gewoon browsertabblad mag een popup
 * openen en het resultaat terugkrijgen; een app die vanaf het beginscherm of als native app
 * draait niet. iOS opent zo'n popup als een los venster zonder verbinding naar de app die hem
 * opende, dus een inlogresultaat kan daar nergens heen. Alles wat op dat verschil moet
 * reageren, vraagt het hier.
 */

/** Draait de app in een Capacitor-schil (de app uit de App Store of Play Store)? */
export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  try {
    return cap?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

/**
 * Draait de app zonder adresbalk? Dat is zo vanaf het beginscherm (PWA) en in de native app.
 *
 * Safari op iOS kent `display-mode: standalone` niet altijd en zet in plaats daarvan
 * `navigator.standalone`; daarom kijken we naar allebei.
 */
export function isStandaloneApp(): boolean {
  if (typeof window === 'undefined') return false;
  if (isNativeApp()) return true;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  const displayMode =
    typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches;
  return iosStandalone || displayMode;
}
