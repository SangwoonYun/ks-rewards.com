import { users } from '../../../../db';
import { queueAndRedeem } from '../../../../services/queueWorker';
import { requireFidParam } from '../../../../utils/http';
import { logger } from '../../../../utils/logger';

/**
 * Queue every validated code the user still needs (including ones that failed as a wrong kingdom:
 * an admin asking explicitly gets a retry) and redeem them in the background
 */
export default defineEventHandler((event) => {
  const fid = requireFidParam(event);

  const user = users.findByFid(fid);
  if (!user || !user.kingdom) {
    throw createError({ statusCode: 400, message: 'No server/kingdom on record for this user' });
  }

  const queuedCount = queueAndRedeem({ fid, priority: 5, retryKingdomMismatch: true });
  logger.info(`Admin apply codes for ${fid}: ${queuedCount} queued`);

  return {
    success: true,
    queuedCount,
    message: queuedCount === 0 ? 'No unredeemed codes to apply' : `Queued ${queuedCount} code(s), redeeming in the background`,
  };
});
