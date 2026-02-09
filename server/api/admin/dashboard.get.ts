import { users, giftCodes, redemptions, queue } from '../../utils/db';
import { logger } from '../../utils/logger';

export default defineEventHandler(async () => {
  try {
    const allUsers = users.findAll();
    const activeUsers = users.findActive();
    const codeStats = giftCodes.stats();
    const pendingQueueCount = queue.countPending();
    const recentRedemptions = redemptions.findRecent(10);

    return {
      success: true,
      stats: {
        totalUsers: allUsers.length,
        activeUsers: activeUsers.length,
        inactiveUsers: allUsers.length - activeUsers.length,
        totalCodes: codeStats.total,
        validatedCodes: codeStats.validated,
        pendingCodes: codeStats.pending,
        expiredCodes: codeStats.expired,
        invalidCodes: codeStats.invalid,
        pendingQueueItems: pendingQueueCount,
      },
      recentRedemptions,
    };
  } catch (error: any) {
    logger.error('Error fetching dashboard data:', error);
    throw createError({ statusCode: 500, message: 'Internal server error' });
  }
});
