import { describe, it, expect, beforeEach } from 'vitest';
import { users } from '../server/db';
import { parseUserFilters } from '../server/utils/userFilters';
import { resetDb, addUser } from './helpers';

beforeEach(() => {
  resetDb();
  addUser('300', '20', { nickname: 'Éclair', createdAt: '2026-01-03 00:00:00' });
  addUser('100', '3', { nickname: 'alpha', createdAt: '2026-01-01 00:00:00' });
  addUser('200', null, { nickname: 'Beta', active: 0, createdAt: '2026-01-02 00:00:00' });
});

const fids = (filters: Record<string, unknown>, sort?: Parameters<typeof users.list>[1]) =>
  users.list(parseUserFilters(filters), { limit: 50, offset: 0, ...sort }).users.map(u => u.fid);

describe('users.list', () => {
  it('lists newest first without filters', () => {
    expect(fids({})).toEqual(['300', '200', '100']);
  });

  it('filters by status, search, nickname (case-insensitive, non-ASCII) and kingdom', () => {
    expect(fids({ status: 'inactive' })).toEqual(['200']);
    expect(fids({ search: 'BET' })).toEqual(['200']);
    expect(fids({ search: '10' })).toEqual(['100']);
    expect(fids({ nickname: 'écl' })).toEqual(['300']);
    expect(fids({ kingdom: '3' })).toEqual(['100']);
  });

  it('filters by registration time, "to" exclusive', () => {
    expect(fids({ from: '2026-01-02T00:00:00Z', to: '2026-01-03T00:00:00Z' })).toEqual(['200']);
  });

  it('sorts numerically with missing values last in both directions', () => {
    expect(fids({}, { sort: 'kingdom', limit: 50, offset: 0 })).toEqual(['100', '300', '200']);
    expect(fids({}, { sort: 'kingdom', desc: true, limit: 50, offset: 0 })).toEqual(['300', '100', '200']);
    expect(fids({}, { sort: 'fid', limit: 50, offset: 0 })).toEqual(['100', '200', '300']);
  });

  it('paginates and counts the whole match', () => {
    const page = users.list({}, { limit: 2, offset: 2 });
    expect(page.users.map(u => u.fid)).toEqual(['100']);
    expect(page.total).toBe(3);
  });

  it('returns ISO-like UTC timestamps', () => {
    expect(users.findByFid('100')!.created_at).toBe('2026-01-01 00:00:00Z');
  });
});
