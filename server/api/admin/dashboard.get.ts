import { users, giftCodes, redemptions, queue } from '../../db';

export default defineEventHandler(() => {
  const userCounts = users.counts();
  const codeStats = giftCodes.stats();

  return {
    success: true,
    stats: {
      totalUsers: userCounts.total,
      activeUsers: userCounts.active,
      inactiveUsers: userCounts.total - userCounts.active,
      totalCodes: codeStats.total,
      validatedCodes: codeStats.validated,
      pendingCodes: codeStats.pending,
      expiredCodes: codeStats.expired,
      invalidCodes: codeStats.invalid,
      pendingQueueItems: queue.countPending(),
    },
    recentRedemptions: redemptions.findRecentSuccesses(10),
  };
});
