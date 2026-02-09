import { queue, redemptions } from '../../../../utils/db';
import { queueUnredeemedCodesForUser } from '../../../../services/redemptionService';
import { redeemGiftCode } from '../../../../services/kingshotApi';
import { logger } from '../../../../utils/logger';

export default defineEventHandler(async (event) => {
  const fid = getRouterParam(event, 'fid');

  if (!fid) {
    throw createError({ statusCode: 400, message: 'FID is required' });
  }

  try {
    // Queue all validated but unredeemed codes for this user
    const queuedCount = await queueUnredeemedCodesForUser(fid, 5);

    if (queuedCount === 0) {
      return {
        success: true,
        queuedCount: 0,
        redeemedCount: 0,
        message: 'No unredeemed codes to apply',
      };
    }

    // Immediately process the queued items for this user
    const userItems = queue.getPendingByFid(fid, 100);
    let redeemedCount = 0;

    for (const item of userItems) {
      try {
        queue.updateStatus(item.id, 'processing', undefined);

        const result = await redeemGiftCode(fid, item.code);
        const normalizedStatus = result.status?.toString().trim().replace(/[.!?]+$/, '').toUpperCase() || 'UNKNOWN';

        redemptions.create(fid, item.code, normalizedStatus);

        if (['SUCCESS', 'RECEIVED', 'SAME_TYPE_EXCHANGE'].includes(normalizedStatus)) {
          redeemedCount++;
          logger.info(`Admin apply: redeemed ${item.code} for ${fid}: ${normalizedStatus}`);
        } else {
          logger.warn(`Admin apply: failed ${item.code} for ${fid}: ${normalizedStatus}`);
        }

        queue.delete(item.id);

        // Delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1500));
      } catch (error) {
        logger.error(`Admin apply: error redeeming ${item.code} for ${fid}:`, error);
        queue.updateStatus(item.id, 'failed', 'Redemption error');
      }
    }

    logger.info(`Admin apply codes for ${fid}: ${redeemedCount}/${userItems.length} successful`);

    return {
      success: true,
      queuedCount,
      redeemedCount,
      message: `Applied ${redeemedCount}/${queuedCount} codes successfully`,
    };
  } catch (error: any) {
    logger.error(`Admin apply codes error for ${fid}:`, error);
    throw createError({ statusCode: 500, message: error.message || 'Internal server error' });
  }
});
