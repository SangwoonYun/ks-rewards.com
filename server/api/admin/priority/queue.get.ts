import { priorityUsers, queue } from '../../../utils/db';

export default defineEventHandler(async () => {
  const registeredUsers = priorityUsers.findAll();
  const queueItems = queue.getPriorityItems(200);
  const pendingCount = queueItems.filter(i => i.status === 'pending').length;

  return {
    registeredUsers,
    queueItems,
    pendingCount,
    totalQueueItems: queueItems.length,
  };
});
