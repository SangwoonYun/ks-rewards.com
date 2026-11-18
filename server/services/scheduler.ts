import { runDiscoveryCycle } from './giftCodeDiscovery';
import { kickQueueWorker } from './queueWorker';
import { createBackup } from './backupService';
import { runExclusive } from './jobs';
import { logger } from '../utils/logger';
import { config } from '../utils/config';

const intervals: NodeJS.Timeout[] = [];

async function discovery() {
  try {
    await runDiscoveryCycle();
  } catch (error) {
    logger.error('Error in gift code discovery:', error);
  }
}

async function backup() {
  try {
    await runExclusive('Database backup', createBackup);
  } catch (error) {
    logger.error('Error in database backup:', error);
  }
}

/**
 * Start the periodic jobs; each also runs once right away (in the background)
 */
export function startScheduledTasks() {
  const { redemptionIntervalMinutes, discoveryIntervalMinutes, backupIntervalHours } = config.scheduler;

  intervals.push(
    setInterval(kickQueueWorker, redemptionIntervalMinutes * 60_000),
    setInterval(discovery, discoveryIntervalMinutes * 60_000),
    setInterval(backup, backupIntervalHours * 3_600_000)
  );

  logger.info('✅ Scheduled tasks started');
  logger.info(`- Redemption processing: every ${redemptionIntervalMinutes} minutes`);
  logger.info(`- Gift code discovery: every ${discoveryIntervalMinutes} minutes`);
  logger.info(`- Database backup: every ${backupIntervalHours} hours`);

  kickQueueWorker();
  void discovery();
  void backup();
}

export function stopScheduledTasks() {
  intervals.forEach(clearInterval);
  intervals.length = 0;
}
