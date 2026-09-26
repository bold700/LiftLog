import { Capacitor } from '@capacitor/core';

/** Waar de apps de API vinden. Eén plek, zodat een live update van Vercel ook in de app goed praat. */
export const PRODUCTION_ORIGIN = 'https://lift-log-phi.vercel.app';

/**
 * Basis-URL voor `/api` in de browser.
 * - Productie (Vercel): leeg → zelfde origin.
 * - `VITE_APP_API_ORIGIN`: expliciete backend-URL.
 * - iPhone/Android-app (Capacitor): de productie-API. Ook zonder VITE_APP_API_ORIGIN, want een live
 *   update is gewoon de Vercel-build.
 * - Development: direct `http://localhost:3001` (Vite-proxy werkt niet overal, o.a. embedded browser).
 */
export function apiOrigin(): string {
  const explicit = import.meta.env.VITE_APP_API_ORIGIN;
  if (typeof explicit === 'string' && explicit.trim()) {
    return explicit.trim().replace(/\/$/, '');
  }
  if (Capacitor.isNativePlatform()) return PRODUCTION_ORIGIN;
  if (import.meta.env.DEV) {
    const port =
      typeof import.meta.env.VITE_DEV_API_PORT === 'string' && import.meta.env.VITE_DEV_API_PORT.trim()
        ? import.meta.env.VITE_DEV_API_PORT.trim()
        : '3001';
    return `http://localhost:${port}`;
  }
  return '';
}

export function apiUrl(path: string): string {
  const base = apiOrigin();
  if (!base) return path.startsWith('/') ? path : `/${path}`;
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}
