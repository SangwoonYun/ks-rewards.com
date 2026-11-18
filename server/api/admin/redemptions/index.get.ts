import { redemptions } from '../../../db';
import { getPagination } from '../../../utils/http';

// Redemption history of one player (fid) or one code; without either, the successful redemptions
export default defineEventHandler((event) => {
  const query = getQuery(event);
  const fid = typeof query.fid === 'string' && query.fid ? query.fid : undefined;
  const code = typeof query.code === 'string' && query.code ? query.code : undefined;
  const { limit, offset } = getPagination(event);

  const result = redemptions.list({ fid, code, limit, offset });
  return { success: true, redemptions: result.redemptions, total: result.total, hasMore: offset + limit < result.total };
});
