import { users, queue } from '../utils/db';
import { logger } from '../utils/logger';

// Public counters for the homepage (the admin dashboard endpoint requires a session)
export default defineEventHandler(async () => {
  try {
    const userCounts = users.counts();
    return {
      success: true,
      stats: {
        totalUsers: userCounts.total,
        activeUsers: userCounts.active,
        pendingQueueItems: queue.countPending(),
      },
    };
  } catch (error: any) {
    logger.error('Error getting public stats:', error);
    return { success: false, error: 'Internal server error' };
  }
});
