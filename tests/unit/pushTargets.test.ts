import { describe, it, expect } from 'vitest';
import { newlyAssignedIds, checkinRecipient } from '../../src/utils/pushTargets';

/**
 * Waarom dit getest wordt: te weinig meldingen en niemand merkt een nieuw schema op; te veel en
 * mensen zetten ze uit. Deze regels bepalen wie er een seintje krijgt.
 */

describe('newlyAssignedIds', () => {
  it('nieuw schema met klant: die klant krijgt een melding', () => {
    expect(newlyAssignedIds(null, { clientId: 'bas', participantIds: [] }, 'kenny')).toEqual(['bas']);
  });

  it('opnieuw opslaan zonder wijziging in wie: geen melding', () => {
    const s = { clientId: 'bas', participantIds: ['richard'] };
    expect(newlyAssignedIds(s, s, 'kenny')).toEqual([]);
  });

  it('alleen nieuw toegevoegde deelnemers krijgen een melding', () => {
    expect(
      newlyAssignedIds({ clientId: null, participantIds: ['bas'] }, { clientId: null, participantIds: ['bas', 'sumit', 'margot'] }, 'kenny')
    ).toEqual(['sumit', 'margot']);
  });

  it('klant gewisseld: alleen de nieuwe klant', () => {
    expect(newlyAssignedIds({ clientId: 'bas', participantIds: [] }, { clientId: 'richard', participantIds: [] }, 'kenny')).toEqual([
      'richard',
    ]);
  });

  it('jezelf toewijzen levert geen melding naar jezelf op', () => {
    expect(newlyAssignedIds(null, { clientId: 'kenny', participantIds: ['kenny', 'bas'] }, 'kenny')).toEqual(['bas']);
  });

  it('dubbelen (klant ook als deelnemer) maar één keer', () => {
    expect(newlyAssignedIds(null, { clientId: 'bas', participantIds: ['bas'] }, 'kenny')).toEqual(['bas']);
  });
});

describe('checkinRecipient', () => {
  it('sporter vult zelf in: melding naar de trainer', () => {
    expect(checkinRecipient({ userId: 'bas', loggedBy: 'bas', trainerId: 'kenny' })).toBe('kenny');
  });

  it('trainer vult in namens de sporter: geen melding', () => {
    expect(checkinRecipient({ userId: 'bas', loggedBy: 'kenny', trainerId: 'kenny' })).toBeNull();
  });

  it('geen trainer gekoppeld: geen melding', () => {
    expect(checkinRecipient({ userId: 'bas', loggedBy: 'bas', trainerId: null })).toBeNull();
  });

  it('trainer die zijn eigen check-in doet: geen melding naar zichzelf', () => {
    expect(checkinRecipient({ userId: 'kenny', loggedBy: 'kenny', trainerId: 'kenny' })).toBeNull();
  });
});
