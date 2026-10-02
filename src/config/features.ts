/**
 * Functies die tijdelijk uit staan. Aanzetten is één regel; de code blijft staan.
 */

/**
 * Ranglijst. Uit sinds september 2026 (privacy: namen en totalen zichtbaar voor de hele studio).
 * Zolang dit uit staat, ruimt de dagelijkse taak de gepubliceerde ranglijst op (zie
 * api/_lib/leaderboardCleanup.mjs) en publiceert de app niets meer.
 */
export const LEADERBOARD_ENABLED = false;

/**
 * Workout inspreken met de microfoon in de iOS/Android-app. De toestemming (Info.plist,
 * AndroidManifest) zit pas in de volgende app-versie uit de store; een live update kan die niet
 * toevoegen, en zonder die toestemming sluit iOS de app af. Zet dit aan zodra die versie live staat.
 * Tot dan dicteer je in de app met de microfoon van het toetsenbord.
 */
export const NATIVE_VOICE_RECORDING = false;
