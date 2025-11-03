import { processRedemptionQueue, autoRedeemValidatedCodes } from './redemptionService';
import { syncGiftCodes } from './giftCodeDiscovery';
import { validatePlayerId } from './kingshotApi';
import { users } from '../utils/db';
import { logger } from '../utils/logger';

const REDEMPTION_INTERVAL_MINUTES = parseInt(process.env.REDEMPTION_INTERVAL_MINUTES || '2');
const DISCOVERY_INTERVAL_MINUTES = parseInt(process.env.DISCOVERY_INTERVAL_MINUTES || '15');
const AUTO_REDEEM_INTERVAL_MINUTES = parseInt(process.env.AUTO_REDEEM_INTERVAL_MINUTES || '5');
const NICKNAME_REFRESH_INTERVAL_HOURS = parseInt(process.env.NICKNAME_REFRESH_INTERVAL_HOURS || '24');

let scheduledIntervals: NodeJS.Timeout[] = [];

/**
 * Initialize scheduled tasks for automatic redemption processing
 */
export function initializeScheduledTasks() {
  logger.info('Initializing scheduled tasks...');

  // Convert minutes to milliseconds
  const redemptionIntervalMs = REDEMPTION_INTERVAL_MINUTES * 60 * 1000;
  const discoveryIntervalMs = DISCOVERY_INTERVAL_MINUTES * 60 * 1000;
  const autoRedeemIntervalMs = AUTO_REDEEM_INTERVAL_MINUTES * 60 * 1000;
  const nicknameRefreshIntervalMs = NICKNAME_REFRESH_INTERVAL_HOURS * 60 * 60 * 1000;

  // Process redemption queue every N minutes
  const redemptionInterval = setInterval(async () => {
    logger.info('⏰ Running scheduled redemption processing...');
    try {
      const result = await processRedemptionQueue(100);
      logger.info(`Processed: ${result.processed}, Success: ${result.success}, Failed: ${result.failed}`);
    } catch (error) {
      logger.error('Error in scheduled redemption processing:', error);
    }
  }, redemptionIntervalMs);

  // Check for new gift codes every N minutes
  const discoveryInterval = setInterval(async () => {
    logger.info('⏰ Running scheduled gift code discovery...');
    try {
      const result = await syncGiftCodes();
      if (result.success) {
        logger.info(`Gift code sync - New: ${result.newCodes}, Existing: ${result.existingCodes}, Total: ${result.totalApiCodes}`);

        // Always queue redemptions for all active users to catch any edge cases
        // This ensures all validated codes are queued for all users who haven't redeemed them
        if (result.newCodes && result.newCodes > 0) {
          logger.info(`✨ Found ${result.newCodes} new codes, running auto-redemption...`);
        }

        const queuedCount = await autoRedeemValidatedCodes();
        if (queuedCount > 0) {
          logger.info(`Queued ${queuedCount} redemptions (including any missed codes)`);
        }
      } else {
        logger.error('Gift code sync failed:', result.error);
      }
    } catch (error) {
      logger.error('Error in scheduled gift code discovery:', error);
    }
  }, discoveryIntervalMs);

  scheduledIntervals.push(redemptionInterval, discoveryInterval);

  // Periodically check and queue validated codes for all active users
  const autoRedeemInterval = setInterval(async () => {
    logger.info('⏰ Running auto-redemption check...');
    try {
      const queuedCount = await autoRedeemValidatedCodes();
      if (queuedCount > 0) {
        logger.info(`Auto-redeem queued ${queuedCount} redemptions`);
      } else {
        logger.info('No new redemptions to queue');
      }
    } catch (error) {
      logger.error('Error in auto-redemption check:', error);
    }
  }, autoRedeemIntervalMs);

  scheduledIntervals.push(autoRedeemInterval);

  logger.info('✅ Scheduled tasks initialized');
  logger.info(`- Redemption processing: every ${REDEMPTION_INTERVAL_MINUTES} minutes (${redemptionIntervalMs}ms)`);
  logger.info(`- Gift code discovery: every ${DISCOVERY_INTERVAL_MINUTES} minutes (${discoveryIntervalMs}ms)`);
  logger.info(`- Auto-redemption check: every ${AUTO_REDEEM_INTERVAL_MINUTES} minutes (${autoRedeemIntervalMs}ms)`);

  // Run initial checks
  logger.info('Running initial checks...');

  Promise.all([
    processRedemptionQueue(100)
      .then(result => {
        logger.info(`Initial redemption run - Processed: ${result.processed}, Success: ${result.success}, Failed: ${result.failed}`);
      })
      .catch(error => {
        logger.error('Error in initial redemption processing:', error);
      }),

    syncGiftCodes()
      .then(result => {
        if (result.success) {
          logger.info(`Initial gift code sync - New: ${result.newCodes}, Existing: ${result.existingCodes}, Total: ${result.totalApiCodes}`);
        } else {
          logger.error('Initial gift code sync failed:', result.error);
        }
      })
      .catch(error => {
        logger.error('Error in initial gift code sync:', error);
      }),

    autoRedeemValidatedCodes()
      .then(queuedCount => {
        logger.info(`Initial auto-redeem queued ${queuedCount} redemptions`);
      })
      .catch(error => {
        logger.error('Error in initial auto-redemption:', error);
      })
  ]);
}

/**
 * Stop all scheduled tasks
 */
export function stopScheduledTasks() {
  logger.info('Stopping scheduled tasks...');
  scheduledIntervals.forEach(interval => clearInterval(interval));
  scheduledIntervals = [];
  logger.info('✅ Scheduled tasks stopped');
}

