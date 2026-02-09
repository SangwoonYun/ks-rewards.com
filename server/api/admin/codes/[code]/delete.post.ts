import { giftCodes, queue } from '../../../../utils/db';
import { logger } from '../../../../utils/logger';

export default defineEventHandler(async (event) => {
  const code = getRouterParam(event, 'code');
  if (!code) {
    throw createError({ statusCode: 400, message: 'Code is required' });
  }

  const existing = giftCodes.findByCode(code);
  if (!existing) {
    throw createError({ statusCode: 404, message: 'Gift code not found' });
  }

  queue.deleteByCode(code);
  giftCodes.delete(code);

  logger.info(`Admin deleted gift code: ${code}`);
  return { success: true };
});
