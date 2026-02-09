import { queue } from '../../../utils/db';
import { logger } from '../../../utils/logger';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { ids } = body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    throw createError({ statusCode: 400, message: 'Array of queue item IDs is required' });
  }

  let resetCount = 0;
  for (const id of ids) {
    const result = queue.resetToPending(id);
    if (result.changes > 0) resetCount++;
  }

  logger.info(`Admin retried ${resetCount} queue items`);
  return { success: true, resetCount };
});
