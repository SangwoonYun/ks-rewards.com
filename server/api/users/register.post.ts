import { users, queue } from '../../utils/db';
import { validatePlayerId, redeemGiftCode } from '../../services/kingshotApi';
import { queueUnredeemedCodesForUser } from '../../services/redemptionService';
import { logger } from '../../utils/logger';

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const { fid } = body;

    if (!fid) {
      return {
        success: false,
        error: 'FID is required'
      };
    }

    // Validate FID format
    if (!/^\d+$/.test(fid)) {
      return {
        success: false,
        error: 'FID must be numeric'
      };
    }

    // Validate the FID with Kingshot API (always do this to get current nickname)
    logger.info(`Validating user FID: ${fid}`);
    const validation = await validatePlayerId(fid);

    if (!validation.success) {
      return {
        success: false,
        error: `Invalid FID: ${validation.error}`
      };
    }

    // Check if user already exists
    const existingUser = await users.findByFid(fid);
    if (existingUser) {
      // Update nickname, kingdom, and avatar if they have changed
      if (validation.nickname && validation.nickname !== existingUser.nickname) {
        await users.updateNickname(fid, validation.nickname);
        logger.info(`✅ Updated nickname for ${fid}: ${existingUser.nickname} -> ${validation.nickname}`);
      }
      if (validation.kingdom && validation.kingdom !== existingUser.kingdom) {
        await users.updateKingdom(fid, validation.kingdom);
        logger.info(`✅ Updated kingdom for ${fid}: ${existingUser.kingdom} -> ${validation.kingdom}`);
      }
      if (validation.avatar_url && validation.avatar_url !== existingUser.avatar_url) {
        await users.updateAvatar(fid, validation.avatar_url);
        logger.info(`✅ Updated avatar for ${fid}`);
      }

      return {
        success: true,
        message: 'User already registered',
        user: {
          ...existingUser,
          nickname: validation.nickname || existingUser.nickname,
          kingdom: validation.kingdom || existingUser.kingdom,
          avatar_url: validation.avatar_url || existingUser.avatar_url
        },
        redeemedCount: 0,
        alreadyRegistered: true
      };
    }

    // Create new user
    await users.create(fid, validation.nickname || null, 1);
    const user = await users.findByFid(fid);

    // Update kingdom and avatar if available
    if (validation.kingdom && user) {
      await users.updateKingdom(fid, validation.kingdom);
    }
    if (validation.avatar_url && user) {
      await users.updateAvatar(fid, validation.avatar_url);
    }

    // Queue unredeemed codes for this user
    const queuedCount = await queueUnredeemedCodesForUser(fid, 10); // High priority for new users

    logger.info(`✅ User registered: ${fid} (${validation.nickname}), ${queuedCount} codes queued`);

    // Immediately process redemptions for this new user
    let redeemedCount = 0;
    if (queuedCount > 0) {
      logger.info(`🚀 Starting immediate redemption for new user ${fid}`);

      try {
        // Get all pending items for this user
        const pendingItems = await queue.getPending(100);
        const userItems = pendingItems.filter(item => item.fid === fid);

        for (const item of userItems) {
          try {
            // Mark as processing
            await queue.updateStatus(item.id, 'processing', undefined);

            // Perform the redemption
            const result = await redeemGiftCode(fid, item.code);
            const normalizedStatus = result.status?.toString().trim().replace(/[.!?]+$/, '').toUpperCase() || 'UNKNOWN';

            // Save redemption result
            const { redemptions } = await import('../../utils/db');
            await redemptions.create(fid, item.code, normalizedStatus);

            if (normalizedStatus == 'SUCCESS') {
              redeemedCount++;
              logger.info(`✅ Immediately redeemed ${item.code} for ${fid}: ${normalizedStatus}`);
            } else {
              logger.warn(`⚠️ Redemption failed for ${item.code}: ${normalizedStatus}`);
            }

            // Remove from queue
            await queue.delete(item.id);

            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 1000));
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
