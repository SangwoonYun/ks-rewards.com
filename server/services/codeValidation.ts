import { users, giftCodes, redemptions, queue } from '../db';
import { redeemGiftCode } from '../clients/kingshot';
import { classifyStatus } from '../domain/redemptionStatus';
import { applyCodeOutcome } from './redemptionExecutor';
import { kickQueueWorker } from './queueWorker';
import { logger } from '../utils/logger';
import { sleep } from '../utils/sleep';
import { config } from '../utils/config';

// Max test users to try when validating a code (a test user may have a wrong kid, be rate limited, etc.)
const MAX_VALIDATION_USERS = 3;

export interface ValidationResult {
  valid: boolean | null;   // null: inconclusive, the code's status is unchanged
  status: string;
  message: string;
}

/**
 * Validate a gift code by redeeming it for random active users (with a known kingdom).
 * Each attempt is a real redemption, so it is recorded like any other.
 * Valid: the code becomes validated. Expired/invalid: marked so and its queued items dropped.
 */
export async function validateGiftCode(code: string): Promise<ValidationResult> {
  const testUsers = users.findActive()
    .filter(u => u.kingdom)
    .map(u => ({ u, r: Math.random() }))
    .sort((a, b) => a.r - b.r)
    .slice(0, MAX_VALIDATION_USERS)
    .map(({ u }) => u);

  if (testUsers.length === 0) {
    logger.warn('No active user with a known server available for validation');
    return { valid: null, status: 'NO_TEST_USER', message: 'No registered user available to validate the code' };
  }

  let status = 'UNKNOWN';
  let message = '';
  for (const testUser of testUsers) {
    logger.info(`Using active user ${testUser.fid} (kid ${testUser.kingdom}) for validation of ${code}`);
    ({ status, message } = await redeemGiftCode(testUser.fid, testUser.kingdom!, code));
    redemptions.create(testUser.fid, code, status);

    const outcome = classifyStatus(status);
    // Problem with this test user, not the code: try another user
    if (outcome === 'playerError' || outcome === 'retryable') {
      logger.warn(`⚠️ Test user ${testUser.fid} could not validate ${code} - status: ${status}`);
      continue;
    }
    break;
  }

  const outcome = classifyStatus(status);
  switch (outcome) {
    case 'success':
    case 'ineligible':
      giftCodes.updateStatus(code, 'validated');
      logger.info(`✅ Gift code ${code} validated - status: ${status}`);
      return { valid: true, status, message };
    case 'codeExpired':
    case 'codeInvalid':
      applyCodeOutcome(code, outcome);
      logger.warn(`❌ Gift code ${code} is ${outcome === 'codeExpired' ? 'expired' : 'invalid'} - status: ${status}`);
      return { valid: false, status, message };
    case 'unknown':
      // Truly unrecognized status: mark invalid only as a last resort
      applyCodeOutcome(code, 'codeInvalid');
      logger.warn(`❌ Gift code ${code} marked invalid (unrecognized status) - status: ${status}`);
      return { valid: false, status, message };
    default:
      // playerError / retryable from every test user, or transient: the code's status is unchanged
      logger.warn(`⚠️ Gift code ${code} validation inconclusive - status: ${status}`);
      return { valid: null, status, message };
  }
}

/**
 * Validate every pending code; newly validated codes are queued for every active user
 */
export async function validatePendingCodes() {
  const pendingCodes = giftCodes.findByStatus('pending');
  let valid = 0;
  let invalid = 0;

  for (const { code } of pendingCodes) {
    const result = await validateGiftCode(code);
    if (result.valid === true) valid++;
    else if (result.valid === false) invalid++;
    await sleep(config.retry.redeemDelayMs);
  }

  const uncertain = pendingCodes.length - valid - invalid;
  if (pendingCodes.length > 0) {
    logger.info(`Pending code validation: ${valid} valid, ${invalid} invalid, ${uncertain} uncertain`);
  }
  if (valid > 0) {
    queue.enqueue();
    kickQueueWorker();
  }
  return { processed: pendingCodes.length, valid, invalid, uncertain };
}

/**
 * Re-check the validated codes for expiry
 */
export async function validateExistingCodes() {
  const validatedCodes = giftCodes.findByStatus('validated');
  let expired = 0;
  for (const { code } of validatedCodes) {
    const result = await validateGiftCode(code);
    if (result.valid === false) expired++;
    await sleep(config.retry.redeemDelayMs);
  }
  logger.info(`Validated code check: ${validatedCodes.length} checked, ${expired} no longer valid`);
  return { checked: validatedCodes.length, expired };
}

/**
 * Validate one code again, whatever its status (except deleted). A code checked from invalid goes through
 * pending so the result can be written; an inconclusive check puts it back to invalid.
 * A code found valid is queued for every active user.
 */
export async function revalidateCode(code: string) {
  const previousStatus = giftCodes.findByCode(code)?.validation_status;
  if (previousStatus === 'invalid') giftCodes.updateStatus(code, 'pending');

  let result: ValidationResult;
  try {
    result = await validateGiftCode(code);
  } catch (error) {
    if (previousStatus === 'invalid') giftCodes.updateStatus(code, 'invalid');
    throw error;
  }
  if (result.valid === null && previousStatus === 'invalid') {
    giftCodes.updateStatus(code, 'invalid');
  }
  if (result.valid === true) {
    queue.enqueue({ code });
    kickQueueWorker();
  }

  return { previousStatus, currentStatus: giftCodes.findByCode(code)?.validation_status ?? previousStatus, result };
}

/**
 * Re-validate the codes that were marked invalid
 */
export async function revalidateInvalidCodes() {
  const invalidCodes = giftCodes.findByStatus('invalid');
  const restoredList: string[] = [];
  let stillInvalid = 0;
  let transient = 0;

  for (const { code } of invalidCodes) {
    try {
      const { result } = await revalidateCode(code);
      if (result.valid === true) restoredList.push(code);
      else if (result.valid === null) transient++;
      else stillInvalid++;
    } catch (error) {
      transient++;
      logger.error(`Error revalidating code ${code}:`, error);
    }
    await sleep(config.retry.redeemDelayMs);
  }

  logger.info(`Revalidation complete: ${restoredList.length} restored, ${stillInvalid} still invalid, ${transient} transient`);
  return { processed: invalidCodes.length, restored: restoredList.length, restoredList, stillInvalid, transient };
}
