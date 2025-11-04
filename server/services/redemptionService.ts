import { queue, redemptions, users, giftCodes, type User, type GiftCode, type Redemption, type QueueItem } from '../utils/db';
import {redeemGiftCode, validatePlayerId} from './kingshotApi';
import { logger } from '../utils/logger';

const DELAY_BETWEEN_REDEMPTIONS = parseInt(process.env.REDEEM_DELAY_MS || '3000');

interface RedemptionQueueItem {
  id: number;
  fid: string;
  code: string;
  attempts: number;
  [key: string]: any;
}

/**
 * Validate a gift code using a test player ID
 */
export async function validateGiftCode(code: string) {
  try {
    // Try to use a random active user for validation
    const activeUsers: User[] = users.findActive();
    let testFid = '27370737'; // Default test FID

    if (activeUsers.length > 0) {
      const randomUser = activeUsers[Math.floor(Math.random() * activeUsers.length)];
      testFid = randomUser.fid;
      logger.info(`Using random active user ${testFid} for validation`);
    } else {
      logger.info(`Using default test FID ${testFid} for validation`);
    }

    // First validate the player ID to ensure we can log in
    const loginResult = await validatePlayerId(testFid);
    if (!loginResult.success) {
      logger.warn(`Failed to validate player ${testFid}: ${loginResult.error}`);
      if (activeUsers.length > 1) {
        // Try another random user
        const otherUsers = activeUsers.filter(u => u.fid !== testFid);
        const backupUser = otherUsers[Math.floor(Math.random() * otherUsers.length)];
        testFid = backupUser.fid;
        logger.info(`Trying backup user ${testFid} for validation`);
        const backupLoginResult = await validatePlayerId(testFid);
        if (!backupLoginResult.success) {
          logger.error(`Failed to validate backup player ${testFid}: ${backupLoginResult.error}`);
          return {
            valid: null,
            status: 'LOGIN_FAILED',
            message: 'Could not authenticate test players'
          };
        }
      } else {
        return {
          valid: null,
          status: 'LOGIN_FAILED',
          message: 'Could not authenticate test player'
        };
      }
    }

    // Now try to redeem the code
    const result = await redeemGiftCode(testFid, code);

    // Map validation statuses - keep consistent across all functions
    const validationStatuses = {
      success: ['SUCCESS', 'RECEIVED', 'SAME_TYPE_EXCHANGE'],
      valid: ['TOO_SMALL_SPEND_MORE', 'TOO_POOR_SPEND_MORE'],
      expired: ['TIME_ERROR', 'USAGE_LIMIT'],
      invalid: ['CDK_NOT_FOUND']
    };

    // Normalize the status by trimming, removing trailing punctuation, and converting to uppercase
    const normalizedStatus = result.status?.toString().trim().replace(/[.!?]+$/, '').toUpperCase() || 'UNKNOWN';

    if (validationStatuses.success.includes(normalizedStatus)) {
      // Code is valid and was successfully redeemed
      giftCodes.updateValidation(code, 'validated');
      logger.info(`✅ Gift code ${code} validated successfully - status: ${normalizedStatus}`);
      return {
        valid: true,
        status: normalizedStatus,
        message: result.message,
        details: 'Successfully redeemed'
      };
    } else if (validationStatuses.valid.includes(normalizedStatus)) {
      // Code is valid but has redemption restrictions
      giftCodes.updateValidation(code, 'validated');
      logger.info(`✅ Gift code ${code} is valid but has restrictions - status: ${normalizedStatus}`);
      return {
        valid: true,
        status: normalizedStatus,
        message: result.message,
        details: 'Valid but has restrictions'
      };
    } else if (validationStatuses.expired.includes(normalizedStatus)) {
      // Code has expired (TIME_ERROR or USAGE_LIMIT)
      giftCodes.updateValidation(code, 'expired');
      logger.warn(`⏱️ Gift code ${code} has expired - status: ${normalizedStatus}`);

      // Remove any queued redemption attempts for this expired code
      try {
        const res = queue.deleteByCode(code);
        logger.info(`Removed ${res.changes || 0} queued redemption(s) for expired code ${code}`);
      } catch (err) {
        logger.error(`Error removing queued redemptions for expired code ${code}:`, err);
      }

      return {
        valid: false,
        status: normalizedStatus,
        message: result.message,
        details: 'Code expired'
      };
    } else if (validationStatuses.invalid.includes(normalizedStatus)) {
      // Code is invalid (CDK_NOT_FOUND)
      giftCodes.markInvalid(code);
      logger.warn(`❌ Gift code ${code} marked invalid - status: ${normalizedStatus}`);

      // Remove any queued redemption attempts for this invalid code
      try {
        const res = queue.deleteByCode(code);
        logger.info(`Removed ${res.changes || 0} queued redemption(s) for invalid code ${code}`);
      } catch (err) {
        logger.error(`Error removing queued redemptions for invalid code ${code}:`, err);
      }

      return {
        valid: false,
        status: normalizedStatus,
        message: result.message,
        details: 'Invalid code'
      };
    } else {
      // Any other unknown status is treated as invalid to prevent endless pending states
      giftCodes.markInvalid(code);
      logger.warn(`❌ Gift code ${code} marked invalid (unknown status) - status: ${normalizedStatus}`);

      // Remove any queued redemption attempts for this invalid code
      try {
        const res = queue.deleteByCode(code);
        logger.info(`Removed ${res.changes || 0} queued redemption(s) for invalid code ${code}`);
      } catch (err) {
        logger.error(`Error removing queued redemptions for invalid code ${code}:`, err);
      }

      return {
        valid: false,
        status: normalizedStatus,
        message: result.message,
        details: 'Invalid or unrecognized code'
      };
    }
  } catch (error: any) {
    logger.error(`Error validating gift code ${code}:`, error);
    return {
      valid: null,
      status: 'ERROR',
      message: error.message
    };
  }
}

