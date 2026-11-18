import { revalidateCode } from '../../../../services/codeValidation';
import { giftCodes } from '../../../../db';
import { logger } from '../../../../utils/logger';

export default defineEventHandler(async (event) => {
  const code = getRouterParam(event, 'code', { decode: true });
  if (!code) {
    throw createError({ statusCode: 400, message: 'Code is required' });
  }

  const existing = giftCodes.findByCode(code);
  if (!existing || existing.validation_status === 'deleted') {
    throw createError({ statusCode: 404, message: 'Code not found' });
  }

  logger.info(`Admin triggered revalidation of code: ${code}`);
  const { previousStatus, currentStatus, result } = await revalidateCode(code);

  return {
    success: true,
    code,
    previousStatus,
    currentStatus,
    validationResult: result,
    stats: giftCodes.stats()
  };
});
