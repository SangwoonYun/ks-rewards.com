import { runMigrations, queue } from '../utils/db';
import { initializeScheduledTasks } from '../services/scheduler';
import { logger } from '../utils/logger';

let initialized = false;

export default defineNitroPlugin((nitroApp) => {
  if (initialized) return;
  initialized = true;

  logger.info('🚀 Starting Kingshot Rewards service...');

  try {
    // Run database migrations
    runMigrations();

    // Nothing is processing yet at startup: recover items interrupted by the last shutdown
    const recovered = queue.resetStuckProcessing();
    if (recovered > 0) {
      logger.info(`♻️  Reset ${recovered} queue item(s) stuck in 'processing' to 'pending'`);
    }

    // Initialize scheduled tasks
    initializeScheduledTasks();

    logger.info('✅ Kingshot Rewards service started successfully');
  } catch (error) {
    logger.error('❌ Failed to start service:', error);
    throw error;
  }
});

