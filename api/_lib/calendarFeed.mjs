/**
 * Kalenderfeed (.ics): de lessen waar een lid voor geboekt staat (PT, groepslessen, SGT, kickbox —
 * alles staat als een `classes`-document, zie classService.ts) als abonneerbare agenda voor Google
 * Agenda / Outlook / Apple Agenda. Geen Firebase-login mogelijk voor een agenda-app die deze URL
 * elk uur zelf ophaalt; de herkenning loopt daarom via een geheime sleutel in de URL, zelfde
 * opzet als de MCP-koppelsleutels (mcpKeyService.ts): alleen de SHA-256-hash staat in Firestore.
 */
import { createHash } from 'node:crypto';

export function hashFeedToken(token) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Amsterdam-afwijking (in minuten) t.o.v. UTC op een gegeven moment; wisselt met zomer/wintertijd. */
function amsterdamOffsetMinutes(utcDate) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Amsterdam',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = Object.fromEntries(dtf.formatToParts(utcDate).map((p) => [p.type, p.value]));
  const hour = parts.hour === '24' ? 0 : Number(parts.hour);
  const asIfUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), hour, Number(parts.minute), Number(parts.second));
  return Math.round((asIfUtc - utcDate.getTime()) / 60000);
}

/** Zet een lokale Amsterdamse kloktijd (datum + HH:MM, zoals opgeslagen op een les) om naar UTC. */
export function amsterdamToUtc(dateStr, timeStr) {
  const naive = new Date(`${dateStr}T${timeStr}:00Z`);
  const offsetMin = amsterdamOffsetMinutes(naive);
  return new Date(naive.getTime() - offsetMin * 60000);
}

function icsEscape(text) {
  return String(text ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function icsDate(d) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/** Vouwt regels langer dan 75 octets, zoals RFC 5545 vereist — sommige agenda's wijzen de feed anders af. */
function foldLine(line) {
  if (Buffer.byteLength(line, 'utf8') <= 75) return line;
  let out = '';
  let rest = line;
  let first = true;
  while (rest.length > 0) {
    const limit = first ? 75 : 74;
    let end = Math.min(rest.length, limit);
    while (end > 0 && Buffer.byteLength(rest.slice(0, end), 'utf8') > limit) end--;
    if (end === 0) end = 1;
    out += (first ? '' : '\r\n ') + rest.slice(0, end);
    rest = rest.slice(end);
    first = false;
  }
  return out;
}

const SESSION_KIND_LABEL = { '1on1': 'PT 1-op-1', duo: 'Duo PT', group: 'Groepsles', concept: 'Concept' };

/**
 * `classes` verrijkt met `bookingStatus` ('booked' | 'waitlist') → volledige .ics-tekst.
 * Wachtlijst-lessen komen erin als TENTATIVE, met een duidelijke aantekening in de titel: het lid
 * staat er niet zeker bij, maar wil het wel in de agenda zien staan om op te kunnen letten.
 */
export function buildIcsFeed({ classes, calendarName }) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//VORM//LiftLog Kalenderfeed//NL',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(calendarName)}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];
  const stamp = icsDate(new Date());
  for (const c of classes) {
    const start = amsterdamToUtc(c.date, c.startTime);
    const end = c.endTime ? amsterdamToUtc(c.date, c.endTime) : new Date(start.getTime() + 60 * 60000);
    const isWaitlist = c.bookingStatus === 'waitlist';
    const title = isWaitlist ? `${c.title} (wachtlijst)` : c.title;
    const descParts = [SESSION_KIND_LABEL[c.sessionKind] || 'Les'];
    if (c.description) descParts.push(c.description);
    if (isWaitlist) descParts.push('Je staat op de wachtlijst voor deze les.');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${c.id}@liftlog.app`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsDate(start)}`,
      `DTEND:${icsDate(end)}`,
      `SUMMARY:${icsEscape(title)}`,
      `DESCRIPTION:${icsEscape(descParts.join(' — '))}`,
      c.room ? `LOCATION:${icsEscape(c.room)}` : null,
      c.cancelledAt ? 'STATUS:CANCELLED' : isWaitlist ? 'STATUS:TENTATIVE' : 'STATUS:CONFIRMED',
      'END:VEVENT'
    );
  }
  lines.push('END:VCALENDAR');
  return (
    lines
      .filter((l) => l != null)
      .map(foldLine)
      .join('\r\n') + '\r\n'
  );
}
