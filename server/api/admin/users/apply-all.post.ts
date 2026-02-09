import { autoRedeemValidatedCodes, processRedemptionQueue } from '../../../services/redemptionService';
import { logger } from '../../../utils/logger';

export default defineEventHandler(async () => {
  try {
    // Queue validated codes for all active users
    const queuedCount = await autoRedeemValidatedCodes();

    if (queuedCount === 0) {
      return {
        success: true,
        queuedCount: 0,
        processed: 0,
        successCount: 0,
        failedCount: 0,
        message: 'No unredeemed codes to apply',
      };
    }

    // Process the queue
    const result = await processRedemptionQueue(queuedCount);

    logger.info(`Admin apply-all: queued ${queuedCount}, processed ${result.processed}, success ${result.success}, failed ${result.failed}`);

    return {
      success: true,
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
