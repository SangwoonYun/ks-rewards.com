import { users } from '../db';
import { verifyPlayer } from '../clients/kingshot';
import { lookupPlayer, type PlayerProfile } from '../clients/mightpulse';
import { queueAndRedeem } from './queueWorker';
import { logger } from '../utils/logger';
import { getErrorMessage } from '../utils/errors';
import { sleep } from '../utils/sleep';

export { lookupPlayer, type PlayerProfile };

/**
 * Save the nickname and avatar from a lookup (a missing nickname keeps the one on record)
 */
export function saveProfile(fid: string, profile: PlayerProfile) {
  if (profile.nickname) users.updateNickname(fid, profile.nickname);
  users.updateAvatar(fid, profile.avatarUrl);
}

export interface RefreshResult {
  result: 'updated' | 'not_found' | 'failed';
  // Only when the lookup's kingdom differs from the one on record
  kingdom?: { from: string | null; to: string; status: 'updated' | 'rejected' };
  // The player is not found or looks inactive (see PlayerProfile.inactive), so the user is now inactive:
  // also when it already was (e.g. deactivated by another refresh running at the same time)
  deactivated?: boolean;
}

/**
 * Save a kingdom from the lookup, after the official API accepts it (lookup data can be stale); inactive users skip the check.
 * Codes that failed with the old kingdom are queued and redeemed right away (active users only), as with an admin kingdom change.
 */
async function applyLookupKingdom(fid: string, kid: number): Promise<RefreshResult['kingdom']> {
  const from = users.findByFid(fid)?.kingdom ?? null;
  const to = String(kid);
  if (from === to) return undefined;

  // The API answers USER_INFO_ERROR for inactive players whatever the kingdom, so theirs is saved unchecked
  if (users.findByFid(fid)?.active !== 1) {
    users.setUnverifiedKingdom(fid, to);
    logger.info(`👤 Kingdom for inactive ${fid} updated from lookup without API check: ${from} -> ${to}`);
    return { from, to, status: 'updated' };
  }

  const verification = await verifyPlayer(fid, to);
  if (!verification.ok) {
    logger.info(`👤 Lookup kingdom ${to} for ${fid} rejected by the API (${verification.status}), keeping ${from}`);
    return { from, to, status: 'rejected' };
  }
  users.setVerifiedKingdom(fid, to);
  logger.info(`👤 Kingdom for ${fid} updated from lookup: ${from} -> ${to}`);
  queueAndRedeem({ fid, priority: 10 });
  return { from, to, status: 'updated' };
}

/**
 * Look the player up and save the nickname and avatar. Unless full is false (a user's own registration),
 * also deactivate the user when the player is not found or looks inactive (inactive for 90 days or
 * no city coordinates), or else update the kingdom.
 * Never throws.
 */
export async function refreshProfile(fid: string, full = true): Promise<RefreshResult> {
  try {
    const profile = await lookupPlayer(fid);
    if (!profile) {
      // Not even in the live search: treated as gone (the live search does not cover every kingdom,
      // so the not_found group of the bulk report lists these for review)
      if (!full) return { result: 'not_found' };
      if (users.findByFid(fid)?.active === 1) {
        users.updateActive(fid, 0);
        logger.info(`👤 Deactivated ${fid}: not found by the lookup (cache and live search)`);
      }
      return { result: 'not_found', deactivated: true };
    }
    saveProfile(fid, profile);
    if (!full) return { result: 'updated' };

    const deactivated = profile.inactive || undefined;
    if (deactivated && users.findByFid(fid)?.active === 1) {
      users.updateActive(fid, 0);
      logger.info(`👤 Deactivated ${fid}: inactive according to the lookup (90 days / no coordinates)`);
    }
    // The kingdom is kept up to date for inactive users too (no codes are redeemed for them)
    const kingdom = profile.kid ? await applyLookupKingdom(fid, profile.kid) : undefined;
    return { result: 'updated', kingdom, deactivated };
  } catch (error) {
    logger.warn(`Player lookup failed for ${fid}: ${getErrorMessage(error)}`);
    return { result: 'failed' };
  }
}

