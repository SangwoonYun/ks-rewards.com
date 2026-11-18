import { redemptions } from '../db';
import { SETTLED_STATUSES } from '../domain/redemptionStatus';

// The failures query is heavy and blocks the server (better-sqlite3 is synchronous), so the sidebar badge
// reads a cached count. It may lag up to the TTL; the failures page itself always computes the full list.
const CACHE_TTL_MS = 60000;
let cached: { count: number; at: number } | null = null;

/**
 * Save a freshly computed count (the failures list endpoint does this on every request)
 */
export function setFailureCount(count: number) {
  cached = { count, at: Date.now() };
}

/**
 * Number of users with final redemption failures, recomputed at most once per TTL
 */
export function getFailureCount(): number {
  if (!cached || Date.now() - cached.at >= CACHE_TTL_MS) {
    const fids = new Set(redemptions.findFinalFailures(SETTLED_STATUSES).map(row => row.fid));
    setFailureCount(fids.size);
  }
  return cached!.count;
}
