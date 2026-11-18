import { runDiscoveryCycle } from '../../../services/giftCodeDiscovery';
import { logger } from '../../../utils/logger';

// Runs a full discovery cycle (sync, validate pending codes, queue), the same as the scheduler
export default defineEventHandler(async () => {
  logger.info('Admin triggered manual gift code sync');
  const result = await runDiscoveryCycle();
  if (!result) {
    throw createError({ statusCode: 409, message: 'A gift code sync is already running' });
  }
  return { success: true, ...result };
});
