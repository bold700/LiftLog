/**
 * Afwezigheid van een trainer, en wie er dan invalt. Een trainer (of beheerder) zet afwezigheid:
 *
 * - losse dagen: van … t/m … (vakantie, ziek, een cursus);
 * - elke maand: bijv. "de 1e donderdag van de maand", vanaf een datum en eventueel tot een datum.
 *
 * Optioneel met een vaste invaller. Lessen van de trainer op die dagen krijgen dan die invaller (als
 * die vrij is); anders staan ze in Beheer bij "Lessen zonder trainer" met voorstellen wie vrij is.
 * De trainer beslist; de app stelt voor.
 *
 * Pure functies zonder Firestore, zodat server en tests hetzelfde rekenen.
 */
import { withinAvailability } from './availability.mjs';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 366;
const DAY_MS = 86_400_000;
export const ABSENCE_KINDS = ['dates', 'monthly'];
/** 1e t/m 4e, of -1 = de laatste van de maand. */
export const NTH_VALUES = [1, 2, 3, 4, -1];

const toMin = (hhmm) => {
  const [h, m] = String(hhmm ?? '').split(':').map(Number);
  return h * 60 + m;
};
const dayMs = (iso) => {
  const [y, m, d] = String(iso).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
export const weekdayOfDate = (iso) => new Date(dayMs(iso)).getUTCDay();

/**
 * Controleer en schoon wat de app stuurt. Geeft `{ value }` of `{ error }` (Nederlands, voor de app).
 * `trainerId` en `substituteId` worden apart gecontroleerd (moeten trainers van de studio zijn).
 */
export function cleanAbsence(raw, today) {
  const kind = ABSENCE_KINDS.includes(raw?.kind) ? raw.kind : 'dates';
  const from = String(raw?.from ?? '').trim();
  const untilRaw = String(raw?.until ?? '').trim();
  const until = untilRaw || null;
  if (!DATE.test(from)) return { error: 'Kies vanaf welke dag.' };
  if (until && !DATE.test(until)) return { error: 'Kies een geldige einddatum.' };
  if (until && until < from) return { error: 'De einddatum ligt voor de begindatum.' };
  if ((until ?? from) < today) return { error: 'Deze afwezigheid ligt helemaal in het verleden.' };
  const note = String(raw?.note ?? '').replace(/\s+/g, ' ').trim().slice(0, 120) || null;
  const substituteId = String(raw?.substituteId ?? '').trim() || null;
  if (kind === 'dates') {
    const end = until ?? from;
    if ((dayMs(end) - dayMs(from)) / DAY_MS >= MAX_DAYS) return { error: 'Kies hooguit een jaar tegelijk.' };
    return { value: { kind, from, until: end, nth: null, weekday: null, substituteId, note } };
  }
  const nth = Number(raw?.nth);
  const weekday = Number(raw?.weekday);
  if (!NTH_VALUES.includes(nth)) return { error: 'Kies de hoeveelste van de maand.' };
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return { error: 'Kies een dag van de week.' };
  return { value: { kind, from, until, nth, weekday, substituteId, note } };
}

/** De hoeveelste deze weekdag van de maand is (1–5), en of het de laatste is. */
export function nthOfMonth(iso) {
  const day = Number(String(iso).slice(8, 10));
  const nth = Math.floor((day - 1) / 7) + 1;
  const next = new Date(dayMs(iso) + 7 * DAY_MS);
  const last = next.getUTCMonth() !== new Date(dayMs(iso)).getUTCMonth();
  return { nth, last };
}

/** Valt deze dag onder de afwezigheid? */
export function absenceCovers(absence, iso) {
  if (!absence || !DATE.test(String(iso))) return false;
  if (iso < absence.from) return false;
  if (absence.until && iso > absence.until) return false;
  if (absence.kind !== 'monthly') return true;
  if (weekdayOfDate(iso) !== Number(absence.weekday)) return false;
  const { nth, last } = nthOfMonth(iso);
  return Number(absence.nth) === -1 ? last : nth === Number(absence.nth);
}

/** De afwezigheid van deze trainer op deze dag, of null. */
export function absenceOn(absences, trainerId, iso) {
  if (!trainerId) return null;
  return (absences ?? []).find((a) => a.trainerId === trainerId && absenceCovers(a, iso)) ?? null;
}

/** "Do 1 okt t/m vr 9 okt", "1e donderdag van de maand" … (voor meldingen en de app). */
const WEEKDAY_LONG = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
export function absenceLabel(absence) {
  if (absence?.kind === 'monthly') {
    const which = Number(absence.nth) === -1 ? 'laatste' : `${absence.nth}e`;
    return `elke ${which} ${WEEKDAY_LONG[Number(absence.weekday)]} van de maand`;
  }
  const fmt = (iso) => iso.split('-').reverse().join('-');
  return absence.until && absence.until !== absence.from ? `${fmt(absence.from)} t/m ${fmt(absence.until)}` : fmt(absence.from);
}

/** Overlappen twee lessen op dezelfde dag? */
const overlap = (a, b) => a.date === b.date && toMin(a.startTime) < toMin(b.endTime) && toMin(b.startTime) < toMin(a.endTime);

/**
 * Is deze trainer vrij om deze les te geven? Niet afwezig, geen andere les op dat moment (afgelaste
 * lessen tellen niet) en binnen zijn beschikbaarheid. Geeft null (vrij) of de reden.
 */
export function busyReason(trainerId, cls, { classes = [], absences = [], availability = null }) {
  if (absenceOn(absences, trainerId, cls.date)) return 'afwezig';
  const other = classes.find((c) => c.id !== cls.id && c.trainerId === trainerId && !c.cancelledAt && overlap(c, cls));
  if (other) return `geeft dan ${other.title || 'een andere les'}`;
  if (!withinAvailability(availability, { weekday: weekdayOfDate(cls.date), startTime: cls.startTime, endTime: cls.endTime })) {
    return 'niet beschikbaar';
  }
  return null;
}

/**
 * Wie kan invallen voor deze les? Alle trainers behalve de afwezige, vrij eerst (de vaste invaller
 * van de afwezigheid bovenaan), daarna wie bezet is, met de reden. `availabilityOf(trainerId)`
 * geeft de beschikbaarheid (of null).
 */
export function substituteOptions(cls, { trainers, absentId, preferredId = null, classes, absences, availabilityOf = () => null }) {
  const list = trainers
    .filter((t) => t.userId !== absentId)
    .map((t) => ({
      userId: t.userId,
      name: t.name,
      preferred: t.userId === preferredId,
      busy: busyReason(t.userId, cls, { classes, absences, availability: availabilityOf(t.userId) }),
    }));
  return list.sort(
    (a, b) => Number(!!a.busy) - Number(!!b.busy) || Number(b.preferred) - Number(a.preferred) || a.name.localeCompare(b.name)
  );
}
