import { queue } from '../db';
import { sqliteNow } from '../db/sql';
import { executeQueueItem } from './redemptionExecutor';
import { logger } from '../utils/logger';
import { config } from '../utils/config';
import { sleep } from '../utils/sleep';

/**
 * The single redemption worker. It takes pending items one at a time, highest priority first, so items
 * queued while it runs (a new registration, an admin action) are redeemed next; items it already tried in
 * this run wait for the next run (see queue.claimNext).
 */
let running = false;
let rerunRequested = false;

async function runOnce(startedAt: string) {
  let processed = 0;
  let succeeded = 0;

  for (let item = queue.claimNext(startedAt); item; item = queue.claimNext(startedAt)) {
    const result = await executeQueueItem(item);
    processed++;
    if (result.success) succeeded++;
    // Delay between redemptions to avoid rate limiting
    await sleep(config.retry.redeemDelayMs);
  }

  if (processed > 0) {
    logger.info(`Redemption run complete: ${processed} processed, ${succeeded} success, ${processed - succeeded} failed`);
  }
}

/**
 * Start the worker, or have it run again when it finishes if it is running. Never throws.
 */
export function kickQueueWorker() {
  if (running) {
    rerunRequested = true;
    return;
  }
  running = true;
  // Shared by the reruns: an item that failed in this activation waits for the next scheduled one
  const startedAt = sqliteNow();
  (async () => {
    try {
      do {
        rerunRequested = false;
        await runOnce(startedAt);
      } while (rerunRequested);
    } catch (error) {
      logger.error('Redemption worker error:', error);
    } finally {
      running = false;
    }
  })();
}

/**
 * Queue what the matching users still need (see queue.enqueue) and start redeeming it right away.
 * Returns the number of items queued.
 */
export function queueAndRedeem(opts: Parameters<typeof queue.enqueue>[0]): number {
  const queued = queue.enqueue(opts);
  if (queued > 0) kickQueueWorker();
  return queued;
}
