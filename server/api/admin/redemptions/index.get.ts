import { redemptions } from '../../../utils/db';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const fid = query.fid as string;
  const code = query.code as string;
  const limit = parseInt(query.limit as string) || 200;

  let result;
  if (fid) {
    result = redemptions.findByFid(fid);
  } else if (code) {
    result = redemptions.findByCode(code);
  } else {
    result = redemptions.findRecent(limit);
  }

  return { success: true, redemptions: result };
});
