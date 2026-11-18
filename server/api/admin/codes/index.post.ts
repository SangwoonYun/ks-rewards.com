import { giftCodes } from '../../../db';
import { logger } from '../../../utils/logger';

export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => null);
  const code = typeof body?.code === 'string' ? body.code.trim() : '';

  if (!/^[a-zA-Z0-9]+$/.test(code)) {
    throw createError({ statusCode: 400, message: 'Gift code must be letters and digits only' });
  }

  const existing = giftCodes.findByCode(code);
  if (existing?.validation_status === 'deleted') {
    giftCodes.restoreDeleted(code);
    logger.info(`Admin restored deleted gift code: ${code}`);
    return { success: true, code };
  }
  if (existing) {
    throw createError({ statusCode: 409, message: 'Gift code already exists' });
  }

  giftCodes.insertOrIgnore(code, 'pending', typeof body?.source === 'string' && body.source ? body.source : 'admin');
  logger.info(`Admin added gift code: ${code}`);

  return { success: true, code };
});
