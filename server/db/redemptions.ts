import { db } from './connection';
import { stmt, utc } from './sql';

export interface Redemption {
  id: number;
  fid: string;
  code: string;
  status: string;
  redeemed_at: string;
  nickname?: string | null;
  kingdom?: string | null;
  avatar_url?: string | null;
}

export interface RedemptionFailureRow {
  fid: string;
  nickname: string | null;
  kingdom: string | null;
  avatar_url: string | null;
  code: string;
  status: string;
  redeemed_at: string;
}

const COLUMNS = `r.id, r.fid, r.code, r.status, ${utc('r.redeemed_at')}, u.nickname, u.kingdom, u.avatar_url`;

export const redemptions = {
  /**
   * One page of redemption history, newest first: one player's, one code's, or else successful ones only
   */
  list: (opts: { fid?: string; code?: string; limit: number; offset: number }): { redemptions: Redemption[]; total: number } => {
    const [where, param] = opts.fid
      ? ['r.fid = ?', opts.fid]
      : opts.code
        ? ['r.code = ?', opts.code]
        : ["r.status = 'SUCCESS'", undefined];
    const params = param === undefined ? [] : [param];

    const rows = db.prepare(`
      SELECT ${COLUMNS}
      FROM redemptions r
      LEFT JOIN users u ON r.fid = u.fid
      WHERE ${where}
      ORDER BY r.id DESC
      LIMIT ? OFFSET ?
    `).all(...params, opts.limit, opts.offset) as Redemption[];
    const { total } = db.prepare(`SELECT COUNT(*) AS total FROM redemptions r WHERE ${where}`).get(...params) as { total: number };
    return { redemptions: rows, total };
  },

  findRecentSuccesses: (limit: number): Redemption[] => {
    return stmt(`
      SELECT ${COLUMNS}
      FROM redemptions r
      LEFT JOIN users u ON r.fid = u.fid
      WHERE r.status = 'SUCCESS'
      ORDER BY r.id DESC
      LIMIT ?
    `).all(limit) as Redemption[];
  },

  // Latest attempt for the pair (by id: redeemed_at only has second precision)
  findLatest: (fid: string, code: string): Redemption | undefined => {
    return stmt(`
      SELECT id, fid, code, status, ${utc('redeemed_at')}
      FROM redemptions
      WHERE fid = ? AND code = ?
      ORDER BY id DESC
      LIMIT 1
    `).get(fid, code) as Redemption | undefined;
  },

  // Final failures of active users: (fid, code) pairs whose latest attempt has a status outside
  // settledStatuses (success, dead code, player not eligible) and that are no longer queued, i.e. retries
  // are used up. Failures from before the kingdom was last verified are ignored: verifying a kingdom
  // queues every unredeemed code again, so those failures are already being retried or superseded.
  // Only codes that are still valid count: a failure on a code that expired since can never be retried
  // (a retry only queues valid codes), so it would keep the user listed forever.
  findFinalFailures: (settledStatuses: string[]): RedemptionFailureRow[] => {
    const placeholders = settledStatuses.map(() => '?').join(', ');
    return stmt(`
      WITH latest AS (
        SELECT r.fid, r.code, r.status, r.redeemed_at
        FROM redemptions r
        WHERE r.id = (
          SELECT MAX(r2.id) FROM redemptions r2
          WHERE r2.fid = r.fid AND r2.code = r.code
        )
      )
      SELECT u.fid, u.nickname, u.kingdom, u.avatar_url, l.code, l.status, ${utc('l.redeemed_at')}
      FROM latest l
      JOIN users u ON u.fid = l.fid
      JOIN gift_codes g ON g.code = l.code AND g.validation_status = 'validated'
      WHERE l.status NOT IN (${placeholders})
        AND u.active = 1
        AND (u.kingdom_verified_at IS NULL OR l.redeemed_at > u.kingdom_verified_at)
        AND NOT EXISTS (
          SELECT 1 FROM redemption_queue q
          WHERE q.fid = l.fid AND q.code = l.code AND q.status IN ('pending', 'processing')
        )
      ORDER BY l.redeemed_at DESC
    `).all(...settledStatuses) as RedemptionFailureRow[];
  },

  create: (fid: string, code: string, status: string) => {
    return stmt('INSERT INTO redemptions (fid, code, status) VALUES (?, ?, ?)').run(fid, code, status);
  }
};
