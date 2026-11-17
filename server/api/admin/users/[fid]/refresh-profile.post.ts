import { users } from '../../../../utils/db';
import { refreshProfile } from '../../../../services/playerLookup';

export default defineEventHandler(async (event) => {
  const fid = getRouterParam(event, 'fid');
  if (!fid) {
    throw createError({ statusCode: 400, message: 'FID is required' });
  }
  if (!users.findByFid(fid)) {
    throw createError({ statusCode: 404, message: 'User not found' });
  }

  const { result, kingdom, deactivated } = await refreshProfile(fid);
  return {
    success: result !== 'failed',
    result,
    kingdom,
    deactivated,
    user: users.findByFid(fid)
  };
});
