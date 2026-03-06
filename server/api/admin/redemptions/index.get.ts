import { redemptions } from '../../../utils/db';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const fid = query.fid as string;
  const code = query.code as string;
  const limit = parseInt(query.limit as string) || 50;
  const offset = parseInt(query.offset as string) || 0;

  let result;
  if (fid) {
    result = redemptions.findByFid(fid);
  } else if (code) {
    result = redemptions.findByCode(code);
  } else {
    result = redemptions.findRecent(10000);
  }

  const total = result.length;
  const paginated = result.slice(offset, offset + limit);

  return { success: true, redemptions: paginated, total, hasMore: offset + limit < total };
});
