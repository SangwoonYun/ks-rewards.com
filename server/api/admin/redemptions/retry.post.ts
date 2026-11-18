import { queue } from '../../../db';
import { kickQueueWorker } from '../../../services/queueWorker';
import { logger } from '../../../utils/logger';

// Put failed queue items back to pending
export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => null);
  const ids = body?.ids;

  if (!Array.isArray(ids) || ids.length === 0 || !ids.every(id => Number.isInteger(id))) {
    throw createError({ statusCode: 400, message: 'Array of queue item IDs is required' });
  }

  const resetCount = ids.filter(id => queue.resetToPending(id).changes > 0).length;
  if (resetCount > 0) kickQueueWorker();

  logger.info(`Admin retried ${resetCount} queue items`);
  return { success: true, resetCount };
});
