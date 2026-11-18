import { queue } from '../../../db';
import { logger } from '../../../utils/logger';

// Force-remove queue items, whatever their status
export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => null);
  const ids = body?.ids;

  if (!Array.isArray(ids) || ids.length === 0 || !ids.every(id => Number.isInteger(id))) {
    throw createError({ statusCode: 400, message: 'Array of queue item IDs is required' });
  }

  const removedCount = ids.filter(id => queue.delete(id).changes > 0).length;

  logger.info(`Admin removed ${removedCount} queue items`);
  return { success: true, removedCount };
});
