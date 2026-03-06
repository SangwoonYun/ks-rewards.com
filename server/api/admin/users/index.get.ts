import { users, type User } from '../../../utils/db';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const search = (query.search as string || '').trim().toLowerCase();
  const status = query.status as string;
  const limit = parseInt(query.limit as string) || 50;
  const offset = parseInt(query.offset as string) || 0;

  let result: User[] = users.findAll();

  if (status === 'active') {
    result = result.filter(u => u.active === 1);
  } else if (status === 'inactive') {
    result = result.filter(u => u.active === 0);
  }

  if (search) {
    result = result.filter(u =>
      u.fid.toLowerCase().includes(search) ||
      (u.nickname && u.nickname.toLowerCase().includes(search))
    );
  }

  const total = result.length;
  const paginated = result.slice(offset, offset + limit);

  return { success: true, users: paginated, total, hasMore: offset + limit < total };
});