export interface RefreshIssue {
  fid: string;
  nickname: string | null;
  kingdom: string | null;
  reason: 'deactivated' | 'not_found' | 'failed' | 'kingdom_rejected';
  detail: string | null;   // kingdom_rejected: the lookup's kingdom the API rejected; not_found: 'deactivated' if so
}

// Refresh of every user's profile, one lookup at a time in the background
const BULK_INTERVAL_MS = 1500;
const BULK_MAX_CONSECUTIVE_FAILURES = 5;

const bulk = {
  running: false,
  cancelRequested: false,
  total: 0,
  done: 0,
  updated: 0,
  notFound: 0,
  failed: 0,
  kingdomUpdated: 0,
  deactivated: 0,
  // Users that did not refresh cleanly, for the report at the end
  issues: [] as RefreshIssue[],
  stoppedReason: null as string | null,
  startedAt: null as number | null,
  finishedAt: null as number | null
};

export function getBulkRefreshStatus() {
  const { cancelRequested, ...status } = bulk;
  return status;
}

export function cancelBulkRefresh() {
  if (bulk.running) bulk.cancelRequested = true;
}

// fids: the users to refresh (the user grid's filter result)
export function startBulkRefresh(fids: string[]) {
  if (bulk.running) {
    throw createError({ statusCode: 409, message: 'A profile refresh is already running' });
  }
  Object.assign(bulk, {
    running: true, cancelRequested: false, total: fids.length, done: 0, updated: 0, notFound: 0, failed: 0, kingdomUpdated: 0, deactivated: 0, issues: [],
    stoppedReason: null, startedAt: Date.now(), finishedAt: null
  });
  logger.info(`👤 Profile refresh started for ${fids.length} user(s)`);
  runBulkRefresh(fids).catch(error => logger.error('👤 Profile refresh error:', error));
  return getBulkRefreshStatus();
}

async function runBulkRefresh(fids: string[]) {
  let consecutiveFailures = 0;
  try {
    for (const fid of fids) {
      if (bulk.cancelRequested) {
        bulk.stoppedReason = 'Cancelled';
        break;
      }
      const { result, kingdom, deactivated } = await refreshProfile(fid);
      bulk.done++;
      if (result === 'updated') bulk.updated++;
      else if (result === 'not_found') bulk.notFound++;
      else bulk.failed++;
      if (kingdom?.status === 'updated') bulk.kingdomUpdated++;
      // Shown within "updated" in the summary: not-found users are deactivated too, but counted as not found
      if (result === 'updated' && deactivated) bulk.deactivated++;

      const reason = result !== 'updated' ? result
        : deactivated ? 'deactivated'
        : kingdom?.status === 'rejected' ? 'kingdom_rejected'
        : null;
      if (reason) {
        const user = users.findByFid(fid);
        bulk.issues.push({
          fid,
          nickname: user?.nickname ?? null,
          kingdom: user?.kingdom ?? null,
          reason,
          detail: reason === 'kingdom_rejected' ? kingdom!.to : reason === 'not_found' && deactivated ? 'deactivated' : null
        });
      }

      consecutiveFailures = result === 'failed' ? consecutiveFailures + 1 : 0;
      if (consecutiveFailures >= BULK_MAX_CONSECUTIVE_FAILURES) {
        bulk.stoppedReason = `Stopped after ${consecutiveFailures} lookup failures in a row`;
        break;
      }
      await sleep(BULK_INTERVAL_MS);
    }
  } finally {
    bulk.running = false;
    bulk.finishedAt = Date.now();
    logger.info(`👤 Profile refresh finished: ${bulk.updated} updated (${bulk.kingdomUpdated} kingdom, ${bulk.deactivated} deactivated), ${bulk.notFound} not found, ${bulk.failed} failed` +
      (bulk.stoppedReason ? ` (${bulk.stoppedReason})` : ''));
  }
}
