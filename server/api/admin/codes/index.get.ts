import { giftCodes } from '../../../db';
import { getPagination } from '../../../utils/http';

export default defineEventHandler((event) => {
  const query = getQuery(event);
  const status = typeof query.status === 'string' && query.status ? query.status : undefined;
  const search = typeof query.search === 'string' ? query.search.trim() : '';

  // Without a status filter: validated codes first, newest first within each group
  const { limit, offset } = getPagination(event);
  const { codes, total } = giftCodes.list({ status, search, limit, offset });

  return { success: true, codes, total, hasMore: offset + limit < total, stats: giftCodes.stats() };
});
