import { users, type User } from '../../../utils/db';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const search = (query.search as string || '').trim().toLowerCase();
  const status = query.status as string;

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

  return { success: true, users: result, total: result.length };
});
