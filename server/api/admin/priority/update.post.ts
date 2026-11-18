import { priorityUsers, queue } from '../../../db';
import { parseFid } from '../../../utils/player';
import { logger } from '../../../utils/logger';

const MAX_PRIORITY = 100;

export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => null);
  const fid = parseFid(body?.fid);
  const priority = Number(body?.priority);

  if (!fid) {
    throw createError({ statusCode: 400, message: 'FID is required' });
  }
  if (!Number.isInteger(priority) || priority < 1 || priority > MAX_PRIORITY) {
    throw createError({ statusCode: 400, message: `Priority must be an integer between 1 and ${MAX_PRIORITY}` });
  }
  if (!priorityUsers.findByFid(fid)) {
    throw createError({ statusCode: 404, message: 'User not found in priority queue' });
  }

  priorityUsers.add(fid, priority);
  // The items already queued for the user move too
  queue.setPriorityForFid(fid, priority);
  logger.info(`Admin priority update: user ${fid} priority changed to ${priority}`);

  return { success: true, fid, priority, message: `Priority updated to ${priority}` };
});
