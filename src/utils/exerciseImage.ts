/**
 * Stilstaand plaatje (eerste GIF-frame) van een oefening als PNG-data-URL, voor de PDF-export.
 * Gaat via /api/exercise-gif: Firebase Storage stuurt geen CORS-headers, dus de browser kan de
 * GIF niet zelf uitlezen; de server maakt er een kleine PNG van.
 * Resultaten worden per oefening gecachet; bij een fout of time-out komt er null (dan geen plaatje).
 */
import { apiUrl } from './apiOrigin';
import { gifIdForExerciseName } from './exerciseGif';

const cache = new Map<string, Promise<string | null>>();
const TIMEOUT_MS = 15000;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Lezen mislukt'));
    reader.readAsDataURL(blob);
  });
}

async function fetchPng(id: string, size: number): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(apiUrl(`/api/exercise-gif?id=${encodeURIComponent(id)}&size=${size}`), {
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith('image/')) return null;
    return await blobToDataUrl(blob);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** PNG-data-URL van het eerste frame, of null als er geen GIF is of het laden mislukt. */
export function getExerciseImageDataUrl(exerciseName: string, size = 320): Promise<string | null> {
  const id = gifIdForExerciseName(exerciseName);
  if (!id) return Promise.resolve(null);
  const key = `${id}@${size}`;
  let p = cache.get(key);
  if (!p) {
    p = fetchPng(id, size).then((url) => {
      if (url === null) cache.delete(key); // volgende keer opnieuw proberen
      return url;
    });
    cache.set(key, p);
  }
  return p;
}

/**
 * Laadt de plaatjes van meerdere oefeningen tegelijk (maximaal `concurrency` tegelijk).
 * Geeft een map oefeningnaam → data-URL; oefeningen zonder plaatje ontbreken.
 */
export async function loadExerciseImages(
  exerciseNames: string[],
  options?: { size?: number; concurrency?: number; onProgress?: (done: number, total: number) => void }
): Promise<Map<string, string>> {
  const size = options?.size ?? 320;
  const concurrency = Math.max(1, options?.concurrency ?? 4);
  const names = Array.from(new Set(exerciseNames.map((n) => n.trim()).filter(Boolean)));
  const result = new Map<string, string>();
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < names.length) {
      const name = names[next++];
      const url = await getExerciseImageDataUrl(name, size);
      if (url) result.set(name, url);
      done += 1;
      options?.onProgress?.(done, names.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, names.length) }, worker));
  return result;
}
