import { validatePendingCodes } from '../../../services/redemptionService';
import { logger } from '../../../utils/logger';

export default defineEventHandler(async () => {
  logger.info('Admin triggered manual code validation');
  const result = await validatePendingCodes();
  return { success: true, ...result };
});
