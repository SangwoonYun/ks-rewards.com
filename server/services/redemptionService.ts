import { queue, redemptions, users, giftCodes, priorityUsers, type User, type GiftCode, type Redemption, type QueueItem } from '../utils/db';
import {
  redeemGiftCode,
  normalizeStatus,
  SUCCESS_STATUSES,
  CODE_EXPIRED_STATUSES,
  CODE_INVALID_STATUSES,
  PLAYER_INELIGIBLE_STATUSES,
  PLAYER_ERROR_STATUSES,
  RETRYABLE_STATUSES
} from './kingshotApi';
import { logger } from '../utils/logger';
import { config } from '../utils/config';

// Max test users to try when validating a code (a test user may have a wrong kid, be rate limited, etc.)
const MAX_VALIDATION_USERS = 3;

// Max redemption attempts per queue item for retryable statuses (TIMEOUT_RETRY, TOO_FREQUENT, USER_INFO_ERROR)
const MAX_QUEUE_ATTEMPTS = 3;

/**
 * USER_INFO_ERROR can be temporary, so it gets the same retry budget as other retryable statuses
 * before the user counts as a kingdom mismatch: the item stays pending and the next queue run retries it.
 * `attempts` must already include the attempt that just failed.
 * Returns true if the item was kept for a retry.
 */
