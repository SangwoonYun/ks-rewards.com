import { users } from '../../../../db';
import { queueAndRedeem } from '../../../../services/queueWorker';
import { requireFidParam } from '../../../../utils/http';
import { logger } from '../../../../utils/logger';

export default defineEventHandler((event) => {
  const fid = requireFidParam(event);

  const user = users.findByFid(fid);
  if (!user) {
    throw createError({ statusCode: 404, message: 'User not found' });
  }

  const newActive = user.active === 1 ? 0 : 1;
  users.updateActive(fid, newActive);
  // Deactivating dropped the user's queue; a reactivated user gets the codes they still need
  const queuedCount = newActive === 1 ? queueAndRedeem({ fid }) : 0;

  logger.info(`Admin toggled user ${fid} active status: ${user.active} -> ${newActive}` + (queuedCount ? `, ${queuedCount} code(s) queued` : ''));

  return {
    success: true,
    user: { ...user, active: newActive },
  };
});
