/**
 * CORS voor de native (Capacitor) app.
 * De webversie draait op dezelfde origin als /api en heeft dit niet nodig.
 * De iOS/Android-app draait op https://localhost (iosScheme/androidScheme) of
 * capacitor://localhost en roept de Vercel-API cross-origin aan.
 */
const ALLOWED_ORIGINS = new Set([
  'capacitor://localhost',
  'ionic://localhost',
  'https://localhost',
  'http://localhost',
]);

function isAllowed(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  return /^http:\/\/localhost:\d+$/.test(origin);
}

/**
 * Zet CORS-headers als de origin een native-app-origin is.
 * Geeft `true` terug als het een preflight (OPTIONS) was die al is afgehandeld.
 */
export function applyCors(req, res) {
  const origin = req.headers?.origin;
  if (isAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }
  return false;
}
