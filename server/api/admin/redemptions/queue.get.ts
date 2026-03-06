import { queue } from '../../../utils/db';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const limit = parseInt(query.limit as string) || 50;
  const offset = parseInt(query.offset as string) || 0;

  const allItems = queue.getAll(10000);
  const total = allItems.length;
  const paginated = allItems.slice(offset, offset + limit);
  const pendingCount = queue.countPending();

  return { success: true, items: paginated, total, hasMore: offset + limit < total, pendingCount };
});
