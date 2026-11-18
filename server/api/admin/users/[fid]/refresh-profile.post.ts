import { users } from '../../../../db';
import { refreshProfile } from '../../../../services/playerLookup';
import { requireFidParam } from '../../../../utils/http';

export default defineEventHandler(async (event) => {
  const fid = requireFidParam(event);
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
