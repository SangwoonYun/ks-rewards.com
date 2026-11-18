import { users, queue } from '../db';

// Public counters for the homepage (the admin dashboard endpoint requires a session)
export default defineEventHandler(() => {
  const userCounts = users.counts();
  return {
    success: true,
    stats: {
      totalUsers: userCounts.total,
      activeUsers: userCounts.active,
      pendingQueueItems: queue.countPending(),
    },
  };
});
