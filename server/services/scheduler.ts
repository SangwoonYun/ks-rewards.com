import { processRedemptionQueue, autoRedeemValidatedCodes } from './redemptionService';
import { syncGiftCodes } from './giftCodeDiscovery';
import { validatePlayerId } from './kingshotApi';
import { createBackup } from './backupService';
import { users } from '../utils/db';
import { logger } from '../utils/logger';

const REDEMPTION_INTERVAL_MINUTES = parseInt(process.env.REDEMPTION_INTERVAL_MINUTES || '2');
const DISCOVERY_INTERVAL_MINUTES = parseInt(process.env.DISCOVERY_INTERVAL_MINUTES || '15');
const AUTO_REDEEM_INTERVAL_MINUTES = parseInt(process.env.AUTO_REDEEM_INTERVAL_MINUTES || '5');
const NICKNAME_REFRESH_INTERVAL_HOURS = parseInt(process.env.NICKNAME_REFRESH_INTERVAL_HOURS || '24');
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
  const autoRedeemIntervalMs = AUTO_REDEEM_INTERVAL_MINUTES * 60 * 1000;
  const nicknameRefreshIntervalMs = NICKNAME_REFRESH_INTERVAL_HOURS * 60 * 60 * 1000;
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

  // Periodically refresh nicknames, kingdoms, and avatars for all active users
  const nicknameRefreshInterval = setInterval(async () => {
    logger.info('⏰ Running user data refresh...');
    try {
      const activeUsers = await users.findActive();
      let updatedCount = 0;

      for (const user of activeUsers) {
        try {
          const validation = await validatePlayerId(user.fid);
          if (validation.success) {
            let updated = false;
            if (validation.nickname && validation.nickname !== user.nickname) {
              await users.updateNickname(user.fid, validation.nickname);
              logger.info(`Updated nickname for ${user.fid}: ${user.nickname} -> ${validation.nickname}`);
              updated = true;
            }
            if (validation.kingdom && validation.kingdom !== user.kingdom) {
              await users.updateKingdom(user.fid, validation.kingdom);
              logger.info(`Updated kingdom for ${user.fid}: ${user.kingdom} -> ${validation.kingdom}`);
              updated = true;
            }
            if (validation.avatar_url && validation.avatar_url !== user.avatar_url) {
              await users.updateAvatar(user.fid, validation.avatar_url);
              logger.info(`Updated avatar for ${user.fid}`);
              updated = true;
            }
            if (updated) updatedCount++;
          }
          // Small delay between API calls to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          logger.error(`Error refreshing data for ${user.fid}:`, error);
        }
      }

      logger.info(`User data refresh complete: ${updatedCount} updated, ${activeUsers.length - updatedCount} unchanged`);
    } catch (error) {
      logger.error('Error in user data refresh:', error);
    }
  }, nicknameRefreshIntervalMs);

  scheduledIntervals.push(nicknameRefreshInterval);

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
  logger.info(`- Auto-redemption check: every ${AUTO_REDEEM_INTERVAL_MINUTES} minutes (${autoRedeemIntervalMs}ms)`);
  logger.info(`- Nickname refresh: every ${NICKNAME_REFRESH_INTERVAL_HOURS} hours (${nicknameRefreshIntervalMs}ms)`);
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

    try {
      const queuedCount = await autoRedeemValidatedCodes();
      logger.info(`Initial auto-redeem queued ${queuedCount} redemptions`);
    } catch (error) {
      logger.error('Error in initial auto-redeem:', error);
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

