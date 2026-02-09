import { users } from '../../../../utils/db';
import { logger } from '../../../../utils/logger';

export default defineEventHandler(async (event) => {
  const fid = getRouterParam(event, 'fid');
  if (!fid) {
    throw createError({ statusCode: 400, message: 'FID is required' });
  }

  const user = users.findByFid(fid);
  if (!user) {
    throw createError({ statusCode: 404, message: 'User not found' });
  }

  const newActive = user.active === 1 ? 0 : 1;
  users.updateActive(fid, newActive);

  logger.info(`Admin toggled user ${fid} active status: ${user.active} -> ${newActive}`);

  return {
    success: true,
    user: { ...user, active: newActive },
  };
});
