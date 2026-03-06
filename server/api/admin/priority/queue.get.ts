import { priorityUsers, queue } from '../../../utils/db';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const queueLimit = parseInt(query.queueLimit as string) || 20;
  const queueOffset = parseInt(query.queueOffset as string) || 0;

  const registeredUsers = priorityUsers.findAll();
  const allQueueItems = queue.getPriorityItems(10000);
  const pendingCount = allQueueItems.filter(i => i.status === 'pending').length;
  const totalQueueItems = allQueueItems.length;
  const queueItems = allQueueItems.slice(queueOffset, queueOffset + queueLimit);

  return {
    registeredUsers,
    queueItems,
    pendingCount,
    totalQueueItems,
    queueHasMore: queueOffset + queueLimit < totalQueueItems,
  };
});
