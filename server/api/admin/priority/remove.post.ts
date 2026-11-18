import { priorityUsers } from '../../../db';
import { parseFid } from '../../../utils/player';
import { logger } from '../../../utils/logger';

export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => null);
  const fid = parseFid(body?.fid);

  if (!fid) {
    throw createError({ statusCode: 400, message: 'FID is required' });
  }

  if (priorityUsers.remove(fid).changes === 0) {
    throw createError({ statusCode: 404, message: 'User not found in priority queue' });
  }

  logger.info(`Admin priority remove: removed user ${fid} from priority queue`);
  return { success: true, fid, message: `User ${fid} removed from priority queue` };
});