/**
 * Process single redemption from the queue
 */
async function processRedemption(queueItem: RedemptionQueueItem) {
  const { id, fid, code } = queueItem;

  try {
    logger.info(`Processing redemption: FID ${fid}, Code ${code}`);

    // Check if already redeemed successfully
    const existingRedemption: Redemption | undefined = redemptions.findByFidAndCode(fid, code);
    if (existingRedemption && ['SUCCESS', 'RECEIVED', 'SAME_TYPE_EXCHANGE'].includes(existingRedemption.status)) {
      logger.info(`FID ${fid} already redeemed code ${code} successfully`);
      queue.delete(id);
      return {
        success: true,
        cached: true,
        status: existingRedemption.status
      };
    }

    // Perform the redemption (this also validates the player and gets the current nickname)
    const result = await redeemGiftCode(fid, code);

    // Update user nickname, kingdom, and avatar if we got them from the redemption
    if (result.nickname || result.kingdom || result.avatar_url) {
      const user = users.findByFid(fid);
      if (user) {
        if (result.nickname && user.nickname !== result.nickname) {
          users.updateNickname(fid, result.nickname);
          logger.info(`Updated nickname for ${fid}: ${user.nickname} -> ${result.nickname}`);
        }
        if (result.kingdom && user.kingdom !== result.kingdom) {
          users.updateKingdom(fid, result.kingdom);
          logger.info(`Updated kingdom for ${fid}: ${user.kingdom} -> ${result.kingdom}`);
        }
        if (result.avatar_url && user.avatar_url !== result.avatar_url) {
          users.updateAvatar(fid, result.avatar_url);
          logger.info(`Updated avatar for ${fid}`);
        }
      }
    }

    // Normalize status for comparison (remove trailing punctuation)
    const normalizedStatus = result.status?.toString().trim().replace(/[.!?]+$/, '').toUpperCase() || 'UNKNOWN';

    // Save redemption result
    redemptions.create(fid, code, normalizedStatus);

    // Update the gift code validation status if this reveals new information
    if (['SUCCESS', 'RECEIVED', 'SAME_TYPE_EXCHANGE'].includes(normalizedStatus)) {
      const giftCode: GiftCode | undefined = giftCodes.findByCode(code);
      if (giftCode && giftCode.validation_status === 'pending') {
        giftCodes.updateValidation(code, 'validated');
      }
    } else if (['TIME_ERROR', 'USAGE_LIMIT'].includes(normalizedStatus)) {
      // Mark as expired (not invalid) for TIME_ERROR and USAGE_LIMIT
      const giftCode: GiftCode | undefined = giftCodes.findByCode(code);
      if (giftCode && giftCode.validation_status === 'validated') {
        giftCodes.updateValidation(code, 'expired');
        logger.warn(`⏱️ Previously validated code ${code} has now expired`);
      } else {
        giftCodes.updateValidation(code, 'expired');
      }

      // Remove any queued redemption attempts for this expired code
      try {
        const res = queue.deleteByCode(code);
        logger.info(`Removed ${res.changes || 0} queued redemption(s) for expired code ${code}`);
      } catch (err) {
        logger.error(`Error removing queued redemptions for expired code ${code}:`, err);
      }
    } else if (['CDK_NOT_FOUND'].includes(normalizedStatus)) {
      giftCodes.markInvalid(code);

      // Remove any queued redemption attempts for this invalid code
      try {
        const res = queue.deleteByCode(code);
        logger.info(`Removed ${res.changes || 0} queued redemption(s) for invalid code ${code}`);
      } catch (err) {
        logger.error(`Error removing queued redemptions for invalid code ${code}:`, err);
      }
    }

    // Update queue status
    const successStatuses = ['SUCCESS', 'RECEIVED', 'SAME_TYPE_EXCHANGE'];
    const permanentFailureStatuses = ['TIME_ERROR', 'CDK_NOT_FOUND', 'CDK NOT FOUND', 'USAGE_LIMIT'];

    if (successStatuses.includes(normalizedStatus) || permanentFailureStatuses.includes(normalizedStatus)) {
      // Complete (success) or permanently failed (invalid code)
      queue.delete(id);
    } else if (normalizedStatus === 'TIMEOUT_RETRY' && queueItem.attempts < 3) {
      // Retry later
      queue.updateStatus(id, 'pending', result.message);
    } else {
      // Failed permanently
      queue.updateStatus(id, 'failed', result.message);
    }

    return {
      success: result.success,
      status: normalizedStatus,
      message: result.message
    };
  } catch (error: any) {
    logger.error(`Error processing redemption for ${fid}:`, error);
    queue.updateStatus(queueItem.id, 'failed', error.message);
    return {
      success: false,
      status: 'ERROR',
      message: error.message
    };
  }
}