export function keepForUserInfoRetry(item: { id: number; fid: string; code: string }, attempts: number, message: string): boolean {
  if (attempts >= MAX_QUEUE_ATTEMPTS) return false;

  queue.updateStatus(item.id, 'pending', message);
  logger.warn(`⏳ USER_INFO_ERROR for ${item.fid} / ${item.code} (attempt ${attempts}/${MAX_QUEUE_ATTEMPTS}), will retry`);
  return true;
}

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
    // Use random active users (with a known server/kingdom) as test players
    const activeUsers: User[] = users.findActive().filter(u => u.kingdom);
    const testUsers = activeUsers
      .map(u => ({ u, r: Math.random() }))
      .sort((a, b) => a.r - b.r)
      .map(({ u }) => u)
      .slice(0, MAX_VALIDATION_USERS);

    if (testUsers.length === 0) {
      logger.warn('No active user with a known server available for validation');
      return {
        valid: null,
        status: 'NO_TEST_USER',
        message: 'No registered user available to validate the code'
      };
    }

    let result = { success: false, status: 'UNKNOWN', message: '' };
    let normalizedStatus = 'UNKNOWN';

    for (const testUser of testUsers) {
      logger.info(`Using active user ${testUser.fid} (kid ${testUser.kingdom}) for validation`);

      result = await redeemGiftCode(testUser.fid, testUser.kingdom as string, code);
      normalizedStatus = normalizeStatus(result.status);

      // Problem with this test user, not the code: try another user
      if (PLAYER_ERROR_STATUSES.includes(normalizedStatus) || RETRYABLE_STATUSES.includes(normalizedStatus)) {
        logger.warn(`⚠️ Test user ${testUser.fid} could not validate ${code} - status: ${normalizedStatus}`);
        continue;
      }
      break;
    }

    if (PLAYER_ERROR_STATUSES.includes(normalizedStatus) || RETRYABLE_STATUSES.includes(normalizedStatus)) {
      logger.warn(`⚠️ Gift code ${code} validation inconclusive after ${testUsers.length} test user(s) - status: ${normalizedStatus}`);
      return {
        valid: null,
        status: normalizedStatus,
        message: result.message,
        details: 'No test user could validate the code, status unchanged'
      };
    }

    if (SUCCESS_STATUSES.includes(normalizedStatus)) {
      // Code is valid and was successfully redeemed
      giftCodes.updateValidation(code, 'validated');
      logger.info(`✅ Gift code ${code} validated successfully - status: ${normalizedStatus}`);
      return {
        valid: true,
        status: normalizedStatus,
        message: result.message,
        details: 'Successfully redeemed'
      };
    } else if (PLAYER_INELIGIBLE_STATUSES.includes(normalizedStatus)) {
      // Code is valid but has redemption restrictions
      giftCodes.updateValidation(code, 'validated');
      logger.info(`✅ Gift code ${code} is valid but has restrictions - status: ${normalizedStatus}`);
      return {
        valid: true,
        status: normalizedStatus,
        message: result.message,
        details: 'Valid but has restrictions'
      };
    } else if (CODE_EXPIRED_STATUSES.includes(normalizedStatus)) {
      // Code has expired (TIME_ERROR) or hit its claim limit (USED)
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
    } else if (CODE_INVALID_STATUSES.includes(normalizedStatus)) {
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
      const transientStatuses = ['NOT_LOGIN', 'SIGN_ERROR', 'INVALID_RESPONSE', 'ERROR', 'UNKNOWN'];
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
    if (existingRedemption && SUCCESS_STATUSES.includes(existingRedemption.status)) {
      logger.info(`FID ${fid} already redeemed code ${code} successfully`);
      queue.delete(id);
      return {
        success: true,
        cached: true,
        status: existingRedemption.status
      };
    }

    const user = users.findByFid(fid);
    // Deactivated after it was queued (or while this batch was running): never redeem for an inactive user
    if (user && user.active !== 1) {
      logger.info(`Skipping redemption for inactive FID ${fid}, code ${code}`);
      queue.delete(id);
      return {
        success: false,
        status: 'INACTIVE',
        message: 'User is inactive'
      };
    }

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

    const normalizedStatus = normalizeStatus(result.status);

    // Save redemption result
    redemptions.create(fid, code, normalizedStatus);

    // Update the gift code validation status if this reveals new information
    if (SUCCESS_STATUSES.includes(normalizedStatus) || PLAYER_INELIGIBLE_STATUSES.includes(normalizedStatus)) {
      const giftCode: GiftCode | undefined = giftCodes.findByCode(code);
      if (giftCode && giftCode.validation_status === 'pending') {
        giftCodes.updateValidation(code, 'validated');
      }
    } else if (CODE_EXPIRED_STATUSES.includes(normalizedStatus)) {
      // Mark as expired (not invalid) for TIME_ERROR and USED
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
    } else if (CODE_INVALID_STATUSES.includes(normalizedStatus)) {
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
    const doneStatuses = [
      ...SUCCESS_STATUSES,
      ...CODE_EXPIRED_STATUSES,
      ...CODE_INVALID_STATUSES,
      ...PLAYER_INELIGIBLE_STATUSES
    ];

    if (doneStatuses.includes(normalizedStatus)) {
      // Complete (success) or permanently failed (dead code / player not eligible)
      queue.delete(id);
    } else if (RETRYABLE_STATUSES.includes(normalizedStatus) && queueItem.attempts + 1 < MAX_QUEUE_ATTEMPTS) {
      // queueItem.attempts was read before this attempt was counted
      // Retry later
      queue.updateStatus(id, 'pending', result.message);
    } else if (normalizedStatus === 'USER_INFO_ERROR' && keepForUserInfoRetry(queueItem, queueItem.attempts + 1, result.message)) {
      // Kept for a retry; only a USER_INFO_ERROR on the last attempt counts as a kingdom mismatch
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
 * Process the pending queue items of the given users only (an admin apply for a filtered set of users)
 */
export async function processRedemptionsForUsers(fids: string[]) {
  let processed = 0;
  let successCount = 0;
  let failedCount = 0;
  for (const fid of fids) {
    for (const item of queue.getPendingByFid(fid, 100)) {
      queue.updateStatus(item.id, 'processing', undefined);
      const result = await processRedemption(item);
      processed++;
      if (result.success) successCount++;
      else failedCount++;
      // Delay between redemptions to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, config.retry.redeemDelayMs));
    }
  }
  return { processed, success: successCount, failed: failedCount };
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
    const skipStatuses = [...SUCCESS_STATUSES, ...PLAYER_INELIGIBLE_STATUSES];

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
    if (users.findByFid(fid)?.active !== 1) {
      logger.info(`Not queueing codes for inactive user ${fid}`);
      return 0;
    }

    const validCodes: GiftCode[] = giftCodes.findValid();
    let queuedCount = 0;

    // Skip users who already succeeded or permanently failed
    const skipStatuses = [...SUCCESS_STATUSES, ...PLAYER_INELIGIBLE_STATUSES];

    for (const giftCode of validCodes) {
      // Check if already redeemed
      const existing: Redemption | undefined = redemptions.findByFidAndCode(fid, giftCode.code);
      if (existing && skipStatuses.includes(existing.status)) {
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
 * Queue unredeemed codes for a user and redeem them right away (new user / kingdom change)
 */
export async function redeemNowForUser(fid: string, kid: string): Promise<number> {
  const queuedCount = await queueUnredeemedCodesForUser(fid, 10); // High priority for new/updated users
  if (queuedCount === 0) return 0;

  logger.info(`🚀 Starting immediate redemption for ${fid}`);
  let redeemedCount = 0;

  try {
    const userItems = queue.getPendingByFid(fid, 100);

    for (const item of userItems) {
      try {
        // Mark as processing
        queue.updateStatus(item.id, 'processing', undefined);

        // Perform the redemption
        const result = await redeemGiftCode(fid, kid, item.code);
        const normalizedStatus = normalizeStatus(result.status);

        // Save redemption result
        redemptions.create(fid, item.code, normalizedStatus);

        if (SUCCESS_STATUSES.includes(normalizedStatus)) {
          redeemedCount++;
          logger.info(`✅ Immediately redeemed ${item.code} for ${fid}: ${normalizedStatus}`);
        } else {
          logger.warn(`⚠️ Redemption failed for ${item.code}: ${normalizedStatus}`);
        }

        // Remove from queue, unless a USER_INFO_ERROR (possibly temporary) still has retries left
        if (!(normalizedStatus === 'USER_INFO_ERROR' && keepForUserInfoRetry(item, item.attempts + 1, result.message))) {
          queue.delete(item.id);
        }

        // Delay to avoid rate limiting (note: additional rate limiting happens in kingshotApi.ts)
        await new Promise(resolve => setTimeout(resolve, 1500));
      } catch (error) {
        logger.error(`Error redeeming ${item.code} for ${fid}:`, error);
        queue.updateStatus(item.id, 'failed', 'Redemption error');
      }
    }

    logger.info(`🎉 Immediate redemption complete for ${fid}: ${redeemedCount}/${userItems.length} successful`);
  } catch (error) {
    logger.error(`Error in immediate redemption for ${fid}:`, error);
  }

  return redeemedCount;
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

        if (validationResult.valid === true) {
          validCount++;
          logger.info(`✅ Gift code ${code.code} validated successfully with status: ${validationResult.status}`);
        } else if (validationResult.valid === false) {
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