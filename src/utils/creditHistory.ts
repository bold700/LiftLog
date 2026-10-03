/**
 * Teksten bij de creditgeschiedenis: wat er gebeurde, wanneer, door wie en hoe de les afliep.
 * In gewone taal, zodat lid en studio hetzelfde lezen: "Bootcamp · di 30 sep 19:00 — geboekt op
 * za 28 sep 14:12 door jezelf — niet gekomen".
 */
import type { CreditHistoryRow, CreditOutcome } from '../services/creditHistoryService';

export const classWhen = (date: string | null, time: string | null) =>
  date
    ? `${new Date(`${date}T12:00:00`).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })}${time ? ` ${time}` : ''}`
    : '';

export const atLabel = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} ${d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}`;
};

export const deltaLabel = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toLocaleString('nl-NL')}`;

export const creditsLabel = (n: number) => `${n.toLocaleString('nl-NL')} ${Math.abs(n) === 1 ? 'credit' : 'credits'}`;

/** Wat er gebeurde, met de les erbij. */
export function creditRowTitle(r: CreditHistoryRow): string {
  const les = r.class ? `${r.class.title}${r.class.date ? ` · ${classWhen(r.class.date, r.class.startTime)}` : ''}` : null;
  switch (r.kind) {
    case 'booking':
      return les ?? 'Les geboekt';
    case 'refund':
      if (!les) return 'Credit terug';
      return r.class?.cancelled ? `Les afgelast: ${les}` : `Afgemeld: ${les}`;
    case 'manual':
      return r.delta >= 0 ? 'Credits toegekend' : 'Credits afgeschreven';
    case 'plan':
      return r.note ?? (r.delta >= 0 ? 'Credits uit abonnement' : 'Abonnement');
    case 'expiry':
      return r.note ?? 'Credits verlopen';
    case 'merge':
      return 'Overgezet van een ander account';
    default:
      return r.note ?? 'Wijziging';
  }
}

/** Wie het deed. `you`: het lid zelf leest het ("jezelf") of de studio ("het lid zelf"). */
export function creditRowBy(r: CreditHistoryRow, you: boolean): string {
  if (r.by === 'system') return 'automatisch';
  if (r.by === 'self') return you ? 'door jezelf' : 'door het lid zelf';
  return `door ${r.byName ?? 'de studio'}`;
}

/** Tweede regel: werkwoord, moment, wie, en een notitie van de studio. */
export function creditRowDetail(r: CreditHistoryRow, you: boolean): string {
  const verb = r.kind === 'booking' ? 'Geboekt' : r.kind === 'refund' ? 'Teruggeboekt' : r.kind === 'expiry' ? 'Verlopen' : 'Op';
  const at = atLabel(r.at);
  const head = verb === 'Op' ? `Op ${at}` : `${verb} op ${at}`;
  const note = r.kind === 'manual' && r.note ? ` · "${r.note}"` : '';
  return `${head} ${creditRowBy(r, you)}${note}`;
}

export const OUTCOME_LABEL: Record<CreditOutcome, string | null> = {
  present: 'Aanwezig',
  absent: 'Niet gekomen',
  late_cancel: 'Te laat afgemeld, geen credit terug',
  refunded: 'Afgemeld, credit terug',
  upcoming: 'Komt nog',
  unmarked: 'Aanwezigheid niet ingevuld',
  unknown: null,
};

export const OUTCOME_COLOR: Record<CreditOutcome, 'success' | 'error' | 'warning' | 'info' | 'default'> = {
  present: 'success',
  absent: 'error',
  late_cancel: 'warning',
  refunded: 'default',
  upcoming: 'info',
  unmarked: 'default',
  unknown: 'default',
};
