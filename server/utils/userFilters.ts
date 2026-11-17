import { users, type User } from './db';

/**
 * Users matching the user grid's filters (query string or request body): search (FID or nickname),
 * status (active/inactive), fid and nickname contain, kingdom exact, registered between from and to
 * (ISO, to exclusive). No filter: every user, newest first.
 */
export function filterUsers(filters: Record<string, unknown>): User[] {
  const text = (key: string) => (typeof filters[key] === 'string' ? (filters[key] as string).trim() : '');
  const search = text('search').toLowerCase();
  const status = text('status');
  const fid = text('fid');
  const nickname = text('nickname').toLowerCase();
  const kingdom = text('kingdom');
  const from = text('from') ? Date.parse(text('from')) : NaN;
  const to = text('to') ? Date.parse(text('to')) : NaN;

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

  if (fid) result = result.filter(u => u.fid.includes(fid));
  if (nickname) result = result.filter(u => u.nickname?.toLowerCase().includes(nickname));
  if (kingdom) result = result.filter(u => u.kingdom === kingdom);
  if (!isNaN(from) || !isNaN(to)) {
    result = result.filter(u => {
      const created = Date.parse(u.created_at.replace(' ', 'T'));
      return (isNaN(from) || created >= from) && (isNaN(to) || created < to);
    });
  }
  return result;
}

/**
 * Whether any filter is set (no filter means every user)
 */
export function hasUserFilters(filters: Record<string, unknown>): boolean {
  return ['search', 'status', 'fid', 'nickname', 'kingdom', 'from', 'to']
    .some(key => typeof filters[key] === 'string' && (filters[key] as string).trim() !== '');
}
