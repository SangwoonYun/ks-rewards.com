import { queue } from '../../../utils/db';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const limit = parseInt(query.limit as string) || 200;

  const items = queue.getAll(limit);
  const pendingCount = queue.countPending();

  return { success: true, items, pendingCount };
});
