import { users, type UserSortKey } from '../../../db';
import { parseUserFilters } from '../../../utils/userFilters';
import { getPagination } from '../../../utils/http';

const SORT_KEYS: UserSortKey[] = ['fid', 'nickname', 'kingdom', 'active', 'created_at'];

export default defineEventHandler((event) => {
  const query = getQuery(event);
  const sort = SORT_KEYS.find(key => key === query.sort);
  const { limit, offset } = getPagination(event);

  // Without a sort: newest first. fid and kingdom sort as numbers; missing values always go last.
  const result = users.list(parseUserFilters(query), { sort, desc: query.order === 'desc', limit, offset });

  return { success: true, users: result.users, total: result.total, hasMore: offset + limit < result.total };
});
