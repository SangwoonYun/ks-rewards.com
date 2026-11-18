import { users, priorityUsers } from '../../../db';
import { queueAndRedeem } from '../../../services/queueWorker';
import { parseFid } from '../../../utils/player';
import { logger } from '../../../utils/logger';

const PRIORITY_LEVEL = 10;

export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => null);
  const fid = parseFid(body?.fid);

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

  // Persistent: later codes are queued with this priority too
  priorityUsers.add(fid, PRIORITY_LEVEL);
  const queuedCount = queueAndRedeem({ fid, priority: PRIORITY_LEVEL });

  logger.info(`Admin priority add: registered user ${fid} with priority ${PRIORITY_LEVEL}, queued ${queuedCount} codes`);

  return {
    success: true,
    fid,
    nickname: user.nickname,
    queuedCount,
    priority: PRIORITY_LEVEL,
    message: `User added to priority queue` + (queuedCount > 0 ? ` (${queuedCount} codes queued)` : ''),
  };
});
