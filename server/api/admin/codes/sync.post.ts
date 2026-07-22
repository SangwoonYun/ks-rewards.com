import { syncGiftCodes } from '../../../services/giftCodeDiscovery';
import { logger } from '../../../utils/logger';

export default defineEventHandler(async () => {
  logger.info('Admin triggered manual gift code sync');
  const result = await syncGiftCodes();
  return { success: true, ...result };
});
