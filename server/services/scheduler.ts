import { processRedemptionQueue, validateGiftCode, queueRedemptionsForCode } from './redemptionService';
import { syncGiftCodes } from './giftCodeDiscovery';
import { createBackup } from './backupService';
import { logger } from '../utils/logger';
import { config } from '../utils/config';

let scheduledIntervals: NodeJS.Timeout[] = [];

/**
 * Initialize scheduled tasks for automatic redemption processing
 */
export function initializeScheduledTasks() {
    logger.info('Initializing scheduled tasks...');

  // Convert minutes to milliseconds
  const redemptionIntervalMs = config.scheduler.redemptionIntervalMinutes * 60 * 1000;
  const discoveryIntervalMs = config.scheduler.discoveryIntervalMinutes * 60 * 1000;
  const backupIntervalMs = config.scheduler.backupIntervalHours * 60 * 60 * 1000;

  // Process redemption queue every N minutes
  // Note: This only processes queued redemptions. Code validation is handled by the discovery scheduler.
  const redemptionInterval = setInterval(async () => {
    logger.info('⏰ Running scheduled redemption processing...');
    try {
      const result = await processRedemptionQueue(100, false); // Don't validate pending codes here
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

        // When new codes are discovered, validate them and queue using queueRedemptionsForCode
        if (result.newCodes && result.newCodes > 0 && Array.isArray(result.newCodeList)) {
          logger.info(`✨ Found ${result.newCodes} new codes, validating and queueing individually...`);
          for (const newCode of result.newCodeList) {
            try {
              const validationResult = await validateGiftCode(newCode);
              logger.info(`Validation result for new code ${newCode}: ${validationResult.status}`);
              if (validationResult.valid === true) {
                try {
                  const queued = await queueRedemptionsForCode(newCode, 1);
                  logger.info(`Queued ${queued} redemptions for newly validated code ${newCode}`);
                } catch (e) {
                  logger.error(`Error queueing redemptions for code ${newCode}:`, e);
                }
              }
            } catch (verr) {
              logger.error(`Error validating new code ${newCode}:`, verr);
            }
          }
        } else {
          // No new codes; nothing to do here
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
  logger.info(`- Redemption processing: every ${config.scheduler.redemptionIntervalMinutes} minutes (${redemptionIntervalMs}ms)`);
  logger.info(`- Gift code discovery: every ${config.scheduler.discoveryIntervalMinutes} minutes (${discoveryIntervalMs}ms)`);
  logger.info(`- Database backup: every ${config.scheduler.backupIntervalHours} hours (${backupIntervalMs}ms)`);

  // Run initial checks in the background (don't block server startup)
  logger.info('Running initial checks...');

  setImmediate(async () => {
    try {
      // On startup, validate any pending codes as a safety measure
      const redemptionResult = await processRedemptionQueue(100, true);
      logger.info(`Initial redemption run - Processed: ${redemptionResult.processed}, Success: ${redemptionResult.success}, Failed: ${redemptionResult.failed}`);
    } catch (error) {
      logger.error('Error in initial redemption processing:', error);
    }

    try {
      const syncResult = await syncGiftCodes();
      if (syncResult.success) {
        logger.info(`Initial gift code sync - New: ${syncResult.newCodes}, Existing: ${syncResult.existingCodes}, Total: ${syncResult.totalApiCodes}`);
        // On startup, also queue any already-validated codes once
        try {
          const { autoRedeemValidatedCodes } = await import('./redemptionService');
          const queuedCount = await autoRedeemValidatedCodes();
          if (queuedCount > 0) {
            logger.info(`Startup queued ${queuedCount} validated redemptions`);
          }
        } catch (err) {
          logger.error('Error running startup autoRedeemValidatedCodes:', err);
        }
      } else {
        logger.error('Initial gift code sync failed:', syncResult.error);
      }
    } catch (error) {
      logger.error('Error in initial gift code sync:', error);
    }

    // Create an initial backup on startup
    try {
      logger.info('Creating initial database backup...');
      await createBackup();
    } catch (error) {
      logger.error('Error creating initial backup:', error);
    }
  });
}
