import { queue, redemptions, users, giftCodes, priorityUsers, type User, type GiftCode, type Redemption, type QueueItem } from '../utils/db';
import { redeemGiftCode } from './kingshotApi';
import { logger } from '../utils/logger';
import { config } from '../utils/config';

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
    // Use a random active user (with a known server/kingdom) as the test player
    const activeUsers: User[] = users.findActive().filter(u => u.kingdom);
    const testUser = activeUsers[Math.floor(Math.random() * activeUsers.length)];

    if (!testUser) {
      logger.warn('No active user with a known server available for validation');
      return {
        valid: null,
        status: 'NO_TEST_USER',
        message: 'No registered user available to validate the code'
      };
    }

    logger.info(`Using active user ${testUser.fid} (kid ${testUser.kingdom}) for validation`);

    // Now try to redeem the code
    const result = await redeemGiftCode(testUser.fid, testUser.kingdom as string, code);

    // Map validation statuses - keep consistent across all functions
    const validationStatuses = {
      success: ['SUCCESS', 'RECEIVED', 'SAME_TYPE_EXCHANGE', 'SAME TYPE EXCHANGE'],
      valid: ['TOO_SMALL_SPEND_MORE', 'TOO_POOR_SPEND_MORE', 'TOO SMALL SPEND MORE', 'TOO POOR SPEND MORE'],
      expired: ['TIME_ERROR', 'TIME ERROR', 'USAGE_LIMIT', 'USAGE LIMIT'],
      invalid: ['CDK_NOT_FOUND', 'CDK NOT FOUND']
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
      // Transient errors (network/server-side) — do not change the code's status
      const transientStatuses = ['TIMEOUT_RETRY', 'NOT_LOGIN', 'INVALID_RESPONSE', 'ERROR', 'UNKNOWN', 'LOGIN_FAILED'];
      if (transientStatuses.includes(normalizedStatus)) {
        logger.warn(`⚠️ Gift code ${code} validation skipped due to transient error - status: ${normalizedStatus}`);
        return {
          valid: null,
          status: normalizedStatus,
          message: result.message,
          details: 'Transient error, status unchanged'
        };
      }

      // Truly unrecognized status — mark invalid only as a last resort
      giftCodes.markInvalid(code);
      logger.warn(`❌ Gift code ${code} marked invalid (unrecognized status) - status: ${normalizedStatus}`);

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

    const user = users.findByFid(fid);
    if (!user || !user.kingdom) {
      logger.error(`Cannot redeem for FID ${fid}: no server/kingdom on record`);
      queue.updateStatus(id, 'failed', 'No server/kingdom on record for this user');
      return {
        success: false,
        status: 'NO_KID',
        message: 'No server/kingdom on record for this user'
      };
    }

    // Perform the redemption
    const result = await redeemGiftCode(fid, user.kingdom, code);

    // Normalize status for comparison (remove trailing punctuation)
    const normalizedStatus = result.status?.toString().trim().replace(/[.!?]+$/, '').toUpperCase() || 'UNKNOWN';

    // Save redemption result
    redemptions.create(fid, code, normalizedStatus);

    // Update the gift code validation status if this reveals new information
    if (['SUCCESS', 'RECEIVED', 'SAME_TYPE_EXCHANGE', 'SAME TYPE EXCHANGE'].includes(normalizedStatus)) {
      const giftCode: GiftCode | undefined = giftCodes.findByCode(code);
      if (giftCode && giftCode.validation_status === 'pending') {
        giftCodes.updateValidation(code, 'validated');
      }
    } else if (['TIME_ERROR', 'TIME ERROR', 'USAGE_LIMIT', 'USAGE LIMIT'].includes(normalizedStatus)) {
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
    } else if (['CDK_NOT_FOUND', 'CDK NOT FOUND'].includes(normalizedStatus)) {
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
    const successStatuses = ['SUCCESS', 'RECEIVED', 'SAME_TYPE_EXCHANGE', 'SAME TYPE EXCHANGE'];
    const permanentFailureStatuses = ['TIME_ERROR', 'TIME ERROR', 'CDK_NOT_FOUND', 'CDK NOT FOUND', 'USAGE_LIMIT', 'USAGE LIMIT'];

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
      await new Promise(resolve => setTimeout(resolve, config.retry.redeemDelayMs));
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

    // Skip users who already succeeded or permanently failed
    const skipStatuses = [
      'SUCCESS', 'RECEIVED', 'SAME_TYPE_EXCHANGE',
      'TOO_SMALL_SPEND_MORE', 'TOO SMALL SPEND MORE',
      'TOO_POOR_SPEND_MORE', 'TOO POOR SPEND MORE'
    ];

    // Priority users get their configured priority (if higher than default)
    const priorityFids = new Set(priorityUsers.getAllFids());

    for (const user of usersList) {
      const existing: Redemption | undefined = redemptions.findByFidAndCode(user.fid, code);
      if (existing && skipStatuses.includes(existing.status)) {
        continue;
      }

      const userPriority = priorityFids.has(user.fid)
        ? Math.max(priority, priorityUsers.getPriorityForFid(user.fid))
        : priority;
      queue.add(user.fid, code, userPriority);
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
          success: ['SUCCESS', 'RECEIVED', 'SAME_TYPE_EXCHANGE', 'SAME TYPE EXCHANGE'],
          valid: ['TOO_SMALL_SPEND_MORE', 'TOO_POOR_SPEND_MORE', 'TOO SMALL SPEND MORE', 'TOO POOR SPEND MORE'],
          expired: ['TIME_ERROR', 'TIME ERROR', 'USAGE_LIMIT', 'USAGE LIMIT'],
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

/**
 * Re-validate codes that were previously marked invalid.
 * Codes that turn out to be valid are restored to 'pending' for re-queueing.
 */
export async function revalidateInvalidCodes() {
  try {
    const invalidCodes = giftCodes.findByStatus('invalid');
    if (invalidCodes.length === 0) {
      logger.info('No invalid codes to revalidate');
      return { processed: 0, restored: 0, stillInvalid: 0, transient: 0 };
    }

    logger.info(`Revalidating ${invalidCodes.length} invalid code(s)...`);

    let restored = 0;
    let stillInvalid = 0;
    let transient = 0;
    const restoredList: string[] = [];

    for (const codeEntry of invalidCodes) {
      try {
        logger.info(`Revalidating previously-invalid code: ${codeEntry.code}`);
        // Temporarily set to pending so validateGiftCode can write the real outcome
        giftCodes.updateValidation(codeEntry.code, 'pending');

        const result = await validateGiftCode(codeEntry.code);

        if (result.valid === true) {
          restored++;
          restoredList.push(codeEntry.code);
          logger.info(`✅ Code ${codeEntry.code} restored to validated`);
        } else if (result.valid === null) {
          // Transient error — roll back to invalid rather than leaving as pending
          giftCodes.updateValidation(codeEntry.code, 'invalid');
          transient++;
          logger.warn(`⚠️ Code ${codeEntry.code} could not be checked (transient), kept invalid`);
        } else {
          stillInvalid++;
          logger.info(`Code ${codeEntry.code} confirmed invalid`);
        }

        await new Promise(resolve => setTimeout(resolve, 3000));
      } catch (error) {
        // On unexpected error roll back to invalid
        giftCodes.updateValidation(codeEntry.code, 'invalid');
        logger.error(`Error revalidating code ${codeEntry.code}:`, getErrorMessage(error));
      }
    }

    if (restored > 0) {
      logger.info(`Queueing ${restored} restored code(s) for all active users...`);
      await autoRedeemValidatedCodes();
    }

    logger.info(`Revalidation complete: ${restored} restored, ${stillInvalid} still invalid, ${transient} transient`);

    return {
      processed: invalidCodes.length,
      restored,
      restoredList,
      stillInvalid,
      transient
    };
  } catch (error) {
    logger.error('Error revalidating invalid codes:', getErrorMessage(error));
    return { success: false, error: getErrorMessage(error) };
  }
}