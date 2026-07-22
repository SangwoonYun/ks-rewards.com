import { giftCodes } from '../../../utils/db';
import { logger } from '../../../utils/logger';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { code, source } = body;

  if (!code || typeof code !== 'string' || !code.trim()) {
    throw createError({ statusCode: 400, message: 'Gift code is required' });
  }

  const cleanCode = code.trim();

  const existing = giftCodes.findByCode(cleanCode);
  if (existing) {
    throw createError({ statusCode: 409, message: 'Gift code already exists' });
  }

  giftCodes.insertOrIgnore(cleanCode, 'pending', source || 'admin');
  logger.info(`Admin added gift code: ${cleanCode}`);

  return { success: true, code: cleanCode };
});
