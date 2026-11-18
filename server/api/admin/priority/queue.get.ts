import { priorityUsers, queue } from '../../../db';

export default defineEventHandler((event) => {
  const query = getQuery(event);
  const limit = Math.min(parseInt(String(query.queueLimit), 10) || 20, 200);
  const offset = Math.max(parseInt(String(query.queueOffset), 10) || 0, 0);

  const { items, total, pending } = queue.listPriority({ limit, offset });

  return {
    registeredUsers: priorityUsers.findAll(),
    queueItems: items,
    pendingCount: pending,
    totalQueueItems: total,
    queueHasMore: offset + limit < total,
  };
});
