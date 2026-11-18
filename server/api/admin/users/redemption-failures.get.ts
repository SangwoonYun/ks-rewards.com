import { redemptions } from '../../../db';
import { SETTLED_STATUSES } from '../../../domain/redemptionStatus';
import { setFailureCount } from '../../../utils/failureCount';

// What to do about a user, from their worst failure
export type FailureCategory = 'wrong_kingdom' | 'no_account' | 'other';

export interface FailureUser {
  fid: string;
  nickname: string | null;
  kingdom: string | null;
  avatar_url: string | null;
  category: FailureCategory;
  failures: { status: string; codes: string[] }[];
  failed_codes: number;
  last_failed_at: string;
}

/**
 * Active users with redemptions that failed for good (retries used up), one entry per user
 */
export default defineEventHandler(() => {
  const byFid = new Map<string, FailureUser>();

  // Rows are newest first, so the first row of a user is their last failure
  for (const row of redemptions.findFinalFailures(SETTLED_STATUSES)) {
    let user = byFid.get(row.fid);
    if (!user) {
      user = {
        fid: row.fid,
        nickname: row.nickname,
        kingdom: row.kingdom,
        avatar_url: row.avatar_url,
        category: 'other',
        failures: [],
        failed_codes: 0,
        last_failed_at: row.redeemed_at
      };
      byFid.set(row.fid, user);
    }
    let failure = user.failures.find(f => f.status === row.status);
    if (!failure) {
      failure = { status: row.status, codes: [] };
      user.failures.push(failure);
    }
    failure.codes.push(row.code);
    user.failed_codes++;
  }

  const users = [...byFid.values()];
  for (const user of users) {
    const statuses = user.failures.map(f => f.status);
    user.category = statuses.includes('USER_INFO_ERROR') ? 'wrong_kingdom'
      : statuses.includes('ROLE_NOT_EXIST') ? 'no_account'
      : 'other';
  }
  // Fresh anyway, so the sidebar badge gets it without running the query again
  setFailureCount(users.length);
  return { success: true, users, total: users.length };
});
