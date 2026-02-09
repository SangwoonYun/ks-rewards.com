import { priorityUsers } from '../../../utils/db';
import { logger } from '../../../utils/logger';

const MAX_PRIORITY = 100;

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const fid = body?.fid?.toString().trim();
  const priority = Number(body?.priority);

  if (!fid) {
    throw createError({ statusCode: 400, message: 'FID is required' });
  }

  if (isNaN(priority) || priority < 1 || priority > MAX_PRIORITY) {
    throw createError({ statusCode: 400, message: `Priority must be between 1 and ${MAX_PRIORITY}` });
  }

  const existing = priorityUsers.findByFid(fid);
  if (!existing) {
    throw createError({ statusCode: 404, message: 'User not found in priority queue' });
  }

  try {
    priorityUsers.add(fid, priority);
    logger.info(`Admin priority update: user ${fid} priority changed to ${priority}`);

    return {
      success: true,
      fid,
      priority,
      message: `Priority updated to ${priority}`,
    };
  } catch (error: any) {
    logger.error(`Admin priority update error for ${fid}:`, error);
    throw createError({ statusCode: 500, message: error.message || 'Internal server error' });
  }
});
