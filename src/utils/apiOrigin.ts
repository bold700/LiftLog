/**
 * Basis-URL voor `/api` in de browser.
 * - Productie (Vercel): leeg → zelfde origin.
 * - `VITE_APP_API_ORIGIN`: Capacitor of expliciete backend-URL.
 * - Development: direct `http://localhost:3001` (Vite-proxy werkt niet overal, o.a. embedded browser).
 */
export function apiOrigin(): string {
  const explicit = import.meta.env.VITE_APP_API_ORIGIN;
  if (typeof explicit === 'string' && explicit.trim()) {
    return explicit.trim().replace(/\/$/, '');
  }
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
