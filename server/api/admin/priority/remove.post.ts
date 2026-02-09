import { priorityUsers } from '../../../utils/db';
import { logger } from '../../../utils/logger';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const fid = body?.fid?.toString().trim();

  if (!fid) {
    throw createError({ statusCode: 400, message: 'FID is required' });
  }

  try {
    const result = priorityUsers.remove(fid);

    if (result.changes === 0) {
      throw createError({ statusCode: 404, message: 'User not found in priority queue' });
    }

    logger.info(`Admin priority remove: removed user ${fid} from priority queue`);

    return {
      success: true,
      fid,
      message: `User ${fid} removed from priority queue`,
    };
  } catch (error: any) {
    if (error.statusCode) throw error;
    logger.error(`Admin priority remove error for ${fid}:`, error);
    throw createError({ statusCode: 500, message: error.message || 'Internal server error' });
  }
});
