import { processRedemptionQueue, autoRedeemValidatedCodes } from './redemptionService';
import { syncGiftCodes } from './giftCodeDiscovery';
import { createBackup } from './backupService';
import { logger } from '../utils/logger';

const REDEMPTION_INTERVAL_MINUTES = parseInt(process.env.REDEMPTION_INTERVAL_MINUTES || '2');
const DISCOVERY_INTERVAL_MINUTES = parseInt(process.env.DISCOVERY_INTERVAL_MINUTES || '15');
const BACKUP_INTERVAL_HOURS = parseInt(process.env.BACKUP_INTERVAL_HOURS || '6');

let scheduledIntervals: NodeJS.Timeout[] = [];

/**
 * Initialize scheduled tasks for automatic redemption processing
 */
export function initializeScheduledTasks() {
    logger.info('Initializing scheduled tasks...');

  // Convert minutes to milliseconds
  const redemptionIntervalMs = REDEMPTION_INTERVAL_MINUTES * 60 * 1000;
  const discoveryIntervalMs = DISCOVERY_INTERVAL_MINUTES * 60 * 1000;
  const backupIntervalMs = BACKUP_INTERVAL_HOURS * 60 * 60 * 1000;

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

  // Periodically create database backups
  const backupInterval = setInterval(async () => {
    logger.info('⏰ Running scheduled database backup...');
    try {
      await createBackup();
    } catch (error) {
      logger.error('Error in scheduled backup:', error);
    }
  }, backupIntervalMs);

  scheduledIntervals.push(backupInterval);

  logger.info('✅ Scheduled tasks initialized');
  logger.info(`- Redemption processing: every ${REDEMPTION_INTERVAL_MINUTES} minutes (${redemptionIntervalMs}ms)`);
  logger.info(`- Gift code discovery: every ${DISCOVERY_INTERVAL_MINUTES} minutes (${discoveryIntervalMs}ms)`);
  logger.info(`- Database backup: every ${BACKUP_INTERVAL_HOURS} hours (${backupIntervalMs}ms)`);

  // Run initial checks in background (don't block server startup)
  logger.info('Running initial checks...');

  setImmediate(async () => {
    try {
      const redemptionResult = await processRedemptionQueue(100);
      logger.info(`Initial redemption run - Processed: ${redemptionResult.processed}, Success: ${redemptionResult.success}, Failed: ${redemptionResult.failed}`);
    } catch (error) {
      logger.error('Error in initial redemption processing:', error);
    }

    try {
      const syncResult = await syncGiftCodes();
      if (syncResult.success) {
        logger.info(`Initial gift code sync - New: ${syncResult.newCodes}, Existing: ${syncResult.existingCodes}, Total: ${syncResult.totalApiCodes}`);
      } else {
        logger.error('Initial gift code sync failed:', syncResult.error);
      }
    } catch (error) {
      logger.error('Error in initial gift code sync:', error);
    }

    // Create initial backup on startup
    try {
      logger.info('Creating initial database backup...');
      await createBackup();
    } catch (error) {
      logger.error('Error creating initial backup:', error);
    }
  });
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

