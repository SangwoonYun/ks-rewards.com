import { users, queue } from '../../utils/db';
import { redeemGiftCode } from '../../services/kingshotApi';
import { queueUnredeemedCodesForUser } from '../../services/redemptionService';
import { logger } from '../../utils/logger';

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const { fid, kid } = body;

    if (!fid) {
      return {
        success: false,
        error: 'FID is required'
      };
    }

    if (!kid) {
      return {
        success: false,
        error: 'Server number (kid) is required'
      };
    }

    // Validate FID and kid format
    if (!/^\d+$/.test(fid)) {
      return {
        success: false,
        error: 'FID must be numeric'
      };
    }

    if (!/^\d+$/.test(String(kid))) {
      return {
        success: false,
        error: 'Server number must be numeric'
      };
    }

    // Check if user already exists
    const existingUser = await users.findByFid(fid);
    if (existingUser) {
      // Update the server/kingdom if it has changed
      if (String(kid) !== existingUser.kingdom) {
        await users.updateKingdom(fid, String(kid));
        logger.info(`✅ Updated kingdom for ${fid}: ${existingUser.kingdom} -> ${kid}`);
      }

      return {
        success: true,
        message: 'User already registered',
        user: {
          ...existingUser,
          kingdom: String(kid)
        },
        redeemedCount: 0,
        alreadyRegistered: true
      };
    }

    // Create new user
    await users.create(fid, null, 1);
    await users.updateKingdom(fid, String(kid));
    const user = await users.findByFid(fid);

    // Queue unredeemed codes for this user
    const queuedCount = await queueUnredeemedCodesForUser(fid, 10); // High priority for new users

    logger.info(`✅ User registered: ${fid} (kid ${kid}), ${queuedCount} codes queued`);

    // Immediately process redemptions for this new user
    let redeemedCount = 0;
    if (queuedCount > 0) {
      logger.info(`🚀 Starting immediate redemption for new user ${fid}`);

      try {
        // Get pending items for this user
        const userItems = queue.getPendingByFid(fid, 100);

        for (const item of userItems) {
          try {
            // Mark as processing
            await queue.updateStatus(item.id, 'processing', undefined);

            // Perform the redemption
            const result = await redeemGiftCode(fid, String(kid), item.code);
            const normalizedStatus = result.status?.toString().trim().replace(/[.!?]+$/, '').toUpperCase() || 'UNKNOWN';

            // Save redemption result
            const { redemptions } = await import('../../utils/db');
            await redemptions.create(fid, item.code, normalizedStatus);

            if (['SUCCESS', 'RECEIVED', 'SAME_TYPE_EXCHANGE'].includes(normalizedStatus)) {
              redeemedCount++;
              logger.info(`✅ Immediately redeemed ${item.code} for ${fid}: ${normalizedStatus}`);
            } else {
              logger.warn(`⚠️ Redemption failed for ${item.code}: ${normalizedStatus}`);
            }

            // Remove from queue
            await queue.delete(item.id);

            // Delay to avoid rate limiting (note: additional rate limiting happens in kingshotApi.ts)
            await new Promise(resolve => setTimeout(resolve, 1500));
          } catch (error) {
            logger.error(`Error redeeming ${item.code} for ${fid}:`, error);
            await queue.updateStatus(item.id, 'failed', 'Redemption error');
          }
        }

        logger.info(`🎉 Immediate redemption complete for ${fid}: ${redeemedCount}/${userItems.length} successful`);
      } catch (error) {
        logger.error(`Error in immediate redemption for ${fid}:`, error);
      }
    }

    return {
      success: true,
      message: 'User registered successfully',
      user,
      redeemedCount
    };
  } catch (error: any) {
    logger.error('Error registering user:', error);
    return {
      success: false,
      error: 'Internal server error',
      message: error?.message || String(error)
    };
  }
});
