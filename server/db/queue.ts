import { stmt, utc, sqlList } from './sql';
import { NO_REQUEUE_STATUSES } from '../domain/redemptionStatus';

export interface QueueItem {
  id: number;
  fid: string;
  code: string;
  priority: number;
  status: string;
  error_message: string | null;
  attempts: number;
  created_at: string;
  updated_at: string;
  nickname?: string | null;
  kingdom?: string | null;
  avatar_url?: string | null;
}

const COLUMNS = `id, fid, code, priority, status, error_message, attempts, ${utc('created_at')}, ${utc('updated_at')}`;
const JOINED_COLUMNS = `rq.id, rq.fid, rq.code, rq.priority, rq.status, rq.error_message, rq.attempts,
  ${utc('rq.created_at')}, ${utc('rq.updated_at')}, u.nickname, u.kingdom, u.avatar_url`;

/**
 * Queue every (active user, validated code) pair that still needs redeeming, optionally narrowed to one user
 * and/or one code. Skipped:
 * - pairs already redeemed or that the player is not eligible for (NO_REQUEUE_STATUSES, any attempt)
 * - unless retryKingdomMismatch: pairs whose latest result is USER_INFO_ERROR and whose kingdom was not
 *   verified since (the user is in the redemption failures list as a wrong kingdom, or still being retried;
 *   fixing the kingdom queues them again)
 * Priority: the given one, or the user's priority_users priority if higher.
 * An existing item becomes pending again (one still processing is left alone); a failed one gets a fresh retry budget.
 */
const ENQUEUE_SQL = `
  INSERT INTO redemption_queue (fid, code, priority, status, attempts)
  SELECT u.fid, g.code, MAX(:priority, COALESCE(pu.priority, 0)), 'pending', 0
  FROM users u
  CROSS JOIN gift_codes g
  LEFT JOIN priority_users pu ON u.fid = pu.fid
  WHERE u.active = 1
    AND g.validation_status = 'validated'
    AND (:fid IS NULL OR u.fid = :fid)
    AND (:code IS NULL OR g.code = :code)
    AND NOT EXISTS (
      SELECT 1 FROM redemptions r
      WHERE r.fid = u.fid AND r.code = g.code
        AND r.status IN (${sqlList(NO_REQUEUE_STATUSES)})
    )
    AND (:retryKingdomMismatch = 1 OR NOT EXISTS (
      SELECT 1 FROM redemptions r
      WHERE r.fid = u.fid AND r.code = g.code
        AND r.status = 'USER_INFO_ERROR'
        AND r.id = (SELECT MAX(r2.id) FROM redemptions r2 WHERE r2.fid = r.fid AND r2.code = r.code)
        AND (u.kingdom_verified_at IS NULL OR r.redeemed_at > u.kingdom_verified_at)
    ))
  ON CONFLICT(fid, code) DO UPDATE SET
    priority = MAX(redemption_queue.priority, excluded.priority),
    status = CASE WHEN redemption_queue.status = 'processing' THEN 'processing' ELSE 'pending' END,
    attempts = CASE WHEN redemption_queue.status = 'failed' THEN 0 ELSE redemption_queue.attempts END,
    error_message = CASE WHEN redemption_queue.status = 'failed' THEN NULL ELSE redemption_queue.error_message END
`;

export const queue = {
  /**
   * See ENQUEUE_SQL. Returns the number of items added or put back to pending.
   */
  enqueue: (opts: { fid?: string; code?: string; priority?: number; retryKingdomMismatch?: boolean } = {}): number => {
    return stmt(ENQUEUE_SQL).run({
      priority: opts.priority ?? 0,
      fid: opts.fid ?? null,
      code: opts.code ?? null,
      retryKingdomMismatch: opts.retryKingdomMismatch ? 1 : 0
    }).changes;
  },

  /**
   * Atomically take the next pending item (highest priority, then oldest) and mark it processing,
   * counting the attempt. Items already tried during the current run (attempts > 0 and updated since
   * runStartedAt, SQLite UTC format) are left for the next run, so a retryable failure is not retried at once.
   */
  claimNext: (runStartedAt: string): QueueItem | undefined => {
    return stmt(`
      UPDATE redemption_queue
      SET status = 'processing', attempts = attempts + 1, error_message = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = (
        SELECT id FROM redemption_queue
        WHERE status = 'pending' AND (attempts = 0 OR updated_at < ?)
        ORDER BY priority DESC, created_at ASC, id ASC
        LIMIT 1
      )
      RETURNING ${COLUMNS}
    `).get(runStartedAt) as QueueItem | undefined;
  },

  // Record an attempt's outcome (the attempt was counted when the item was claimed)
  setStatus: (id: number, status: 'pending' | 'failed', errorMessage: string | null) => {
    return stmt('UPDATE redemption_queue SET status = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(status, errorMessage, id);
  },

  delete: (id: number) => {
    return stmt('DELETE FROM redemption_queue WHERE id = ?').run(id);
  },

  // Remove all queued entries for a gift code (used when a code turns out expired or invalid)
  deleteByCode: (code: string) => {
    return stmt('DELETE FROM redemption_queue WHERE code = ?').run(code);
  },

  list: (opts: { limit: number; offset: number }): { items: QueueItem[]; total: number } => {
    const items = stmt(`
      SELECT ${JOINED_COLUMNS}
      FROM redemption_queue rq
      LEFT JOIN users u ON rq.fid = u.fid
      ORDER BY rq.updated_at DESC, rq.id DESC
      LIMIT ? OFFSET ?
    `).all(opts.limit, opts.offset) as QueueItem[];
    const { total } = stmt('SELECT COUNT(*) AS total FROM redemption_queue').get() as { total: number };
    return { items, total };
  },

  listPriority: (opts: { limit: number; offset: number }): { items: QueueItem[]; total: number; pending: number } => {
    const items = stmt(`
      SELECT ${JOINED_COLUMNS}
      FROM redemption_queue rq
      LEFT JOIN users u ON rq.fid = u.fid
      WHERE rq.priority > 0
      ORDER BY rq.priority DESC, rq.created_at ASC
      LIMIT ? OFFSET ?
    `).all(opts.limit, opts.offset) as QueueItem[];
    const counts = stmt(`
      SELECT COUNT(*) AS total, COALESCE(SUM(status = 'pending'), 0) AS pending
      FROM redemption_queue WHERE priority > 0
    `).get() as { total: number; pending: number };
    return { items, ...counts };
  },

  countPending: (): number => {
    return (stmt("SELECT COUNT(*) AS count FROM redemption_queue WHERE status = 'pending'").get() as { count: number }).count;
  },

  // Items left 'processing' by a restart are never picked up again; put them back (their attempt was already counted)
  resetStuckProcessing: (): number => {
    return stmt(`
      UPDATE redemption_queue
      SET status = 'pending', updated_at = CURRENT_TIMESTAMP
      WHERE status = 'processing'
    `).run().changes;
  },

  // Admin retry of a failed item, with a fresh retry budget; one being processed is left alone
  resetToPending: (id: number) => {
    return stmt(`
      UPDATE redemption_queue
      SET status = 'pending', attempts = 0, error_message = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'failed'
    `).run(id);
  },

  // A changed user priority applies to the user's queued items too
  setPriorityForFid: (fid: string, priority: number) => {
    return stmt("UPDATE redemption_queue SET priority = ? WHERE fid = ? AND status != 'processing'").run(priority, fid);
  }
};

