/**
 * Privacy van de ingelogde gebruiker zelf: toestemming voor gezondheidsgegevens vastleggen of
 * intrekken, en eigen bestanden opruimen voordat een account wordt verwijderd.
 *
 * Bestanden (voortgangsfoto's, profielfoto) ruimt de app zelf op: de server kent de opslagbucket
 * niet, en de opslagregels staan de eigenaar toe zijn eigen bestanden te verwijderen.
 */
import type { User } from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { updateProfile } from './profileService';
import { getMeasurementsForUser } from './measurementService';
import { deleteAllProgressPhotos } from './progressPhotoService';
import { deleteAvatar } from './avatarService';
import { exportOwnData, withdrawHealthConsentOnServer } from './adminAccountService';

/**
 * Versie van de toestemmingstekst; verhoog als de tekst wezenlijk verandert (dan wordt opnieuw gevraagd).
 * Moet gelijk zijn aan die in api/admin-account.mjs. v2: de AI-dienst (OpenAI) wordt genoemd, voor schema's en bodyscan-foto's.
 */
export const HEALTH_CONSENT_VERSION = 2;

export async function recordHealthConsent(uid: string, given: boolean): Promise<void> {
  await updateProfile(uid, { healthConsent: { given, at: new Date().toISOString(), version: HEALTH_CONSENT_VERSION } });
}

/** Alle voortgangsfoto's van deze persoon weg (best effort: een foto die al weg is, is geen fout). */
async function removeOwnProgressPhotos(uid: string): Promise<void> {
  const measurements = await getMeasurementsForUser(uid).catch(() => []);
  await Promise.all(measurements.map((m) => deleteAllProgressPhotos(uid, m.id)));
}

/** Toestemming intrekken: foto's weg, dan metingen en gezondheidsvelden via de server. */
export async function withdrawHealthConsent(user: User): Promise<void> {
  await removeOwnProgressPhotos(user.uid);
  await withdrawHealthConsentOnServer(user);
}

/** Vóór het verwijderen van een account: eigen foto's en profielfoto opruimen. */
export async function removeOwnFiles(uid: string): Promise<void> {
  await removeOwnProgressPhotos(uid);
  await deleteAvatar(uid);
}

/**
 * "Download mijn gegevens": haalt alles op bij de server en biedt het aan als bestand. In de
 * iPhone- en Android-app werkt een downloadlink niet; daar gaat het via het deelmenu van de telefoon.
 */
export async function downloadOwnData(user: User): Promise<void> {
  const data = await exportOwnData(user);
  const name = `vorm-mijn-gegevens-${new Date().toISOString().slice(0, 10)}.json`;
  const json = JSON.stringify(data, null, 2);
  const file = new File([json], name, { type: 'application/json' });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (Capacitor.isNativePlatform() && nav.canShare?.({ files: [file] })) {
    await nav.share({ files: [file], title: 'Mijn gegevens' });
    return;
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
