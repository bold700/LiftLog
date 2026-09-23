import { describe, it, expect } from 'vitest';
import type { Membership, Profile } from '../../src/types';
import { DEFAULT_MEMBER_FILTER, NO_PLAN, filterMembers, planOptions, sortMembers } from '../../src/utils/memberTable';

const p = (userId: string, displayName: string, role: Profile['role'], extra: Partial<Profile> = {}) =>
  ({ userId, displayName, role, email: `${displayName.toLowerCase()}@x.nl`, ...extra }) as Profile;
const m = (userId: string, planId: string, planName: string) => ({ userId, planId, planName, status: 'active' }) as Membership;

const profiles = [
  p('bas', 'Bas', 'sporter', { trainerId: 'kenny' }),
  p('kenny', 'Kenny', 'admin'),
  p('margot', 'Margot', 'sporter'),
  p('richard', 'richard', 'sporter'),
  p('tom', 'Tom', 'trainer'),
];
const ctx = {
  credits: { bas: 3, margot: 9, richard: 0 } as Record<string, number>,
  memberships: { bas: m('bas', 'pt1', 'Personal Training'), margot: m('margot', 'strip', 'Strippenkaart') } as Record<string, Membership>,
  nameOf: (id: string | null | undefined) => (id === 'kenny' ? 'Kenny' : null),
};
const ids = (list: Profile[]) => list.map((x) => x.userId);

describe('filterMembers', () => {
  it('laat standaard iedereen zien', () => {
    expect(ids(filterMembers(profiles, DEFAULT_MEMBER_FILTER, ctx))).toEqual(ids(profiles));
  });
  it('zoekt op naam, e-mail, trainer en abonnement', () => {
    expect(ids(filterMembers(profiles, { ...DEFAULT_MEMBER_FILTER, query: 'MARG' }, ctx))).toEqual(['margot']);
    expect(ids(filterMembers(profiles, { ...DEFAULT_MEMBER_FILTER, query: 'kenny' }, ctx))).toEqual(['bas', 'kenny']);
    expect(ids(filterMembers(profiles, { ...DEFAULT_MEMBER_FILTER, query: 'strippen' }, ctx))).toEqual(['margot']);
  });
  it('filtert op rol', () => {
    expect(ids(filterMembers(profiles, { ...DEFAULT_MEMBER_FILTER, role: 'staff' }, ctx))).toEqual(['kenny', 'tom']);
    expect(ids(filterMembers(profiles, { ...DEFAULT_MEMBER_FILTER, role: 'sporter' }, ctx))).toEqual(['bas', 'margot', 'richard']);
  });
  it('filtert op abonnement of juist sporters zonder', () => {
    expect(ids(filterMembers(profiles, { ...DEFAULT_MEMBER_FILTER, plan: 'strip' }, ctx))).toEqual(['margot']);
    expect(ids(filterMembers(profiles, { ...DEFAULT_MEMBER_FILTER, plan: NO_PLAN }, ctx))).toEqual(['richard']);
  });
});

describe('sortMembers', () => {
  it('op naam, zonder op hoofdletters te letten', () => {
    expect(ids(sortMembers(profiles, { key: 'name', dir: 'asc' }, ctx))).toEqual(['bas', 'kenny', 'margot', 'richard', 'tom']);
    expect(ids(sortMembers(profiles, { key: 'name', dir: 'desc' }, ctx))).toEqual(['tom', 'richard', 'margot', 'kenny', 'bas']);
  });
  it('op credits, lege waarden altijd onderaan', () => {
    expect(ids(sortMembers(profiles, { key: 'credits', dir: 'asc' }, ctx))).toEqual(['richard', 'bas', 'margot', 'kenny', 'tom']);
    expect(ids(sortMembers(profiles, { key: 'credits', dir: 'desc' }, ctx))).toEqual(['margot', 'bas', 'richard', 'kenny', 'tom']);
  });
  it('op rol: staf eerst, daarna op naam', () => {
    expect(ids(sortMembers(profiles, { key: 'role', dir: 'asc' }, ctx))).toEqual(['kenny', 'tom', 'bas', 'margot', 'richard']);
  });
  it('op abonnement', () => {
    expect(ids(sortMembers(profiles, { key: 'subscription', dir: 'asc' }, ctx)).slice(0, 2)).toEqual(['bas', 'margot']);
  });
});

describe('planOptions', () => {
  it('unieke abonnementen, alfabetisch', () => {
    expect(planOptions(ctx.memberships)).toEqual([
      { id: 'pt1', name: 'Personal Training' },
      { id: 'strip', name: 'Strippenkaart' },
    ]);
  });
});
