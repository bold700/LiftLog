/**
 * Wat er op een les in het rooster staat. Een groepsles: de naam van de les. Een persoonlijk
 * PT-moment (privé voor één lid): wie het is en bij welke trainer, zoals "Emma L" met daaronder
 * "PT – Kenny". Het lid zelf ziet alleen "PT – Kenny".
 */
import type { StudioClass } from '../services/classService';

/** "Emma Laureau" → "Emma L". */
export function shortPersonName(name: string | null | undefined): string {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? '';
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}`;
}

/** "Kenny Timmer" → "Kenny". */
export const firstName = (name: string | null | undefined): string => String(name ?? '').trim().split(/\s+/)[0] ?? '';

export interface ClassLabel {
  title: string;
  /** Tweede regel, bijv. "PT – Kenny"; null bij een gewone les. */
  sub: string | null;
}

export function classLabel(
  cls: Pick<StudioClass, 'title' | 'privateFor' | 'sessionKind' | 'trainerId'>,
  names: { member?: string | null; trainer?: string | null }
): ClassLabel {
  if (!cls.privateFor) return { title: cls.title, sub: null };
  const kind = cls.sessionKind === 'duo' ? 'Duo PT' : 'PT';
  const pt = names.trainer ? `${kind} – ${firstName(names.trainer)}` : kind;
  const member = shortPersonName(names.member);
  return member ? { title: member, sub: pt } : { title: pt, sub: null };
}
