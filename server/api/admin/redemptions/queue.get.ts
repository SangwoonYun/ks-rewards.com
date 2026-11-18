import { queue } from '../../../db';
import { getPagination } from '../../../utils/http';

export default defineEventHandler((event) => {
  const { limit, offset } = getPagination(event);
  const { items, total } = queue.list({ limit, offset });

  return { success: true, items, total, hasMore: offset + limit < total, pendingCount: queue.countPending() };
});
