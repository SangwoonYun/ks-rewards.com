import { giftCodes, queue } from '../db';
import { fetchGiftCodes } from '../clients/giftCodeSource';
import { validatePendingCodes, validateExistingCodes } from './codeValidation';
import { kickQueueWorker } from './queueWorker';
import { runExclusive } from './jobs';
import { logger } from '../utils/logger';

// Validated codes are re-checked for expiry at most this often. Each check is a real redemption per code;
// between checks, the queue itself marks a code expired as soon as a redemption says so.
const EXISTING_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
let lastExistingCheckAt = 0;

/**
 * Add the codes from the external API that are not in the database yet (as pending)
 */
export async function syncGiftCodes() {
  const apiCodes = await fetchGiftCodes();
  const known = new Set(giftCodes.findAll().map(c => c.code));

  const newCodeList: string[] = [];
  for (const apiCode of apiCodes) {
    // A deleted code is not in findAll; INSERT OR IGNORE keeps it deleted
    if (!known.has(apiCode.code) && giftCodes.insertOrIgnore(apiCode.code, 'pending', 'api', apiCode.date).changes > 0) {
      newCodeList.push(apiCode.code);
      logger.info(`✨ New gift code discovered: ${apiCode.code}`);
    }
  }

  logger.info(`Gift code sync: ${newCodeList.length} new, ${apiCodes.length} from API`);
  return {
    newCodes: newCodeList.length,
    newCodeList,
    existingCodes: apiCodes.length - newCodeList.length,
    totalApiCodes: apiCodes.length
  };
}

/**
 * One discovery cycle: sync, validate pending codes (new ones and ones whose validation was
 * inconclusive before), re-check validated codes once a day, then queue every validated code for every
 * active user who still needs it (also covers reactivated users) and start the worker.
 * Never runs twice at once: null when a cycle is already running.
 */
export function runDiscoveryCycle() {
  return runExclusive('Gift code discovery', async () => {
    const sync = await syncGiftCodes();
    const validation = await validatePendingCodes();

    if (Date.now() - lastExistingCheckAt >= EXISTING_CHECK_INTERVAL_MS) {
      // The clock starts with the first check that had something to check
      if ((await validateExistingCodes()).checked > 0) lastExistingCheckAt = Date.now();
    }

    const queuedCount = queue.enqueue();
    if (queuedCount > 0) logger.info(`Queued ${queuedCount} redemption(s)`);
    kickQueueWorker();

    return { ...sync, validated: validation.valid, queuedCount };
  });
}
