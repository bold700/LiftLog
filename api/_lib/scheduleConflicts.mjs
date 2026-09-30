/**
 * Dubbel plannen voorkomen. Elke les op het rooster komt uit een lessoort met vaste weekmomenten
 * (ook PT-momenten en groepslessen zijn lessoorten). Twee weekmomenten botsen als ze op dezelfde
 * dag overlappen en dezelfde trainer of dezelfde ruimte hebben.
 *
 * Staat "Dubbel plannen blokkeren" aan (Beheer → Instellingen, standaard aan), dan kan zo'n moment
 * niet worden opgeslagen. De app blokkeert niet kaal: hij stelt een vrije ruimte op hetzelfde
 * tijdstip voor, of vrije tijden op dezelfde dag binnen de openingstijden.
 *
 * Pure functies zonder Firestore, zodat server en tests hetzelfde rekenen.
 */

/** Standaard openingstijden: eerste les om 06:00, laatste les begint om 21:00. */
export const DEFAULT_HOURS = { firstStart: '06:00', lastStart: '21:00' };
const STEP_MIN = 30;
const MAX_TIME_SUGGESTIONS = 4;

export const toMin = (hhmm) => {
  const [h, m] = String(hhmm ?? '').split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : NaN;
};
export const fromMin = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

const roomKey = (room) => String(room ?? '').trim().toLowerCase() || null;
const trainerKey = (id) => String(id ?? '').trim() || null;

/** Staat blokkeren aan voor deze studio? Standaard wel. */
export const blocksDoubleBooking = (orgData) => orgData?.scheduling?.blockDoubleBooking !== false;

/** Openingstijden van de studio, of de standaard. */
export function hoursOf(orgData) {
  const h = orgData?.scheduling?.hours;
  const ok = (v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v ?? ''));
  return {
    firstStart: ok(h?.firstStart) ? h.firstStart : DEFAULT_HOURS.firstStart,
    lastStart: ok(h?.lastStart) ? h.lastStart : DEFAULT_HOURS.lastStart,
  };
}

const overlaps = (a, b) =>
  Number(a.weekday) === Number(b.weekday) && toMin(a.startTime) < toMin(b.endTime) && toMin(b.startTime) < toMin(a.endTime);

/** Een lessoort teruggebracht tot wat telt voor botsingen. */
const shape = (ct) => ({
  id: String(ct?.id ?? ''),
  name: String(ct?.name ?? ''),
  trainer: trainerKey(ct?.defaultTrainerId),
  trainerId: ct?.defaultTrainerId ?? null,
  room: ct?.room ?? null,
  roomKey: roomKey(ct?.room),
  schedule: Array.isArray(ct?.schedule) ? ct.schedule : [],
});

/** Botst dit ene moment (met deze trainer en ruimte) met een ander moment? Welke reden(en)? */
function reasons(trainer, rKey, other) {
  const sameTrainer = !!trainer && trainer === other.trainer;
  const sameRoom = !!rKey && rKey === other.roomKey;
  return { sameTrainer, sameRoom, any: sameTrainer || sameRoom };
}

/**
 * Alle botsingen van `candidate` (een lessoort, eventueel nog niet opgeslagen) met de andere
 * lessoorten van de studio. Per botsing: welk moment van de kandidaat, met welke les en waarom.
 */
export function findConflicts(candidate, classTypes) {
  const c = shape(candidate);
  const others = classTypes.map(shape).filter((o) => o.id !== c.id && o.schedule.length > 0);
  const out = [];
  c.schedule.forEach((slot, slotIndex) => {
    for (const o of others) {
      const r = reasons(c.trainer, c.roomKey, o);
      if (!r.any) continue;
      for (const os of o.schedule) {
        if (!overlaps(slot, os)) continue;
        out.push({
          slotIndex,
          slot: { weekday: Number(slot.weekday), startTime: slot.startTime, endTime: slot.endTime },
          other: { id: o.id, name: o.name, trainerId: o.trainerId, room: o.room, weekday: Number(os.weekday), startTime: os.startTime, endTime: os.endTime },
          sameTrainer: r.sameTrainer,
          sameRoom: r.sameRoom,
        });
      }
    }
  });
  return out;
}

/** Is dit moment vrij voor deze trainer en ruimte (los van `excludeId`)? */
function isFree(slot, trainer, rKey, others) {
  return !others.some((o) => {
    const r = reasons(trainer, rKey, o);
    return r.any && o.schedule.some((os) => overlaps(slot, os));
  });
}

/**
 * Voorstellen voor een moment dat botst:
 * - `rooms`: ruimtes van de studio die op dat tijdstip vrij zijn (alleen als de ruimte de botsing is
 *   en de trainer zelf wel kan);
 * - `times`: tijden op dezelfde dag, zelfde duur, binnen de openingstijden, waarop trainer én
 *   ruimte vrij zijn; dichtstbijzijnde eerst.
 */
export function suggestionsFor(candidate, slot, classTypes, studioRooms = [], hours = DEFAULT_HOURS) {
  const c = shape(candidate);
  const others = classTypes.map(shape).filter((o) => o.id !== c.id && o.schedule.length > 0);
  const base = { weekday: Number(slot.weekday), startTime: slot.startTime, endTime: slot.endTime };

  const trainerFreeHere = isFree(base, c.trainer, null, others);
  const rooms = trainerFreeHere
    ? [...new Set(studioRooms.map((r) => String(r).trim()).filter(Boolean))].filter(
        (r) => roomKey(r) !== c.roomKey && isFree(base, null, roomKey(r), others)
      )
    : [];

  const duration = toMin(slot.endTime) - toMin(slot.startTime);
  const first = toMin(hours.firstStart);
  const last = toMin(hours.lastStart);
  const origin = toMin(slot.startTime);
  const times = [];
  for (let start = first; start <= last; start += STEP_MIN) {
    if (start === origin || !(duration > 0) || start + duration > 24 * 60) continue;
    const t = { weekday: base.weekday, startTime: fromMin(start), endTime: fromMin(start + duration) };
    if (isFree(t, c.trainer, c.roomKey, others)) times.push(t);
  }
  times.sort((a, b) => Math.abs(toMin(a.startTime) - origin) - Math.abs(toMin(b.startTime) - origin) || toMin(a.startTime) - toMin(b.startTime));
  return { rooms, times: times.slice(0, MAX_TIME_SUGGESTIONS) };
}

/** Alle botsende paren binnen de studio (elk paar één keer), voor het overzicht "Dubbel ingepland". */
export function allConflicts(classTypes) {
  const list = classTypes.map(shape).filter((o) => o.schedule.length > 0);
  const out = [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      const r = reasons(a.trainer, a.roomKey, b);
      if (!r.any) continue;
      for (const as of a.schedule) {
        for (const bs of b.schedule) {
          if (!overlaps(as, bs)) continue;
          out.push({
            a: { id: a.id, name: a.name, trainerId: a.trainerId, room: a.room, weekday: Number(as.weekday), startTime: as.startTime, endTime: as.endTime },
            b: { id: b.id, name: b.name, trainerId: b.trainerId, room: b.room, weekday: Number(bs.weekday), startTime: bs.startTime, endTime: bs.endTime },
            sameTrainer: r.sameTrainer,
            sameRoom: r.sameRoom,
          });
        }
      }
    }
  }
  return out.sort((x, y) => x.a.weekday - y.a.weekday || toMin(x.a.startTime) - toMin(y.a.startTime));
}
