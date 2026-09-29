import { describe, expect, it } from 'vitest';
import { actingOrg, isAdminIn, isStaffAnywhere, isStaffIn, roleIn } from '../../api/_lib/orgRoles.mjs';

describe('roleIn', () => {
  it('oud profiel: role geldt in de thuisstudio', () => {
    expect(roleIn({ orgId: 'a', role: 'admin' }, 'a')).toBe('admin');
  });

  it('geen lid van de studio: geen rechten', () => {
    expect(roleIn({ orgId: 'a', role: 'admin' }, 'b')).toBe('sporter');
  });

  it('orgRoles gaat voor de algemene role', () => {
    const p = { orgId: 'a', orgIds: ['a', 'b'], role: 'admin', orgRoles: { a: 'admin', b: 'sporter' } };
    expect(isAdminIn(p, 'a')).toBe(true);
    expect(isStaffIn(p, 'b')).toBe(false);
    expect(isStaffAnywhere(p)).toBe(true);
  });

  it('ongeldige waarde valt terug op role', () => {
    expect(roleIn({ orgId: 'a', role: 'trainer', orgRoles: { a: 'baas' } }, 'a')).toBe('trainer');
  });
});

describe('actingOrg', () => {
  const p = { orgId: 'a', orgIds: ['a', 'b'] };
  it('de meegestuurde studio als je daar lid bent', () => {
    expect(actingOrg(p, 'b')).toBe('b');
  });
  it('anders de thuisstudio', () => {
    expect(actingOrg(p, 'x')).toBe('a');
    expect(actingOrg(p, undefined)).toBe('a');
  });
});
