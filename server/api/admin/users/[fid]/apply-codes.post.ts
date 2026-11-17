import { queue, redemptions, users } from '../../../../utils/db';
import { queueUnredeemedCodesForUser, keepForUserInfoRetry } from '../../../../services/redemptionService';
import { redeemGiftCode, normalizeStatus, SUCCESS_STATUSES } from '../../../../services/kingshotApi';
import { logger } from '../../../../utils/logger';

export default defineEventHandler(async (event) => {
  const fid = getRouterParam(event, 'fid');

  if (!fid) {
    throw createError({ statusCode: 400, message: 'FID is required' });
  }

  const user = users.findByFid(fid);
  if (!user || !user.kingdom) {
    throw createError({ statusCode: 400, message: 'No server/kingdom on record for this user' });
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

        const result = await redeemGiftCode(fid, user.kingdom as string, item.code);
        const normalizedStatus = normalizeStatus(result.status);

        redemptions.create(fid, item.code, normalizedStatus);

        if (SUCCESS_STATUSES.includes(normalizedStatus)) {
          redeemedCount++;
          logger.info(`Admin apply: redeemed ${item.code} for ${fid}: ${normalizedStatus}`);
        } else {
          logger.warn(`Admin apply: failed ${item.code} for ${fid}: ${normalizedStatus}`);
        }

        // Remove from queue, unless a USER_INFO_ERROR (possibly temporary) still has retries left
        if (!(normalizedStatus === 'USER_INFO_ERROR' && keepForUserInfoRetry(item, item.attempts + 1, result.message))) {
          queue.delete(item.id);
        }

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
