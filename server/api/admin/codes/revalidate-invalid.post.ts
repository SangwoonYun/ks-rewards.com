import { revalidateInvalidCodes } from '../../../services/codeValidation';
import { runExclusive } from '../../../services/jobs';
import { logger } from '../../../utils/logger';

export default defineEventHandler(async () => {
  logger.info('Admin triggered revalidation of invalid codes');
  const result = await runExclusive('Invalid code revalidation', revalidateInvalidCodes);
  if (!result) {
    throw createError({ statusCode: 409, message: 'A revalidation is already running' });
  }
  return { success: true, ...result };
});
