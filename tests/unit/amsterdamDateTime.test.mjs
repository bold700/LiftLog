/**
 * Lessen staan in Nederlandse tijd. De server draait in UTC; zonder omrekening begon een les van
 * 07:00 voor de server om 09:00 hier, waardoor reserveren na de start nog kon en de grens voor
 * gratis afmelden verschoof.
 */
import { describe, it, expect } from 'vitest';
import { amsterdamDateTime } from '../../api/_lib/classReminders.mjs';

describe('amsterdamDateTime', () => {
  it('zomertijd: 07:00 hier is 05:00 UTC', () => {
    expect(amsterdamDateTime('2026-09-26', '07:00')?.toISOString()).toBe('2026-09-26T05:00:00.000Z');
  });

  it('wintertijd: 07:00 hier is 06:00 UTC', () => {
    expect(amsterdamDateTime('2026-12-01', '07:00')?.toISOString()).toBe('2026-12-01T06:00:00.000Z');
  });

  it('rond de wisseling naar wintertijd', () => {
    expect(amsterdamDateTime('2026-10-25', '09:00')?.toISOString()).toBe('2026-10-25T08:00:00.000Z');
    expect(amsterdamDateTime('2026-10-24', '23:30')?.toISOString()).toBe('2026-10-24T21:30:00.000Z');
  });

  it('ongeldige invoer geeft null', () => {
    expect(amsterdamDateTime('', '07:00')).toBeNull();
    expect(amsterdamDateTime('2026-09-26', 'x')).toBeNull();
  });
});
