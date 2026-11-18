import { queue } from '../../../utils/db';
import { logger } from '../../../utils/logger';

// Force-remove queue items, whatever their status
export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { ids } = body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    throw createError({ statusCode: 400, message: 'Array of queue item IDs is required' });
  }

  let removedCount = 0;
  for (const id of ids) {
    const result = queue.delete(id);
    if (result.changes > 0) removedCount++;
  }

  logger.info(`Admin removed ${removedCount} queue items`);
  return { success: true, removedCount };
});
