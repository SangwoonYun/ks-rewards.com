import { users, queue } from '../../../db';
import { kickQueueWorker } from '../../../services/queueWorker';
import { requireFidList } from '../../../utils/http';
import { logger } from '../../../utils/logger';

/**
 * Queue the validated codes for the users selected in the user grid (body.fids); only active users
 * get codes. They are redeemed in the background.
 */
export default defineEventHandler(async (event) => {
  const fids = requireFidList(await readBody(event).catch(() => null));
  const targets = fids.filter(fid => users.findByFid(fid)?.active === 1);

  let queuedCount = 0;
  for (const fid of targets) {
    queuedCount += queue.enqueue({ fid, priority: 5, retryKingdomMismatch: true });
  }
  if (queuedCount > 0) kickQueueWorker();

  logger.info(`Admin apply codes (${targets.length} active of ${fids.length} selected users): queued ${queuedCount}`);

  return {
    success: true,
    targetCount: targets.length,
    queuedCount,
    message: queuedCount === 0 ? 'No unredeemed codes to apply' : `Queued ${queuedCount} redemption(s), redeeming in the background`,
  };
});
