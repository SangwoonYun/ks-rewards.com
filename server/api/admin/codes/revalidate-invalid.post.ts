import { revalidateInvalidCodes } from '../../../services/redemptionService';
import { logger } from '../../../utils/logger';

export default defineEventHandler(async () => {
  logger.info('Admin triggered revalidation of invalid codes');
  const result = await revalidateInvalidCodes();
  return { success: true, ...result };
});
