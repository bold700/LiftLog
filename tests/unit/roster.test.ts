import { describe, expect, it } from 'vitest';
import { rosterFromProfiles } from '../../src/utils/roster';
import type { Profile } from '../../src/types';

const p = (userId: string, extra: Partial<Profile> = {}) => ({ userId, displayName: userId, role: 'sporter', ...extra }) as Profile;

describe('ledenlijsten voor staf', () => {
  it('eigen sporters, wie je kunt inplannen en iedereen behalve jezelf, op naam', () => {
    const everyone = [
      p('kenny', { role: 'admin' }),
      p('wendy', { trainerId: 'kenny' }),
      p('anna'),
      p('simone', { role: 'trainer', trainsAsMember: true }),
      p('bas', { role: 'trainer' }),
    ];
    const r = rosterFromProfiles(everyone, 'kenny');
    expect(r.sporters.map((x) => x.userId)).toEqual(['wendy']);
    expect(r.allSporters.map((x) => x.userId)).toEqual(['anna', 'simone', 'wendy']);
    expect(r.members.map((x) => x.userId)).toEqual(['anna', 'bas', 'simone', 'wendy']);
  });

  it('een nieuw lid in de lijst komt meteen mee (zelfde berekening bij elke update)', () => {
    const before = rosterFromProfiles([p('kenny', { role: 'admin' })], 'kenny');
    expect(before.members).toHaveLength(0);
    const after = rosterFromProfiles([p('kenny', { role: 'admin' }), p('ingrid')], 'kenny');
    expect(after.members.map((x) => x.userId)).toEqual(['ingrid']);
    expect(after.allSporters.map((x) => x.userId)).toEqual(['ingrid']);
  });
});