/**
 * Process pending redemptions from the queue
 * Note: Code validation is now handled by the discovery scheduler and new user registration.
 * This function focuses solely on processing queued redemptions.
 */
export async function processRedemptionQueue(batchSize: number = 100, validatePending: boolean = false) {
  try {
    // Optional: validate pending codes if explicitly requested (e.g., on startup or for safety)
    if (validatePending) {
      let codesValidated = false;

      const pendingCodes = giftCodes.findByStatus('pending');
      if (pendingCodes.length > 0) {
        logger.info(`Found ${pendingCodes.length} pending codes to validate`);
        for (const code of pendingCodes) {
          try {
            const validationResult = await validateGiftCode(code.code);
            if (validationResult.valid === true) {
              codesValidated = true; // Track if any codes were validated
            }
            logger.info(`Validation result for ${code.code}: ${validationResult.status}`);
            // Add a small delay between validations
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (error) {
            logger.error(`Error validating code ${code.code}:`, error);
          }
        }

        // If any codes were validated, queue them for all active users
        if (codesValidated) {
          logger.info('New codes were validated, queueing for all active users...');
          const queuedCount = await autoRedeemValidatedCodes();
          logger.info(`Queued ${queuedCount} redemptions for validated codes`);
        }
      }
    }

    // Process redemptions from the queue
    const pendingItems: QueueItem[] = queue.getPending(batchSize);

    if (pendingItems.length === 0) {
      return {
        processed: 0,
        success: 0,
        failed: 0
      };
    }

    logger.info(`Processing ${pendingItems.length} pending redemptions...`);

    let successCount = 0;
    let failedCount = 0;

    for (const item of pendingItems) {
      // Mark as processing
      queue.updateStatus(item.id, 'processing', undefined);

      const result = await processRedemption(item);

      if (result.success) {
        successCount++;
      } else {
        failedCount++;
      }

      // Delay between redemptions to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REDEMPTIONS));
    }

    logger.info(`Redemption batch complete: ${successCount} success, ${failedCount} failed`);

    return {
      processed: pendingItems.length,
      success: successCount,
      failed: failedCount
    };
  } catch (error) {
    logger.error('Error processing redemption queue:', error);
    throw error;
  }
}

/**
 * Queue redemptions for all active users for a specific gift code
 */
export async function queueRedemptionsForCode(code: string, priority: number = 0, activeUsers?: User[]) {
  try {
    // Accept optional activeUsers to avoid repeated DB queries when called in loops
    const usersList: User[] = activeUsers ?? users.findActive();
    let queuedCount = 0;

    // Define success statuses consistently
    const successStatuses = ['SUCCESS', 'RECEIVED', 'SAME_TYPE_EXCHANGE'];

    for (const user of usersList) {
      // Check if already redeemed
      const existing: Redemption | undefined = redemptions.findByFidAndCode(user.fid, code);
      if (existing && successStatuses.includes(existing.status)) {
        continue;
      }

      queue.add(user.fid, code, priority);
      queuedCount++;
    }

    logger.info(`Queued ${queuedCount} redemptions for code ${code}`);
    return queuedCount;
  } catch (error) {
    logger.error(`Error queuing redemptions for code ${code}:`, error);
    throw error;
  }
}

/**
 * Queue unredeemed codes for a specific user
 */
export async function queueUnredeemedCodesForUser(fid: string, priority: number = 1) {
  try {
    const validCodes: GiftCode[] = giftCodes.findValid();
    let queuedCount = 0;

    // Define success statuses consistently
    const successStatuses = ['SUCCESS', 'RECEIVED', 'SAME_TYPE_EXCHANGE'];

    for (const giftCode of validCodes) {
      // Check if already redeemed
      const existing: Redemption | undefined = redemptions.findByFidAndCode(fid, giftCode.code);
      if (existing && successStatuses.includes(existing.status)) {
        continue;
      }

      queue.add(fid, giftCode.code, priority);
      queuedCount++;
    }

    logger.info(`Queued ${queuedCount} codes for user ${fid}`);
    return queuedCount;
  } catch (error) {
    logger.error(`Error queuing codes for user ${fid}:`, error);
    throw error;
  }
}

/**
 * Validate all pending gift codes immediately
 */
export async function validatePendingCodes() {
  try {
    const pendingCodes = giftCodes.findByStatus('pending');
    if (pendingCodes.length === 0) {
      logger.info('No pending codes to validate');
      return {
        processed: 0,
        valid: 0,
        invalid: 0
      };
    }

    logger.info(`Found ${pendingCodes.length} pending codes to validate`);
    let validCount = 0;
    let invalidCount = 0;

    for (const code of pendingCodes) {
      try {
        const validationResult = await validateGiftCode(code.code);

        // Map validation statuses
        const validationStatuses = {
          success: ['SUCCESS', 'RECEIVED', 'SAME_TYPE_EXCHANGE'],
          valid: ['TOO_SMALL_SPEND_MORE', 'TOO_POOR_SPEND_MORE'],
          expired: ['TIME_ERROR', 'USAGE_LIMIT'],
          invalid: ['CDK_NOT_FOUND', 'CDK NOT FOUND']
        };

        if (validationStatuses.success.includes(validationResult.status) || validationStatuses.valid.includes(validationResult.status)) {
          validCount++;
          logger.info(`✅ Gift code ${code.code} validated successfully with status: ${validationResult.status}`);
        } else if (validationStatuses.invalid.includes(validationResult.status)) {
          invalidCount++;
          logger.warn(`❌ Gift code ${code.code} is invalid with status: ${validationResult.status}`);
        } else {
          logger.warn(`⚠️ Gift code ${code.code} status is uncertain: ${validationResult.status}`);
        }

        // Add a small delay between validations
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        logger.error(`Error validating code ${code.code}:`, error);
      }
    }

    const uncertainCount = pendingCodes.length - validCount - invalidCount;
    logger.info(`Validation complete: ${validCount} valid, ${invalidCount} invalid, ${uncertainCount} uncertain`);

    return {
      processed: pendingCodes.length,
      valid: validCount,
      invalid: invalidCount,
      uncertain: uncertainCount
    };
  } catch (error) {
    logger.error('Error validating pending codes:', error);
    throw error;
  }
}

/**
 * Auto-redeem validated codes for all active users
 * Queues redemptions for all active users for all validated codes that they haven't redeemed yet
 */
export async function autoRedeemValidatedCodes() {
  try {
    const activeUsers: User[] = users.findActive();
    if (activeUsers.length === 0) {
      logger.info('No active users for auto-redemption');
      return 0;
    }

    const validatedCodes: GiftCode[] = giftCodes.findValid();
    if (validatedCodes.length === 0) {
      logger.info('No validated codes for auto-redemption');
      return 0;
    }

    logger.info(`Auto-redeeming ${validatedCodes.length} validated codes for ${activeUsers.length} users`);

    // Prefer a single bulk INSERT to queue validated codes for active users
    try {
      const res = queue.bulkQueueValidatedForUsers(0);
      const queuedCount = (res) ? res.changes : 0;
      logger.info(`Auto-redeem bulk queued ${queuedCount} redemptions`);
      return queuedCount;
    } catch (bulkErr) {
      logger.warn('Bulk queue operation failed, falling back to per-code queuing:', bulkErr);

      let queuedCount = 0;
      // Fallback: queue per code using the existing helper (with pre-fetched activeUsers)
      for (const code of validatedCodes) {
        try {
          const added = await queueRedemptionsForCode(code.code, 0, activeUsers);
          queuedCount += added;
        } catch (err) {
          logger.error(`Error queueing redemptions for validated code ${code.code}:`, err);
        }
      }

      logger.info(`Auto-redeem queued ${queuedCount} redemptions (fallback)`);
      return queuedCount;
    }
  } catch (error) {
    logger.error('Error in auto-redeem:', error);
    throw error;
  }
}