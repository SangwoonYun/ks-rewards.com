import { queue, redemptions, users, giftCodes, type QueueItem } from '../db';
import { redeemGiftCode } from '../clients/kingshot';
import { classifyStatus, isSettled, SUCCESS_STATUSES, type Outcome } from '../domain/redemptionStatus';
import { logger } from '../utils/logger';

// Max redemption attempts per queue item for retryable statuses and USER_INFO_ERROR (which can be temporary)
export const MAX_QUEUE_ATTEMPTS = 3;

export interface ExecutionResult {
  success: boolean;
  status: string;
  message: string;
}

/**
 * What a redeem result says about the code itself, applied to the code's status:
 * - redeemed or player-ineligible: the code works (a pending code becomes validated)
 * - expired / invalid: the code is dead for everyone, its queued items are dropped
 */
export function applyCodeOutcome(code: string, outcome: Outcome) {
  if (outcome === 'success' || outcome === 'ineligible') {
    if (giftCodes.findByCode(code)?.validation_status === 'pending') {
      giftCodes.updateStatus(code, 'validated');
    }
  } else if (outcome === 'codeExpired' || outcome === 'codeInvalid') {
    const status = outcome === 'codeExpired' ? 'expired' : 'invalid';
    if (giftCodes.findByCode(code)?.validation_status === 'validated') {
      logger.warn(`⏱️ Previously validated code ${code} is now ${status}`);
    }
    giftCodes.updateStatus(code, status);
    const removed = queue.deleteByCode(code).changes;
    logger.info(`Removed ${removed} queued redemption(s) for ${status} code ${code}`);
  }
}

/**
 * Redeem one claimed queue item (see queue.claimNext: status processing, attempt already counted)
 * and settle it: done -> removed; retryable or USER_INFO_ERROR with attempts left -> pending; otherwise failed.
 * Every redemption in the app goes through here.
 */
export async function executeQueueItem(item: QueueItem): Promise<ExecutionResult> {
  const { id, fid, code } = item;

  try {
    const existing = redemptions.findLatest(fid, code);
    if (existing && SUCCESS_STATUSES.includes(existing.status)) {
      queue.delete(id);
      return { success: true, status: existing.status, message: 'Already redeemed' };
    }

    const user = users.findByFid(fid);
    // Deactivated after it was queued: never redeem for an inactive user
    if (user && user.active !== 1) {
      queue.delete(id);
      return { success: false, status: 'INACTIVE', message: 'User is inactive' };
    }
    if (!user?.kingdom) {
      const message = 'No server/kingdom on record for this user';
      logger.error(`Cannot redeem for FID ${fid}: ${message}`);
      queue.setStatus(id, 'failed', message);
      return { success: false, status: 'NO_KID', message };
    }

    const result = await redeemGiftCode(fid, user.kingdom, code);
    redemptions.create(fid, code, result.status);

    const outcome = classifyStatus(result.status);
    applyCodeOutcome(code, outcome);

    const attemptsLeft = item.attempts < MAX_QUEUE_ATTEMPTS;
    if (isSettled(outcome)) {
      // Removed by applyCodeOutcome already when the code is dead; a no-op then
      queue.delete(id);
    } else if (attemptsLeft && (outcome === 'retryable' || result.status === 'USER_INFO_ERROR')) {
      // Only a USER_INFO_ERROR on the last attempt counts as a kingdom mismatch
      queue.setStatus(id, 'pending', result.message);
      logger.warn(`⏳ ${result.status} for ${fid} / ${code} (attempt ${item.attempts}/${MAX_QUEUE_ATTEMPTS}), will retry`);
    } else {
      queue.setStatus(id, 'failed', result.message);
    }

    const log = result.success ? logger.info : logger.warn;
    log(`${result.success ? '✅' : '⚠️'} Redemption ${fid} / ${code}: ${result.status}`);
    return { success: result.success, status: result.status, message: result.message };
  } catch (error: any) {
    logger.error(`Error processing redemption for ${fid} / ${code}:`, error);
    queue.setStatus(id, 'failed', error.message);
    return { success: false, status: 'ERROR', message: error.message };
  }
}
