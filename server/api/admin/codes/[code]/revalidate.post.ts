import { validateGiftCode } from '../../../../services/redemptionService';
import { giftCodes } from '../../../../utils/db';
import { logger } from '../../../../utils/logger';

export default defineEventHandler(async (event) => {
  const code = decodeURIComponent(getRouterParam(event, 'code') ?? '');
  if (!code) {
    throw createError({ statusCode: 400, message: 'Code is required' });
  }

  const existing = giftCodes.findByCode(code);
  if (!existing) {
    throw createError({ statusCode: 404, message: 'Code not found' });
  }

  logger.info(`Admin triggered revalidation of code: ${code}`);

  // Temporarily set to pending so validateGiftCode can write the real outcome
  const previousStatus = existing.validation_status;
  if (previousStatus === 'invalid') {
    giftCodes.updateValidation(code, 'pending');
  }

  const result = await validateGiftCode(code);

  // If transient error, roll back to the previous status
  if (result.valid === null && previousStatus === 'invalid') {
    giftCodes.updateValidation(code, 'invalid');
  }

  const updated = giftCodes.findByCode(code);

  return {
    success: true,
    code,
    previousStatus,
    currentStatus: updated?.validation_status ?? previousStatus,
    validationResult: result
  };
});
