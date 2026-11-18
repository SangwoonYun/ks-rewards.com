import { validatePendingCodes } from '../../../services/codeValidation';
import { runExclusive } from '../../../services/jobs';
import { logger } from '../../../utils/logger';

export default defineEventHandler(async () => {
  logger.info('Admin triggered manual code validation');
  const result = await runExclusive('Pending code validation', validatePendingCodes);
  if (!result) {
    throw createError({ statusCode: 409, message: 'A validation is already running' });
  }
  return { success: true, ...result };
});
