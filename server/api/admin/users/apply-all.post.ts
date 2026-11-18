import { users, queue } from '../../../db';
import { kickQueueWorker } from '../../../services/queueWorker';
import { parseUserFilters, hasUserFilters } from '../../../utils/userFilters';
import { logger } from '../../../utils/logger';

/**
 * Queue the validated codes for the active users matching the user grid's filters (body), or for every
 * active user when no filter is set; they are redeemed in the background
 */
export default defineEventHandler(async (event) => {
  const body = (await readBody(event).catch(() => null)) ?? {};
  const filtered = hasUserFilters(body);

  let queuedCount = 0;
  let targetCount: number | null = null;
  if (filtered) {
    const filters = parseUserFilters(body);
    // Only active users get codes: an "inactive" filter matches nobody to apply to
    const targets = filters.status === 'inactive' ? [] : users.findFids({ ...filters, status: 'active' });
    targetCount = targets.length;
    for (const fid of targets) {
      queuedCount += queue.enqueue({ fid, priority: 5, retryKingdomMismatch: true });
    }
  } else {
    queuedCount = queue.enqueue();
  }
  if (queuedCount > 0) kickQueueWorker();

  logger.info(`Admin apply-all${filtered ? ` (${targetCount} filtered users)` : ''}: queued ${queuedCount}`);

  return {
    success: true,
    targetCount,
    queuedCount,
    message: queuedCount === 0 ? 'No unredeemed codes to apply' : `Queued ${queuedCount} redemption(s), redeeming in the background`,
  };
});
