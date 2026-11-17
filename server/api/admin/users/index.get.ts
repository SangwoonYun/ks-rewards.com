import type { User } from '../../../utils/db';
import { filterUsers } from '../../../utils/userFilters';

// Sortable columns; fid and kingdom compare as numbers. Missing values always go last.
const SORT_KEYS: Record<string, (u: User) => string | number | null> = {
  fid: u => Number(u.fid),
  nickname: u => u.nickname?.toLowerCase() || null,
  kingdom: u => (u.kingdom ? Number(u.kingdom) : null),
  active: u => u.active,
  created_at: u => u.created_at
};

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const sortKey = SORT_KEYS[query.sort as string];
  const desc = query.order === 'desc';
  const limit = parseInt(query.limit as string) || 50;
  const offset = parseInt(query.offset as string) || 0;

  const result = filterUsers(query);

  // Without a sort, findAll's order (newest first)
  if (sortKey) {
    result.sort((a, b) => {
      const x = sortKey(a);
      const y = sortKey(b);
      if (x === y) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      return (x < y ? -1 : 1) * (desc ? -1 : 1);
    });
  }

  const total = result.length;
  const paginated = result.slice(offset, offset + limit);

  return { success: true, users: paginated, total, hasMore: offset + limit < total };
});
