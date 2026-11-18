import { describe, it, expect, beforeEach, vi } from 'vitest';
import { users } from '../server/db';
import { resetDb, addUser } from './helpers';

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), verify: vi.fn() }));
vi.mock('../server/clients/mightpulse', () => ({ lookupPlayer: mocks.lookup }));
vi.mock('../server/clients/kingshot', () => ({ verifyPlayer: mocks.verify }));
vi.mock('../server/services/queueWorker', () => ({ queueAndRedeem: vi.fn() }));
vi.mock('../server/utils/sleep', () => ({ sleep: () => Promise.resolve() }));

const { startBulkRefresh, getBulkRefreshStatus } = await import('../server/services/playerLookup');

async function runBulk(fids: string[]) {
  startBulkRefresh(fids);
  await vi.waitFor(() => expect(getBulkRefreshStatus().running).toBe(false));
  return getBulkRefreshStatus();
}

const profile = (kid: number, inactive = false) => ({ kid, nickname: null, avatarUrl: null, inactive });

beforeEach(() => {
  resetDb();
  mocks.lookup.mockReset();
  mocks.verify.mockReset();
});

describe('bulk profile refresh', () => {
  it('counts and reports the users it deactivates', async () => {
    addUser('1');
    addUser('2');
    addUser('3');
    mocks.lookup.mockImplementation(async (fid: string) =>
      fid === '1' ? undefined : fid === '2' ? profile(100, true) : profile(100));

    const s = await runBulk(['1', '2', '3']);

    expect(s).toMatchObject({ updated: 2, notFound: 1, deactivated: 1 });
    expect(s.issues.map(i => `${i.fid}:${i.reason}:${i.detail}`)).toEqual(['1:not_found:deactivated', '2:deactivated:null']);
    expect(users.findByFid('1')?.active).toBe(0);
    expect(users.findByFid('2')?.active).toBe(0);
    expect(users.findByFid('3')?.active).toBe(1);
  });

  it('counts users that were already inactive (e.g. deactivated by another refresh)', async () => {
    addUser('1', '100', { active: 0 });
    addUser('2', '100', { active: 0 });
    mocks.lookup.mockImplementation(async (fid: string) => fid === '1' ? undefined : profile(100, true));

    const s = await runBulk(['1', '2']);

    expect(s).toMatchObject({ updated: 1, notFound: 1, deactivated: 1 });
    expect(s.issues.map(i => `${i.fid}:${i.reason}:${i.detail}`)).toEqual(['1:not_found:deactivated', '2:deactivated:null']);
  });

  it('saves the lookup kingdom of an inactive user without asking the API', async () => {
    addUser('1', '13');
    mocks.lookup.mockResolvedValue(profile(12, true));

    const s = await runBulk(['1']);

    expect(mocks.verify).not.toHaveBeenCalled();
    expect(s).toMatchObject({ kingdomUpdated: 1, deactivated: 1 });
    expect(users.findByFid('1')).toMatchObject({ kingdom: '12', kingdom_verified_at: null, active: 0 });
  });
});
