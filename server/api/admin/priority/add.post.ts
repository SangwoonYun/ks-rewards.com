import { users, priorityUsers } from '../../../utils/db';
import { queueUnredeemedCodesForUser } from '../../../services/redemptionService';
import { logger } from '../../../utils/logger';

const PRIORITY_LEVEL = 10;

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const fid = body?.fid?.toString().trim();

  if (!fid) {
    throw createError({ statusCode: 400, message: 'FID is required' });
  }

  const user = users.findByFid(fid);
  if (!user) {
    throw createError({ statusCode: 404, message: `User with FID ${fid} not found` });
  }

  if (!user.active) {
    throw createError({ statusCode: 400, message: `User ${fid} is inactive` });
  }

  try {
    // Register user in priority_users table (persistent)
    priorityUsers.add(fid, PRIORITY_LEVEL);

    // Queue unredeemed codes with high priority
    const queuedCount = await queueUnredeemedCodesForUser(fid, PRIORITY_LEVEL);

    logger.info(`Admin priority add: registered user ${fid} with priority ${PRIORITY_LEVEL}, queued ${queuedCount} codes`);

    return {
      success: true,
      fid,
      nickname: user.nickname,
      queuedCount,
      priority: PRIORITY_LEVEL,
      message: `User added to priority queue` + (queuedCount > 0 ? ` (${queuedCount} codes queued)` : ''),
    };
  } catch (error: any) {
    logger.error(`Admin priority add error for ${fid}:`, error);
    throw createError({ statusCode: 500, message: error.message || 'Internal server error' });
  }
});
