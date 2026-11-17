import {
  autoRedeemValidatedCodes,
  processRedemptionQueue,
  processRedemptionsForUsers,
  queueUnredeemedCodesForUser
} from '../../../services/redemptionService';
import { filterUsers, hasUserFilters } from '../../../utils/userFilters';
import { logger } from '../../../utils/logger';

/**
 * Apply the validated codes to the active users matching the user grid's filters (body), or to every
 * active user when no filter is set
 */
export default defineEventHandler(async (event) => {
  const filters = (await readBody(event).catch(() => null)) ?? {};
  const filtered = hasUserFilters(filters);

  try {
    let queuedCount = 0;
    let targets: string[] = [];
    if (filtered) {
      targets = filterUsers(filters).filter(u => u.active === 1).map(u => u.fid);
      for (const fid of targets) {
        queuedCount += await queueUnredeemedCodesForUser(fid, 5);
      }
    } else {
      // Queue validated codes for all active users
      queuedCount = await autoRedeemValidatedCodes();
    }

    if (queuedCount === 0) {
      return {
        success: true,
        targetCount: filtered ? targets.length : null,
        queuedCount: 0,
        processed: 0,
        successCount: 0,
        failedCount: 0,
        message: 'No unredeemed codes to apply',
      };
    }

    // Process the queue (only the targets' items when filtered)
    const result = filtered ? await processRedemptionsForUsers(targets) : await processRedemptionQueue(queuedCount);

    logger.info(`Admin apply-all${filtered ? ` (${targets.length} filtered users)` : ''}: queued ${queuedCount}, processed ${result.processed}, success ${result.success}, failed ${result.failed}`);

    return {
      success: true,
      targetCount: filtered ? targets.length : null,
      queuedCount,
      processed: result.processed,
      successCount: result.success,
      failedCount: result.failed,
      message: `Queued ${queuedCount}, processed ${result.processed} (${result.success} success, ${result.failed} failed)`,
    };
  } catch (error: any) {
    logger.error('Admin apply-all error:', error);
    throw createError({ statusCode: 500, message: error.message || 'Internal server error' });
  }
});
