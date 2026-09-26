/**
 * De ranglijst staat voorlopig uit (src/config/features.ts). Zolang dat zo is, ruimt de dagelijkse
 * avondronde de gepubliceerde ranglijst op: namen en totalen horen dan nergens meer te staan.
 */

/** Moet gelijk zijn aan LEADERBOARD_ENABLED in src/config/features.ts (een test bewaakt dat). */
export const LEADERBOARD_ENABLED = false;

export async function clearPublishedLeaderboard(db) {
  if (LEADERBOARD_ENABLED) return 0;
  let removed = 0;
  for (;;) {
    const snap = await db.collection('leaderboardPublic').limit(400).get();
    if (snap.empty) return removed;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    removed += snap.size;
    if (snap.size < 400) return removed;
  }
}
