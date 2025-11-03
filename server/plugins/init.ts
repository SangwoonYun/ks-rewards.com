import { runMigrations } from '../utils/db';
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

    // Initialize scheduled tasks
    initializeScheduledTasks();

    logger.info('✅ Kingshot Rewards service started successfully');
  } catch (error) {
    logger.error('❌ Failed to start service:', error);
    throw error;
  }
});

