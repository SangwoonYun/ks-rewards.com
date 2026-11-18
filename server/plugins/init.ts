import { runMigrations, queue } from '../db';
import { startScheduledTasks, stopScheduledTasks } from '../services/scheduler';
import { assertProductionSecrets } from '../utils/config';
import { logger } from '../utils/logger';

export default defineNitroPlugin((nitroApp) => {
  logger.info('🚀 Starting Kingshot Rewards service...');

  try {
    assertProductionSecrets();
    runMigrations();

    // Nothing is processing yet at startup: recover items interrupted by the last shutdown
    const recovered = queue.resetStuckProcessing();
    if (recovered > 0) {
      logger.info(`♻️  Reset ${recovered} queue item(s) stuck in 'processing' to 'pending'`);
    }

    startScheduledTasks();
    nitroApp.hooks.hook('close', stopScheduledTasks);

    logger.info('✅ Kingshot Rewards service started successfully');
  } catch (error) {
    logger.error('❌ Failed to start service:', error);
    throw error;
  }
});
